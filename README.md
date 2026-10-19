# Mis finanzas

Tus gastos e ingresos de Mercado Pago, siempre actualizados, en el celular y en la compu. **Tu propia copia**, en tu
cuenta de Cloudflare: nadie más ve tus datos. Gratis. Solo Argentina.

- Cada mes en cuatro números, el gasto mes a mes y cada categoría con todo lo que la compone.
- Se actualiza sola desde Mercado Pago; entrás con tu cuenta de Mercado Pago.
- Tus notas, nombres y reglas son tuyos y las actualizaciones no los tocan.
- Solo hechos: sumas y cuentas, sin consejos ni predicciones.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/tomasdibot/mis-finanzas)

**Instalación paso a paso: [LEEME.md](LEEME.md)** (unos 15 minutos, todo con clics).

Para probarla sin instalar nada: abrí cualquier copia con `?demo` al final de la dirección (datos inventados).

---

For developers: a Cloudflare Worker (`src/`) serves the PWA in `web/` and keeps one Owner's data in D1
(`migrations/`, applied by `npm run deploy`). Read `CLAUDE.md`, `CONTEXT.md` and `docs/adr/`. Tests: `npm test`.
