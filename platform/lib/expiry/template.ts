/**
 * La plantilla de WhatsApp para ofrecer un lote.
 *
 * Una oferta la inicia OpFarma, así que Meta exige una plantilla aprobada: el
 * texto libre sólo se puede mandar dentro de las 24 horas siguientes a un
 * mensaje del cliente. El texto tiene una sola fuente, data/offer-template.json:
 * de ahí lo lee el script que da de alta la plantilla en Meta y de ahí salen las
 * variables que arma el agente, así que no pueden divergir.
 */
import offerTemplate from "@/data/offer-template.json";

import type { Offer } from "./offer";

// El texto vive en data/offer-template.json, que también lee el script que da de
// alta la plantilla en Meta (scripts/create-template.mjs).
export const OFFER_TEMPLATE = offerTemplate as {
  readonly name: string;
  readonly language: string;
  readonly category: "MARKETING" | "UTILITY";
  readonly body: string;
  readonly footer: string;
  readonly examples: readonly string[];
};

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

/** Las siete variables, en el orden de la plantilla. */
export function offerTemplateVariables(offer: Offer): string[] {
  return [
    offer.accountName,
    offer.productName,
    fecha(offer.expiry),
    `${offer.quantity} ${offer.quantity === 1 ? offer.unit : plural(offer.unit)}`,
    `$${pesos.format(offer.money.offerUnitPrice)}`,
    `$${pesos.format(offer.money.lineTotal)}`,
    `${Math.round(offer.money.discountPct * 100)}%`,
  ];
}

/** Lo que va a leer el cliente, para mostrarlo antes de aprobar. */
export function renderTemplate(name: string, variables: string[]): string | null {
  if (name !== OFFER_TEMPLATE.name) return null;
  const body = OFFER_TEMPLATE.body.replace(/\{\{(\d+)\}\}/g, (match, n: string) => variables[Number(n) - 1] ?? match);
  return `${body}\n\n${OFFER_TEMPLATE.footer}`;
}
