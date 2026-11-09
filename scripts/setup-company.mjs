/**
 * Levanta la company OpFarma entera en una instancia de Paperclip vacía.
 *
 * Es idempotente: si algo ya existe, lo reusa y lo dice. Se puede correr dos
 * veces sin romper nada.
 *
 * Uso:
 *   PAPERCLIP_API_URL=http://127.0.0.1:3100/api \
 *   PAPERCLIP_BOARD_TOKEN=pcp_board_... \
 *   MCP_BASE_URL=http://127.0.0.1:3200 \
 *   MCP_API_KEY=... \
 *   node scripts/setup-company.mjs
 *
 * El board token se saca con:
 *   npx paperclipai token board create --name setup --json
 *
 * NOTA SOBRE LO QUE ESTE SCRIPT NO PUEDE HACER
 * --------------------------------------------
 * Todo lo de acá abajo es API pura. Lo único que Paperclip NO expone de forma
 * utilizable por API es el último tramo del alta de una conexión cuando usa
 * credencial propia (el "Finish setup" de la interfaz). Por eso las conexiones
 * se crean acá con la key dentro de la URL, que es el patrón que Paperclip ya
 * soporta para Zapier. El costo de esa decisión está escrito en DECISIONS.md.
 */

const API = (process.env.PAPERCLIP_API_URL ?? "http://127.0.0.1:3100/api").replace(/\/+$/, "");
const TOKEN = process.env.PAPERCLIP_BOARD_TOKEN;
const MCP_BASE = (process.env.MCP_BASE_URL ?? "http://127.0.0.1:3200").replace(/\/+$/, "");
const MCP_KEY = process.env.MCP_API_KEY;

if (!TOKEN) fatal("Falta PAPERCLIP_BOARD_TOKEN. Sacalo con: npx paperclipai token board create --name setup --json");
if (!MCP_KEY) fatal("Falta MCP_API_KEY: la misma key que tiene el .env.local de platform/.");

function fatal(message) {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

const log = {
  step: (m) => console.log(`\n▸ ${m}`),
  ok: (m) => console.log(`  ✓ ${m}`),
  reuse: (m) => console.log(`  · ${m} (ya existía)`),
  warn: (m) => console.log(`  ! ${m}`),
};

async function api(method, path, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const detail = data?.error ?? `HTTP ${response.status}`;
    throw new Error(`${method} ${path} → ${detail}`);
  }
  return data;
}

/* -------------------------------------------------------------------------- */

log.step("Compañía");

const companies = await api("GET", "/companies");
let company = (Array.isArray(companies) ? companies : (companies?.companies ?? [])).find(
  (c) => c.name === "OpFarma",
);

if (company) {
  log.reuse(`OpFarma (${company.issuePrefix})`);
} else {
  company = await api("POST", "/companies", {
    name: "OpFarma",
    description:
      "Distribuidora de dispositivos e insumos medicos. Dataset sembrado para el challenge tecnico.",
  });
  log.ok(`OpFarma creada (${company.issuePrefix})`);
}

const CID = company.id;

// El presupuesto va antes que cualquier agente: los heartbeats son autónomos
// y corren contra la key de quien levanta esto.
await api("PATCH", `/companies/${CID}`, { budgetMonthlyCents: 2000 });
log.ok("Presupuesto de la compañía: USD 20/mes");

/* -------------------------------------------------------------------------- */

log.step("Objetivo");

const goals = await api("GET", `/companies/${CID}/goals`);
const goalList = Array.isArray(goals) ? goals : (goals?.goals ?? []);
let goal = goalList.find((g) => g.title.startsWith("Cero perdida"));

if (goal) {
  log.reuse(goal.title);
} else {
  goal = await api("POST", `/companies/${CID}/goals`, {
    title: "Cero perdida por vencimiento, sin regalar margen",
    description:
      "Colocar cada lote proximo a vencer en la cuenta cuya rotacion lo consume antes de la fecha, " +
      "respetando un piso de precio. Un lote que vence en deposito destruye el 100% del costo.",
  });
  log.ok(goal.title);
}

/* -------------------------------------------------------------------------- */

log.step("Organigrama");

// El rol en Paperclip es un enum cerrado y no incluye "Operator" ni "Reviewer",
// que son los que sugiere el enunciado. El significado real lo carga el título.
const AGENT_WORKSPACE = process.env.AGENT_WORKSPACE ?? "C:/dev/paperclip-challenge/agent-workspace";

/**
 * Qué runner usa el agente. Esto NO es cosmético.
 *
 * El runner nativo de Paperclip sólo soporta linux y darwin: `win32` no está en
 * `paperclipRunnerSupportsPlatform`. Así que en Windows el único disponible es
 * `legacy`, y en Mac o Linux el default es el nativo (acpx).
 *
 * Importa para este script porque `maxTurnsPerRun` es un ajuste exclusivo de
 * legacy: mandarlo con el runner nativo devuelve
 * `422 agent_runner_config_incompatible`. Por eso sólo se incluye cuando se pide
 * legacy explícitamente con PAPERCLIP_RUNNER=legacy.
 */
const RUNNER = process.env.PAPERCLIP_RUNNER?.trim() || null;

const adapterConfig = (maxTurns) => ({
  cwd: AGENT_WORKSPACE,
  model: "claude-opus-5",
  // Con 300 s se cortaron dos corridas reales en la Mac (OPF-1 y OPF-5): escanear
  // los 8 lotes y colocar cada uno lleva más que eso. 600 deja margen.
  timeoutSec: 600,
  ...(RUNNER === "legacy" ? { maxTurnsPerRun: maxTurns } : {}),
});

const existingAgents = await api("GET", `/companies/${CID}/agents`);
const agentList = Array.isArray(existingAgents) ? existingAgents : (existingAgents?.agents ?? []);
const byName = (n) => agentList.find((a) => a.name === n);

let reviewer = byName("MarginReviewer");
if (reviewer) {
  log.reuse("MarginReviewer");
} else {
  reviewer = await api("POST", `/companies/${CID}/agents`, {
    name: "MarginReviewer",
    role: "qa",
    title: "Revisor de margen y cuenta",
    capabilities:
      "Valida propuestas de colocacion de lotes proximos a vencer: que la cuenta pueda consumir el " +
      "lote antes del vencimiento, que el precio respete el piso de margen, y que la cuenta no tenga " +
      "deuda ni bloqueo administrativo. Aprueba o pide cambios. Nunca envia mensajes al cliente.",
    adapterType: "claude_local",
    ...(RUNNER ? { runner: RUNNER } : {}),
    adapterConfig: adapterConfig(25),
    budgetMonthlyCents: 800,
  });
  log.ok("MarginReviewer (qa) — raíz del organigrama");
}

let scout = byName("StockScout");
if (scout) {
  log.reuse("StockScout");
} else {
  scout = await api("POST", `/companies/${CID}/agents`, {
    name: "StockScout",
    role: "general",
    title: "Operador de colocacion de lotes",
    reportsTo: reviewer.id,
    capabilities:
      "Escanea el inventario por lotes proximos a vencer, busca que cuenta puede consumir cada lote " +
      "antes de la fecha segun su rotacion historica, y redacta la oferta y el mensaje. No decide el " +
      "precio: lo calcula el motor. No envia nada sin aprobacion humana.",
    adapterType: "claude_local",
    ...(RUNNER ? { runner: RUNNER } : {}),
    adapterConfig: adapterConfig(40),
    budgetMonthlyCents: 1000,
  });
  log.ok("StockScout (general) — reporta a MarginReviewer");
}

/* -------------------------------------------------------------------------- */

log.step("Conexiones MCP");

const connectionsResponse = await api("GET", `/companies/${CID}/tools/connections`);
const connections = connectionsResponse?.connections ?? [];

async function ensureConnection(name, mcpPath) {
  const existing = connections.find((c) => c.name === name);
  if (existing) {
    log.reuse(name);
    return existing;
  }

  const created = await api("POST", `/companies/${CID}/tools/connections`, {
    name,
    transport: "mcp_remote",
    authKind: "none",
    config: { url: `${MCP_BASE}/api/mcp/${mcpPath}?key=${MCP_KEY}` },
  });

  // La conexión nace en draft: hay que activarla por la ruta que NO está
  // documentada, /api/tool-connections/{id}, no bajo /companies/.
  await api("PATCH", `/tool-connections/${created.id}`, { status: "active", enabled: true });

  // El catálogo se carga al pedirlo: esto es lo que verifica que el servidor
  // MCP está vivo y que la key anda.
  const catalog = await api("GET", `/tool-connections/${created.id}/catalog`);
  log.ok(`${name} — ${catalog?.catalog?.length ?? 0} tools`);
  return created;
}

await ensureConnection("OpFarma Inventario", "inventory");
await ensureConnection("OpFarma WhatsApp", "whatsapp");

/* -------------------------------------------------------------------------- */

log.step("Tareas");

const issuesResponse = await api("GET", `/companies/${CID}/issues?view=compact`);
const issues = Array.isArray(issuesResponse) ? issuesResponse : (issuesResponse?.issues ?? []);

async function ensureIssue(title, description, extra = {}) {
  if (issues.some((i) => i.title === title)) {
    log.reuse(title.slice(0, 48));
    return;
  }
  await api("POST", `/companies/${CID}/issues`, {
    title,
    description,
    status: "todo",
    assigneeAgentId: scout.id,
    goalId: goal.id,
    ...extra,
  });
  log.ok(title.slice(0, 48));
}

await ensureIssue(
  "Detectar lotes proximos a vencer y proponer destino",
  "Escanear el inventario con inventory_scan_expiring. Para cada lote que necesite decision, usar " +
    "inventory_place_lot y reportar en un comentario: dias al vencimiento, plata en riesgo, y que " +
    "cuentas pueden absorberlo. No proponer ninguna oferta todavia.",
  { priority: "high" },
);

// La tarea con el gate. Dos etapas de naturaleza distinta: primero el agente
// revisor valida los números, después una persona aprueba el margen. El runtime
// intercepta el pase a done y lo rutea solo.
await ensureIssue(
  "Validar la colocacion del lote L-4028 y aprobar el margen",
  "Construir la oferta con inventory_draft_offer para el lote L-4028 y la cuenta que el motor " +
    "habilito. Adjuntar el payload completo al hilo: ajuste de consumo, precio, margen, lo que " +
    "ahorra el cliente y lo que pagaria un liquidador. El revisor valida absorcion, piso de precio " +
    "y estado de cuenta. Despues la aprobacion final es humana: no se puede marcar done sin eso.",
  {
    priority: "critical",
    executionPolicy: {
      mode: "normal",
      commentRequired: true,
      stages: [
        { type: "review", participants: [{ type: "agent", agentId: reviewer.id }] },
        { type: "approval", participants: [{ type: "user", userId: "local-board" }] },
      ],
    },
  },
);

await ensureIssue(
  "Enviar la oferta aprobada del lote L-4028 por WhatsApp",
  "Con la oferta ya aprobada, llamar whatsapp_channel_status, despues whatsapp_draft_message con el " +
    "message_body de la oferta, y adjuntar el draft_id y el payload al hilo. Recien entonces " +
    "whatsapp_send_message con ese draft_id y confirm true. Ese ultimo llamado pide aprobacion " +
    "humana en la conexion: no se puede saltear.",
  { priority: "high" },
);

/* -------------------------------------------------------------------------- */

console.log(`
▸ Listo

  Compañía   OpFarma (${company.issuePrefix}) — ${API.replace("/api", "")}/${company.issuePrefix}/dashboard
  Agentes    MarginReviewer (qa) ← StockScout (general)
  Tareas     3, una con review de agente + aprobación humana
  Conexiones Inventario y WhatsApp, con el envío pendiente de permiso

  Los agentes nacen pausados: nada corre ni gasta hasta reanudarlos.
`);
