# OpFarma, una compañía de agentes que coloca lotes por vencer

Mi resolución del desafío técnico de Paperclip.

OpFarma es una distribuidora de insumos médicos armada como compañía de agentes.
Los agentes detectan los lotes que se van a vencer en el depósito, buscan qué
cliente puede consumir cada uno antes de la fecha según lo que realmente compra,
y le mandan la oferta por WhatsApp. El lote que ninguna cuenta absorbe se ofrece
a clínicas nuevas con un posteo en LinkedIn, y ese posteo queda listo para que
Grok Bot lo publique. Una persona aprueba el margen, cada mensaje y cada posteo.

Cubre las tres vías del desafío. B2 (WhatsApp) con envío real, B3 (LinkedIn)
con un dry-run del pedido exacto, y B1 (Grokbot) con el traspaso listo en la
tarea.

## La entrega

- **Video del flujo** (Loom, menos de 2 minutos), en
  <https://www.loom.com/share/19870b3b2b5b469c8e9faae649a780d9>. Va de la tarea
  en Paperclip a las dos aprobaciones con tarjeta, el WhatsApp que llega y el
  aviso de Meta en la plataforma.
- **Plataforma deployada en Vercel**, en <https://opfarma-paperclip-challenge.vercel.app>.
  Tiene un explorador que corre el mismo motor que usan los agentes. Se elige un
  lote y se ve qué cuenta lo consume a tiempo, por qué las demás quedan afuera,
  el precio y el mensaje que saldría. Una barra adelanta el reloj para ver qué
  pasa si nadie hace nada. También expone los dos servidores MCP en
  `/api/mcp/inventory` y `/api/mcp/whatsapp`, protegidos con clave.
- **Research de Paperclip**, de una página, en [`research/RESEARCH.md`](research/RESEARCH.md).
  La versión extendida está en [`research/PAPERCLIP.md`](research/PAPERCLIP.md).
- **Decisiones**, de media página, en [`DECISIONS.md`](DECISIONS.md). El detalle
  técnico de cada obstáculo está en [`docs/BITACORA.md`](docs/BITACORA.md).
- **Cómo lo verifiqué**, en [`VERIFICATION.md`](VERIFICATION.md).
- **Cada decisión con sus alternativas**, en el
  [registro de decisiones](docs/REGISTRO-DE-DECISIONES.md).
- **Por qué tres canales y por qué LinkedIn**, con fuentes, en
  [`research/CANALES.md`](research/CANALES.md).
- **Cómo pasar LinkedIn de la simulación a publicar de verdad**, en
  [`docs/LINKEDIN.md`](docs/LINKEDIN.md).
- **El problema y sus fuentes**, en [`research/EXPIRY.md`](research/EXPIRY.md).
- **Cómo pasar WhatsApp a producción**, en [`docs/PRODUCCION.md`](docs/PRODUCCION.md).

## Por qué este problema

El enunciado deja libre el objetivo de la compañía. No quería una demo en la que
el agente manda un WhatsApp que una persona podría mandar igual. Busqué una tarea
que a mano no se llega a hacer.

En un distribuidor de insumos médicos, un lote que vence en depósito no reduce el
margen. Se pierde el 100% del costo. Saber qué se vence es fácil, porque
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
   │  MarginReviewer  (qa)     │◀──────────▶│    margen: aprobación humana │
   │        ▲                  │            │  /api/mcp/whatsapp           │
   │        │ reportan         │            │    envío: aprobación humana  │
   │  StockScout     (general) │            │  /api/mcp/social             │
   │  GrowthScout    (cmo)     │            │                              │
   │                           │            │    posteo: aprobación humana │
   │  detectar                 │            └──────────────────────────────┘
   │  ofertar  ◀── revisor     │                 │               │
   │  aprobar y enviar         │                 ▼               ▼
   │  postear en LinkedIn      │        WhatsApp Cloud API   LinkedIn (dry-run)
   │  traspaso a Grok Bot ─────┼──MCP──▶ mcp.grokbot.dev ──▶ una persona lo pega en Grok
   └───────────────────────────┘
```

Separé las "manos" a propósito. El servidor de inventario no puede contactar a
nadie; el de WhatsApp y el de redes son los únicos que salen hacia afuera. Son
riesgos distintos, así que tienen conexiones y políticas distintas. Grokbot es
de terceros y de sólo lectura, así que entra sin clave y sin permisos especiales.

El resultado son tres controles en capas diferentes. El agente revisor valida los
números, una persona aprueba el margen y cada envío requiere otra aprobación. Si
uno falla, los otros dos siguen en pie. Las dos aprobaciones humanas son
tarjetas de Paperclip sobre una herramienta, con una política `require_approval`
que crea el script de setup. Esa política no venía configurada. Paperclip marca
el envío como `risk=write`, pero esa marca sola no frena nada. Y el margen se
aprueba con una herramienta, `inventory_commit_offer`, porque la etapa de
aprobación humana de una tarea no tiene botón en la interfaz de esta versión. El
servidor recalcula la oferta y rechaza cualquier número distinto del motor. Los
hallazgos están contados en [`DECISIONS.md`](DECISIONS.md).

**Tres agentes, cada uno con las herramientas de su área.** MarginReviewer
revisa y no puede enviar, publicar ni fijar márgenes. StockScout, el comercial,
fija el margen y manda el WhatsApp con aprobación, pero no puede publicar.
GrowthScout publica en LinkedIn con aprobación, pero no puede mandar mensajes ni
tocar márgenes. Lo impone Paperclip con políticas. Cuando StockScout intentó
publicar, Paperclip ni siquiera le mostró la herramienta.

**Dónde está el review humano que pide la Tarea A.** En la tarea del envío.
Paperclip frena dos veces la ejecución y pide aprobación, primero del margen y
después del mensaje exacto, y lo mismo con el posteo de LinkedIn. Probé también
la otra forma que ofrece Paperclip, una etapa de aprobación que bloquea el pase a
*done* (OPF-2 y OPF-8 en la Mac). Funciona, pero esta versión no trae un botón
para aprobarla desde la interfaz y sólo se puede por la API. Por eso moví la
decisión humana a las tarjetas, que sí tienen botón y además frenan la acción,
no sólo el cierre.

## Cómo levantarlo en unos 10 minutos

Necesitás macOS o Linux, Node.js 24.11 o más nuevo, git, y Claude Code con una
suscripción activa. Lo probé con reloj en un usuario nuevo de Linux, sin nada
instalado. Lo que más tarda es el `npm install` del repo, unos 4 minutos; el
resto suma 2 o 3 más.

> **En Windows, usá WSL2.** Directamente sobre Windows los agentes no arrancan,
> porque el runner de Paperclip para Windows falla. La causa, con el código que
> lo confirma, está en [`docs/BITACORA.md`](docs/BITACORA.md). Dentro de WSL2
> Paperclip corre sobre Linux y los agentes funcionan; los pasos están en
> [Windows con WSL2](#windows-con-wsl2), más abajo.

### 1. Claude Code

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

Es el instalador oficial y no pide permisos de administrador. Si preferís npm,
en Linux `npm install -g` suele fallar por permisos; los comandos para
instalarlo en tu usuario están en [Windows con WSL2](#windows-con-wsl2), paso 3.

```bash
claude auth login
```

No dejes `ANTHROPIC_API_KEY` ni `CLAUDE_CODE_OAUTH_TOKEN` en el entorno. Tienen
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

El repo ya aprueba el script de instalación del PostgreSQL embebido. Si npm
avisa de otro script sin aprobar (`ssh2`), no hace falta hacer nada.

```bash
npx paperclipai onboard --yes
```

La primera vez configura Paperclip con las opciones por defecto y lo deja
andando en <http://localhost:3100>, en menos de un minuto. Dejá esa terminal
abierta. Las veces siguientes alcanza con `npx paperclipai run`.

### 3. Los servidores MCP

En otra terminal, desde la raíz del repo.

```bash
cd platform && npm install && cp .env.example .env.local
```

Completá `MCP_API_KEY` en `.env.local` con cualquier clave que elijas. Lo de
Meta es opcional. Sin credenciales, el canal arma y valida los mensajes pero no
los entrega.

```bash
npm run dev
```

Queda en <http://localhost:3200>. Dejá también esa terminal abierta.

### 4. La compañía

En una tercera terminal, desde la raíz del repo, con la misma clave que pusiste
en `.env.local`.

```bash
PAPERCLIP_RUNNER=legacy MCP_API_KEY=la-misma-clave node scripts/setup-company.mjs
```

En la instalación local, Paperclip no pide token. Si lo instalaste con login
(modo `authenticated`), generá uno con `npx paperclipai token board create
--name setup --json` y pasalo como `PAPERCLIP_BOARD_TOKEN`. Si el script dice
que los servidores MCP no responden, es que falta el `npm run dev` del paso 3.

El script crea la compañía con su presupuesto y su objetivo, los tres agentes con
su línea de reporte, las cuatro conexiones MCP con el catálogo verificado
(inventario, WhatsApp, redes y Grokbot), las políticas de aprobación del margen,
del envío y del posteo, la carpeta de trabajo de los agentes y cinco tareas. Son
el escaneo, la oferta con su revisor, el envío con las dos aprobaciones humanas,
el posteo en LinkedIn y el traspaso a Grok Bot. El envío y el traspaso nacen
sin asignar. El envío se lo asignás a StockScout cuando la oferta pasó la
revisión, y el traspaso a GrowthScout cuando el posteo fue aprobado. Para armar
otra oferta en una compañía que ya mandó una, agregá `OFFER_LOT=L-8890`. El
script es idempotente.
Si algo ya existe, lo reutiliza y lo informa.

Para usar el canal real en lugar del local, agregá
`MCP_BASE_URL=https://opfarma-paperclip-challenge.vercel.app` y la
`MCP_API_KEY` del proyecto en Vercel. Las credenciales de Meta viven sólo ahí,
así que cualquier instalación de Paperclip manda por el mismo canal. Si la
compañía ya existía, el script sólo actualiza la dirección de las conexiones.

`PAPERCLIP_RUNNER=legacy` es necesario porque en macOS el runner nativo falló
con un error de acceso a la terminal, y el Legacy es el que funcionó de punta a
punta.

### 5. Ponerla a trabajar

Los agentes se crean pausados, así que nada corre ni consume hasta que los
reanudes. En <http://localhost:3100>, reanudá **StockScout** y
**MarginReviewer** y abrí la tarea **OPF-1**.

Si una corrida falla en un segundo con un error de workspace, usá **Retry** en
la tarea. El setup crea la carpeta de trabajo como repositorio git para evitarlo,
pero si la borrás o la movés, vuelve a pasar.

### Windows con WSL2

Paperclip corre dentro de Ubuntu, en WSL2, y se usa desde el navegador de
Windows en <http://localhost:3100>. Los agentes usan los servidores MCP
deployados en Vercel, así que no hace falta levantar `platform/`.

**1. Instalar WSL2.** En PowerShell como administrador, y después reiniciar.

```powershell
wsl --install -d Ubuntu
```

Al volver, Ubuntu pide crear un usuario y una contraseña. Todo lo que sigue se
corre en la terminal de Ubuntu, no en PowerShell.

**2. Node.js 24.** Ubuntu trae una versión anterior, así que se instala
desde el repositorio firmado de NodeSource.

```bash
sudo apt-get install -y ca-certificates curl gnupg && sudo mkdir -p /etc/apt/keyrings
```

```bash
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
```

```bash
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list && sudo apt-get update && sudo apt-get install -y nodejs
```

**3. Claude Code, instalado para tu usuario y visible para el servicio.**

```bash
mkdir -p ~/.npm-global && npm config set prefix ~/.npm-global && echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.profile && source ~/.profile
```

```bash
npm install -g --allow-scripts=@anthropic-ai/claude-code @anthropic-ai/claude-code && sudo ln -sf ~/.npm-global/bin/claude /usr/local/bin/claude
```

```bash
claude auth login
```

Paperclip se instala como servicio, y un servicio no ve la carpeta de tu
usuario, así que el enlace en `/usr/local/bin` es necesario. Sin él, el chequeo
de los agentes falla con "Command not found in PATH: claude".

**4. El repo y Paperclip.**

```bash
git clone https://github.com/matilgoros2365-cmyk/opfarma-paperclip-challenge.git && cd opfarma-paperclip-challenge && npm install
```

```bash
npx paperclipai run
```

La primera vez pregunta la configuración. Aceptá las opciones por defecto,
instalalo como servicio y respondé **No** a seguir corriendo después de cerrar
sesión. El servicio queda en el puerto 3100; si la terminal muestra otro
servidor en el 3101, cerralo con Ctrl+C.

**5. Los servidores MCP y la compañía.** Seguí los pasos 3 y 4 de arriba,
dentro de Ubuntu. En WSL2 no hace falta `PAPERCLIP_RUNNER=legacy`, porque
Paperclip elige el runner solo y el chequeo de los agentes pasa.

Si tenés la `MCP_API_KEY` del proyecto en Vercel, podés saltear el paso 3 y
usar los servidores de producción, con el canal de WhatsApp real.

```bash
MCP_API_KEY=la-de-vercel MCP_BASE_URL=https://opfarma-paperclip-challenge.vercel.app node scripts/setup-company.mjs
```

## Cómo verificarlo sin esperar a los agentes

```bash
cd platform && npm test
```

Son 209 tests. Además de las pruebas por módulo, incluyen una verificación
independiente que rehace todas las cuentas del motor desde la especificación,
sin usar su código, para cada combinación de lote y cuenta. El detalle de todo lo
que verifiqué, y cómo, está en [`VERIFICATION.md`](VERIFICATION.md).

Las herramientas también se pueden llamar directamente.

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

Lo armé para que incluya los casos difíciles y no sólo el que sale bien. Hay un
lote que ninguna cuenta puede absorber, una cuenta con deuda que requiere una decisión
humana y un lote demasiado cerca del vencimiento que el motor se niega a ofrecer.

## Sobre WhatsApp

Con `WHATSAPP_ALLOW_SEND=false`, que es el valor por defecto, el canal redacta,
valida y arma el mensaje exacto, pero en lugar de entregarlo devuelve un dry-run
explícito. Para enviar de verdad alcanza con una app de Meta y su número de
prueba, que no requiere verificación de negocio.

Como una oferta la inicia la empresa, fuera de la ventana de 24 horas Meta sólo
la entrega como plantilla aprobada. La plantilla `oferta_lote_por_vencer` está
definida en `platform/lib/expiry/template.ts`, y cada oferta devuelve sus
variables listas para el borrador. Después del envío, Meta informa por webhook
si el mensaje se entregó, se leyó o falló; la plataforma lo muestra y el agente
lo puede consultar con `whatsapp_delivery_status` para registrarlo en la tarea.

Para usarlo con clientes reales sólo falta la cuenta de la empresa, verificada
con su CUIT, con número propio y con la plantilla aprobada en esa cuenta.
El procedimiento está en [`docs/PRODUCCION.md`](docs/PRODUCCION.md).
