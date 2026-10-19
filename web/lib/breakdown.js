// The ways to break a month down ("Por categoría", "Por medio de pago"…): what each groups by, its name and icon,
// and how each of its values is drawn (a brand badge when the value is a known brand, else a line icon).
// Facts only: sums and counts per value, nothing inferred.
import { iconSvg } from "./icons.js";
import { brandOf, brandSvg } from "./brands.js";

const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const WEEK = [...DAYS.slice(1), DAYS[0]]; // Monday first
export const weekday = (iso) => { const [y, m, d] = iso.split("-").map(Number); return DAYS[new Date(y, m - 1, d).getDay()]; };

/** key → { label per view (chip), by per view ("Gastos por …"), many per view ("9 categorías"), icon, of(row),
 *  max (fold the rest), order } */
export const DIMS = {
  category: { label: { out: "Categoría", in: "Tipo" }, by: { out: "categoría", in: "tipo" }, many: { out: "categorías", in: "tipos" },
    icon: "grid", of: (r) => r.category },
  method: { label: { out: "Medio de pago" }, by: { out: "medio de pago" }, many: { out: "medios de pago" }, icon: "card",
    of: (r) => r.method || "Sin dato" },
  channel: { label: { out: "Canal" }, by: { out: "canal" }, many: { out: "canales" }, icon: "qr", of: (r) => r.channel || "Otro" },
  merchant: { label: { out: "Comercio", in: "Origen" }, by: { out: "comercio", in: "origen" }, many: { out: "comercios", in: "orígenes" },
    icon: "store", of: (r) => r.merchant, max: 8 },
  weekday: { label: { out: "Día", in: "Día" }, by: { out: "día de la semana", in: "día de la semana" }, many: { out: "días", in: "días" },
    icon: "calendar", of: (r) => weekday(r.date), order: WEEK },
};
export const dimsFor = (view) => Object.keys(DIMS).filter((k) => DIMS[k].label[view]);

// line icons for values that aren't a brand
const VALUE_ICONS = {
  "Efectivo": "coins", "Transferencia bancaria": "bank", "Varios medios": "wallet", "Otro medio": "card", "Sin dato": "card",
  "Transferencia a otro banco": "bank", "Transferencia recibida": "inbox", "QR en comercio": "qr", "Pagos desde la app": "phone",
  "Pago online": "laptop", "Otro": "box",
};

/**
 * How one value of a breakdown is drawn: { icon } (a line icon name) or { ico } (ready-made html: brand badge or
 * weekday). rows: the value's movements (a merchant without a brand takes its category's icon).
 */
export function valueLook(dim, value, rows, rules, size = 32) {
  if (dim === "weekday") return { ico: `<span class="cbi wday">${value.slice(0, 2)}</span>` };
  if (dim === "category") return { icon: rules.icons?.[value] ?? "box", tint: rules.tints?.[value] };
  const brand = brandOf(value);
  if (brand) return { ico: brandSvg(brand, size) };
  if (dim === "merchant") { const c = rows[0]?.category; return { icon: rules.icons?.[c] ?? "box", tint: rules.tints?.[c] }; }
  if (/(débito|crédito)$/.test(value)) return { icon: "card" };
  return { icon: VALUE_ICONS[value] ?? "box" };
}

/** The look as standalone html (for the detail header). */
export const lookHtml = (look, size = 22) => look.ico ??
  iconSvg(look.icon, size, "icon dicon").replace("<svg ", look.tint ? `<svg style="--t:${look.tint}" ` : "<svg ");

/** The month's rows grouped by a breakdown: [{key, name, value, n, pct}], largest first (weekdays: Monday first). */
export function groupRows(list, dim) {
  const d = DIMS[dim], m = new Map();
  list.forEach((r) => { const k = d.of(r); const g = m.get(k) ?? { key: k, name: k, value: 0, n: 0, rows: [] };
    g.value += r.amount; if (r.amount > 0) g.n++; g.rows.push(r); m.set(k, g); });
  const total = list.reduce((a, r) => a + r.amount, 0);
  const out = [...m.values()].filter((g) => g.value > 0.5).map((g) => ({ ...g, pct: total ? Math.round((g.value / total) * 100) : 0 }));
  return d.order ? out.sort((a, b) => d.order.indexOf(a.key) - d.order.indexOf(b.key)) : out.sort((a, b) => b.value - a.value);
}
