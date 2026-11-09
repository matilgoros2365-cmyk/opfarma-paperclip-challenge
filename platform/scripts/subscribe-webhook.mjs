/**
 * Conecta el webhook de estado con Meta, sin pasar por la interfaz.
 *
 * Hace dos cosas, que en la consola de Meta están en pantallas distintas:
 *   1. Registra la URL del webhook en la app, suscripta al campo "messages".
 *      Meta la verifica en el momento: llama a la URL con un desafío y espera
 *      que el webhook lo devuelva usando el mismo token de verificación.
 *   2. Suscribe la app a la cuenta de WhatsApp Business, para que los avisos de
 *      esa cuenta le lleguen.
 *
 * Uso:
 *   META_APP_ID=... META_APP_SECRET=... META_WEBHOOK_VERIFY_TOKEN=... \
 *   META_WABA_ID=... META_WHATSAPP_TOKEN=... WEBHOOK_URL=https://.../api/whatsapp/webhook \
 *   node scripts/subscribe-webhook.mjs
 */
const env = (name) => process.env[name]?.trim();
const required = ["META_APP_ID", "META_APP_SECRET", "META_WEBHOOK_VERIFY_TOKEN", "META_WABA_ID", "META_WHATSAPP_TOKEN", "WEBHOOK_URL"];
const missing = required.filter((name) => !env(name));
if (missing.length > 0) {
  console.error(`Faltan: ${missing.join(", ")}`);
  process.exit(1);
}

const graph = `https://graph.facebook.com/${env("META_GRAPH_VERSION") || "v27.0"}`;

async function call(label, url, init) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = body?.error ?? {};
    console.error(`\n✗ ${label}: HTTP ${response.status}`);
    console.error(`  ${error.error_user_msg ?? error.message ?? "sin detalle"}`);
    process.exit(1);
  }
  console.log(`✓ ${label}`);
  return body;
}

// 1. La URL del webhook, con el token de acceso de la app (id|secreto).
const appToken = `${env("META_APP_ID")}|${env("META_APP_SECRET")}`;
await call(
  "Webhook registrado y verificado por Meta",
  `${graph}/${env("META_APP_ID")}/subscriptions`,
  {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      object: "whatsapp_business_account",
      callback_url: env("WEBHOOK_URL"),
      verify_token: env("META_WEBHOOK_VERIFY_TOKEN"),
      fields: "messages",
      include_values: "true",
      access_token: appToken,
    }),
  },
);

// 2. La app, suscripta a la cuenta de WhatsApp Business.
const headers = { Authorization: `Bearer ${env("META_WHATSAPP_TOKEN")}` };
await call("App suscripta a la cuenta de WhatsApp Business", `${graph}/${env("META_WABA_ID")}/subscribed_apps`, {
  method: "POST",
  headers,
});

const apps = await call("Apps suscriptas a la cuenta", `${graph}/${env("META_WABA_ID")}/subscribed_apps`, { headers });
for (const entry of apps?.data ?? []) {
  const app = entry.whatsapp_business_api_data ?? entry;
  console.log(`  - ${app.name ?? "(sin nombre)"} (${app.id ?? "?"})`);
}
