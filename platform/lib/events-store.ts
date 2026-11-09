/**
 * Dónde quedan los avisos de Meta.
 *
 * Una función serverless no tiene memoria entre llamadas, así que los eventos
 * van a un Redis de Upstash por su API REST, sin dependencias. Las variables
 * son las que crea la integración de Vercel (KV_REST_API_URL y
 * KV_REST_API_TOKEN), o las de Upstash directo. Si no están, el webhook sigue
 * respondiendo y validando, y los eventos sólo quedan en el log: es un estado
 * válido, y se informa como tal.
 */
import type { WebhookEvent } from "./webhook";

const KEY = "opfarma:whatsapp:events";
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

export async function saveEvents(
  events: WebhookEvent[],
  config: StoreConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (events.length === 0) return;
  await call(
    config,
    "/pipeline",
    [["LPUSH", KEY, ...events.map((event) => JSON.stringify(event))], ["LTRIM", KEY, "0", String(KEEP - 1)]],
    fetchImpl,
  );
}

/** Los más recientes primero. */
export async function recentEvents(
  config: StoreConfig,
  limit = 50,
  fetchImpl: typeof fetch = fetch,
): Promise<WebhookEvent[]> {
  const raw = (await call(config, "", ["LRANGE", KEY, "0", String(limit - 1)], fetchImpl)) as { result?: string[] };
  return (raw.result ?? []).flatMap((entry) => {
    try {
      return [JSON.parse(entry) as WebhookEvent];
    } catch {
      return [];
    }
  });
}
