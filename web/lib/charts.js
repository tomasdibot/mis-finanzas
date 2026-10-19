// Storytelling-with-data charts: gray context, accent on the selection, values written on the marks,
// no axes, gridlines or legends. Return HTML/SVG strings; the app wires the clicks.

import { iconAt, iconSvg } from "./icons.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/**
 * Vertical monthly bars. months: [{key, label, value, partial}], selected: key.
 * The in-progress month is drawn as a dashed outline: it isn't comparable yet.
 */
export function monthlyBars(months, selected, { width = 700, fmt = String } = {}) {
  const W = Math.max(280, Math.round(width)), H = W < 480 ? 190 : 220, top = 26, bottom = 26, ph = H - top - bottom;
  const max = Math.max(1, ...months.map((m) => m.value));
  const band = W / Math.max(months.length, 1), bw = Math.min(band * 0.64, 46);
  const showAll = band >= 42; // labels on every bar only if they fit; otherwise the selected one + ends
  let s = `<svg class="bars" viewBox="0 0 ${W} ${H}" role="img" aria-label="Consumo por mes">`;
  months.forEach((m, i) => {
    const h = m.value > 0 ? Math.max(2, (m.value / max) * ph) : 0;
    const x = band * i + (band - bw) / 2, y = top + ph - h, on = m.key === selected;
    const cls = `bar${on ? " on" : ""}${m.partial ? " partial" : ""}`;
    const r = Math.min(5, bw / 2, h);
    if (h > 0) s += `<path class="${cls}" style="--i:${i}" d="M${x},${top + ph}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${top + ph}Z"/>`;
    if (showAll || on || i === 0 || i === months.length - 1) {
      s += `<text class="val${on ? " on" : ""}" x="${x + bw / 2}" y="${y - 7}" text-anchor="middle">${esc(fmt(m.value))}</text>`;
    }
    if (showAll || on || i % Math.ceil(42 / band) === 0) {
      s += `<text class="mon${on ? " on" : ""}" x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${esc(m.label)}</text>`;
    }
    s += `<rect class="hit" x="${band * i}" y="0" width="${band}" height="${H}" data-key="${esc(m.key)}" tabindex="0" role="button"
      aria-label="${esc(m.label)}: ${esc(fmt(m.value))}${m.partial ? " (en curso)" : ""}"><title>${esc(m.label)}: ${esc(fmt(m.value))}${m.partial ? " (en curso)" : ""}</title></rect>`;
  });
  s += `<line class="base" x1="0" x2="${W}" y1="${top + ph + 0.5}" y2="${top + ph + 0.5}"/></svg>`;
  return s;
}

/**
 * Horizontal bars, largest first. items: [{key, name, value, note}], selected key (or null).
 * With a selection, the other rows go quiet (gray text) so the eye lands on the accent.
 */
export function horizontalBars(items, selected, { fmt = String, total = null, max = 8, otherLabel = "Resto" } = {}) {
  if (!items.length) return `<div class="empty">No hay gastos con estos filtros.</div>`;
  let list = items.slice(0, max);
  const rest = items.slice(max);
  if (rest.length) list = [...list, { key: null, name: `${otherLabel} (${rest.length})`, value: rest.reduce((a, b) => a + b.value, 0), rest: true }];
  const top = Math.max(...list.map((i) => i.value), 1);
  // Each row: name and value on one line, the bar underneath at full width (reads well on a phone)
  return `<div class="hbars">` + list.map((it, i) => {
    const on = selected != null && it.key === selected, dim = selected != null && !on;
    const pct = total ? ` · ${Math.round((it.value / total) * 100)}%` : "";
    const attr = it.key == null ? "disabled" : `data-key="${esc(it.key)}"`;
    return `<button class="hrow${on ? " on" : ""}${dim ? " dim" : ""}${it.key == null ? " rest" : ""}" ${attr}
        aria-label="${esc(it.name)}: ${esc(fmt(it.value))}${pct}">
      <span class="hname">${esc(it.name)}${it.note ? `<small>${esc(it.note)}</small>` : ""}</span>
      <span class="hval">${esc(fmt(it.value))}${pct}</span>
      <span class="htrack"><span class="hbar" style="--i:${i};width:${Math.max(0.6, (it.value / top) * 100)}%"></span></span></button>`;
  }).join("") + `</div>`;
}

/** Split a name into at most two lines of ~`n` characters (whole words; the second line trimmed with "…"). */
function twoLines(name, n) {
  // a single word longer than the line is split with a hyphen ("Suscrip-" / "ciones") instead of cut off
  const words = String(name).split(/\s+/).flatMap((w) => (w.length > n && n > 4 ? [w.slice(0, n - 1) + "-", w.slice(n - 1)] : [w]));
  const lines = [""];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if (!cur) lines[lines.length - 1] = w;
    else if ((cur + " " + w).length <= n) lines[lines.length - 1] = cur + " " + w;
    else if (lines.length < 2) lines.push(w);
    else { lines[1] = lines[1] + " " + w; break; }
  }
  return lines.map((l) => (l.length > n ? l.slice(0, Math.max(1, n - 1)) + "…" : l));
}

/**
 * The month's categories as vertical columns, largest first: one series, one color (the height is the only thing
 * compared). Each column says what it is right under it — icon, name (two lines), how many times — and its amount
 * on the cap. Too many categories for the width → the chart scrolls sideways instead of squeezing the labels.
 * items: [{key, name, label?, value, n, pct, icon}] (label = short name under the column; the full name stays in
 * the tooltip). Columns carry data-key (tap → the category's detail).
 */
export function categoryColumns(items, { width = 700, fmt = String, selected = null, unit = ["vez", "veces"] } = {}) {
  const list = items.filter((i) => i.value > 0);
  if (!list.length) return `<div class="empty">No hay movimientos este mes.</div>`;
  const avail = Math.max(280, Math.round(width)), minBand = avail >= 600 ? 58 : 66; // a desktop fits them all
  const band = Math.max(minBand, Math.min(110, avail / list.length)), W = Math.round(band * list.length);
  const top = 40, plot = avail < 480 ? 170 : 210, labels = 100, H = top + plot + labels, base = top + plot;
  const max = Math.max(...list.map((i) => i.value)), bw = Math.min(24, band * 0.42), chars = Math.floor((band - 4) / 5.4); // ~5.4 px per letter at 11.5 px DM Sans
  let s = `<div class="ccols${W > avail ? " scrolls" : ""}"><svg class="cols" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gastos del mes por categoría">`;
  s += `<line class="base" x1="0" x2="${W}" y1="${base + 0.5}" y2="${base + 0.5}"/>`;
  list.forEach((it, i) => {
    const cx = band * i + band / 2, h = Math.max(3, (it.value / max) * plot), y = base - h, r = Math.min(4, bw / 2);
    const on = selected === it.key, dim = selected != null && !on, times = `${it.n} ${it.n === 1 ? unit[0] : unit[1]}`;
    const [l1, l2] = twoLines(it.label || it.name, chars);
    s += `<g class="col${on ? " on" : ""}${dim ? " dim" : ""}" data-key="${esc(it.key)}" tabindex="0" role="button"
      aria-label="${esc(it.name)}: ${esc(fmt(it.value))}, ${esc(times)}, ${it.pct}% del mes">
      <title>${esc(it.name)}: ${esc(fmt(it.value))} · ${esc(times)} · ${it.pct}% del mes</title>
      <rect class="hit" x="${band * i}" y="0" width="${band}" height="${H}"/>
      <path class="bar" style="--i:${i}" d="M${cx - bw / 2},${base}V${y + r}Q${cx - bw / 2},${y} ${cx - bw / 2 + r},${y}H${cx + bw / 2 - r}Q${cx + bw / 2},${y} ${cx + bw / 2},${y + r}V${base}Z"/>
      <text class="pct" x="${cx}" y="${y - 25}" text-anchor="middle">${it.pct}%</text>
      <text class="val" x="${cx}" y="${y - 9}" text-anchor="middle">${esc(fmt(it.value))}</text>
      <circle class="icobg" cx="${cx}" cy="${base + 22}" r="15"/>${iconAt(it.icon, cx - 9, base + 13, 18)}
      <text class="cn" x="${cx}" y="${base + 54}" text-anchor="middle">${esc(l1 || "")}</text>
      ${l2 ? `<text class="cn" x="${cx}" y="${base + 68}" text-anchor="middle">${esc(l2)}</text>` : ""}
      <text class="ct" x="${cx}" y="${base + (l2 ? 84 : 70)}" text-anchor="middle">${esc(times)}</text></g>`;
  });
  return s + `</svg></div>`;
}

/**
 * The month broken down (by category, payment method, merchant, weekday…) as a horizontal bar chart, largest
 * first — everything fits without scrolling. One series, one color (the length is the only thing compared). Each
 * row: icon (or brand badge) | name ……… amount, and under the name a thick bar from a common baseline, with
 * "N veces · %" right after its end.
 * items: [{key, name, label?, value, n, pct, icon | ico (ready-made badge html)}]. Rows carry data-key (tap →
 * its detail). max: show only the largest N and fold the rest into one row. Items are drawn in the order given.
 */
export function categoryBars(items, { fmt = String, selected = null, unit = ["vez", "veces"], max: top = 0, otherLabel = "Resto",
  label = "Gastos del mes" } = {}) {
  let list = items.filter((i) => i.value > 0);
  if (!list.length) return `<div class="empty">No hay movimientos este mes.</div>`;
  // many items (e.g. merchants): the largest ones, then the rest folded into one row
  if (top && list.length > top + 1) {
    const rest = list.slice(top);
    list = [...list.slice(0, top), { key: null, name: `${otherLabel} (${rest.length})`, value: rest.reduce((a, b) => a + b.value, 0),
      n: rest.reduce((a, b) => a + b.n, 0), pct: rest.reduce((a, b) => a + b.pct, 0), rest: true }];
  }
  const max = Math.max(...list.map((i) => i.value));
  return `<div class="cbars" role="list" aria-label="${esc(label)}">` + list.map((it, i) => {
    const on = selected === it.key, dim = selected != null && !on && !it.rest, times = `${it.n} ${it.n === 1 ? unit[0] : unit[1]}`;
    // the icon may carry its category's color (--t); the bar never does: one color, the length is what compares
    const ico = it.ico ?? `<span class="cbi"${it.tint && !it.rest ? ` style="--t:${esc(it.tint)}"` : ""}>${iconSvg(it.rest ? "plus" : it.icon || "box", 16, "icon")}</span>`;
    const tag = it.rest ? "div" : "button";
    return `<${tag} class="cb${on ? " on" : ""}${dim ? " dim" : ""}${it.rest ? " rest" : ""}" role="listitem"${it.rest ? "" : ` data-key="${esc(it.key)}"`}
        title="${esc(it.name)}: ${esc(fmt(it.value))} · ${esc(times)} · ${it.pct}% del mes"
        aria-label="${esc(it.name)}: ${esc(fmt(it.value))}, ${esc(times)}, ${it.pct}% del mes">
      <span class="cbico">${ico}</span><span class="cbn">${esc(it.label || it.name)}</span><span class="cbv">${esc(fmt(it.value))}</span>
      <span class="cbplot"><span class="cbb" style="--i:${i};--f:${Math.max(0.012, it.value / max).toFixed(4)}"></span>
        <span class="cbm">${esc(times)} · ${it.pct}%</span></span></${tag}>`;
  }).join("") + `</div>`;
}

/** The same data as a table (the chart's accessible twin): category, amount, times, share. */
export function categoryTable(items, { fmt = String, head = "Categoría" } = {}) {
  if (!items.length) return "";
  return `<table class="ctable"><thead><tr><th>${esc(head)}</th><th>Monto</th><th>Veces</th><th>%</th></tr></thead><tbody>` +
    items.map((it) => `<tr data-key="${esc(it.key)}"><td>${it.icon ? iconSvg(it.icon, 16, "icon ticon").replace("<svg ", it.tint ? `<svg style="--t:${esc(it.tint)}" ` : "<svg ") : ""}${esc(it.name)}</td><td>${esc(fmt(it.value))}</td><td>${it.n}</td><td>${it.pct}%</td></tr>`).join("") +
    `</tbody></table>`;
}

