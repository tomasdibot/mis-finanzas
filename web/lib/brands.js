// Brand badges: a small rounded tile in each brand's own colors with its mark, so a movement from SUBE, Mercado
// Libre, a Visa card… is recognizable at a glance. Mercado Libre / Mercado Pago (handshake), SUBE and Macro follow
// their real logos; the rest are simplified wordmarks in the brand's colors. Matching is by words in the movement's name/detail (accent- and case-insensitive).
// Brands not listed here keep the category's line icon. The brand names are trademarks of their owners; they're
// used only to identify where each movement went.

const fold = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// The Mercado Libre / Mercado Pago "handshake in an oval": the real outline (path from Simple Icons, CC0), shrunk
// to fit the tile.
const HANDSHAKE = "M11.115 16.479a.93.927 0 0 1-.939-.886c-.002-.042-.006-.155-.103-.155-.04 0-.074.023-.113.059-.112.103-.254.206-.46.206a.816.814 0 0 1-.305-.066c-.535-.214-.542-.578-.521-.725.006-.038.007-.08-.02-.11l-.032-.03h-.034c-.027 0-.055.012-.093.039a.788.786 0 0 1-.454.16.7.699 0 0 1-.253-.05c-.708-.27-.65-.928-.617-1.126.005-.041-.005-.072-.03-.092l-.05-.04-.047.043a.728.726 0 0 1-.505.203.73.728 0 0 1-.732-.725c0-.4.328-.722.732-.722.364 0 .675.27.721.63l.026.195.11-.165c.01-.018.307-.46.852-.46.102 0 .21.016.316.05.434.13.508.52.519.68.008.094.075.1.09.1.037 0 .064-.024.083-.045a.746.744 0 0 1 .54-.225c.128 0 .263.03.402.09.69.293.379 1.158.374 1.167-.058.144-.061.207-.005.244l.027.013h.02c.03 0 .07-.014.134-.035.093-.032.235-.08.367-.08a.944.942 0 0 1 .94.93.936.934 0 0 1-.94.928zm7.302-4.171c-1.138-.98-3.768-3.24-4.481-3.77-.406-.302-.685-.462-.928-.533a1.559 1.554 0 0 0-.456-.07c-.182 0-.376.032-.58.095-.46.145-.918.505-1.362.854l-.023.018c-.414.324-.84.66-1.164.73a1.986 1.98 0 0 1-.43.049c-.362 0-.687-.104-.81-.258-.02-.025-.007-.066.04-.125l.008-.008 1-1.067c.783-.774 1.525-1.506 3.23-1.545h.085c1.062 0 2.12.469 2.24.524a7.030 7.030 0 0 0 3.056.724c1.076 0 2.188-.263 3.354-.795a9.135 9.110 0 0 0-.405-.317c-1.025.44-2.003.66-2.946.66-.962 0-1.925-.229-2.858-.68-.05-.022-1.22-.567-2.440-.570-.032 0-.065 0-.096.002-1.434.033-2.24.536-2.782.976-.528.013-.982.138-1.388.25-.361.1-.673.186-.979.185-.125 0-.35-.01-.37-.012-.35-.01-2.115-.437-3.518-.962-.143.1-.28.203-.415.31 1.466.593 3.25 1.053 3.812 1.089.157.01.323.027.491.027.372 0 .744-.103 1.104-.203.213-.059.446-.123.692-.17l-.196.194-1.017 1.087c-.08.08-.254.294-.14.557a.705.703 0 0 0 .268.292c.243.162.677.27 1.08.271.152 0 .297-.015.43-.044.427-.095.874-.448 1.349-.82.377-.296.913-.672 1.323-.782a1.494 1.490 0 0 1 .37-.05.611.610 0 0 1 .095.005c.27.034.533.125 1.003.472.835.62 4.531 3.815 4.566 3.846.002.002.238.203.22.537-.007.186-.11.352-.294.466a.902.900 0 0 1-.484.15.804.802 0 0 1-.428-.124c-.014-.01-1.28-1.157-1.746-1.543-.074-.06-.146-.115-.22-.115a.122.122 0 0 0-.096.045c-.073.09.01.212.105.294l1.48 1.47c.002 0 .184.17.204.395.012.244-.106.447-.35.606a.957.955 0 0 1-.526.171.766.764 0 0 1-.42-.127l-.214-.206a21.035 20.978 0 0 0-1.08-1.009c-.072-.058-.148-.112-.221-.112a.127.127 0 0 0-.094.038c-.033.037-.056.103.028.212a.698.696 0 0 0 .075.083l1.078 1.198c.01.01.222.26.024.511l-.038.048a1.180 1.178 0 0 1-.1.096c-.184.15-.43.164-.527.164a.8.798 0 0 1-.147-.012c-.106-.018-.178-.048-.212-.089l-.013-.013c-.06-.06-.602-.609-1.054-.98-.059-.05-.133-.11-.21-.11a.128.128 0 0 0-.096.042c-.09.096.044.24.1.293l.92 1.003a.204.204 0 0 1-.033.062c-.033.044-.144.155-.479.196a.910.907 0 0 1-.122.007c-.345 0-.712-.164-.902-.264a1.343 1.340 0 0 0 .13-.576 1.368 1.365 0 0 0-1.42-1.357c.024-.342-.025-.99-.697-1.274a1.455 1.452 0 0 0-.575-.125c-.146 0-.287.025-.42.075a1.153 1.150 0 0 0-.671-.564 1.520 1.515 0 0 0-.494-.085c-.28 0-.537.08-.767.242a1.168 1.165 0 0 0-.903-.43 1.173 1.170 0 0 0-.82.335c-.287-.217-1.425-.93-4.467-1.613a17.390 17.344 0 0 1-.692-.189 4.822 4.820 0 0 0-.077.494l.67.157c3.108.682 4.136 1.391 4.309 1.525a1.145 1.142 0 0 0-.09.442 1.160 1.158 0 0 0 1.378 1.132c.096.467.406.821.879 1.003a1.165 1.162 0 0 0 .415.08c.09 0 .179-.012.266-.034.086.22.282.493.722.668a1.233 1.230 0 0 0 .457.094c.122 0 .241-.022.355-.063a1.373 1.370 0 0 0 1.269.841c.37.002.726-.147.985-.41.221.121.688.341 1.163.341.06 0 .118-.002.175-.01.47-.059.689-.24.789-.382a.571.570 0 0 0 .048-.078c.11.032.234.058.373.058.255 0 .501-.086.75-.265.244-.174.418-.424.444-.637v-.01c.083.017.167.026.251.026.265 0 .527-.082.773-.242.48-.31.562-.715.554-.98a1.280 1.279 0 0 0 .978-.194 1.040 1.040 0 0 0 .502-.808 1.088 1.085 0 0 0-.16-.653c.804-.342 2.636-1.003 4.795-1.483a4.734 4.721 0 0 0-.067-.492 27.742 27.667 0 0 0-5.049 1.62zm5.123-.763c0 4.027-5.166 7.293-11.537 7.293-6.372 0-11.538-3.266-11.538-7.293 0-4.028 5.165-7.293 11.539-7.293 6.371 0 11.537 3.265 11.537 7.293zm.46.004c0-4.272-5.374-7.755-12-7.755S.002 7.277.002 11.550L0 12.004c0 4.533 4.695 8.203 11.999 8.203 7.347 0 12-3.670 12-8.204z";
const handshake = (c) => `<path transform="translate(2.4 2.3) scale(.8)" fill="${c}" d="${HANDSHAKE}"/>`;
// Banco Macro (2025): two concentric half rings over a dot, from the bank's own logo.
const macro = (c) => `<g transform="translate(4.2 7.4) scale(.03)" fill="${c}">
  <path d="M0 260A260 260 0 0 1 520 260H451.2A191.2 191.2 0 0 0 68.8 260Z"/>
  <path d="M96 260A164 164 0 0 1 424 260H355.9A95.9 95.9 0 0 0 164.1 260Z"/><circle cx="260" cy="260" r="48.5"/></g>`;
// SUBE: the white "SUBE" of the card, with the green up-arrow on top of the U.
const sube = `<text x="12" y="16" text-anchor="middle" font-family="DM Sans, system-ui, sans-serif" font-size="8.4"
  font-weight="800" fill="#FFFFFF" textLength="17.4" lengthAdjust="spacingAndGlyphs">SUBE</text>
  <path d="M7.95 7.2l1.9 2.6H6.05z" fill="#8DC63F"/>`;
// A short wordmark that always fits the tile (squeezed to `w` units if longer).
const word = (t, c, { size = 8.2, w = 0, weight = 800, italic = false, y = 15 } = {}) =>
  `<text x="12" y="${y}" text-anchor="middle" font-family="DM Sans, system-ui, sans-serif" font-size="${size}"
    font-weight="${weight}"${italic ? ' font-style="italic"' : ""} fill="${c}"${w ? ` textLength="${w}" lengthAdjust="spacingAndGlyphs"` : ""}>${t}</text>`;

/** [key, test words, background, mark]. Order matters: the first match wins (Mercado Libre before Mercado Pago). */
const BRANDS = [
  ["mercadolibre", ["mercado libre", "mercadolibre"], "#FFE600", handshake("#2D3277")],
  ["mercadopago", ["mercado pago", "mercadopago", "mercado credito", "dinero en cuenta", "prepaga mercado pago"], "#00B1EA", handshake("#FFFFFF")],
  ["sube", ["sube", "transporte publico"], "#1A9BD7", sube],
  ["macro", ["macro", "banco macro"], "#0039E3", macro("#FFFFFF")],
  ["visa", ["visa"], "#1A1F71", word("VISA", "#FFFFFF", { size: 8, w: 18, italic: true, weight: 900 })],
  ["mastercard", ["mastercard", "master card"], "#1F1F1F",
    `<circle cx="9.3" cy="12" r="5" fill="#EB001B"/><circle cx="14.7" cy="12" r="5" fill="#F79E1B"/>
     <path d="M12 8a5 5 0 0 1 0 8a5 5 0 0 1 0-8z" fill="#FF5F00"/>`],
  ["maestro", ["maestro"], "#1F1F1F",
    `<circle cx="9.3" cy="12" r="5" fill="#E7302A"/><circle cx="14.7" cy="12" r="5" fill="#0099DF"/>
     <path d="M12 8a5 5 0 0 1 0 8a5 5 0 0 1 0-8z" fill="#6C6BBD"/>`],
  ["amex", ["american express", "amex"], "#2E77BC", word("AMEX", "#FFFFFF", { size: 7.4, w: 18, weight: 900 })],
  ["naranja", ["naranja"], "#FE5000", word("NX", "#FFFFFF", { size: 10, weight: 900, y: 15.6 })],
  ["cabal", ["cabal"], "#005BAA", word("cabal", "#FFFFFF", { size: 7.4, w: 17 })],
  ["uala", ["uala"], "#2F55D4", word("ualá", "#FFFFFF", { size: 8, w: 16 })],
  ["brubank", ["brubank"], "#6A2CF5", word("b", "#FFFFFF", { size: 13, weight: 900, y: 16.5 })],
  ["galicia", ["galicia"], "#F47920", word("G", "#FFFFFF", { size: 12, weight: 900, y: 16.2 })],
  ["santander", ["santander"], "#EC0000", word("S", "#FFFFFF", { size: 12, weight: 900, y: 16.2 })],
  ["bbva", ["bbva", "frances"], "#004481", word("BBVA", "#FFFFFF", { size: 7.4, w: 18, weight: 900 })],
  ["nacion", ["banco nacion", "bna"], "#00589C", word("BNA", "#FFFFFF", { size: 8, w: 16, weight: 900 })],
  ["provincia", ["banco provincia", "bapro", "cuenta dni"], "#00A651", word("DNI", "#FFFFFF", { size: 8, w: 16, weight: 900 })],
  ["uber", ["uber"], "#000000", word("Uber", "#FFFFFF", { size: 8, w: 17, weight: 600 })],
  ["cabify", ["cabify"], "#7145D6", word("cabify", "#FFFFFF", { size: 7, w: 18, weight: 700 })],
  ["didi", ["didi"], "#FC4C02", word("DiDi", "#FFFFFF", { size: 8, w: 16, weight: 900 })],
  ["pedidosya", ["pedidosya", "pedidos ya"], "#FA0050", word("YA", "#FFFFFF", { size: 10, weight: 900, y: 15.6 })],
  ["rappi", ["rappi"], "#FF441F", word("rappi", "#FFFFFF", { size: 7.6, w: 17 })],
  ["netflix", ["netflix"], "#000000", word("N", "#E50914", { size: 15, weight: 900, y: 17.4 })],
  ["spotify", ["spotify"], "#1DB954",
    `<path d="M6.6 9.6c3.7-1.1 7.7-.8 10.9.9M7.3 12.4c3-.8 6.1-.5 8.7.8M8 15c2.3-.6 4.6-.3 6.6.6" fill="none" stroke="#191414"
     stroke-width="1.6" stroke-linecap="round"/>`],
  ["youtube", ["youtube"], "#FF0000", `<path d="M10 8.6v6.8l5.6-3.4z" fill="#FFFFFF"/>`],
  ["disney", ["disney"], "#0E2A8A", word("D+", "#FFFFFF", { size: 10, weight: 900, y: 15.6 })],
  ["max", ["hbo", "max.com"], "#002BE7", word("max", "#FFFFFF", { size: 8, w: 16, weight: 900 })],
  ["prime", ["amazon prime", "primevideo", "prime video", "amazon"], "#00A8E1", word("prime", "#FFFFFF", { size: 7.2, w: 18, weight: 700 })],
  ["google", ["google"], "#FFFFFF", word("G", "#4285F4", { size: 13, weight: 800, y: 16.6 })],
  ["steam", ["steam"], "#171A21", word("steam", "#FFFFFF", { size: 7, w: 18, weight: 700 })],
  ["personal", ["personal flow", "telecom personal", "personal movil"], "#00A3E0", word("personal", "#FFFFFF", { size: 6, w: 19, weight: 700 })],
  ["movistar", ["movistar"], "#019DF4", word("M", "#FFFFFF", { size: 12, weight: 900, y: 16.2 })],
  ["claro", ["claro"], "#DA291C", word("claro", "#FFFFFF", { size: 7.4, w: 17, weight: 700 })],
  ["edenor", ["edenor"], "#00843D", word("edenor", "#FFFFFF", { size: 6.6, w: 19, weight: 700 })],
  ["edesur", ["edesur"], "#E4002B", word("edesur", "#FFFFFF", { size: 6.6, w: 19, weight: 700 })],
  ["metrogas", ["metrogas"], "#0072CE", word("metro", "#FFFFFF", { size: 7, w: 18, weight: 700 })],
  ["aysa", ["aysa"], "#0093D0", word("AySA", "#FFFFFF", { size: 7.6, w: 17, weight: 800 })],
  ["coto", ["coto"], "#E30613", word("COTO", "#FFFFFF", { size: 7.6, w: 18, weight: 900 })],
  ["carrefour", ["carrefour"], "#004E9F", word("C", "#E1000F", { size: 13, weight: 900, y: 16.6 })],
  ["dia", ["supermercado dia", "dia tienda", "dia %", "dia%"], "#E30613", word("DIA", "#FFFFFF", { size: 8, w: 16, weight: 900 })],
  ["jumbo", ["jumbo"], "#00A651", word("jumbo", "#FFFFFF", { size: 7, w: 18, weight: 800 })],
  ["disco", ["supermercado disco", "disco supermercado", "disco virtual"], "#D52B1E", word("disco", "#FFFFFF", { size: 7, w: 18, weight: 800 })],
  ["changomas", ["changomas", "chango mas"], "#00539F", word("+", "#FFD100", { size: 15, weight: 900, y: 17 })],
  ["ypf", ["ypf"], "#0055A4", word("YPF", "#FFFFFF", { size: 8.6, w: 17, weight: 900 })],
  ["shell", ["shell"], "#FFD500", word("Shell", "#DD1D21", { size: 7.6, w: 17, weight: 900 })],
  ["axion", ["axion"], "#5B2C86", word("AXION", "#FFFFFF", { size: 6.6, w: 19, weight: 900 })],
  ["mcdonalds", ["mcdonald", "mc donald"], "#DA291C", word("M", "#FFC72C", { size: 14, weight: 900, y: 17 })],
  ["burgerking", ["burger king"], "#F5EBDC", word("BK", "#D62300", { size: 9.6, weight: 900, y: 15.4 })],
  ["starbucks", ["starbucks"], "#00704A", word("★", "#FFFFFF", { size: 12, y: 16.2 })],
  ["farmacity", ["farmacity"], "#003DA5", word("F", "#FFFFFF", { size: 13, weight: 900, y: 16.6 })],
];

// whole words only ("sube" in "SUBE viajes" yes, "macro" in "macroeconomía" no)
const tests = BRANDS.map(([key, words, bg, mark]) => ({ key, bg, mark,
  re: new RegExp(`(^|[^a-z0-9])(${words.map((w) => fold(w).replace(/[.*+?^${}()|[\]\\%]/g, "\\$&")).join("|")})($|[^a-z0-9])`) }));

/** The brand a movement belongs to (by its texts), or null. */
export function brandOf(...texts) {
  const t = fold(texts.filter(Boolean).join(" "));
  if (!t) return null;
  return tests.find((b) => b.re.test(t))?.key ?? null;
}

/** The brand's badge as an inline <svg> (a rounded tile), or "" for an unknown key. */
export function brandSvg(key, size = 34, cls = "brand") {
  const b = tests.find((x) => x.key === key);
  if (!b) return "";
  const ring = b.bg.toUpperCase() === "#FFFFFF" || b.bg === "#FFE600" || b.bg === "#F5EBDC" || b.bg === "#FFD500" ? ' stroke="rgba(0,0,0,.12)" stroke-width="1"' : "";
  return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><rect x=".5" y=".5" width="23" height="23"
    rx="7" fill="${b.bg}"${ring}/>${b.mark}</svg>`;
}

export const BRAND_KEYS = tests.map((b) => b.key);
