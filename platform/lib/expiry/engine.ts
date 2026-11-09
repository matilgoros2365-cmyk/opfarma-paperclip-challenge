/**
 * Expiry placement engine — deterministic, no model involved.
 *
 * WHY THIS IS CODE AND NOT AN AGENT:
 * every number here decides money. A model that invents a discount, a floor
 * price or an absorption estimate is how a distributor loses margin while
 * believing it saved a lot. So the arithmetic lives here, is tested, and is
 * auditable. The agent's job starts after this: choosing among the eligible
 * accounts and writing to a human being.
 *
 * GROUNDING (see research/EXPIRY.md for sources):
 * - The absorption formula is the one the published prototypes converge on:
 *   projected consumption before expiry = days to expiry x daily rate.
 * - The tier boundaries come from three independent anchors that all land on
 *   six months: ANMAT Disposicion 2565/25 bars importing medical products
 *   with under 6 months of shelf life; M&A diligence writes anything under 6
 *   months to zero; and the secondary market calls 60-90 days "short dated",
 *   which is liquidator territory. So the useful moment to act is BEFORE that
 *   line, not at 60 days.
 * - The market's own rule for short-dated stock is "begin with utilization,
 *   not price". That is why an account is disqualified by its consumption
 *   rate before any discount is computed.
 */

export interface Product {
  sku: string;
  name: string;
  unit: string;
  /** What OpFarma paid, per unit, in ARS. */
  unitCost: number;
  /** Normal selling price, per unit, in ARS. */
  listPrice: number;
  coldChain: boolean;
}

export interface Lot {
  lotId: string;
  sku: string;
  quantity: number;
  /** ISO date, YYYY-MM-DD. */
  expiry: string;
}

export type CreditStatus = "ok" | "debt" | "blocked";

export interface Account {
  id: string;
  name: string;
  kind: string;
  whatsapp: string;
  creditStatus: CreditStatus;
  /** Product families this account is equipped/authorised to use. */
  families: string[];
}

export interface Purchase {
  accountId: string;
  sku: string;
  quantity: number;
  /** ISO date, YYYY-MM-DD. */
  date: string;
}

export interface Dataset {
  products: Product[];
  lots: Lot[];
  accounts: Account[];
  purchases: Purchase[];
  /** Which family each sku belongs to, for the compatibility check. */
  families: Record<string, string>;
}

/* -------------------------------------------------------------------------- */
/* time                                                                      */
/* -------------------------------------------------------------------------- */

const MS_PER_DAY = 86_400_000;

export function daysBetween(fromISO: string, toISO: string): number {
  const from = Date.parse(`${fromISO}T00:00:00Z`);
  const to = Date.parse(`${toISO}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) {
    throw new Error(`Invalid date in daysBetween(${fromISO}, ${toISO})`);
  }
  return Math.round((to - from) / MS_PER_DAY);
}

/* -------------------------------------------------------------------------- */
/* tiers                                                                     */
/* -------------------------------------------------------------------------- */

export type Tier = "healthy" | "place" | "discount" | "salvage" | "retire";

export interface TierRule {
  tier: Tier;
  /** Lower bound of days to expiry, inclusive. */
  minDays: number;
  maxDiscount: number;
  rationale: string;
}

/**
 * Ordered from most to least shelf life. The first rule whose minDays is met
 * applies.
 */
export const TIERS: TierRule[] = [
  {
    tier: "healthy",
    minDays: 271,
    maxDiscount: 0,
    rationale: "More than nine months of shelf life. Sells at list price; no intervention needed.",
  },
  {
    tier: "place",
    minDays: 181,
    maxDiscount: 0.08,
    rationale:
      "Six to nine months. The last window where a lot can be placed with almost all its margin intact, before it crosses the six-month line the market treats as unsellable.",
  },
  {
    tier: "discount",
    minDays: 91,
    maxDiscount: 0.2,
    rationale:
      "Three to six months. Past the line where diligence values the lot at zero, so a real discount is cheaper than the write-off.",
  },
  {
    tier: "salvage",
    minDays: 31,
    maxDiscount: 0.45,
    rationale:
      "One to three months. This is what the secondary market calls short dated. Compare any offer against what a liquidator would pay.",
  },
  {
    tier: "retire",
    minDays: Number.NEGATIVE_INFINITY,
    maxDiscount: 0,
    rationale:
      "Under a month. Not offered for clinical use: placing it would move the loss onto a clinic and risk expired stock on a care shelf.",
  },
];

export function tierFor(daysToExpiry: number): TierRule {
  const rule = TIERS.find((candidate) => daysToExpiry >= candidate.minDays);
  if (!rule) throw new Error("TIERS must end with an open-ended rule");
  return rule;
}

/* -------------------------------------------------------------------------- */
/* consumption                                                               */
/* -------------------------------------------------------------------------- */

export interface ConsumptionOptions {
  /** How far back to read purchase history. */
  lookbackDays: number;
  /**
   * Days of shelf life left unused on purpose. The client must not be the one
   * holding the lot at the wire: that is the loss moving, not disappearing.
   */
  safetyDays: number;
}

export const DEFAULT_CONSUMPTION: ConsumptionOptions = { lookbackDays: 180, safetyDays: 30 };

/** Units per month this account has actually bought of this sku. */
export function monthlyConsumption(
  purchases: Purchase[],
  accountId: string,
  sku: string,
  asOf: string,
  lookbackDays: number = DEFAULT_CONSUMPTION.lookbackDays,
): number {
  const total = purchases
    .filter((purchase) => purchase.accountId === accountId && purchase.sku === sku)
    .filter((purchase) => {
      const age = daysBetween(purchase.date, asOf);
      return age >= 0 && age <= lookbackDays;
    })
    .reduce((sum, purchase) => sum + purchase.quantity, 0);

  return total / (lookbackDays / 30);
}

/**
 * How many units this account can realistically consume before the lot
 * expires, leaving the safety margin unused.
 */
export function absorptionCapacity(
  monthlyRate: number,
  daysToExpiry: number,
  safetyDays: number = DEFAULT_CONSUMPTION.safetyDays,
): number {
  const usableDays = Math.max(0, daysToExpiry - safetyDays);
  return (monthlyRate / 30) * usableDays;
}

/* -------------------------------------------------------------------------- */
/* pricing                                                                   */
/* -------------------------------------------------------------------------- */

export interface PricingOptions {
  /** Minimum margin over unit cost, as a fraction. */
  minMargin: number;
  /** What a liquidator would pay, as a fraction of unit cost. */
  salvageRecovery: number;
}

export const DEFAULT_PRICING: PricingOptions = { minMargin: 0.05, salvageRecovery: 0.2 };

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface PriceProposal {
  listPrice: number;
  floorPrice: number;
  salvageUnitValue: number;
  offerPrice: number;
  discountPct: number;
  marginPct: number;
  /** True when the tier's full discount would have broken the floor. */
  floorBinding: boolean;
}

/**
 * The floor is not the cost. It is the better of "cost plus the minimum
 * margin" and "what a liquidator would pay", because selling below the
 * salvage alternative is never rational.
 */
export function priceProposal(
  product: Product,
  tier: TierRule,
  pricing: PricingOptions = DEFAULT_PRICING,
): PriceProposal {
  const marginFloor = product.unitCost * (1 + pricing.minMargin);
  const salvageUnitValue = product.unitCost * pricing.salvageRecovery;
  const floorPrice = Math.max(marginFloor, salvageUnitValue);

  const discounted = product.listPrice * (1 - tier.maxDiscount);
  const offerPrice = Math.max(discounted, floorPrice);

  return {
    listPrice: round2(product.listPrice),
    floorPrice: round2(floorPrice),
    salvageUnitValue: round2(salvageUnitValue),
    offerPrice: round2(offerPrice),
    discountPct: round2(1 - offerPrice / product.listPrice),
    marginPct: round2(offerPrice / product.unitCost - 1),
    floorBinding: discounted < floorPrice,
  };
}

/* -------------------------------------------------------------------------- */
/* matching                                                                  */
/* -------------------------------------------------------------------------- */

export type Disqualifier =
  | "no_history"
  | "cannot_absorb"
  | "credit_blocked"
  | "credit_debt"
  | "family_mismatch";

export interface Candidate {
  accountId: string;
  accountName: string;
  whatsapp: string;
  monthlyRate: number;
  capacity: number;
  /** capacity / lot quantity. Above 1 the account absorbs the whole lot. */
  coverage: number;
  eligible: boolean;
  disqualifiers: Disqualifier[];
  /** Needs a human to clear it rather than being ruled out outright. */
  needsReview: boolean;
}

export interface Placement {
  lotId: string;
  sku: string;
  productName: string;
  quantity: number;
  expiry: string;
  daysToExpiry: number;
  tier: Tier;
  tierRationale: string;
  /** Unit cost times quantity: what is lost if the lot expires in the warehouse. */
  valueAtRisk: number;
  pricing: PriceProposal | null;
  candidates: Candidate[];
}

export interface MatchOptions {
  consumption?: Partial<ConsumptionOptions>;
  pricing?: Partial<PricingOptions>;
}

export function placeLot(
  lot: Lot,
  dataset: Dataset,
  asOf: string,
  options: MatchOptions = {},
): Placement {
  const consumption = { ...DEFAULT_CONSUMPTION, ...options.consumption };
  const pricing = { ...DEFAULT_PRICING, ...options.pricing };

  const product = dataset.products.find((candidate) => candidate.sku === lot.sku);
  if (!product) throw new Error(`Lot ${lot.lotId} references unknown sku ${lot.sku}`);

  const daysToExpiry = daysBetween(asOf, lot.expiry);
  const tier = tierFor(daysToExpiry);
  const family = dataset.families[lot.sku];

  const candidates: Candidate[] = dataset.accounts
    .map((account) => {
      const monthlyRate = monthlyConsumption(
        dataset.purchases,
        account.id,
        lot.sku,
        asOf,
        consumption.lookbackDays,
      );
      const capacity = absorptionCapacity(monthlyRate, daysToExpiry, consumption.safetyDays);
      const disqualifiers: Disqualifier[] = [];

      if (monthlyRate === 0) disqualifiers.push("no_history");
      if (capacity < lot.quantity) disqualifiers.push("cannot_absorb");
      if (family && !account.families.includes(family)) disqualifiers.push("family_mismatch");
      if (account.creditStatus === "blocked") disqualifiers.push("credit_blocked");
      if (account.creditStatus === "debt") disqualifiers.push("credit_debt");

      // A debt is a judgement call for a human; the others are hard rules.
      const hardBlocks = disqualifiers.filter((reason) => reason !== "credit_debt");

      return {
        accountId: account.id,
        accountName: account.name,
        whatsapp: account.whatsapp,
        monthlyRate: round2(monthlyRate),
        capacity: round2(capacity),
        coverage: round2(capacity / lot.quantity),
        eligible: hardBlocks.length === 0 && !disqualifiers.includes("credit_debt"),
        disqualifiers,
        needsReview: hardBlocks.length === 0 && disqualifiers.includes("credit_debt"),
      };
    })
    // Best absorber first, but only among those that can actually take it.
    .sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.coverage - a.coverage);

  const offerable = tier.tier !== "healthy" && tier.tier !== "retire";

  return {
    lotId: lot.lotId,
    sku: lot.sku,
    productName: product.name,
    quantity: lot.quantity,
    expiry: lot.expiry,
    daysToExpiry,
    tier: tier.tier,
    tierRationale: tier.rationale,
    valueAtRisk: round2(product.unitCost * lot.quantity),
    pricing: offerable ? priceProposal(product, tier, pricing) : null,
    candidates,
  };
}

/** Every lot that needs a decision, worst first. */
export function scanInventory(
  dataset: Dataset,
  asOf: string,
  options: MatchOptions = {},
): Placement[] {
  return dataset.lots
    .map((lot) => placeLot(lot, dataset, asOf, options))
    .filter((placement) => placement.tier !== "healthy")
    .sort((a, b) => a.daysToExpiry - b.daysToExpiry);
}
