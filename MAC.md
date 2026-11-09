# Levantarlo en una Mac, paso a paso

Vine a probar acá porque en Windows el adapter `claude_local` nunca pasó su
chequeo de ejecución, y cinco de los nueve sospechosos que descarté eran
específicos de ese sistema: rutas con espacios y acentos, la política de
ejecución de PowerShell, la caché de npm corrompiéndose sola, la falta de
servicio en background y los symlinks. En una Mac esos cinco no existen.

Calculá una hora si no se complica. Casi todo está scripteado y es Node puro,
así que se muda solo.

---

## 1. Node 24.11 o más nuevo

Esto es requisito duro de Paperclip, no una sugerencia.

```bash
node --version
```

Si da menos de 24.11, instalalo con Homebrew:

```bash
brew install node
```

## 2. Traer el proyecto

```bash
git clone <URL-DEL-REPO> paperclip-challenge && cd paperclip-challenge
```

## 3. El CLI de Claude

```bash
npm install -g @anthropic-ai/claude-code
```

```bash
claude auth login
```

Te abre el navegador. Usá la cuenta con suscripción.

**Importante:** no pongas `ANTHROPIC_API_KEY` ni `CLAUDE_CODE_OAUTH_TOKEN` en el
entorno. Probé las dos y el adapter prefiere el login guardado; una credencial
en el entorno le gana a ese login y rompe el probe. Que quede sólo el login.

Para verificar que el CLI funciona de verdad, no sólo que está instalado:

```bash
claude -p "ok"
```

Tiene que responder algo y salir con código 0.

## 4. Levantar Paperclip

```bash
npm install
```

```bash
npx paperclipai run
```

Queda corriendo en <http://localhost:3100>. Dejá esa terminal abierta.

> En Mac sí se puede instalar como servicio en background, que en Windows no
> existe. Si querés que sobreviva a cerrar la terminal, mirá
> `npx paperclipai service`.

La primera vez tarda: baja el PostgreSQL embebido y arranca el cluster. Si npm
tira `tarball ... seems to be corrupted`, corré `npm cache verify` y repetí.

## 5. Las manos (los servidores MCP)

En **otra terminal**:

```bash
cd platform && npm install && cp .env.example .env.local
```

Editá `.env.local` y poné al menos:

```
MCP_API_KEY=una-clave-cualquiera-que-elijas
INVENTORY_AS_OF=2026-11-08
WHATSAPP_ALLOW_SEND=false
```

Lo de Meta es opcional: con `WHATSAPP_ALLOW_SEND=false` el canal arma el payload
exacto pero no entrega, que es el dry-run que el enunciado acepta.

```bash
npm run dev
```

Queda en <http://localhost:3200>. Dejá esa terminal abierta también.

Antes de seguir, comprobá que responde:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:3200/api/mcp/inventory?key=TU_MCP_API_KEY" -X POST -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Tiene que dar **200**. Si da 401, la key del `.env.local` no coincide con la de
la URL.

## 6. La compañía

En una tercera terminal, sacá un token de board:

```bash
npx paperclipai token board create --name setup --json
```

Copiá el valor de `token` y corré:

```bash
PAPERCLIP_BOARD_TOKEN=pcp_board_... MCP_API_KEY=tu-clave AGENT_WORKSPACE=$HOME/paperclip-agent-workspace node scripts/setup-company.mjs
```

```bash
mkdir -p ~/paperclip-agent-workspace
```

Eso crea la compañía, el objetivo, los dos agentes, las dos conexiones MCP con
el catálogo verificado, y las tres tareas con la política de revisión. Es
idempotente: si lo corrés dos veces, reusa lo que ya existe.

## 7. El momento de la verdad

Entrá a <http://localhost:3100>, andá al agente **StockScout** → pestaña
**Harness / Runtime** → botón **Run test**, y abrí **Test details**.

Esa pantalla es el único lugar donde Paperclip cuenta qué falla de verdad: el
log del servidor sólo escribe `exitCode 1`. Si el test pasa, reanudá el agente y
asignale la tarea OPF-1.

Si **falla igual que en Windows**, ya sabemos que no era el sistema operativo y
vamos al plan B del adapter `http`. Copiame lo que diga el Test details.

---

## Si algo no arranca

**El agente queda en `paused` y vuelve solo a `verifying`.** Es el chequeo de
ejecución fallando. Andá al Test details, no al log.

**El agente no tiene con qué pensar.** Verificá que `claude -p "ok"` funcione
desde la misma carpeta que figura como working directory del agente.

**Las tools no cargan.** Revisá que `npm run dev` siga vivo en el puerto 3200 y
que la key de la URL coincida con la del `.env.local`.
