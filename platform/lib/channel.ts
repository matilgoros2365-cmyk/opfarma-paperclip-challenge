/**
 * Channel configuration and self-description.
 *
 * The agent operating this channel needs to be able to answer "what can I
 * actually do right now?" without guessing. That is what describeChannel is
 * for: it separates what the deployment DECLARES (env vars) from what Meta
 * REPORTS (a live Graph call), and never presents one as the other.
 */
import { ChannelError, DEFAULT_GRAPH_VERSION, normalizeRecipient } from "./whatsapp";

export type ChannelMode = "test_number" | "own_number";

/** Meta's shared test number can only reach recipients added by hand. */
export const TEST_NUMBER_RECIPIENT_LIMIT = 5;

export interface ChannelConfig {
  phoneNumberId: string;
  token: string;
  graphVersion: string;
  mode: ChannelMode;
  allowedRecipients: string[];
  sendingEnabled: boolean;
}

function parseRecipients(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => entry.replace(/\D/g, ""));
}

export function loadChannelConfig(env: Record<string, string | undefined> = process.env): ChannelConfig {
  const phoneNumberId = env.META_PHONE_NUMBER_ID?.trim();
  const token = env.META_WHATSAPP_TOKEN?.trim();

  const missing: string[] = [];
  if (!phoneNumberId) missing.push("META_PHONE_NUMBER_ID");
  if (!token) missing.push("META_WHATSAPP_TOKEN");

  if (missing.length > 0 || !phoneNumberId || !token) {
    throw new ChannelError(
      `The WhatsApp channel is not configured: ${missing.join(", ")} missing.`,
      "not_configured",
      { remedy: "Copy platform/.env.example to .env.local and fill it from the Meta app dashboard." },
    );
  }

  const declaredMode = env.META_CHANNEL_MODE?.trim();
  const mode: ChannelMode = declaredMode === "own_number" ? "own_number" : "test_number";

  return {
    phoneNumberId,
    token,
    graphVersion: env.META_GRAPH_VERSION?.trim() || DEFAULT_GRAPH_VERSION,
    mode,
    allowedRecipients: parseRecipients(env.META_ALLOWED_RECIPIENTS),
    // Sending is off unless switched on deliberately. Any other value is off.
    sendingEnabled: env.WHATSAPP_ALLOW_SEND?.trim() === "true",
  };
}

/**
 * Lo que necesita un borrador, que es mucho menos que lo que necesita un envío.
 *
 * Armar el payload exacto de la Graph API no requiere ni el token ni el número
 * de Meta: sólo el destinatario y el mensaje. Así que esta lectura nunca falla
 * por credenciales faltantes, y reporta en `configured` si se podría entregar.
 *
 * Esto importa porque el dry-run es el mínimo aceptable del enunciado, y
 * exigir credenciales de Meta para producirlo dejaba sin canal a cualquiera que
 * no las tuviera cargadas.
 */
export interface DraftConfig {
  configured: boolean;
  missing: string[];
  phoneNumberId: string | null;
  graphVersion: string;
  mode: ChannelMode;
  allowedRecipients: string[];
  sendingEnabled: boolean;
}

export function readDraftConfig(env: Record<string, string | undefined> = process.env): DraftConfig {
  const phoneNumberId = env.META_PHONE_NUMBER_ID?.trim() || null;
  const token = env.META_WHATSAPP_TOKEN?.trim() || null;

  const missing: string[] = [];
  if (!phoneNumberId) missing.push("META_PHONE_NUMBER_ID");
  if (!token) missing.push("META_WHATSAPP_TOKEN");

  const declaredMode = env.META_CHANNEL_MODE?.trim();

  return {
    configured: missing.length === 0,
    missing,
    phoneNumberId,
    graphVersion: env.META_GRAPH_VERSION?.trim() || DEFAULT_GRAPH_VERSION,
    mode: declaredMode === "own_number" ? "own_number" : "test_number",
    allowedRecipients: parseRecipients(env.META_ALLOWED_RECIPIENTS),
    sendingEnabled: env.WHATSAPP_ALLOW_SEND?.trim() === "true",
  };
}

/** El endpoint que se llamaría, con un marcador visible si falta el número. */
export function endpointFor(config: Pick<DraftConfig, "graphVersion" | "phoneNumberId">): string {
  return `POST https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId ?? "{META_PHONE_NUMBER_ID}"}/messages`;
}

/**
 * Fails before the network call when we already know Meta will refuse. The
 * allowlist is only authoritative for a test number; for a registered number
 * an empty list means "no local restriction", not "nobody allowed".
 */
export function assertRecipientAllowed(
  recipient: string,
  config: Pick<ChannelConfig, "mode" | "allowedRecipients">,
): void {
  if (config.mode !== "test_number") return;
  if (config.allowedRecipients.length === 0) return;

  const to = normalizeRecipient(recipient);
  if (!config.allowedRecipients.includes(to)) {
    throw new ChannelError(
      `${to} is not on this test number's allowed list, so Meta would reject the send (error 131030).`,
      "recipient_not_allowed",
      {
        remedy: `Add the number in the Meta app dashboard under WhatsApp > API setup (up to ${TEST_NUMBER_RECIPIENT_LIMIT} recipients), then add it to META_ALLOWED_RECIPIENTS.`,
        detail: { allowed: config.allowedRecipients },
      },
    );
  }
}

export interface ObservedNumber {
  reachable: true;
  displayPhoneNumber: string | undefined;
  verifiedName: string | undefined;
  qualityRating: string | undefined;
  platformType: string | undefined;
  codeVerificationStatus: string | undefined;
}

export interface UnreachableNumber {
  reachable: false;
  reason: string;
}

export interface ChannelDescription {
  declared: {
    mode: ChannelMode;
    graphVersion: string;
    phoneNumberId: string;
    sendingEnabled: boolean;
    allowedRecipients: string[];
  };
  observed: ObservedNumber | UnreachableNumber;
  constraints: string[];
}

const NUMBER_FIELDS = [
  "display_phone_number",
  "verified_name",
  "quality_rating",
  "platform_type",
  "code_verification_status",
].join(",");

export async function describeChannel(
  config: ChannelConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<ChannelDescription> {
  const constraints: string[] = [];

  if (!config.sendingEnabled) {
    constraints.push(
      "Sending is disabled in this deployment (WHATSAPP_ALLOW_SEND is not \"true\"). Drafts are produced and validated; nothing is delivered.",
    );
  }

  if (config.mode === "test_number") {
    constraints.push(
      `This is Meta's test number: it can only message up to ${TEST_NUMBER_RECIPIENT_LIMIT} recipients added by hand in the app dashboard. It cannot message an arbitrary number.`,
    );
    constraints.push(
      "Reaching any recipient requires a registered business number, which requires business verification of the Meta portfolio (legal name, address, tax id) and a payment method.",
    );
  }

  constraints.push(
    "Free-form text only reaches a recipient within 24h of their last inbound message. Outside that window Meta requires a pre-approved template.",
  );

  let observed: ObservedNumber | UnreachableNumber;
  try {
    const url = `https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}?fields=${NUMBER_FIELDS}`;
    const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${config.token}` } });
    const raw: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const message = (raw as { error?: { message?: string } } | null)?.error?.message;
      observed = { reachable: false, reason: message ?? `Graph API returned HTTP ${response.status}.` };
    } else {
      const node = raw as Record<string, string | undefined> | null;
      observed = {
        reachable: true,
        displayPhoneNumber: node?.display_phone_number,
        verifiedName: node?.verified_name,
        qualityRating: node?.quality_rating,
        platformType: node?.platform_type,
        codeVerificationStatus: node?.code_verification_status,
      };
    }
  } catch (cause) {
    observed = { reachable: false, reason: String(cause) };
  }

  return {
    declared: {
      mode: config.mode,
      graphVersion: config.graphVersion,
      phoneNumberId: config.phoneNumberId,
      sendingEnabled: config.sendingEnabled,
      allowedRecipients: config.allowedRecipients,
    },
    observed,
    constraints,
  };
}

/**
 * Lo que muestra la página cuando Meta no responde. El caso esperable es el
 * token de prueba vencido (dura 24 horas): se explica en criollo en lugar de
 * mostrar el mensaje crudo de la Graph API.
 */
export function explainUnreachable(reason: string): string {
  if (/session has expired|access token|oauth|\b190\b/i.test(reason)) {
    return (
      "El token de Meta venció o dejó de ser válido: el de prueba dura 24 horas. " +
      "Mientras no se renueve no sale ningún mensaje; los avisos de abajo son de los envíos que ya se hicieron."
    );
  }
  if (/fetch failed|enotfound|econnreset|etimedout|network/i.test(reason)) {
    return "No se pudo llegar a Meta en este momento. Los avisos de abajo son de los envíos que ya se hicieron.";
  }
  return `No se pudo consultar a Meta: ${reason}`;
}
