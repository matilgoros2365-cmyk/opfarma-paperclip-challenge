/**
 * El canal de redes: un posteo de LinkedIn para colocar un lote entre clínicas
 * que todavía no son clientes.
 *
 * WhatsApp le ofrece un lote a una cuenta que ya lo consume. LinkedIn sirve
 * para el caso contrario, el lote que ninguna cuenta absorbe entero a tiempo,
 * y para eso hay que encontrar compradores nuevos.
 *
 * Es una simulación creíble, no un texto suelto. El borrador es el pedido
 * exacto que recibiría la API de Posts de LinkedIn, con su draft_id, y el
 * envío exige ese mismo draft_id. Sin credenciales responde como dry-run y
 * dice qué faltaría. Publicar como página de empresa exige que LinkedIn
 * apruebe la app (Community Management API), así que el modo real queda
 * escrito pero sin probar contra LinkedIn.
 */
import { draftId } from "./drafts";
import { placeLot, type Dataset, type Placement } from "./expiry/engine";
import { cantidad, fecha, pesos } from "./expiry/format";

export const LINKEDIN_ENDPOINT = "https://api.linkedin.com/rest/posts";
export const LINKEDIN_MAX_COMMENTARY = 3000;
const DEFAULT_API_VERSION = "202610";

export interface SocialConfig {
  configured: boolean;
  publishingEnabled: boolean;
  organizationUrn: string | null;
  apiVersion: string;
  missing: string[];
}

export function loadSocialConfig(env: Record<string, string | undefined> = process.env): SocialConfig {
  const token = env.LINKEDIN_ACCESS_TOKEN?.trim();
  const org = env.LINKEDIN_ORGANIZATION_URN?.trim();
  const missing = [
    ...(token ? [] : ["LINKEDIN_ACCESS_TOKEN"]),
    ...(org ? [] : ["LINKEDIN_ORGANIZATION_URN"]),
  ];
  return {
    configured: missing.length === 0,
    publishingEnabled: env.SOCIAL_ALLOW_PUBLISH?.trim() === "true",
    organizationUrn: org || null,
    apiVersion: env.LINKEDIN_API_VERSION?.trim() || DEFAULT_API_VERSION,
    missing,
  };
}

export class SocialRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SocialRefused";
  }
}

/** El pedido a la API de Posts de LinkedIn, tal cual se mandaría. */
export interface LinkedInPost {
  author: string;
  commentary: string;
  visibility: "PUBLIC";
  distribution: {
    feedDistribution: "MAIN_FEED";
    targetEntities: never[];
    thirdPartyDistributionChannels: never[];
  };
  lifecycleState: "PUBLISHED";
  isReshareDisabledByAuthor: false;
}

export interface SocialDraft {
  network: "linkedin";
  lotId: string;
  placement: Placement;
  commentary: string;
  formatHint: string;
  imageHint: string;
  payload: LinkedInPost;
  endpoint: string;
  draftId: string;
}

/** Sin una organización configurada, el autor queda marcado para que nadie lo confunda con uno real. */
export const PLACEHOLDER_AUTHOR = "urn:li:organization:OPFARMA_ORG_ID";

function meses(daysToExpiry: number): string {
  const n = Math.max(1, Math.floor((daysToExpiry - 30) / 30));
  return n === 1 ? "30 días" : `${n} meses`;
}

function minuscula(nombre: string): string {
  return nombre.charAt(0).toLowerCase() + nombre.slice(1);
}

function commentaryFor(p: Placement, unit: string): string {
  const pricing = p.pricing!;
  const pct = Math.round(pricing.discountPct * 100);
  return [
    `¿En tu servicio usan ${minuscula(p.productName)}? Tenemos un lote que te puede servir.`,
    "",
    `Son ${cantidad(p.quantity, unit)} (${p.sku}) con vencimiento el ${fecha(p.expiry)}. Los ofrecemos con ${pct}% de descuento, a ${pesos(pricing.offerPrice)} por ${unit} en lugar de ${pesos(pricing.listPrice)}.`,
    "",
    `Le conviene a un servicio que pueda usar el lote completo en los próximos ${meses(p.daysToExpiry)}. Así se aprovecha a tiempo y un insumo en buen estado no termina descartado.`,
    "",
    "Si te interesa, escribinos por mensaje privado y lo coordinamos.",
    "",
    "#InsumosMédicos #ComprasHospitalarias #Clínicas",
  ].join("\n");
}

/**
 * Arma el borrador para un lote. Se niega con los lotes que no corresponde
 * publicar: los sanos, que no necesitan nada, y los de menos de un mes, que
 * no se ofrecen para uso clínico.
 */
export function buildSocialDraft(
  lotId: string,
  dataset: Dataset,
  asOf: string,
  config: Pick<SocialConfig, "organizationUrn"> = { organizationUrn: null },
): SocialDraft {
  const lot = dataset.lots.find((candidate) => candidate.lotId === lotId);
  if (!lot) throw new SocialRefused(`there is no lot ${lotId} in this inventory.`);

  const placement = placeLot(lot, dataset, asOf);
  if (placement.tier === "healthy") {
    throw new SocialRefused(`lot ${lotId} has healthy shelf life (${placement.daysToExpiry} days); it sells at list price and needs no post.`);
  }
  if (placement.tier === "retire" || !placement.pricing) {
    throw new SocialRefused(
      `lot ${lotId} expires in ${placement.daysToExpiry} days. Under a month it is not offered for clinical use, so it is not advertised either.`,
    );
  }

  const unit = dataset.products.find((product) => product.sku === lot.sku)!.unit;
  const commentary = commentaryFor(placement, unit);
  if (commentary.length > LINKEDIN_MAX_COMMENTARY) {
    throw new SocialRefused(`the post is ${commentary.length} characters; LinkedIn allows ${LINKEDIN_MAX_COMMENTARY}.`);
  }

  const payload: LinkedInPost = {
    author: config.organizationUrn ?? PLACEHOLDER_AUTHOR,
    commentary,
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };

  return {
    network: "linkedin",
    lotId,
    placement,
    commentary,
    formatHint:
      "Posteo de página de empresa con una imagen 1200x627 (producto, vencimiento y precio), o un carrusel en PDF de tres diapositivas: el lote, las condiciones y cómo pedirlo.",
    imageHint: `Foto del producto (${placement.productName}) con una franja que diga "Vence ${fecha(placement.expiry)}" y el precio por ${unit}. Sin imágenes de pacientes.`,
    payload,
    endpoint: LINKEDIN_ENDPOINT,
    draftId: draftId(payload),
  };
}

/** El paquete para que una persona se lo pase a Grok Bot. */
export interface GrokHandoff {
  draftId: string;
  plugin: { slug: string; name: string; url: string };
  steps: string[];
  instructionForGrok: string;
}

export function buildGrokHandoff(
  draft: SocialDraft,
  plugin: { slug: string; name: string; url: string },
): GrokHandoff {
  const instructionForGrok = [
    `Publicá en la página de LinkedIn de OpFarma este posteo, sin cambiarle ni una palabra. Antes de publicar, mostrame el texto final y esperá mi confirmación.`,
    "",
    draft.commentary,
    "",
    `El formato sugerido es este. ${draft.formatHint}`,
  ].join("\n");

  return {
    draftId: draft.draftId,
    plugin,
    steps: [
      `Abrí ${plugin.url} y copiá el prompt del plugin "${plugin.name}".`,
      "Pegalo en Grok Bot para conectarlo. Grok te va a pedir que inicies sesión en la herramienta: esa credencial la cargás vos, nunca el agente.",
      "Después pegale a Grok la instrucción de abajo. Grok te muestra el texto y espera tu confirmación antes de publicar.",
    ],
    instructionForGrok,
  };
}
