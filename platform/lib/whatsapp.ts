/**
 * WhatsApp Cloud API client.
 *
 * Two things are deliberately separated here: BUILDING a payload (pure, free,
 * always safe) and DELIVERING it (a network call that costs money and reaches
 * a real phone). Every tool in this MCP server can build. Only one can
 * deliver, and only when the deployment explicitly allows it.
 */
import { z } from "zod";

export const DEFAULT_GRAPH_VERSION = "v27.0";

export class ChannelError extends Error {
  readonly code: string;
  readonly detail: unknown;
  readonly remedy: string | undefined;

  constructor(message: string, code: string, opts: { detail?: unknown; remedy?: string } = {}) {
    super(message);
    this.name = "ChannelError";
    this.code = code;
    this.detail = opts.detail;
    this.remedy = opts.remedy;
  }
}

export const textMessageSchema = z.object({
  kind: z.literal("text"),
  body: z.string().min(1, "An empty message body is not sendable.").max(4096),
});

export const templateMessageSchema = z.object({
  kind: z.literal("template"),
  name: z.string().min(1),
  language: z.string().min(2).default("es_AR"),
  variables: z.array(z.string()).default([]),
});

export const messageSchema = z.discriminatedUnion("kind", [textMessageSchema, templateMessageSchema]);
export type Message = z.infer<typeof messageSchema>;

export interface WhatsAppPayload {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "text" | "template";
  text?: { preview_url: boolean; body: string };
  template?: {
    name: string;
    language: { code: string };
    components?: Array<{ type: "body"; parameters: Array<{ type: "text"; text: string }> }>;
  };
}

/**
 * Meta wants a full international number: digits only, country code included,
 * no plus sign and no separators. Everything else is rejected here rather
 * than at the Graph API, so the failure names the real problem.
 */
export function normalizeRecipient(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) {
    throw new ChannelError(`"${raw}" is not a usable WhatsApp recipient.`, "invalid_recipient", {
      remedy:
        "Pass the full international number, country code included, digits only - for example 5491122223333.",
    });
  }
  return digits;
}

export function buildPayload(recipient: string, message: Message): WhatsAppPayload {
  const to = normalizeRecipient(recipient);

  if (message.kind === "text") {
    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body: message.body },
    };
  }

  const components =
    message.variables.length > 0
      ? [
          {
            type: "body" as const,
            parameters: message.variables.map((text) => ({ type: "text" as const, text })),
          },
        ]
      : undefined;

  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: message.name,
      language: { code: message.language },
      ...(components ? { components } : {}),
    },
  };
}

/** What a human will actually read on the phone, for the approval screen. */
export function renderPreview(message: Message): string {
  if (message.kind === "text") return message.body;
  const filled = message.variables.map((v, i) => `{{${i + 1}}} = ${v}`).join("\n");
  return `[template ${message.name} | ${message.language}]${filled ? `\n${filled}` : ""}`;
}

export interface DeliveryReceipt {
  wamid: string;
  waId: string | undefined;
  graphVersion: string;
  sentAt: string;
}

/**
 * Meta error codes worth translating. Everything else is passed through
 * verbatim: a wrong guess about someone else's error is worse than the
 * original message.
 */
const META_ERRORS: Record<number, { summary: string; remedy: string }> = {
  131030: {
    summary: "Meta refused the recipient: it is not on this number's allowed list.",
    remedy:
      "A test number can only message recipients added by hand in the Meta app dashboard (up to five). Add the number there, or register your own business number.",
  },
  131026: {
    summary: "Meta accepted the request but the message is undeliverable.",
    remedy:
      "Usually the recipient has no WhatsApp account on that number, or has never opened a conversation window with this sender.",
  },
  131047: {
    summary: "Outside the 24-hour customer service window.",
    remedy:
      "Free-form text only works within 24h of the recipient's last message. Send an approved template instead.",
  },
  190: {
    summary: "The access token is expired or invalid.",
    remedy:
      "The token generated in the Meta console lasts 24 hours. Generate a new one, or create a permanent System User token.",
  },
};

interface MetaErrorBody {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

interface MetaSendResponse {
  messages?: Array<{ id?: string }>;
  contacts?: Array<{ wa_id?: string }>;
}

export async function deliver(
  payload: WhatsAppPayload,
  config: { phoneNumberId: string; token: string; graphVersion: string },
  fetchImpl: typeof fetch = fetch,
): Promise<DeliveryReceipt> {
  const url = `https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (cause) {
    throw new ChannelError("Could not reach the Graph API.", "network_error", {
      detail: String(cause),
    });
  }

  const raw: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (raw as MetaErrorBody | null)?.error;
    const known = error?.code !== undefined ? META_ERRORS[error.code] : undefined;
    throw new ChannelError(
      known?.summary ?? error?.message ?? `Graph API returned HTTP ${response.status}.`,
      `meta_${error?.code ?? response.status}`,
      {
        remedy: known?.remedy,
        detail: {
          httpStatus: response.status,
          metaMessage: error?.message,
          metaCode: error?.code,
          metaSubcode: error?.error_subcode,
          fbtraceId: error?.fbtrace_id,
        },
      },
    );
  }

  const ok = raw as MetaSendResponse | null;
  const wamid = ok?.messages?.[0]?.id;
  if (!wamid) {
    throw new ChannelError(
      "Graph API answered 200 but without a message id, so delivery cannot be evidenced.",
      "missing_wamid",
      { detail: raw },
    );
  }

  return {
    wamid,
    waId: ok?.contacts?.[0]?.wa_id,
    graphVersion: config.graphVersion,
    sentAt: new Date().toISOString(),
  };
}
