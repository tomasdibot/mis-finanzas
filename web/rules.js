// Reglas de la app: cómo se nombra cada comercio y en qué categoría cae cada gasto.
// Son las reglas generales de la plantilla, iguales para todos. Tus propios nombres y categorías se guardan en tu
// base (notas, destinatarios, palabras aprendidas), nunca acá. La nube guarda solo los datos crudos.
//
// Palabras clave: se buscan en minúsculas, como fragmentos, dentro de " comercio + detalle + descripción + sitio "
// (con un espacio al principio y al final). Gana la primera regla que coincide, así que el orden importa.
// Un espacio antes o después de la palabra (" dia ") hace que coincida solo como palabra completa.

export default {
  // ---------------------------------------------------------------- nombres de comercios
  merchants: {
    // Lo que viene después de "MERPAGO*" en el resumen, cuando no es legible.
    aliases: {
      MERCADOLIBRE: "Mercado Libre", MERCADOPAGO: "Mercado Pago", MERCADOPAGOPAGOCR: "Mercado Crédito",
      MELI: "Meli+", SUBEVIAJES: "SUBE (viajes)", EMOVASUBTE: "Subte (Emova)",
    },
    // Descripciones que traen el nombre del comercio adentro. El grupo (...) es el nombre.
    patterns: [
      "^Compra en (.+?)(?:\\s*-\\s*Suc\\.?.*)?$",
      "^Pago con Mercado Pago en (.+)$",
      "^Producto de (.+)$",
      "^Reserva en (.+)$",
      "^Pago de Tasa:\\s*(.+)$",
      "^([^-]{2,30}?)\\s+-\\s+.+$",          // "Inflables Ejemplo - Servicio de inflado" -> Inflables Ejemplo
    ],
    // Etiqueta interna de Mercado Pago -> nombre, cuando no hay otro dato.
    branches: { "Transport - Public transport recharge": "SUBE (carga)", "Transport - QRC": "Transporte público" },
    // Sitios web de tiendas online -> nombre.
    sites: { "medicus.com.ar": "Medicus", "passline.com": "Passline" },
    // Descripciones que no son un nombre de comercio.
    generic: ["pago", "pago online", "varios", "proximity payment", "payment for debt engine", "pago de cuota"],
  },

  // ---------------------------------------------------------------- categorías
  defaultOut: "Otros",
  defaultIn: "Transferencias recibidas",
  // No cuenta como gasto: se muestra solo si activás "+ Financiadas y retenciones".
  // Las compras financiadas cuentan cuando se paga cada cuota ("Cuotas de créditos"), no al comprar.
  // Las transferencias enviadas (a cuentas de Mercado Pago o a alias/CBU/CVU de otros bancos) SÍ cuentan como gasto.
  nonConsumption: ["Retenciones y disputas", "Compras financiadas (se cuentan por cuota)"],

  // Cada categoría pertenece a un grupo (se usa para agrupar en los filtros).
  groups: {
    "Supermercado y almacén": "Supermercado y comida", "Verdulería": "Supermercado y comida",
    "Panadería": "Supermercado y comida", "Carnicería": "Supermercado y comida",
    "Comida afuera y delivery": "Supermercado y comida", "Regalos": "Otros",
    "Hogar": "Hogar y servicios", "Servicios e impuestos": "Hogar y servicios", "Mascotas": "Hogar y servicios",
    "Transporte": "Transporte", "Auto": "Transporte", "Salud": "Salud", "Belleza y cuidado personal": "Salud",
    "Compras varias": "Compras", "Tecnología": "Compras", "Ropa": "Compras", "Libros y educación": "Compras",
    "Ocio": "Ocio y suscripciones", "Suscripciones": "Ocio y suscripciones", "Deportes y gimnasio": "Ocio y suscripciones",
    "Viajes": "Ocio y suscripciones",
    "Cuotas de créditos": "Cuotas", "Otros": "Otros",
    "Transferencias enviadas": "Transferencias", "Transferencias a otros bancos": "Transferencias",
  },

  // Ícono de cada categoría (dibujo de línea en el color de la app, debajo de su columna en el gráfico).
  // Los nombres de los dibujos están en lib/icons.js: cart, carrot, utensils, home, bolt, bus, health, bag, laptop,
  // shirt, book, ticket, repeat, card, gift, send, bank, box, scale, receipt, inbox, briefcase, wallet, tag, undo,
  // people, plus, bread, drumstick, paw, scissors, dumbbell, plane, car.
  icons: {
    "Panadería": "bread", "Carnicería": "drumstick", "Mascotas": "paw", "Belleza y cuidado personal": "scissors",
    "Deportes y gimnasio": "dumbbell", "Viajes": "plane", "Auto": "car",
    "Supermercado y almacén": "cart", "Verdulería": "carrot", "Comida afuera y delivery": "utensils", "Hogar": "home",
    "Servicios e impuestos": "bolt", "Transporte": "bus", "Salud": "health", "Compras varias": "bag", "Tecnología": "laptop",
    "Ropa": "shirt", "Libros y educación": "book", "Ocio": "ticket", "Suscripciones": "repeat", "Cuotas de créditos": "card",
    "Regalos": "gift", "Transferencias enviadas": "send", "Transferencias a otros bancos": "bank", "Otros": "box",
    "Retenciones y disputas": "scale", "Compras financiadas (se cuentan por cuota)": "receipt",
    "Transferencias recibidas": "inbox", "Sueldo": "briefcase", "Dinero propio (desde tu banco)": "wallet", "Ventas": "tag",
    "Devoluciones": "undo", "Préstamos y devoluciones de amigos": "people", "Otros ingresos": "plus",
  },

  // Color de cada categoría: solo tiñe su ícono (el círculo de fondo y el dibujo), en todos lados igual. Las barras
  // de los gráficos siguen en un solo color, así que el largo sigue siendo lo único que se compara.
  tints: {
    "Panadería": "#c98a3a", "Carnicería": "#b23a48", "Mascotas": "#6d8b74", "Belleza y cuidado personal": "#d16fa9",
    "Deportes y gimnasio": "#1f9e89", "Viajes": "#00a0c6", "Auto": "#8e5a3c",
    "Supermercado y almacén": "#2e9d6a", "Verdulería": "#6aa84f", "Comida afuera y delivery": "#e07b39",
    "Hogar": "#b07d4f", "Servicios e impuestos": "#d4a017", "Transporte": "#3a7bd5", "Salud": "#d9534f",
    "Compras varias": "#6d7fcc", "Tecnología": "#4a6fa5", "Ropa": "#c2548f", "Libros y educación": "#8a7a2e",
    "Ocio": "#9b59b6", "Suscripciones": "#17a2b8", "Cuotas de créditos": "#7f8c8d", "Regalos": "#e86fa0",
    "Transferencias enviadas": "#607d8b", "Transferencias a otros bancos": "#455a64", "Otros": "#9e9e9e",
    "Retenciones y disputas": "#8d6e63", "Compras financiadas (se cuentan por cuota)": "#a1887f",
    "Transferencias recibidas": "#2e9d6a", "Sueldo": "#1e88e5", "Dinero propio (desde tu banco)": "#00897b",
    "Ventas": "#f39c12", "Devoluciones": "#6d7fcc", "Préstamos y devoluciones de amigos": "#e86fa0",
    "Otros ingresos": "#9e9e9e",
  },

  // Nombre corto de cada categoría para el gráfico de columnas (el nombre completo sigue en la tabla y el detalle).
  shortNames: {
    "Supermercado y almacén": "Súper y almacén", "Comida afuera y delivery": "Comida afuera",
    "Servicios e impuestos": "Servicios", "Libros y educación": "Educación", "Cuotas de créditos": "Cuotas",
    "Suscripciones": "Suscrip- ciones", "Belleza y cuidado personal": "Belleza", "Deportes y gimnasio": "Deportes",
    "Transferencias enviadas": "Enviadas", "Transferencias a otros bancos": "Otros bancos",
    "Retenciones y disputas": "Retenciones", "Compras financiadas (se cuentan por cuota)": "Financiadas",
    "Transferencias recibidas": "Recibidas", "Dinero propio (desde tu banco)": "Dinero propio",
    "Préstamos y devoluciones de amigos": "Amigos", "Otros ingresos": "Otros",
  },

  // Una transferencia a una empresa (titular con "S.A.", "S.R.L."...) se trata como compra.
  companyMarkers: ["s.a.", "sa", "s.r.l.", "srl", "s.a.s.", "sas", "s.a.u.", "sau", "sociedad", "cooperativa",
                   "coop", "asociacion", "asociación", "fundacion", "fundación", "cia", "cía", "ltda"],

  // Tipo de movimiento de Mercado Pago ("direction:operation_type:row_type") -> categoría. Gana sobre todo.
  types: {
    "out:money_transfer:payment": "Transferencias enviadas",
    // Transferencias a un alias/CBU/CVU de otro banco o billetera (propia o de otra persona). Mercado Pago las
    // informa solo en el reporte de saldo ("payout"), que llega con demora.
    "out:payout:payment": "Transferencias a otros bancos", "out:payout:payout": "Transferencias a otros bancos",
  },
  typeFallback: { "out:recurring_payment:payment": "Suscripciones" },   // solo si nada más coincidió
  methods: { consumer_credits: "Compras financiadas (se cuentan por cuota)" }, // pagado con Mercado Crédito
  units: { "credits/core": "Cuotas de créditos" },
  unitFallback: { "marketplace/checkout_on": "Compras varias" },       // compra en Mercado Libre sin otra pista
  branches: {
    "Transport - QRC": "Transporte",                       // colectivo/tren/subte pagado con QR
    "Transport - Public transport recharge": "Transporte", // carga de SUBE
    "Suscripciones de Loyalty": "Suscripciones",           // Meli+ y similares
  },
  // Categoría de Mercado Libre del producto -> categoría. Abarca todo lo que está debajo; gana la más larga.
  mercadoLibre: {
    "Alimentos y Bebidas": "Supermercado y almacén", "Salud y Equipamiento Médico": "Salud",
    "Celulares y Teléfonos": "Tecnología", "Computación": "Tecnología", "Electrónica, Audio y Video": "Tecnología",
    "Consolas y Videojuegos": "Tecnología", "Cámaras y Accesorios": "Tecnología",
    "Hogar, Muebles y Jardín": "Hogar", "Electrodomésticos y Aires Ac.": "Hogar", "Herramientas": "Hogar",
    "Construcción": "Hogar", "Industrias y Oficinas": "Hogar", "Ropa y Accesorios": "Ropa",
    "Libros, Revistas y Comics": "Libros y educación", "Instrumentos Musicales": "Ocio",
    "Juegos y Juguetes": "Ocio", "Deportes y Fitness": "Deportes y gimnasio", "tickets": "Ocio",
    "Animales y Mascotas": "Mascotas", "Belleza y Cuidado Personal": "Belleza y cuidado personal",
    "Accesorios para Vehículos": "Auto",
  },
  // Rubro del comercio según la red de tarjetas (código MCC, norma ISO 18245) -> categoría. Mercado Pago lo informa
  // en las compras con su tarjeta en un local. Gana sobre las palabras clave; un código que no está acá no decide nada.
  mcc: {
    // supermercado y almacén
    "5411": "Supermercado y almacén", "5441": "Supermercado y almacén", "5451": "Supermercado y almacén",
    "5499": "Supermercado y almacén", "5300": "Supermercado y almacén",
    "5462": "Panadería", "5422": "Carnicería",
    // comida afuera
    "5812": "Comida afuera y delivery", "5814": "Comida afuera y delivery",
    // transporte (público, taxis, micros)
    "4111": "Transporte", "4112": "Transporte", "4121": "Transporte", "4131": "Transporte", "4789": "Transporte",
    // auto (nafta, peajes, estacionamiento, taller, lavadero, gomería, repuestos)
    "5541": "Auto", "5542": "Auto", "4784": "Auto", "7523": "Auto", "7538": "Auto", "7542": "Auto", "5532": "Auto",
    "5533": "Auto",
    // viajes (aerolíneas, aeropuertos, hoteles, agencias)
    "4511": "Viajes", "4582": "Viajes", "7011": "Viajes", "4722": "Viajes",
    // salud
    "5912": "Salud", "5975": "Salud", "5976": "Salud", "8011": "Salud", "8021": "Salud",
    "8042": "Salud", "8043": "Salud", "8049": "Salud", "8050": "Salud", "8062": "Salud", "8071": "Salud",
    "8099": "Salud",
    // belleza y cuidado personal (peluquería, spa, cosmética)
    "7230": "Belleza y cuidado personal", "7298": "Belleza y cuidado personal", "5977": "Belleza y cuidado personal",
    // mascotas (veterinaria, pet shop)
    "0742": "Mascotas", "5995": "Mascotas",
    // deportes y gimnasio (clubes, gimnasios, artículos deportivos)
    "7941": "Deportes y gimnasio", "7997": "Deportes y gimnasio", "5941": "Deportes y gimnasio",
    // servicios e impuestos
    "4814": "Servicios e impuestos", "4899": "Servicios e impuestos", "4900": "Servicios e impuestos",
    "9311": "Servicios e impuestos", "9222": "Servicios e impuestos", "9399": "Servicios e impuestos",
    "6300": "Servicios e impuestos", "6513": "Servicios e impuestos",
    // hogar (incluye lavandería y mudanzas)
    "5200": "Hogar", "5211": "Hogar", "5231": "Hogar", "5251": "Hogar", "5261": "Hogar", "5712": "Hogar",
    "5713": "Hogar", "5714": "Hogar", "5719": "Hogar", "5722": "Hogar",
    "7210": "Hogar", "7211": "Hogar", "7216": "Hogar", "4214": "Hogar",
    // tecnología
    "5732": "Tecnología", "5734": "Tecnología", "5045": "Tecnología", "5946": "Tecnología",
    // ropa
    "5611": "Ropa", "5621": "Ropa", "5631": "Ropa", "5641": "Ropa", "5651": "Ropa", "5655": "Ropa", "5661": "Ropa",
    "5691": "Ropa", "5699": "Ropa", "5948": "Ropa",
    // libros y educación
    "5942": "Libros y educación", "5943": "Libros y educación", "5192": "Libros y educación", "8211": "Libros y educación",
    "8220": "Libros y educación", "8241": "Libros y educación", "8244": "Libros y educación", "8249": "Libros y educación",
    "8299": "Libros y educación",
    // ocio
    "5813": "Ocio", "7832": "Ocio", "7922": "Ocio", "7929": "Ocio", "7991": "Ocio", "7992": "Ocio",
    "7994": "Ocio", "7996": "Ocio", "7999": "Ocio", "5945": "Ocio", "5816": "Ocio",
    // suscripciones digitales
    "5815": "Suscripciones", "5817": "Suscripciones", "5818": "Suscripciones",
    // regalos (florería, regalería)
    "5992": "Regalos", "5947": "Regalos",
    // compras varias
    "5310": "Compras varias", "5311": "Compras varias", "5331": "Compras varias", "5399": "Compras varias",
    "5944": "Compras varias", "5964": "Compras varias", "5999": "Compras varias",
  },
  // Palabras (en comercio, detalle, el "Motivo" de una transferencia o la nota que escribas) -> categoría.
  // Se comparan sin tildes ni mayúsculas: "Café con Ana" encuentra "cafe". Gana la primera lista que coincida.
  // Una palabra corta va con un espacio adelante (" flor") para que coincida solo al principio de una palabra
  // ("flores", "florería" sí; "coliflor" no). Lo que no está acá lo aprende la app de tus notas: si escribís
  // "Flores" y elegís la categoría, la próxima vez "flores" ya cae ahí (Ajustes → Palabras aprendidas).
  keywords: [
    ["Transferencias a otros bancos", ["payout", "withdrawal", "retiro"]],
    ["Retenciones y disputas", ["reserve", "dispute", "chargeback", "mediation"]],
    ["Suscripciones", ["netflix", "spotify", "disney", "hbo", " max ", "youtube", "apple", "google", "icloud",
                       "amazon prime", "prime video", "paramount", "openai", "chatgpt", "claude", "meli+", "suscripcion",
                       "crunchyroll", "twitch", "patreon", " canva ", "adobe", "microsoft", "office 365", "dropbox",
                       "github", " notion ", "mubi", "star+", "deezer", "tidal", "membresia", "abono mensual"]],
    ["Verdulería", ["verduler", "fruteria", "fruta", "verdura", "tomate", "lechuga", "cebolla", "zanahoria", " palta",
                    "frutilla", "mandarina", " limon", " banana", "manzana"]],
    ["Panadería", ["panader", " pan ", "pan dulce", "medialuna", "confiteria", "pasteleria", "bizcocho", "facturitas"]],
    ["Carnicería", ["carnicer", "polleria", "pescader", "frigorifico"]],
    ["Supermercado y almacén", ["coto", "carrefour", "jumbo", "disco", " dia ", "supermercado", " super ", "mercadito",
                                "almacen", "kiosco", "diarco", "drogueria",
                                "chino ", "compras de la semana", " leche", "fiambre", "dietetica", "huevo",
                                " yerba", "mayorista", "makro", "changomas", "la anonima", " vea ", "maxiconsumo",
                                "autoservicio", "queso", "galletit", "gaseosa", "vinoteca",
                                " vino ", "mercaderia", "comestible"]],
    ["Mascotas", ["mascota", "veterinari", "balanceado", "piedritas", "pet shop", "petshop", "alimento para perro",
                  "alimento para gato", "puppis"]],
    // antes que "Comida afuera" para que "heladera" no caiga en helado
    ["Hogar", ["ferreter", "pinturer", "corralon", "bazar", "mueble", "colchon", "sabana", "toalla", "cortina",
               "lampara", " foco", "limpieza", "lavandin", "detergente", "lavanderia", "tintoreria", "plomer",
               "electricista", "gasista", "cerrajer", "vivero", "maceta", " planta", "decoracion", "sodimac", " easy ",
               "blaisten", "mudanza", "flete",
               "electrodomestic", "heladera", "lavarropa", "microondas", "aire acondicionado", "ventilador", "estufa",
               "garrafa", "vajilla", "almohada"]],
    ["Comida afuera y delivery", ["rappi", "pedidosya", "pedidos ya", "mcdonald", "burger", "hamburgues", "starbucks",
                                  "cafe", "resto", "pizz", "sushi", "helad", "fudo", "cerveceria", "cerveza",
                                  "birra", "tostado", "almuerzo", "cena ", "cenamos", "desayuno", "merienda",
                                  "empanada", "parrilla", "asado", "comida", "delivery", "brunch", "picada",
                                  "bodegon", "cantina", "lomito", "kebab", "shawarma", " taco", "trago", "almorz", "cenar",
                                  "mostaza", "kfc", "subway", "havanna", "grido", "freddo", "food", "pub ", "vermut",
                                  " pancho"]],
    // antes que "Transporte" y "Servicios": la nafta, el peaje o el seguro del auto son del auto
    ["Auto", ["shell", "ypf", "axion", "peaje", "estacionamiento", "nafta", "combustible", "gomeria", "mecanico", " vtv",
              "cochera", "lavado de auto", "lubricentro", "repuesto", "seguro del auto", "patente del auto"]],
    ["Transporte", ["uber", "cabify", "didi", "sube", "subte", "taxi", "remis",
                    "colectivo", "tren ", "bondi", "combi", " micro ",
                    "omnibus", "flecha bus", "plataforma 10", "pasaje", "ecobici", "monopatin"]],
    // después de "Transporte": "SUBE (viajes)" es transporte, no un viaje
    ["Viajes", ["hotel", "airbnb", "hostel", "booking", "despegar", "almundo", "turismo", "viaje", "vacaciones",
                "aerolineas", "flybondi", "jetsmart", "vuelo", "camping", "excursion"]],
    ["Salud", ["farmacia", "farmacity", "osde", "swiss", "medicus", "galeno", "clinica", "medico", "dentista",
               "odontolog", "psicolog", "kinesio", "remedio", "analisis", "optica", "anteojo", " lentes", "laboratorio",
               "vacuna", "hospital", "sanatorio", "guardia", "pediatra", "nutricion", "terapia", "psiquiatr",
               "medicament", "ibuprofeno", "omint", "medife", "sancor salud", "obra social", "dermatolog", "ginecolog",
               "oftalmolog", "traumatolog", "pasta dental", "cepillo de dientes", "preservativo"]],
    ["Belleza y cuidado personal", ["peluquer", "barberia", "manicur", "depilacion", "masaje", " spa ", "perfum",
                                    "shampoo", "desodorante", "cosmetic", "maquillaje", "esmalte", "estetica"]],
    ["Servicios e impuestos", ["edenor", "edesur", "metrogas", "aysa", "telecentro", "fibertel", " personal ",
                               "movistar", " claro ", "expensas", " abl ", "alquiler", "pago de tasa", "luz ", " gas ",
                               "internet", "celular", "monotributo", "impuesto", "telefono", "wifi", "cablevision",
                               "directv", " flow ", " arba", " agip", " afip", " arca ", "rentas", "municipal", "seguro",
                               "patente", "inmobiliaria", "contador", "tasa ", "multa"]],
    ["Tecnología", ["notebook", "computadora", " compu", "monitor", "teclado", "mouse", "auricular", "parlante",
                    "cargador", "pendrive", "disco externo", "impresora", "cartucho", "toner", "tablet", "ipad", "iphone",
                    "samsung", "motorola", "xiaomi", "garbarino", "fravega", "musimundo", "consola", "televisor",
                    "smart tv", "camara", "funda", "joystick", "smartwatch"]],
    ["Regalos", ["regalo", "cumple", "cumpleanos", "presente", "obsequio", "souvenir", "dia de la madre", "dia del padre",
                 "dia del nino", "navidad", "aniversario", "regaleria"]],
    ["Ropa", ["ropa", "zapatilla", "remera", "pantalon", "campera", "zapato", " bota", " buzo", "camisa", "vestido",
              "pollera", " jean", " medias", " malla", "bermuda", "sweater", "corbata", "cartera", "mochila", "calzado",
              "indumentaria", "lenceria", "boxer", "ojota", " gorra", "sombrero", "bufanda", "jogging", " calza"]],
    ["Compras varias", ["mercadolibre", "mercado libre", "tienda", "zara", "adidas", "nike", "falabella", "shein",
                        "amazon", "temu", "aliexpress", "shopping", "dafiti", "netshoes", "tiendamia"]],
    ["Libros y educación", ["libro", "curso", "clase", "facultad", "universidad", "colegio", "cuota escolar", "librer",
                            "fotocopia", "apunte", " utiles", "cuaderno", "lapic", "birome", "matricula", "seminario",
                            "capacitacion", "idioma", " ingles", "examen", "inscripcion", "udemy", "coursera", "platzi",
                            "jardin de infantes", "guarderia", "profesor"]],
    ["Deportes y gimnasio", ["gimnasio", "gym", "padel", "tenis", "golf", " club", "futbol", "cancha", "pileta", "natacion", "yoga", "pilates", "crossfit", "deportes", "deportivo",
                             "decathlon", "megatlon", "sportclub"]],
    ["Ocio", ["cine", "teatro", "steam", "playstation", "bar ", "boliche",
              "passline", "recital", "entrada", "museo", " show ", "concierto", "festival", "parque",
              "bowling", "karaoke", "escape room", "videojuego", "nintendo", "xbox", "ticketek",
              "tuentrada", "eventbrite", "jugueteria", "juguete", "billar",
              "casino", "quiniela", "loteria"]],
    ["Transferencias enviadas", ["transferencia enviada", "transferencia a", "enviaste", "cvu", "alias"]],
  ],
  // Entradas de dinero. Ojo: cuando alguien te transfiere desde otro banco (por CVU/alias), Mercado Pago lo registra
  // como "ingreso de dinero" y pone a VOS como quien paga: no se puede saber si fuiste vos o fue otra persona.
  // Por eso se llaman "Transferencias recibidas"; con una nota podés marcar cuáles fueron tuyas, tu sueldo, etc.
  typesIn: {
    "out:regular_payment:refund": "Devoluciones", "out:recurring_payment:refund": "Devoluciones",
    "out:money_transfer:refund": "Devoluciones", "in:account_fund:payment": "Transferencias recibidas",
    "in:money_transfer:payment": "Transferencias recibidas",
  },
  // Categorías que podés elegir para una entrada de dinero, y las palabras de una nota que las eligen solas.
  incomeCategories: ["Transferencias recibidas", "Sueldo", "Dinero propio (desde tu banco)", "Ventas", "Devoluciones",
                     "Préstamos y devoluciones de amigos", "Otros ingresos"],
  keywordsIn: [
    ["Sueldo", ["sueldo", "salario", "haberes", "honorarios", "aguinaldo", "factura"]],
    ["Dinero propio (desde tu banco)", ["mio", "mia", "propio", "desde mi banco", "mi cuenta", "ahorro", "plazo fijo"]],
    ["Ventas", ["venta", "vendi", "cliente"]],
    ["Préstamos y devoluciones de amigos", ["me devolvio", "devolucion", "presta", "deuda", "debia"]],
  ],
};
