# OpFarma — una compañía de agentes con una mano en WhatsApp

Esto es mi resolución del desafío técnico de Paperclip.

Armé una company que busca los lotes de insumos médicos que están por vencer,
encuentra a qué cliente colocárselos según lo que cada uno consume de verdad, y
manda la oferta por WhatsApp. Antes de que salga nada, una persona aprueba el
margen.

- Mi research de Paperclip, en una página: [`research/RESEARCH.md`](research/RESEARCH.md) (la versión larga está en [`research/PAPERCLIP.md`](research/PAPERCLIP.md))
- Por qué tomé cada decisión y con qué me choqué: [`DECISIONS.md`](DECISIONS.md)
- Por qué elegí este problema y de dónde saqué los números: [`research/EXPIRY.md`](research/EXPIRY.md)

## Por qué este problema y no otro

El enunciado deja libre el objetivo de la company, así que lo elegí yo. No
quería hacer "el agente escribe un WhatsApp", porque eso es una demo donde el
agente hace algo que una persona podía hacer igual, sólo que más lento.

Busqué algo que a mano directamente no se haga, y lo encontré en el vencimiento
de stock. Un lote que vence en depósito no te come el margen: te come el 100%
del costo. Las referencias que junté hablan de entre 2% y 5% del inventario por
año.

Saber qué se vence es fácil y cualquier sistema te lo avisa. Lo difícil es saber
a quién vendérselo antes de la fecha, porque hay que cruzar cada lote contra la
rotación histórica de cada cuenta. Con cientos de cuentas eso no se hace mal, no
se hace.

Mientras investigaba encontré que el software comercial del rubro avisa pero no
coloca, y que los proyectos que sí hacen este matching lo resuelven puertas
adentro de una red hospitalaria, moviendo stock entre sedes. De distribuidor a
cliente, como acción comercial, no encontré a nadie.

## Cómo lo armé

```
   Paperclip  (el molde)                    platform/  (las manos)
   ┌───────────────────────────┐            ┌──────────────────────────────┐
   │ OpFarma                   │            │  /api/mcp/inventory          │
   │                           │   MCP      │    scan · place · draft      │
   │  MarginReviewer  (qa)     │◀──────────▶│    → todo Allowed            │
   │        ▲                  │            │                              │
   │        │ reporta          │            │  /api/mcp/whatsapp           │
   │  StockScout     (general) │            │    status · draft  Allowed   │
   │                           │            │    send         ASK FIRST    │
   │  OPF-1  detectar          │            │                              │
   │  OPF-2  validar  ◀── gate │            │  /  dashboard de lectura     │
   │  OPF-3  enviar            │            └──────────────────────────────┘
   └───────────────────────────┘                        │
            │                                           ▼
            └──── el humano aprueba ───────▶  WhatsApp Cloud API
```

Separé las dos manos a propósito. El servidor de inventario sólo lee el negocio
y no puede tocar a nadie; el de WhatsApp es el único que sale al mundo. Son dos
riesgos distintos, así que les puse dos conexiones con dos políticas distintas.

Terminaron quedando tres controles en capas diferentes: el agente revisor valida
los números, una persona aprueba el margen, y el envío pide permiso aparte. Si
uno falla, los otros dos siguen en pie.

El tercero no vino de fábrica. Paperclip marca el envío como `risk=write`, pero
esa marca sola no frena nada: la aprobación existe sólo si hay una política
`require_approval` para esa tool y ese agente, y el script de setup la crea
explícita. Cómo me di cuenta está en [DECISIONS.md](DECISIONS.md).

## Cómo levantarlo

Necesitás Node.js 24.11 o más nuevo y una suscripción de Claude.

### 1. El servidor de Paperclip

```bash
npm install
```

```bash
npx claude setup-token
```

Eso imprime un token que dura un año. Después:

```bash
.\scripts\start-paperclip.ps1
```

Ese script lo escribí yo después de pelearme un rato con esto. Te pide la
credencial, le saca los espacios que mete la terminal cuando corta el token en
dos renglones, valida que esté completa y arranca el servidor en
<http://localhost:3100>. Si apretás Enter sin pegar nada, usa el login guardado
de `claude auth login`, que es lo que el adapter prefiere.

En Linux o macOS no hace falta el script: `npx paperclipai run` alcanza.

> **Si estás en Windows, dos avisos.** No hay servicio en background —te lo dice
> el propio `paperclipai doctor`— así que el servidor queda atado a esa
> terminal. Y si npm te tira `tarball ... seems to be corrupted`, corré
> `npm cache verify` antes de seguir. A mí me pasó dos veces.

### 2. Las manos

```bash
cd platform && npm install && cp .env.example .env.local
```

Completá `.env.local` —como mínimo `MCP_API_KEY`; lo de Meta es opcional— y
levantá:

```bash
npm run dev
```

### 3. La compañía

```bash
npx paperclipai token board create --name setup --json
```

Con ese token:

```bash
PAPERCLIP_BOARD_TOKEN=pcp_board_... MCP_API_KEY=... node scripts/setup-company.mjs
```

Eso crea la compañía con su presupuesto, el objetivo, los dos agentes con su
línea de reporte, las dos conexiones MCP —activadas y con el catálogo
verificado— y las tres tareas, con la política de revisión en la del medio. Lo
hice idempotente: si algo ya existe lo reusa y te lo dice, así podés correrlo
dos veces mientras probás.

Los agentes nacen pausados. Nada corre ni gasta hasta que los reanudes.

> **Lo que este script no puede hacer.** El alta de una conexión con credencial
> propia tiene un último tramo que sólo se completa desde la interfaz. Lo busqué
> por API y no está: lo cuento en [`DECISIONS.md`](DECISIONS.md). Por eso acá las
> conexiones se crean con la key dentro de la URL, que es el patrón que
> Paperclip ya soporta para Zapier.

## Cómo verificar sin esperar a ningún agente

El motor de colocación es código determinista y se prueba solo:

```bash
cd platform && npm test
```

Son 88 tests. Cubren los tramos de vencimiento, el consumo derivado del
historial, el piso de precio, los errores de la Graph API mockeados, y la regla
que más me importaba: que no se pueda construir una oferta para una cuenta que
el motor descalificó.

Las tools también se pueden llamar a mano:

```bash
curl -s -X POST "http://127.0.0.1:3200/api/mcp/inventory?key=TU_KEY" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"inventory_scan_expiring","arguments":{}}}'
```

## Dos decisiones que condicionan todo lo demás

**El precio no lo calcula el modelo.** El piso, el margen y el tramo de
descuento son aritmética y los dejé en `platform/lib/expiry/engine.ts`, con
tests. El agente elige a qué cuenta le conviene el lote y escribe el mensaje,
pero no toca los números.

**El `draft_id` es el hash del payload.** Antes de enviar, el servidor recalcula
el hash de lo que le pasaron y se niega si no coincide con el draft aprobado.
Así lo que una persona aprobó es lo que sale, y lo puedo demostrar. Encima eso
hace que el servidor no necesite base ni sesión, y por eso puede correr
serverless.

## Sobre los datos

El dataset de `platform/data/seed.json` es sembrado y está marcado como tal en
cada respuesta de las tools. Los lotes con vencimiento y el historial de compras
por cuenta son justamente lo que ningún ERP expone público, así que los genero
de forma determinista con `node scripts/make-seed.mjs`.

Lo armé para que tenga los casos incómodos y no sólo el feliz: hay un lote que
nadie puede absorber, una cuenta con deuda que necesita decisión humana, y un
lote demasiado cerca del vencimiento que el motor se niega a ofrecer.

## Sobre WhatsApp

Con `WHATSAPP_ALLOW_SEND=false`, que es el default, el canal redacta, valida y
arma el payload exacto, pero no entrega: devuelve el dry-run explícito.

Para enviar de verdad hace falta una app de Meta con su número de prueba, que
**no** requiere verificación de negocio. El muro aparece recién cuando querés
registrar un número propio, y de eso hablo en [`DECISIONS.md`](DECISIONS.md).
