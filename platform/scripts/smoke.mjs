/**
 * Prueba de humo de los dos servidores MCP, contra cualquier instancia.
 *
 * Ejercita las siete herramientas como lo haría un agente, incluidos los casos
 * que el servidor tiene que rechazar. Nunca puede mandar un mensaje real: los
 * únicos envíos que prueba son los que deben rechazarse antes de llegar a Meta
 * (un draft_id que no coincide, y confirm: false).
 *
 * Uso:
 *   SMOKE_BASE_URL=http://127.0.0.1:3200 MCP_API_KEY=... node scripts/smoke.mjs
 *   SMOKE_BASE_URL=https://opfarma-paperclip-challenge.vercel.app MCP_API_KEY=... node scripts/smoke.mjs
 */
const BASE = (process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3200").replace(/\/+$/, "");
const KEY = process.env.MCP_API_KEY?.trim();
if (!KEY) {
  console.error("Falta MCP_API_KEY.");
  process.exit(1);
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? `  (${detail})` : ""}`);
}

async function rpc(server, method, params, key = KEY) {
  const url = key === null ? `${BASE}/api/mcp/${server}` : `${BASE}/api/mcp/${server}?key=${encodeURIComponent(key)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const text = await response.text();
  // La respuesta puede venir como JSON o como evento SSE ("data: {...}").
  const json = text.trim().startsWith("{") ? JSON.parse(text) : JSON.parse(text.split("\n").find((l) => l.startsWith("data:"))?.slice(5) ?? "null");
  return { status: response.status, json };
}

async function tool(server, name, args) {
  const { json } = await rpc(server, "tools/call", { name, arguments: args });
  const result = json?.result ?? {};
  const textBlock = (result.content ?? []).map((c) => c.text ?? "").join("\n");
  // Los datos vienen en un bloque ```json debajo del resumen.
  let data = null;
  const match = textBlock.match(/```json\n([\s\S]*?)\n```/);
  if (match) {
    try {
      data = JSON.parse(match[1]);
    } catch {
      data = null;
    }
  }
  return { isError: Boolean(result.isError), text: textBlock, data };
}

console.log(`Prueba de humo contra ${BASE}\n`);

// Autenticación
check("sin clave, el inventario responde 401", (await rpc("inventory", "tools/list", {}, null)).status === 401);
check("con una clave incorrecta, WhatsApp responde 401", (await rpc("whatsapp", "tools/list", {}, "clave-incorrecta")).status === 401);

// Catálogo
const invTools = (await rpc("inventory", "tools/list", {})).json?.result?.tools?.map((t) => t.name) ?? [];
check("el inventario expone sus 3 herramientas", invTools.length === 3, invTools.join(", "));
const waTools = (await rpc("whatsapp", "tools/list", {})).json?.result?.tools?.map((t) => t.name) ?? [];
check("WhatsApp expone sus 4 herramientas", waTools.length === 4, waTools.join(", "));

// Inventario
const scan = await tool("inventory", "inventory_scan_expiring", {});
check(
  "el escaneo encuentra 7 lotes y $3.004.000 en riesgo",
  !scan.isError && scan.data?.lots?.length === 7 && scan.data?.total_value_at_risk === 3004000,
);

const place = await tool("inventory", "inventory_place_lot", { lot_id: "L-4028" });
check("L-4028 se coloca en Sanatorio del Parque", !place.isError && place.text.includes("Sanatorio del Parque"));

const offer = await tool("inventory", "inventory_draft_offer", { lot_id: "L-4028", account_id: "ACC-PARQUE" });
const template = offer.data?.whatsapp_template;
check("la oferta de L-4028 trae su plantilla con variables", !offer.isError && Array.isArray(template?.variables) && template.variables.length > 0);
check("la oferta de L-4028 sale a $1.260 por unidad", offer.text.includes("1260") || offer.text.includes("1.260"));

const retired = await tool("inventory", "inventory_draft_offer", { lot_id: "L-7703", account_id: "ACC-LABCENTRO" });
check("un lote a punto de vencer no se ofrece", retired.isError);

const blocked = await tool("inventory", "inventory_draft_offer", { lot_id: "L-2201", account_id: "ACC-NORTE" });
check("no se arma una oferta para una cuenta bloqueada", blocked.isError);

// WhatsApp
const status = await tool("whatsapp", "whatsapp_channel_status", {});
check("el estado del canal responde", !status.isError, status.text.split("\n")[0]);

const message = { to: "5491100000001", kind: "text", body: "Prueba de humo: este mensaje nunca se envía." };
const draft = await tool("whatsapp", "whatsapp_draft_message", message);
const draftId = draft.data?.draft_id;
check("el borrador devuelve un draft_id", !draft.isError && /^wd_[0-9a-f]{20}$/.test(draftId ?? ""));

const again = await tool("whatsapp", "whatsapp_draft_message", message);
check("el mismo mensaje da el mismo draft_id", again.data?.draft_id === draftId);

const tampered = await tool("whatsapp", "whatsapp_send_message", { ...message, body: `${message.body} (cambiado)`, draft_id: draftId, confirm: true });
check("un mensaje cambiado después de aprobar se rechaza", tampered.isError && /does not match/i.test(tampered.text));

const unconfirmed = await tool("whatsapp", "whatsapp_send_message", { ...message, draft_id: draftId, confirm: false });
check("sin confirm, no se envía", unconfirmed.isError && /confirm must be true/i.test(unconfirmed.text));

const delivery = await tool("whatsapp", "whatsapp_delivery_status", {});
check("la consulta de entregas responde", !delivery.isError, delivery.text.split("\n")[0]);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} de ${results.length} verificaciones pasaron.`);
process.exit(failed.length === 0 ? 0 : 1);
