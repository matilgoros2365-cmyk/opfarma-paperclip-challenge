/**
 * El webhook de WhatsApp: lo que Meta avisa después de un envío.
 *
 * Un envío aceptado por la Graph API no significa que el mensaje llegó. Meta
 * informa después, por webhook, si quedó enviado, entregado, leído o si falló.
 * Este módulo hace dos cosas puras y testeables: comprobar que el aviso viene
 * de Meta (firma HMAC con el secreto de la app) y convertirlo en eventos
 * chicos, sin guardar el contenido de los mensajes de nadie.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type DeliveryStatus = "sent" | "delivered" | "read" | "failed";

export interface StatusEvent {
  kind: "status";
  wamid: string;
  status: DeliveryStatus;
  /** Sólo los últimos cuatro dígitos: alcanza para reconocerlo y no expone el número. */
  recipient: string;
  at: string;
  error?: { code: number | undefined; title: string | undefined };
}

export interface InboundEvent {
  kind: "inbound";
  /** Una respuesta del cliente abre la ventana de 24 horas para texto libre. */
  from: string;
  type: string;
  at: string;
}

export type WebhookEvent = StatusEvent | InboundEvent;

const STATUSES: ReadonlySet<string> = new Set(["sent", "delivered", "read", "failed"]);

export function maskNumber(number: string | undefined): string {
  const digits = (number ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? `…${digits.slice(-4)}` : "…";
}

function isoFromUnix(seconds: string | number | undefined): string {
  const n = Number(seconds);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : new Date().toISOString();
}

/**
 * Meta firma el cuerpo crudo con el secreto de la app y lo manda en
 * X-Hub-Signature-256 como "sha256=<hex>". Si el cuerpo se parsea y se vuelve
 * a serializar antes de verificar, la firma deja de coincidir: por eso esto
 * recibe el texto tal cual llegó.
 */
export function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const received = Buffer.from(header.slice("sha256=".length), "hex");
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  return received.length === expected.length && timingSafeEqual(received, expected);
}

interface MetaWebhookBody {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: {
        statuses?: Array<{
          id?: string;
          status?: string;
          timestamp?: string;
          recipient_id?: string;
          errors?: Array<{ code?: number; title?: string }>;
        }>;
        messages?: Array<{ from?: string; type?: string; timestamp?: string }>;
      };
    }>;
  }>;
}

/** Los eventos que importan, en el orden en que vinieron. Lo demás se ignora. */
export function parseWebhook(body: unknown): WebhookEvent[] {
  const payload = body as MetaWebhookBody | null;
  if (payload?.object !== "whatsapp_business_account") return [];

  const events: WebhookEvent[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const value = change.value ?? {};

      for (const status of value.statuses ?? []) {
        if (!status.id || !status.status || !STATUSES.has(status.status)) continue;
        const firstError = status.errors?.[0];
        events.push({
          kind: "status",
          wamid: status.id,
          status: status.status as DeliveryStatus,
          recipient: maskNumber(status.recipient_id),
          at: isoFromUnix(status.timestamp),
          ...(firstError ? { error: { code: firstError.code, title: firstError.title } } : {}),
        });
      }

      for (const message of value.messages ?? []) {
        events.push({
          kind: "inbound",
          from: maskNumber(message.from),
          type: message.type ?? "unknown",
          at: isoFromUnix(message.timestamp),
        });
      }
    }
  }
  return events;
}

/** El handshake de suscripción: Meta manda un desafío y espera que se lo devuelvan. */
export function verifySubscription(
  params: URLSearchParams,
  verifyToken: string,
): { ok: true; challenge: string } | { ok: false } {
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");
  if (mode !== "subscribe" || !token || !challenge) return { ok: false };

  const a = Buffer.from(token);
  const b = Buffer.from(verifyToken);
  return a.length === b.length && timingSafeEqual(a, b) ? { ok: true, challenge } : { ok: false };
}
