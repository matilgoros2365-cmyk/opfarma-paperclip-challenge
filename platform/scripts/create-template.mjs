/**
 * Da de alta la plantilla de oferta en una cuenta de WhatsApp Business.
 *
 * Lee el texto de data/offer-template.json, el mismo archivo que usa el agente,
 * así que lo que Meta aprueba es exactamente lo que se va a mandar.
 *
 * Uso:
 *   META_WABA_ID=... META_WHATSAPP_TOKEN=... node scripts/create-template.mjs
 *
 * El token necesita el permiso whatsapp_business_management. El temporal de la
 * consola de Meta alcanza.
 */
import { readFileSync } from "node:fs";

// Por defecto la oferta completa. TEMPLATE_FILE=offer-template-simple.json da de
// alta la invitación corta.
const file = process.env.TEMPLATE_FILE?.trim() || "offer-template.json";
const template = JSON.parse(readFileSync(new URL(`../data/${file}`, import.meta.url), "utf8"));

const wabaId = process.env.META_WABA_ID?.trim();
const token = process.env.META_WHATSAPP_TOKEN?.trim();
const version = process.env.META_GRAPH_VERSION?.trim() || "v27.0";

if (!wabaId || !token) {
  console.error("Faltan META_WABA_ID y META_WHATSAPP_TOKEN.");
  process.exit(1);
}

const body = {
  name: template.name,
  language: template.language,
  category: template.category,
  components: [
    { type: "BODY", text: template.body, example: { body_text: [template.examples] } },
    { type: "FOOTER", text: template.footer },
  ],
};

const response = await fetch(`https://graph.facebook.com/${version}/${wabaId}/message_templates`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const result = await response.json().catch(() => null);

if (!response.ok) {
  const error = result?.error ?? {};
  console.error(`\nMeta rechazó la plantilla (HTTP ${response.status}).`);
  console.error(`  ${error.error_user_title ?? error.message ?? "sin detalle"}`);
  if (error.error_user_msg) console.error(`  ${error.error_user_msg}`);
  process.exit(1);
}

console.log(`\nPlantilla ${template.name} enviada a revisión.`);
console.log(`  id: ${result?.id}`);
console.log(`  estado: ${result?.status}`);
console.log(`  categoría: ${result?.category}`);
