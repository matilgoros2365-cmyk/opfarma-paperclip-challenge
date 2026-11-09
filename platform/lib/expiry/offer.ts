/**
 * Turning a placement into an offer a human can approve.
 *
 * The important property of this module: an offer CANNOT be built for an
 * account that the engine disqualified. The rule lives here, in code, not in
 * an agent's instructions — so an agent cannot argue its way past it, and a
 * future prompt change cannot quietly weaken it.
 */
import {
  placeLot,
  type Candidate,
  type Dataset,
  type Disqualifier,
  type Lot,
  type MatchOptions,
  type Placement,
} from "./engine";

export class OfferRefused extends Error {
  readonly reasons: Disqualifier[];
  readonly candidate: Candidate | undefined;

  constructor(message: string, reasons: Disqualifier[], candidate?: Candidate) {
    super(message);
    this.name = "OfferRefused";
    this.reasons = reasons;
    this.candidate = candidate;
  }
}

export interface Offer {
  lotId: string;
  sku: string;
  productName: string;
  unit: string;
  quantity: number;
  expiry: string;
  daysToExpiry: number;
  tier: string;

  accountId: string;
  accountName: string;
  whatsapp: string;

  /** Why this account and not another one. */
  fit: {
    monthlyConsumption: number;
    absorptionCapacity: number;
    coverage: number;
    explanation: string;
  };

  money: {
    listUnitPrice: number;
    offerUnitPrice: number;
    discountPct: number;
    marginPct: number;
    lineTotal: number;
    listTotal: number;
    customerSaves: number;
    /** What the lot is worth if it expires in the warehouse: nothing. */
    valueAtRisk: number;
    /** What a liquidator would pay for the whole lot instead. */
    salvageTotal: number;
  };

  /** Present when a human has to clear something before this can go out. */
  warnings: string[];
}

const DISQUALIFIER_TEXT: Record<Disqualifier, string> = {
  no_history: "this account has never bought this product",
  cannot_absorb: "this account cannot consume the lot before it expires",
  credit_blocked: "this account is administratively blocked",
  credit_debt: "this account has an open balance",
  family_mismatch: "this account is not set up for this product family",
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function buildOffer(
  lot: Lot,
  accountId: string,
  dataset: Dataset,
  asOf: string,
  options: MatchOptions = {},
): { offer: Offer; placement: Placement } {
  const placement = placeLot(lot, dataset, asOf, options);

  if (!placement.pricing) {
    throw new OfferRefused(
      placement.tier === "retire"
        ? `Lot ${lot.lotId} expires in ${placement.daysToExpiry} days. It is not offered for clinical use: placing it would move the loss onto a clinic and risk expired stock on a care shelf.`
        : `Lot ${lot.lotId} has healthy shelf life (${placement.daysToExpiry} days) and needs no intervention.`,
      [],
    );
  }

  const candidate = placement.candidates.find((entry) => entry.accountId === accountId);
  if (!candidate) {
    throw new OfferRefused(`${accountId} is not an account in this dataset.`, []);
  }

  // Hard rules. A debt is the one thing a human may clear; the rest are walls.
  const hardBlocks = candidate.disqualifiers.filter((reason) => reason !== "credit_debt");
  if (hardBlocks.length > 0) {
    throw new OfferRefused(
      `No offer can be built for ${candidate.accountName}: ${hardBlocks
        .map((reason) => DISQUALIFIER_TEXT[reason])
        .join("; ")}.`,
      hardBlocks,
      candidate,
    );
  }

  const product = dataset.products.find((entry) => entry.sku === lot.sku);
  if (!product) throw new Error(`Lot ${lot.lotId} references unknown sku ${lot.sku}`);

  const pricing = placement.pricing;
  const lineTotal = round2(pricing.offerPrice * lot.quantity);
  const listTotal = round2(pricing.listPrice * lot.quantity);

  const warnings: string[] = [];
  if (candidate.disqualifiers.includes("credit_debt")) {
    warnings.push(
      "This account has an open balance. A human must decide whether to extend the offer; the engine does not clear it.",
    );
  }
  if (pricing.floorBinding) {
    warnings.push(
      `The ${placement.tier} tier allows a deeper discount, but it was capped at the floor price to protect margin.`,
    );
  }
  if (product.coldChain) {
    warnings.push("Cold chain product: delivery conditions have to be confirmed before committing.");
  }

  const offer: Offer = {
    lotId: lot.lotId,
    sku: lot.sku,
    productName: product.name,
    unit: product.unit,
    quantity: lot.quantity,
    expiry: lot.expiry,
    daysToExpiry: placement.daysToExpiry,
    tier: placement.tier,

    accountId: candidate.accountId,
    accountName: candidate.accountName,
    whatsapp: candidate.whatsapp,

    fit: {
      monthlyConsumption: candidate.monthlyRate,
      absorptionCapacity: candidate.capacity,
      coverage: candidate.coverage,
      explanation:
        `Buys about ${candidate.monthlyRate} ${product.unit} a month, so it can absorb roughly ` +
        `${candidate.capacity} before the lot expires — ${candidate.coverage}x the ${lot.quantity} in the lot, ` +
        `with a safety margin left unused.`,
    },

    money: {
      listUnitPrice: pricing.listPrice,
      offerUnitPrice: pricing.offerPrice,
      discountPct: pricing.discountPct,
      marginPct: pricing.marginPct,
      lineTotal,
      listTotal,
      customerSaves: round2(listTotal - lineTotal),
      valueAtRisk: placement.valueAtRisk,
      salvageTotal: round2(pricing.salvageUnitValue * lot.quantity),
    },

    warnings,
  };

  return { offer, placement };
}

/**
 * The message body. Deliberately plain: it states the product, the quantity,
 * the price and the expiry date. It does not claim a health benefit, does not
 * invent urgency, and does not hide the short shelf life — the client has to
 * be able to judge whether they can use it.
 */
export function offerMessage(offer: Offer): string {
  const money = offer.money;
  const pct = Math.round(money.discountPct * 100);

  return [
    `Hola ${offer.accountName}, les escribimos de OpFarma.`,
    ``,
    `Tenemos un lote de ${offer.productName} (${offer.sku}) disponible con ${pct}% de descuento:`,
    ``,
    `• Cantidad: ${offer.quantity} ${offer.unit}`,
    `• Vencimiento: ${offer.expiry} (${offer.daysToExpiry} dias)`,
    `• Precio: $${money.offerUnitPrice} por ${offer.unit} (lista $${money.listUnitPrice})`,
    `• Total: $${money.lineTotal}`,
    ``,
    `Se lo ofrecemos a ustedes porque por su consumo habitual lo usarian antes del vencimiento.`,
    `Si no les sirve, decinos y no insistimos.`,
  ].join("\n");
}
