// Invented data for demo mode (?demo in the URL). Same shape as `movements` rows.
// Every merchant here is fictional.

function rng(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }

const KINDS = [
  // [description, statement_descriptor, operation_type, business_unit, branch, item_category, item_titles, min, max, per month]
  ["Compra en Súper Ejemplo - Suc. 12", "", "regular_payment", "wallet/qr", "QR", "", "", 9000, 32000, 4],
  ["Producto de Verdulería La Ejemplar", "", "regular_payment", "wallet/qr", "QR", "", "", 2500, 7000, 3],
  ["Pago Online", "MERPAGO*CAFEEJEMPLO", "regular_payment", "wallet/qr", "QR", "", "", 3000, 9000, 2],
  ["", "MERPAGO*SUBEVIAJES", "recurring_payment", "wallet/single_player", "Transport - QRC", "", "", 700, 1200, 8],
  ["SUBE", "", "regular_payment", "wallet/single_player", "Transport - Public transport recharge", "", "", 3000, 6000, 1],
  ["Producto de Farmacia Ejemplo", "", "regular_payment", "wallet/qr", "QR", "", "", 6000, 30000, 1],
  ["Pago de expensas", "MERPAGO*CONSORCIOEJ", "recurring_payment", "wallet/single_player", "", "", "", 48000, 56000, 1],
  ["Auriculares Ejemplo Bluetooth", "MERPAGO*TECNOEJEMPLO", "regular_payment", "marketplace/checkout_on", "Marketplace",
   "Electrónica, Audio y Video > Audio", "Auriculares Ejemplo Bluetooth", 20000, 60000, 0.4],
  ["Lámpara Ejemplo De Mesa", "MERPAGO*CASAEJEMPLO", "regular_payment", "marketplace/checkout_on", "Marketplace",
   "Hogar, Muebles y Jardín > Iluminación", "Lámpara Ejemplo De Mesa", 10000, 40000, 0.5],
  ["Libro Ejemplo", "MERPAGO*LIBROSEJEMPLO", "regular_payment", "marketplace/checkout_on", "Marketplace",
   "Libros, Revistas y Comics > Libros Físicos", "Libro Ejemplo", 12000, 25000, 0.5],
  ["Suscripción mensual Streaming Ejemplo", "MERPAGO*STREAMEJ", "recurring_payment", "online_payments/subscription",
   "Suscripciones de Loyalty", "", "", 4000, 4000, 1],
  ["Varios", "", "money_transfer", "digital_accounts_cards/money_outflows", "Intra MP", "", "", 5000, 40000, 1],
];

export function demoRows(now = new Date()) {
  const r = rng(42), rows = [];
  // how each invented payment was paid (own sequence, so the amounts above stay the same)
  const r2 = rng(7), METHODS = [["account_money", "account_money", 0.6], ["debit_card", "debvisa", 0.8], ["credit_card", "master", 0.95], ["digital_currency", "consumer_credits", 1]];
  const pay = (op) => { if (op === "money_transfer") return METHODS[0]; const x = r2(); return METHODS.find((m) => x < m[2]); };
  let id = 1000;
  for (let k = 12; k >= 0; k--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1));
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
    const lastDay = k === 0 ? now.getUTCDate() : new Date(Date.UTC(y, m, 0)).getUTCDate();
    for (const [desc, sd, op, unit, branch, cat, titles, lo, hi, per] of KINDS) {
      const n = Math.floor(per) + (r() < per % 1 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const day = 1 + Math.floor(r() * lastDay);
        const date = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}T12:00:00-03:00`;
        const [ptype, pmethod] = pay(op);
        rows.push({ id: `${id}:payment`, payment_id: id++, row_type: "payment", date, month: date.slice(0, 7),
          direction: "out", operation_type: op, status: "approved", payment_type: ptype,
          payment_method: pmethod, channel: "", business_unit: unit, branch, item_category: cat,
          description: desc, statement_descriptor: sd, item_titles: titles, merchant_site: "", counterparty: "",
          holder_name: "", amount: -Math.round(lo + r() * (hi - lo)),
          // transfers go to one of two invented recipients (known only by a key, as in real data)
          recipient_key: op === "money_transfer" ? (r() < 0.6 ? "a1d3m0000000000000aa" : "b7d3m0000000000000bb") : "" });
      }
    }
  }
  // money in (own deposits + a transfer from a friend) and payouts to a bank account, every month
  for (let k = 12; k >= 0; k--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1));
    const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const add = (day, over) => {
      const date = `${ym}-${String(day).padStart(2, "0")}T10:00:00-03:00`;
      rows.push({ id: `${id}:payment`, payment_id: id++, row_type: "payment", date, month: ym, status: "approved",
        payment_type: "bank_transfer", payment_method: "cvu", channel: "", business_unit: "", branch: "", item_category: "",
        description: "", statement_descriptor: "", item_titles: "", merchant_site: "", counterparty: "", holder_name: "", ...over });
    };
    add(2, { direction: "in", operation_type: "account_fund", description: "Bank Transfer", amount: 300000 + Math.round(r() * 80000) });
    if (r() < 0.6) add(15, { direction: "in", operation_type: "money_transfer", counterparty: "Ana Ejemplo", amount: 15000 + Math.round(r() * 20000) });
    // one Mercado Libre purchase paid with two methods (account money + card): two payments, one group
    if (k === 1) {
      const buy = { direction: "out", operation_type: "regular_payment", business_unit: "marketplace/checkout_on", branch: "Marketplace",
        item_category: "Hogar, Muebles y Jardín > Iluminación", description: "Lámpara Ejemplo De Pie", item_titles: "Lámpara Ejemplo De Pie",
        statement_descriptor: "MERPAGO*CASAEJEMPLO", group_id: "g:demo-split" };
      add(12, { ...buy, payment_type: "account_money", payment_method: "account_money", amount: -30000 });
      add(12, { ...buy, payment_type: "prepaid_card", payment_method: "visa", amount: -18500 });
    }
    if (k > 0 || now.getUTCDate() > 20) add(20, { direction: "out", operation_type: "payout", row_type: "payout", description: "Transferencia a alias/CBU/CVU", amount: -(50000 + Math.round(r() * 60000)) });
  }
  return rows;
}

export function demoBalance(now = new Date()) {
  return { available: 48210.35, as_of: new Date(now.getTime() - 2 * 3600e3).toISOString(),
           fetched_at: new Date(now.getTime() - 12 * 60e3).toISOString() };
}
