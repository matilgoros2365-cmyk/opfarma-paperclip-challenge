/**
 * Las plantillas de WhatsApp para ofrecer un lote.
 *
 * Una oferta la inicia OpFarma, así que Meta exige una plantilla aprobada: el
 * texto libre sólo se puede mandar dentro de las 24 horas siguientes a un
 * mensaje del cliente. El texto de cada plantilla tiene una sola fuente, un JSON
 * en data/: de ahí lo lee el script que la da de alta en Meta y de ahí salen las
 * variables que arma el agente, así que no pueden divergir.
 *
 * Hay dos:
 *   oferta_lote_por_vencer  la oferta completa, con cantidad, precio y descuento.
 *   oferta_lote_simple      una invitación corta, sin precio. Pensada para pasar
 *                           la revisión automática de Meta, que suele frenar las
 *                           plantillas con muchas variables y montos. El precio
 *                           va después, como texto libre, cuando el cliente
 *                           responde y se abre la ventana de 24 horas.
 *
 * WHATSAPP_OFFER_TEMPLATE elige cuál usa el agente. Por defecto, la completa.
 */
import full from "@/data/offer-template.json";
import simple from "@/data/offer-template-simple.json";

import type { Offer } from "./offer";

export type TemplateField =
  | "cuenta"
  | "producto"
  | "vencimiento"
  | "cantidad"
  | "precio_unitario"
  | "total"
  | "descuento";

export interface OfferTemplate {
  readonly name: string;
  readonly language: string;
  readonly category: "MARKETING" | "UTILITY";
  readonly body: string;
  readonly footer: string;
  /** Qué dato de la oferta va en cada variable, en orden: {{1}}, {{2}}, ... */
  readonly fields: readonly TemplateField[];
  readonly examples: readonly string[];
}

export const OFFER_TEMPLATES: readonly OfferTemplate[] = [full as OfferTemplate, simple as OfferTemplate];

/** La plantilla completa, la de referencia. */
export const OFFER_TEMPLATE: OfferTemplate = OFFER_TEMPLATES[0]!;

export function activeOfferTemplate(env: Record<string, string | undefined> = process.env): OfferTemplate {
  const wanted = env.WHATSAPP_OFFER_TEMPLATE?.trim();
  return OFFER_TEMPLATES.find((template) => template.name === wanted) ?? OFFER_TEMPLATE;
}

const pesos = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

function fecha(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** "sobre" → "sobres", "caja x100" → "cajas x100". Alcanza para las unidades del catálogo. */
function plural(unit: string): string {
  const [first, ...rest] = unit.split(" ");
  return [`${first}s`, ...rest].join(" ");
}

function fieldValue(offer: Offer, field: TemplateField): string {
  switch (field) {
    case "cuenta":
      return offer.accountName;
    case "producto":
      return offer.productName;
    case "vencimiento":
      return fecha(offer.expiry);
    case "cantidad":
      return `${offer.quantity} ${offer.quantity === 1 ? offer.unit : plural(offer.unit)}`;
    case "precio_unitario":
      return `$${pesos.format(offer.money.offerUnitPrice)}`;
    case "total":
      return `$${pesos.format(offer.money.lineTotal)}`;
    case "descuento":
      return `${Math.round(offer.money.discountPct * 100)}%`;
  }
}

/** Las variables de la plantilla, en su orden. */
export function offerTemplateVariables(offer: Offer, template: OfferTemplate = OFFER_TEMPLATE): string[] {
  return template.fields.map((field) => fieldValue(offer, field));
}

/** Lo que va a leer el cliente, para mostrarlo antes de aprobar. */
export function renderTemplate(name: string, variables: string[]): string | null {
  const template = OFFER_TEMPLATES.find((candidate) => candidate.name === name);
  if (!template) return null;
  const body = template.body.replace(/\{\{(\d+)\}\}/g, (match, n: string) => variables[Number(n) - 1] ?? match);
  return `${body}\n\n${template.footer}`;
}
