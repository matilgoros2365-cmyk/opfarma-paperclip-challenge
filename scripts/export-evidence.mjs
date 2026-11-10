#!/usr/bin/env node
/**
 * Exporta el historial real de la compañía en Paperclip para la página de
 * evidencia de la plataforma (/paperclip).
 *
 * Paperclip corre en la máquina de cada persona, así que quien evalúa no lo
 * puede abrir. Este script toma las tareas elegidas, con sus comentarios y sus
 * tarjetas de aprobación, las limpia de datos personales y las deja en
 * platform/data/paperclip-evidence.json. Es una foto con fecha, no una vista en
 * vivo, y la página lo dice.
 *
 * Uso, con Paperclip andando en modo local:
 *   EVIDENCE_ISSUES=OPF-1,OPF-5,OPF-6 node scripts/export-evidence.mjs
 *
 * Si falla la limpieza (queda un teléfono, una ruta personal o una clave), el
 * script no escribe nada.
 */
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const API = (process.env.PAPERCLIP_API_URL ?? "http://127.0.0.1:3100/api").replace(/\/+$/, "");
const TOKEN = process.env.PAPERCLIP_BOARD_TOKEN;
const WANTED = (process.env.EVIDENCE_ISSUES ?? "OPF-1,OPF-5,OPF-6,OPF-7,OPF-8,OPF-9,OPF-10")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const OUT = join(REPO_ROOT, "platform", "data", "paperclip-evidence.json");

async function api(path) {
  const response = await fetch(`${API}${path}`, { headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {} });
  if (!response.ok) throw new Error(`GET ${path} → HTTP ${response.status}`);
  return response.json();
}
const list = (value, key) => (Array.isArray(value) ? value : (value?.[key] ?? []));

/* ------------------------------------------------------------------ limpieza */

function clean(text) {
  return String(text ?? "")
    // Celulares argentinos con o sin el 9: quedan los últimos cuatro dígitos.
    .replace(/\b549?\d{10}\b/g, (n) => `54…${n.slice(-4)}`)
    // El identificador de mensaje de Meta codifica el teléfono.
    .replace(/wamid\.[A-Za-z0-9+/=_-]+/g, "wamid.…")
    // Rutas de la máquina, que llevan el usuario.
    .replace(/\/home\/[A-Za-z0-9._-]+/g, "/home/…")
    .replace(/[A-Z]:\\Users\\[^\\\s]+/g, "C:\\Users\\…")
    // Claves en URLs.
    .replace(/([?&]key=)[^\s&)"'`]+/g, "$1…")
    // Adjuntos y enlaces internos de Paperclip, que fuera de la máquina no abren.
    .replace(/\]\((\/api\/attachments\/[^)]+|\/OPF\/[^)]+)\)/g, "]")
    // Identificadores internos largos, que no le dicen nada a quien lee.
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g, (id) => `${id.slice(0, 8)}…`);
}

const FORBIDDEN = [/\b549?\d{10}\b/, /wamid\.[A-Za-z0-9+/=_-]{6,}/, /pcp_[A-Za-z0-9]/, /\/home\/(?!…)/, /[?&]key=(?!…)/];

/* ------------------------------------------------------------------ export */

const companies = list(await api("/companies"), "companies");
const company = companies.find((c) => c.name === "OpFarma");
if (!company) throw new Error("No encontré la compañía OpFarma.");
const CID = company.id;

const agentList = list(await api(`/companies/${CID}/agents`), "agents");
const agentName = (id) => agentList.find((a) => a.id === id)?.name ?? null;

const issues = list(await api(`/companies/${CID}/issues?view=compact`), "issues");
const exported = [];

for (const identifier of WANTED) {
  const brief = issues.find((i) => i.identifier === identifier);
  if (!brief) {
    console.warn(`  ! ${identifier} no existe, lo salteo`);
    continue;
  }
  const issue = await api(`/issues/${brief.id}`);
  const comments = list(await api(`/issues/${brief.id}/comments`), "comments");
  const interactions = list(await api(`/issues/${brief.id}/interactions`), "interactions");

  const events = [
    ...comments
      .filter((c) => !c.deletedAt)
      .map((c) => ({
        kind: "comment",
        at: c.createdAt,
        author: c.authorAgentId ? agentName(c.authorAgentId) : "Persona",
        body: clean(c.body),
      })),
    ...interactions
      .filter((x) => x.kind === "request_confirmation" && x.payload?.toolAction)
      .map((x) => {
        let args = null;
        try {
          args = JSON.parse(x.payload.toolAction.argumentsSummaryJson ?? "null");
        } catch {
          args = null;
        }
        return {
          kind: "approval",
          at: x.createdAt,
          resolvedAt: x.resolvedAt,
          status: x.status,
          requestedBy: agentName(x.createdByAgentId),
          resolvedBy: x.resolvedByUserId ? "Persona" : null,
          tool: x.payload.toolAction.toolDisplayName,
          app: x.payload.toolAction.appDisplayName,
          args: args ? JSON.parse(clean(JSON.stringify(args))) : null,
        };
      }),
  ].sort((a, b) => String(a.at).localeCompare(String(b.at)));

  exported.push({
    identifier,
    title: issue.title,
    status: issue.status,
    assignee: agentName(issue.assigneeAgentId),
    description: clean(issue.description),
    createdAt: issue.createdAt,
    events,
  });
  console.log(`  ✓ ${identifier} — ${events.length} eventos`);
}

const output = {
  exportedAt: new Date().toISOString(),
  paperclipVersion: (await api("/health")).version ?? null,
  company: { name: company.name, prefix: company.issuePrefix },
  agents: agentList
    .filter((a) => ["MarginReviewer", "StockScout", "GrowthScout"].includes(a.name))
    .map((a) => ({ name: a.name, role: a.role, title: a.title, reportsTo: agentName(a.reportsTo) })),
  issues: exported,
};

const json = JSON.stringify(output, null, 2);
const leaks = FORBIDDEN.filter((re) => re.test(json));
if (leaks.length > 0) {
  console.error(`\n  ✗ La limpieza dejó datos que no pueden publicarse (${leaks.map(String).join(", ")}). No escribí nada.\n`);
  process.exit(1);
}

writeFileSync(OUT, json + "\n");
console.log(`\n  Listo: ${OUT}`);
