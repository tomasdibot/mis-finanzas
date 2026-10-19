# Mis finanzas: guía de instalación

Vas a tener **tu propia copia** de la app: tus gastos e ingresos de Mercado Pago, siempre actualizados, en el
celular y en la compu. Todo queda en **tu** cuenta de Cloudflare: nadie más puede ver tus datos (tampoco quien hizo
la app). Es gratis: usa los planes gratuitos de Cloudflare y GitHub. Solo para cuentas de Mercado Pago de Argentina.

Tardás unos 15 minutos y no hace falta saber programar: son todos clics.

## Qué necesitás

- Tu cuenta de **Mercado Pago** (la de siempre).
- Una cuenta de **GitHub** (gratis): [github.com/signup](https://github.com/signup). Ahí se guarda tu copia de la app.
- Una cuenta de **Cloudflare** (gratis): [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up). Ahí funciona la app.

## Paso 1: tu aplicación de Mercado Pago

La app lee tus movimientos con un permiso que le das vos, a través de una "aplicación" de Mercado Pago que es tuya.

1. Entrá a [Mercado Pago Developers → Tus integraciones](https://www.mercadopago.com.ar/developers/panel/app) con tu
   cuenta de Mercado Pago y tocá **Crear aplicación**.
2. Ponele un nombre (por ejemplo, *Mis finanzas*) y completá lo que te pida.
3. Abrí la aplicación que creaste → **Credenciales de producción**. Dejá esa página abierta: en el paso 2 vas a
   copiar el **Client ID** y el **Client Secret**.

## Paso 2: instalar la app en tu Cloudflare

1. Tocá este botón:

   [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url={{REPO_URL}})

2. Entrá con tu cuenta de Cloudflare y conectá tu cuenta de GitHub cuando te lo pida.
3. En la página de configuración:
   - **Nombre**: podés dejar `mis-finanzas`.
   - **MP_CLIENT_ID** y **MP_CLIENT_SECRET**: pegá los dos datos del paso 1.
4. Tocá **Create and deploy** (Crear y publicar) y esperá unos minutos.
5. Cuando termine, Cloudflare te muestra la dirección de tu app, parecida a
   `https://mis-finanzas.tu-nombre.workers.dev`. Copiala.

## Paso 3: avisarle a Mercado Pago tu dirección

1. Volvé a tu aplicación de Mercado Pago (paso 1) → **Editar** (o *Configuración*).
2. En **URLs de redireccionamiento** pegá tu dirección con `/api/auth/callback` al final, por ejemplo:
   `https://mis-finanzas.tu-nombre.workers.dev/api/auth/callback`
3. Guardá.

## Paso 4: entrar

1. Abrí tu dirección y tocá **Entrar con Mercado Pago**. Aceptá el permiso.
2. La primera vez que entrás, la app queda **a tu nombre**: después solo puede entrar la cuenta de Mercado Pago dueña
   de la aplicación del paso 1.
3. Empieza sola la primera descarga (los últimos 13 meses). Puede tardar unos minutos; podés dejarla trabajando.

En el celular: abrí tu dirección → menú del navegador → **Agregar a pantalla de inicio**.

## Día a día

- Se actualiza sola cada 30 minutos. El botón ↻ (o deslizar hacia abajo) actualiza en el momento.
- Para saber tu saldo y las transferencias a otros bancos, la app le pide a Mercado Pago un reporte de
  "Dinero disponible", como mucho uno por día. **Mercado Pago te manda un email cada vez que lo genera**: es normal.
- Tocá cualquier movimiento para escribir en qué fue, cambiar su categoría o el nombre del comercio.
- **Ajustes → Tus reglas**: tus nombres de comercios y palabras que siempre significan una categoría.
- **Ajustes → Tus datos**: descargar una copia de seguridad, restaurarla, o borrar todo.

## Actualizar la app

Cuando haya una versión nueva, vos decidís cuándo instalarla:

1. **Ajustes → Versión de la app**: la primera vez, escribí tu copia de GitHub (por ejemplo `tu-usuario/mis-finanzas`;
   la ves en [github.com](https://github.com) arriba a la izquierda, en tus repositorios).
2. Tocá **Actualizar la app**. Se abre tu copia en GitHub: tocá **Run workflow** y después el botón verde
   **Run workflow**.
3. En unos minutos la app queda actualizada. Tus datos y tus reglas no cambian.

## Privacidad

- Tus datos están solo en tu cuenta de Cloudflare. La app no manda nada a nadie más: ni estadísticas, ni errores,
  ni avisos de versión.
- El permiso de Mercado Pago se usa solo para **leer** tus movimientos y tu saldo. Queda guardado en tu servidor y
  nunca viaja a tu navegador ni a tus copias de seguridad.
- La app no guarda emails, DNI/CUIT, teléfonos ni números de cuenta de nadie. A quién le transferís se reconoce con un
  código cifrado; vos le ponés el nombre.

## Si algo no anda

- **"Falta configurar la app de Mercado Pago"**: faltan MP_CLIENT_ID o MP_CLIENT_SECRET. En Cloudflare → Workers →
  tu app → **Settings → Variables and Secrets**, agregalos (tipo *Secret*).
- **"Esta app solo acepta la cuenta de Mercado Pago dueña…"**: entraste con otra cuenta de Mercado Pago. Cerrá sesión
  en Mercado Pago y entrá con la cuenta que creó la aplicación del paso 1.
- **Mercado Pago dice que la dirección de redireccionamiento no es válida**: revisá el paso 3 (tiene que terminar
  en `/api/auth/callback` y empezar con `https://`).
- **"El permiso de Mercado Pago venció"**: Ajustes → Cerrar sesión, y volvé a entrar con Mercado Pago.

## Desinstalar

1. En la app: **Ajustes → Tus datos → Borrar todos mis datos** (si querés, antes descargá una copia).
2. Cloudflare → **Workers & Pages** → tu app → **Settings** → **Delete**. Y en **Storage & Databases → D1**, borrá la
   base `mis-finanzas`.
3. GitHub → tu copia → **Settings** → **Delete this repository**.
4. Mercado Pago Developers → tu aplicación → eliminarla.
