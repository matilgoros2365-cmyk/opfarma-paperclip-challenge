/**
 * Webhook de WhatsApp. Se configura en la app de Meta con esta URL y el
 * META_WEBHOOK_VERIFY_TOKEN, suscripto al campo "messages".
 *
 * GET  responde el desafío de suscripción.
 * POST verifica la firma con META_APP_SECRET, guarda los estados de entrega de
 *      los mensajes que mandó OpFarma y responde 200 enseguida: si Meta no
 *      recibe 200, reintenta. Con WHATSAPP_SHARED_ACCOUNT=true, además descarta
 *      las respuestas entrantes, que en una cuenta compartida pueden no ser
 *      para OpFarma.
 */
import { keepOwn, readStoreConfig, saveEvents } from "@/lib/events-store";
import { parseWebhook, verifySignature, verifySubscription } from "@/lib/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim();
  if (!verifyToken) return new Response("Webhook not configured", { status: 503 });

  const result = verifySubscription(new URL(request.url).searchParams, verifyToken);
  return result.ok
    ? new Response(result.challenge, { status: 200, headers: { "Content-Type": "text/plain" } })
    : new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request): Promise<Response> {
  const appSecret = process.env.META_APP_SECRET?.trim();
  if (!appSecret) return new Response("Webhook not configured", { status: 503 });

  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"), appSecret)) {
    return new Response("Invalid signature", { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const received = parseWebhook(body);
  const store = readStoreConfig();
  const sharedAccount = process.env.WHATSAPP_SHARED_ACCOUNT?.trim() === "true";
  let events = received;

  if (store) {
    try {
      events = await keepOwn(received, store, { sharedAccount });
      await saveEvents(events, store);
    } catch (error) {
      // Se registra y se responde 200 igual: un reintento de Meta no arregla un
      // problema del almacén, y sí duplicaría eventos.
      console.error("whatsapp-webhook: could not store events", String(error));
      events = [];
    }
  }
  // Al log va sólo la cuenta, no el contenido: puede haber avisos de otra app.
  console.log(
    "whatsapp-webhook",
    JSON.stringify({ received: received.length, stored: store ? events.length : 0 }),
  );

  return new Response("OK", { status: 200 });
}
