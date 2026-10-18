// Turns Mercado Pago /v1/payments/search results into rows for the `movements` table.
// Facts only: amounts, dates, Mercado Pago's own labels and texts. Merchant names and categories are
// derived later, in the app (web/lib/model.js), from web/rules.js, so rules can change without re-syncing.
// Never stores a counterparty's email, document (DNI/CUIT), phone, account numbers or IP.
// Plain ES module with no dependencies: runs in Deno (Edge Function) and in Node (tests).

export const TZ_OFFSET_MIN = -180; // Argentina, UTC-3, no daylight saving

const pad = (n, w = 2) => String(n).padStart(w, "0");

/** ISO timestamp in local time with offset, e.g. 2026-09-01T00:30:00-03:00 */
export function localIso(ts, offsetMin = TZ_OFFSET_MIN) {
  const t = new Date(ts).getTime() + offsetMin * 60000;
  const d = new Date(t);
  const sign = offsetMin < 0 ? "-" : "+";
  const off = `${sign}${pad(Math.floor(Math.abs(offsetMin) / 60))}:${pad(Math.abs(offsetMin) % 60)}`;
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:` +
    `${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}${off}`;
}

/** Mercado Pago search only accepts ISO dates with milliseconds: 2026-09-01T00:00:00.000-03:00 */
export function mpTime(year, month0, day, h = 0, m = 0, s = 0, ms = 0, offsetMin = TZ_OFFSET_MIN) {
  const sign = offsetMin < 0 ? "-" : "+";
  const off = `${sign}${pad(Math.floor(Math.abs(offsetMin) / 60))}:${pad(Math.abs(offsetMin) % 60)}`;
  const d = new Date(Date.UTC(year, month0, day, h, m, s, ms));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:` +
    `${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}${off}`;
}

/** The last n local calendar months, oldest first: [{label, begin, end}] with inclusive MP-format bounds. */
export function monthWindows(n, now = new Date(), offsetMin = TZ_OFFSET_MIN) {
  const local = new Date(now.getTime() + offsetMin * 60000);
  let y = local.getUTCFullYear(), m = local.getUTCMonth();
  const out = [];
  for (let i = 0; i < n; i++) {
    const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    out.push({ label: `${y}-${pad(m + 1)}`, begin: mpTime(y, m, 1), end: mpTime(y, m, days, 23, 59, 59, 999) });
    m -= 1;
    if (m < 0) { m = 11; y -= 1; }
  }
  return out.reverse();
}

/** "1.234,56" / "1,234.56" / "-1234.5" / "$ 1.234" -> number (whichever separator comes last is the decimal). */
export function parseAmount(v) {
  let s = String(v ?? "").replace(/[^\d,.\-]/g, "");
  if (!s) return NaN;
  if (s.includes(",") && s.includes(".")) {
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (s.includes(",")) s = s.replace(",", ".");
  return Number(s);
}

/** Minimal CSV parser (quotes, BOM, "," or ";" delimiter) -> array of objects keyed by header. */
export function parseCsv(text) {
  text = String(text).replace(/^﻿/, "");
  const head = text.split(/\r?\n/, 1)[0];
  const d = (head.match(/;/g) ?? []).length > (head.match(/,/g) ?? []).length ? ";" : ",";
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') q = false;
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === d) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = ""; if (row.some((f) => f !== "")) rows.push(row); row = [];
    } else field += ch;
  }
  row.push(field); if (row.some((f) => f !== "")) rows.push(row);
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? ""])));
}

/**
 * Available balance from a Releases ("Dinero disponible") report: the running BALANCE_AMOUNT of the LAST movement
 * (or of the opening line if the period had none). The closing "total" line is a summary whose BALANCE_AMOUNT is
 * not the balance (verified 2026-09-29: it read 0 while opening balance + all movements = the last running balance).
 * Returns { balance, asOf } or null.
 */
export function releaseBalance(csvText) {
  const rows = parseCsv(csvText).filter((r) => !/total/i.test(r.RECORD_TYPE ?? "") && r.DATE &&
    r.BALANCE_AMOUNT !== "" && !Number.isNaN(parseAmount(r.BALANCE_AMOUNT)));
  if (!rows.length) return null;
  const last = rows[rows.length - 1];
  return { balance: parseAmount(last.BALANCE_AMOUNT), asOf: new Date(last.DATE).toISOString() };
}

/**
 * Payouts (money sent from the balance to bank accounts/CVUs) from a Releases report, as `movements` rows.
 * They never appear in /v1/payments/search, so without these, money out is badly undercounted.
 * The "reserve_for_*" lines are holds that are released within the same flow (they net to zero) and are skipped.
 * `dest` = the destination account (PAYOUT_BANK_ACCOUNT_NUMBER, "account number to where Mercado Pago money was
 * transferred" per the AR report-fields docs; only present once that column is in the report config). It is
 * TRANSIENT: the sync turns it into an HMAC recipient_key and drops it, so the account number is never stored.
 */
export function payoutRows(csvText) {
  return parseCsv(csvText).filter((r) => r.RECORD_TYPE === "release" && r.DESCRIPTION === "payout" && r.DATE)
    .map((r) => {
      const amount = (parseAmount(r.NET_CREDIT_AMOUNT) || 0) - Math.abs(parseAmount(r.NET_DEBIT_AMOUNT) || 0);
      const date = localIso(r.DATE);
      return {
        id: `payout:${r.SOURCE_ID}:${r.DATE}`, payment_id: Number(r.SOURCE_ID) || 0, row_type: "payout", date,
        month: date.slice(0, 7), direction: "out", operation_type: "payout", status: "approved",
        payment_type: "", payment_method: r.PAYMENT_METHOD ?? "", channel: "", business_unit: "", branch: "",
        item_category: "", description: "Retiro a cuenta bancaria", statement_descriptor: "", item_titles: "",
        merchant_site: "", counterparty: "", holder_name: "", amount: Math.round(amount * 100) / 100,
        dest: String(r.PAYOUT_BANK_ACCOUNT_NUMBER ?? "").trim(),
      };
    });
}

/**
 * One purchase paid with several methods (e.g. account money + debit card on Mercado Libre) arrives as one
 * payment per method. Mercado Pago ties them with metadata.payments_group_uuid (payments_group_size > 1);
 * otherwise the order id (payments of one order are one purchase). The app merges rows only when two or more
 * share the key, so a lone payment with an order id stays as it is. Verified 2026-09-29: both split purchases
 * of the last 400 days carry the same uuid and the same order id.
 */
export function paymentGroup(p) {
  const m = p.metadata ?? {};
  if (m.payments_group_uuid && Number(m.payments_group_size) > 1) return `g:${m.payments_group_uuid}`;
  if (p.order?.id) return `o:${p.order.id}`;
  return "";
}

const personName = (party) => [party?.first_name, party?.last_name].filter(Boolean).join(" ").trim();

/**
 * One row for the payment plus one per refund (dated when the refund happened, opposite sign).
 * Amounts are signed from the account holder's view: out negative, in positive.
 * `resolveCategory(id)` returns Mercado Libre's category path for an item category id (or the id).
 */
export function paymentRows(p, meId, resolveCategory = (id) => id ?? "") {
  const collector = String(p.collector_id ?? p.collector?.id ?? "");
  const incoming = collector === String(meId);
  const details = p.transaction_details ?? {};
  const amount = incoming
    ? Number(details.net_received_amount || p.transaction_amount || 0)
    : -Number(details.total_paid_amount || p.transaction_amount || 0);
  const poi = p.point_of_interaction ?? {};
  const biz = poi.business_info ?? {};
  const items = p.additional_info?.items ?? [];
  const bankSide = (poi.transaction_data?.bank_info ?? {})[incoming ? "payer" : "collector"] ?? {};
  const itemCat = items.find((i) => i.category_id)?.category_id;
  let site = "";
  try { site = p.notification_url ? new URL(p.notification_url).hostname : ""; } catch { site = ""; }

  const base = {
    payment_id: Number(p.id),
    direction: incoming ? "in" : "out",
    operation_type: p.operation_type ?? "",
    status: p.status ?? "",
    payment_type: p.payment_type_id ?? "",
    payment_method: p.payment_method_id ?? "",
    channel: poi.type ?? "",
    // the shop's card-network category code (ISO 18245 MCC, e.g. "5411" = supermarket); Mercado Pago fills it on
    // purchases with its card in a shop (checked 2026-10-02: point_of_interaction.transaction_data.commerce.mcc)
    mcc: String(poi.transaction_data?.commerce?.mcc ?? "").trim(),
    business_unit: [biz.unit, biz.sub_unit].filter(Boolean).join("/"),
    branch: biz.branch ?? "",
    item_category: itemCat ? String(resolveCategory(itemCat) ?? itemCat) : "",
    description: String(p.description ?? "").trim(),
    statement_descriptor: String(p.statement_descriptor ?? "").trim(),
    item_titles: items.map((i) => i.title).filter(Boolean).join(" | "),
    merchant_site: site,
    // A person's display name: incoming transfers show who sent them. MP leaves the merchant's empty.
    counterparty: personName(incoming ? p.payer : p.collector),
    holder_name: String(bankSide.account_holder_name ?? "").trim(),
    group_id: paymentGroup(p),
  };
  const row = (rowType, suffix, ts, amt) => {
    const date = localIso(ts);
    return { id: `${p.id}:${rowType}${suffix}`, row_type: rowType, date, month: date.slice(0, 7),
             amount: Math.round(amt * 100) / 100, ...base };
  };
  const rows = [row("payment", "", p.date_created, amount)];
  const sign = incoming ? -1 : 1; // a refund moves money the opposite way
  const refunds = (p.refunds ?? []).filter((f) => !["rejected", "cancelled"].includes(f.status));
  refunds.forEach((f, i) => rows.push(
    row("refund", `:${f.id ?? i}`, f.date_created ?? p.date_last_updated, sign * Number(f.amount || 0))));
  const refunded = Number(p.transaction_amount_refunded || 0);
  if (refunded && !refunds.length) rows.push(row("refund", ":0", p.date_last_updated, sign * refunded));
  return rows;
}
