# Mis finanzas

Tus gastos e ingresos de Mercado Pago, siempre a mano, en el celular y en la compu. Gratis. Solo Argentina.

- Entrás con un toque: **Entrar con Mercado Pago**. No hay nada que instalar ni configurar.
- **Tus datos quedan solo en tu dispositivo**: nadie más los guarda ni los ve (ver `web/privacidad.html`).
- Cada mes en cuatro números, el gasto mes a mes y cada categoría con todo lo que la compone.
- Tus notas, nombres y reglas son tuyos. Solo hechos: sumas y cuentas, sin consejos ni predicciones.

Uso: [LEEME.md](LEEME.md).

---

For developers: local-first PWA in `web/` (data in IndexedDB, Mercado Pago read from the browser) served by a
Cloudflare Worker (`src/`) that is a stateless Relay. Read `CLAUDE.md`, `CONTEXT.md` and `docs/adr/0003`.
Tests: `npm test`. Publish: `npm run deploy`.
