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

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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
const AGENT_WORKSPACE = resolve(process.env.AGENT_WORKSPACE ?? join(REPO_ROOT, "agent-workspace"));

// La carpeta de trabajo de los agentes tiene que ser un repositorio de git con
// al menos un commit. Si Paperclip pasa una tarea a workspace aislado, pide un
// git worktree sobre esa carpeta y falla si no lo es (está en DECISIONS).
if (!existsSync(AGENT_WORKSPACE)) mkdirSync(AGENT_WORKSPACE, { recursive: true });
if (!existsSync(join(AGENT_WORKSPACE, ".git"))) {
  const git = (...args) => execFileSync("git", args, { cwd: AGENT_WORKSPACE, stdio: "ignore" });
  git("init", "-q");
  git("-c", "user.name=OpFarma setup", "-c", "user.email=setup@opfarma.invalid", "commit", "-q", "--allow-empty", "-m", "Workspace de los agentes");
  log.ok(`Workspace de los agentes: ${AGENT_WORKSPACE} (repositorio de git creado)`);
} else {
  log.reuse(`Workspace de los agentes: ${AGENT_WORKSPACE}`);
}

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

// El catálogo se carga al pedirlo: esto es lo que verifica que el servidor MCP
// está vivo y que la key anda. Si la key no coincide, el servidor responde 401
// y Paperclip lo traduce como "This app needs you to sign in", que no orienta a
// nadie; acá se dice qué revisar.
async function verifyCatalog(id, name) {
  try {
    const catalog = await api("GET", `/tool-connections/${id}/catalog`);
    log.ok(`${name} — ${catalog?.catalog?.length ?? 0} tools`);
  } catch (error) {
    if (/sign in|401|unauthorized/i.test(String(error))) {
      fatal(
        `${name}: el servidor MCP rechazó la key. MCP_API_KEY tiene que ser la misma que tiene el servidor ` +
          `en ${MCP_BASE} (en Vercel, la variable MCP_API_KEY del proyecto). Corregila y volvé a correr el script: ` +
          `la conexión se actualiza sola.`,
      );
    }
    throw error;
  }
}

async function ensureConnection(name, mcpPath) {
  const url = `${MCP_BASE}/api/mcp/${mcpPath}?key=${MCP_KEY}`;
  const existing = connections.find((c) => c.name === name);

  if (existing) {
    // Si ya existe pero apunta a otra URL o tiene otra key, se corrige en lugar
    // de reutilizarla rota: pasa cuando se cambia MCP_API_KEY o MCP_BASE_URL.
    const detail = await api("GET", `/tool-connections/${existing.id}`);
    if (detail?.config?.url === url) {
      log.reuse(name);
      return existing;
    }
    await api("PATCH", `/tool-connections/${existing.id}`, { config: { url } });
    log.ok(`${name}: URL o key actualizada`);
    await verifyCatalog(existing.id, name);
    return existing;
  }

  const created = await api("POST", `/companies/${CID}/tools/connections`, {
    name,
    transport: "mcp_remote",
    authKind: "none",
    config: { url },
  });

  // La conexión nace en draft: hay que activarla por la ruta que NO está
  // documentada, /api/tool-connections/{id}, no bajo /companies/.
  await api("PATCH", `/tool-connections/${created.id}`, { status: "active", enabled: true });

  await verifyCatalog(created.id, name);
  return created;
}

// Una conexión creada por API queda disponible para la organización, pero no
// instalada para nadie: los agentes no ven sus herramientas hasta que se instala.
// Desde la interfaz se hace con un clic; acá se instala para toda la compañía, y
// las políticas de abajo deciden qué puede hacer cada agente.
async function ensureInstalled(connection, name) {
  const current = await api("GET", `/tool-connections/${connection.id}/installs`);
  const installs = current?.installs ?? [];
  if (installs.some((i) => i.targetType === "company" && i.targetId === CID)) {
    log.reuse(`${name}: instalada para la compañía`);
    return;
  }
  await api("PUT", `/tool-connections/${connection.id}/installs`, {
    installs: [
      ...installs.map((i) => ({ targetType: i.targetType, targetId: i.targetId })),
      { targetType: "company", targetId: CID },
    ],
  });
  log.ok(`${name}: instalada para la compañía`);
}

const inventory = await ensureConnection("OpFarma Inventario", "inventory");
const whatsapp = await ensureConnection("OpFarma WhatsApp", "whatsapp");
await ensureInstalled(inventory, "OpFarma Inventario");
await ensureInstalled(whatsapp, "OpFarma WhatsApp");

/* -------------------------------------------------------------------------- */

log.step("Permisos del envío");

/*
 * Que Paperclip clasifique whatsapp_send_message como risk=write no frena nada.
 * La aprobación humana existe sólo si hay una política require_approval para
 * esa tool y ese agente. Cuando el acceso se da desde la interfaz, Paperclip la
 * crea solo; con el acceso que arma este script no, y el envío pasaba directo
 * (lo vimos en la auditoría: profile_allows_tool). Así que la creo explícita:
 *
 *   StockScout     → whatsapp_send_message pide aprobación humana
 *   MarginReviewer → whatsapp_send_message bloqueado: el revisor nunca envía
 *
 * La API no acepta `config` en estas políticas, y el agentId va dentro de
 * conditions.actor. El nombre es único por compañía, así que se saltea si ya
 * existe y el script sigue siendo idempotente.
 */
const sendCatalog = await api("GET", `/tool-connections/${whatsapp.id}/catalog`);
const sendEntry = (sendCatalog?.catalog ?? []).find((t) => t.toolName === "whatsapp_send_message");

if (!sendEntry) {
  log.warn("whatsapp_send_message no está en el catálogo: no se pudo configurar el permiso del envío.");
} else {
  const policiesResponse = await api("GET", `/companies/${CID}/tools/policies`);
  const policies = Array.isArray(policiesResponse) ? policiesResponse : (policiesResponse?.policies ?? []);

  async function ensurePolicy(name, policyType, agentId, description) {
    if (policies.some((p) => p.name === name)) {
      log.reuse(name);
      return;
    }
    await api("POST", `/companies/${CID}/tools/policies`, {
      name,
      description,
      policyType,
      priority: 0,
      enabled: true,
      selectors: { connectionId: whatsapp.id, catalogEntryId: sendEntry.id },
      conditions: { actor: { agentId } },
    });
    log.ok(name);
  }

  await ensurePolicy(
    "ask-first:whatsapp_send_message:StockScout",
    "require_approval",
    scout.id,
    "Aprobacion humana antes de que StockScout envie un mensaje por WhatsApp.",
  );
  await ensurePolicy(
    "block:whatsapp_send_message:MarginReviewer",
    "block",
    reviewer.id,
    "El revisor valida ofertas, nunca envia mensajes al cliente.",
  );
}

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
  Conexiones Inventario y WhatsApp; el envío pide aprobación humana

  Los agentes nacen pausados: nada corre ni gasta hasta reanudarlos.
`);
