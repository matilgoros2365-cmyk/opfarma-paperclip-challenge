# OpFarma: una compañía de agentes que coloca lotes por vencer

Mi resolución del desafío técnico de Paperclip.

OpFarma es una distribuidora de insumos médicos armada como compañía de agentes.
Los agentes detectan los lotes que se van a vencer en el depósito, buscan qué
cliente puede consumir cada uno antes de la fecha según lo que realmente compra,
y preparan la oferta para enviarla por WhatsApp. Una persona aprueba el margen y,
por separado, cada mensaje.

## La entrega

- **Plataforma deployada en Vercel:** <https://opfarma-paperclip-challenge.vercel.app>.
  Muestra el inventario calculado en vivo por el mismo motor que usan los agentes,
  y expone los dos servidores MCP en `/api/mcp/inventory` y `/api/mcp/whatsapp`,
  protegidos con clave.
- **Research de Paperclip, en una página:** [`research/RESEARCH.md`](research/RESEARCH.md).
  La versión extendida está en [`research/PAPERCLIP.md`](research/PAPERCLIP.md).
- **Decisiones:** [`DECISIONS.md`](DECISIONS.md), en media página. El detalle
  técnico de cada obstáculo está en [`docs/BITACORA.md`](docs/BITACORA.md).
- **Cómo lo verifiqué:** [`VERIFICATION.md`](VERIFICATION.md).
- **El problema y sus fuentes:** [`research/EXPIRY.md`](research/EXPIRY.md).
- **Cómo pasar WhatsApp a producción:** [`docs/PRODUCCION.md`](docs/PRODUCCION.md).

## Por qué este problema

El enunciado deja libre el objetivo de la compañía. No quería una demo en la que
el agente manda un WhatsApp que una persona podría mandar igual. Busqué una tarea
que a mano no se llega a hacer.

En un distribuidor de insumos médicos, un lote que vence en depósito no reduce el
margen: se pierde el 100% del costo. Saber qué se vence es fácil, porque
cualquier sistema lo avisa. Lo difícil es saber a quién vendérselo antes de la
fecha, y eso exige cruzar cada lote con la rotación de cada cuenta. Con cientos
de cuentas, esa tarea simplemente no se hace. El software del rubro avisa pero
no coloca; los proyectos de redistribución la resuelven dentro de una red
hospitalaria, y los marketplaces de excedentes publican el stock y esperan a un
comprador. No encontré herramientas que, del lado del distribuidor, busquen
activamente al cliente que va a consumir cada lote a tiempo. Las auditorías,
normas, estudios y entrevistas que respaldan el problema están en
[`research/EXPIRY.md`](research/EXPIRY.md).

## Cómo está armado

```
   Paperclip  (el molde)                    platform/  (las manos, en Vercel)
   ┌───────────────────────────┐            ┌──────────────────────────────┐
   │ OpFarma                   │            │  /api/mcp/inventory          │
   │                           │   MCP      │    escanear, colocar, ofertar│
   │  MarginReviewer  (qa)     │◀──────────▶│    sólo lectura              │
   │        ▲                  │            │                              │
   │        │ reporta          │            │  /api/mcp/whatsapp           │
   │  StockScout     (general) │            │    estado y borrador: libre  │
   │                           │            │    envío: aprobación humana  │
   │  OPF-1  detectar          │            │                              │
   │  OPF-2  validar  ◀── gate │            │  /  la plataforma            │
   │  OPF-3  enviar            │            └──────────────────────────────┘
   └───────────────────────────┘                        │
            │                                           ▼
            └──── una persona aprueba ─────▶  WhatsApp Cloud API
```

Separé las dos "manos" a propósito. El servidor de inventario sólo lee el negocio
y no puede contactar a nadie; el de WhatsApp es el único que sale hacia afuera.
Son riesgos distintos, así que tienen conexiones y políticas distintas.

El resultado son tres controles en capas diferentes: el agente revisor valida los
números, una persona aprueba el margen y cada envío requiere otra aprobación. Si
uno falla, los otros dos siguen en pie. El tercero no venía configurado:
Paperclip marca el envío como `risk=write`, pero esa marca sola no frena nada. La
aprobación existe sólo si hay una política `require_approval` para esa
herramienta y ese agente, y el script de setup la crea. El hallazgo está contado
en [`DECISIONS.md`](DECISIONS.md).

## Cómo levantarlo en unos 10 minutos

**Requisitos:** macOS o Linux, Node.js 24.11 o más nuevo, git, y Claude Code con
una suscripción activa.

> **En Windows, los agentes no arrancan.** El servidor de Paperclip funciona,
> pero el runner nativo de agentes sólo soporta Linux y macOS, y el que queda
> disponible en Windows falla. La causa, con el código que lo confirma, está en
> [`docs/BITACORA.md`](docs/BITACORA.md).

### 1. Claude Code

```bash
npm install -g @anthropic-ai/claude-code
```

```bash
claude auth login
```

No dejes `ANTHROPIC_API_KEY` ni `CLAUDE_CODE_OAUTH_TOKEN` en el entorno: tienen
prioridad sobre el login guardado y hacen fallar el chequeo de los agentes.
Para confirmar que el CLI responde, `claude -p "ok"` tiene que contestar y
terminar sin error.

### 2. El repo y Paperclip

```bash
git clone https://github.com/matilgoros2365-cmyk/opfarma-paperclip-challenge.git
```

```bash
cd opfarma-paperclip-challenge && npm install
```

Si npm avisa que hay scripts de instalación pendientes de aprobación (pasa con
npm 11 y el PostgreSQL embebido), aprobalos con `npm approve-scripts` y repetí
`npm install`.

```bash
npx paperclipai run
```

Queda en <http://localhost:3100>. La primera vez tarda un poco más porque
inicializa la base. Dejá esa terminal abierta.

### 3. Los servidores MCP

En otra terminal, desde la raíz del repo:

```bash
cd platform && npm install && cp .env.example .env.local
```

Completá `MCP_API_KEY` en `.env.local` con cualquier clave que elijas. Lo de
Meta es opcional: sin credenciales, el canal arma y valida los mensajes pero no
los entrega.

```bash
npm run dev
```

Queda en <http://localhost:3200>. Dejá también esa terminal abierta.

### 4. La compañía

En una tercera terminal, desde la raíz del repo, generá un token de
administración:

```bash
npx paperclipai token board create --name setup --json
```

Y con ese token:

```bash
PAPERCLIP_RUNNER=legacy PAPERCLIP_BOARD_TOKEN=pcp_board_... MCP_API_KEY=la-misma-clave node scripts/setup-company.mjs
```

El script crea la compañía con su presupuesto y su objetivo, los dos agentes con
su línea de reporte, las dos conexiones MCP con el catálogo verificado, las
políticas de aprobación del envío, la carpeta de trabajo de los agentes y las
tres tareas, con la revisión humana en la del medio. Es idempotente: si algo ya
existe, lo reutiliza y lo informa.

`PAPERCLIP_RUNNER=legacy` es necesario: en macOS, el runner nativo falló con un
error de acceso a la terminal, y el Legacy es el que funcionó de punta a punta.

### 5. Ponerla a trabajar

Los agentes se crean pausados, así que nada corre ni consume hasta que los
reanudes. En <http://localhost:3100>, reanudá **StockScout** y
**MarginReviewer** y abrí la tarea **OPF-1**.

Si después de responder una tarjeta la corrida falla en un segundo con un error
de workspace, usá **Retry** en la tarea. Es una limitación conocida de Paperclip
con los workspaces aislados, y está documentada en la bitácora.

## Cómo verificarlo sin esperar a los agentes

```bash
cd platform && npm test
```

Son 170 tests. Además de las pruebas por módulo, incluyen una verificación
independiente que rehace todas las cuentas del motor desde la especificación,
sin usar su código, para cada combinación de lote y cuenta. El detalle de todo lo
que verifiqué, y cómo, está en [`VERIFICATION.md`](VERIFICATION.md).

Las herramientas también se pueden llamar directamente:

```bash
curl -s -X POST "http://127.0.0.1:3200/api/mcp/inventory?key=TU_CLAVE" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"inventory_scan_expiring","arguments":{}}}'
```

## Dos decisiones que condicionan todo lo demás

**El precio no lo calcula el modelo.** El piso, el margen y el tramo de
descuento son aritmética, y están en `platform/lib/expiry/engine.ts`, con tests.
El agente elige a qué cuenta le conviene cada lote y redacta el mensaje, pero no
toca los números.

**El `draft_id` es el hash del mensaje.** Antes de enviar, el servidor recalcula
el hash de lo que recibe y rechaza el envío si no coincide con el borrador
aprobado. Así, lo que una persona aprobó es exactamente lo que sale. Además, el
servidor no necesita base de datos ni sesión, y por eso puede correr serverless.

## Sobre los datos

El dataset de `platform/data/seed.json` es de ejemplo, y cada respuesta de las
herramientas lo indica. Los lotes con su vencimiento y el historial de compras
por cuenta son justamente lo que ningún sistema de gestión expone de forma
pública, así que los genero de forma determinista con
`node platform/scripts/make-seed.mjs`.

Lo armé para que incluya los casos difíciles y no sólo el que sale bien: un lote
que ninguna cuenta puede absorber, una cuenta con deuda que requiere una decisión
humana y un lote demasiado cerca del vencimiento que el motor se niega a ofrecer.

## Sobre WhatsApp

Con `WHATSAPP_ALLOW_SEND=false`, que es el valor por defecto, el canal redacta,
valida y arma el mensaje exacto, pero no lo entrega: devuelve un dry-run
explícito. Para enviar de verdad alcanza con una app de Meta y su número de
prueba, que no requiere verificación de negocio.

Como una oferta la inicia la empresa, fuera de la ventana de 24 horas Meta sólo
la entrega como plantilla aprobada. La plantilla `oferta_lote_por_vencer` está
definida en `platform/lib/expiry/template.ts`, y cada oferta devuelve sus
variables listas para el borrador. Después del envío, Meta informa por webhook
si el mensaje se entregó, se leyó o falló; la plataforma lo muestra y el agente
lo puede consultar con `whatsapp_delivery_status` para registrarlo en la tarea.

Lo único que falta para usarlo con clientes reales es la cuenta de la empresa:
verificación con su CUIT, número propio y la plantilla aprobada en esa cuenta.
El procedimiento está en [`docs/PRODUCCION.md`](docs/PRODUCCION.md).
