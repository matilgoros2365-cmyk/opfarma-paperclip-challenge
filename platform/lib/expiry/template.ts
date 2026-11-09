/**
 * La plantilla de WhatsApp para ofrecer un lote.
 *
 * Una oferta la inicia OpFarma, así que Meta exige una plantilla aprobada: el
 * texto libre sólo se puede mandar dentro de las 24 horas siguientes a un
 * mensaje del cliente. Este archivo es la fuente única del texto: lo que se da
 * de alta en el WhatsApp Manager se copia de acá, y lo que arma el agente sale
 * de acá, así que no pueden divergir sin que un test lo detecte.
 */
import type { Offer } from "./offer";

export const OFFER_TEMPLATE = {
  name: "oferta_lote_por_vencer",
  language: "es_AR",
  category: "MARKETING",
  body: [
    "Hola, {{1}}. Les escribimos de OpFarma por un lote de {{2}} que vence el {{3}}.",
    "",
    "Tenemos {{4}} disponibles a {{5}} por unidad, {{6}} en total, con un {{7}} de descuento sobre el precio de lista.",
    "",
    "Se lo ofrecemos porque, por su consumo habitual, lo usarían antes de esa fecha. Si les interesa, respondan este mensaje y coordinamos la entrega.",
  ].join("\n"),
  footer: "Si no les sirve, avísennos y no insistimos.",
  /** Valores de ejemplo que Meta pide al dar de alta la plantilla. */
  examples: ["Sanatorio del Parque", "Sutura de nylon 3-0", "22/01/2027", "120 sobres", "$1.260", "$151.200", "40%"],
} as const;

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
