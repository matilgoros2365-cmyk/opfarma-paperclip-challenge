/**
 * Dónde quedan los avisos de Meta.
 *
 * Una función serverless no tiene memoria entre llamadas, así que los eventos
 * van a un Redis de Upstash por su API REST, sin dependencias. Las variables
 * son las que crea la integración de Vercel (KV_REST_API_URL y
 * KV_REST_API_TOKEN), o las de Upstash directo. Si no están, el webhook sigue
 * respondiendo y validando, y los eventos sólo quedan en el log: es un estado
 * válido, y se informa como tal.
 *
 * Sólo se guardan los avisos de mensajes que mandó OpFarma. Cada envío anota
 * su identificador, y el webhook descarta el resto. Importa porque una cuenta de
 * WhatsApp Business puede estar compartida con otra app: sus avisos llegan al
 * mismo webhook y no son nuestros.
 */
import type { WebhookEvent } from "./webhook";

const EVENTS = "opfarma:whatsapp:events";
const SENT = "opfarma:whatsapp:sent";
const KEEP = 200;

export interface StoreConfig {
  url: string;
  token: string;
}

export function readStoreConfig(env: Record<string, string | undefined> = process.env): StoreConfig | null {
  const url = (env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL)?.trim();
  const token = (env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN)?.trim();
  return url && token ? { url: url.replace(/\/+$/, ""), token } : null;
}

async function call(config: StoreConfig, path: string, body: unknown, fetchImpl: typeof fetch): Promise<unknown> {
  const response = await fetchImpl(`${config.url}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Event store answered HTTP ${response.status}`);
  return response.json();
}

/** Lo llama el envío: a partir de acá, los avisos de este mensaje son nuestros. */
export async function recordSent(wamid: string, config: StoreConfig, fetchImpl: typeof fetch = fetch): Promise<void> {
  await call(config, "", ["SADD", SENT, wamid], fetchImpl);
}

/**
 * Se queda con los avisos de mensajes propios. Las respuestas entrantes se
 * conservan sólo si la cuenta no está compartida: en una cuenta compartida no
 * hay forma de saber si el cliente le contestó a OpFarma o a la otra app.
 */
export async function keepOwn(
  events: WebhookEvent[],
  config: StoreConfig,
  options: { sharedAccount: boolean },
  fetchImpl: typeof fetch = fetch,
): Promise<WebhookEvent[]> {
  const statuses = events.filter((event) => event.kind === "status");
  let own = new Set<string>();

  if (statuses.length > 0) {
    const answers = (await call(
      config,
      "/pipeline",
      statuses.map((event) => ["SISMEMBER", SENT, event.wamid]),
      fetchImpl,
    )) as Array<{ result?: number }>;
    own = new Set(statuses.filter((_, i) => answers[i]?.result === 1).map((event) => event.wamid));
  }

  return events.filter((event) =>
    event.kind === "status" ? own.has(event.wamid) : !options.sharedAccount,
  );
}

export async function saveEvents(
  events: WebhookEvent[],
  config: StoreConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (events.length === 0) return;
  await call(
    config,
    "/pipeline",
    [["LPUSH", EVENTS, ...events.map((event) => JSON.stringify(event))], ["LTRIM", EVENTS, "0", String(KEEP - 1)]],
    fetchImpl,
  );
}

/** Los más recientes primero. */
export async function recentEvents(
  config: StoreConfig,
  limit = 50,
  fetchImpl: typeof fetch = fetch,
): Promise<WebhookEvent[]> {
  const raw = (await call(config, "", ["LRANGE", EVENTS, "0", String(limit - 1)], fetchImpl)) as { result?: string[] };
  return (raw.result ?? []).flatMap((entry) => {
    try {
      return [JSON.parse(entry) as WebhookEvent];
    } catch {
      return [];
    }
  });
}
