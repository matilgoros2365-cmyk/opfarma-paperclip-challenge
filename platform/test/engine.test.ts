import { describe, expect, it } from "vitest";

import seed from "@/data/seed.json";
import {
  absorptionCapacity,
  monthlyConsumption,
  placeLot,
  priceProposal,
  scanInventory,
  tierFor,
  type Dataset,
} from "@/lib/expiry/engine";

const dataset = seed as unknown as Dataset;
const AS_OF = seed.asOf;

function lot(lotId: string) {
  const found = dataset.lots.find((candidate) => candidate.lotId === lotId);
  if (!found) throw new Error(`seed has no lot ${lotId}`);
  return found;
}

function candidate(lotId: string, accountId: string) {
  const placement = placeLot(lot(lotId), dataset, AS_OF);
  const found = placement.candidates.find((c) => c.accountId === accountId);
  if (!found) throw new Error(`no candidate ${accountId} for ${lotId}`);
  return found;
}

describe("tier boundaries", () => {
  it("puts the six-month line between place and discount", () => {
    expect(tierFor(181).tier).toBe("place");
    expect(tierFor(180).tier).toBe("discount");
  });

  it("treats 90 days and under as the short-dated, liquidator window", () => {
    expect(tierFor(91).tier).toBe("discount");
    expect(tierFor(90).tier).toBe("salvage");
  });

  it("stops offering under a month", () => {
    expect(tierFor(31).tier).toBe("salvage");
    expect(tierFor(30).tier).toBe("retire");
    expect(tierFor(0).tier).toBe("retire");
    expect(tierFor(-5).tier).toBe("retire");
  });
});

describe("consumption and absorption", () => {
  it("derives the monthly rate from purchase history, not from a declared field", () => {
    expect(monthlyConsumption(dataset.purchases, "ACC-PARQUE", "SUT-3010", AS_OF)).toBe(90);
    expect(monthlyConsumption(dataset.purchases, "ACC-SANJORGE", "SUT-3010", AS_OF)).toBe(50);
  });

  it("is zero for an account that never bought the sku", () => {
    expect(monthlyConsumption(dataset.purchases, "ACC-BELGRANO", "SUT-3010", AS_OF)).toBe(0);
  });

  it("leaves the safety margin unused so the client is not holding it at the wire", () => {
    // 90/month, 75 days left, 30 reserved => 45 usable days => 135 units.
    expect(absorptionCapacity(90, 75, 30)).toBe(135);
    // Without the margin it would look like 225, which is the loss moving.
    expect(absorptionCapacity(90, 75, 0)).toBe(225);
  });

  it("never reports negative capacity for an expired lot", () => {
    expect(absorptionCapacity(90, 10, 30)).toBe(0);
  });
});

describe("the headline lot: L-4028, 120 sutures, 75 days", () => {
  const placement = placeLot(lot("L-4028"), dataset, AS_OF);

  it("lands in the salvage tier", () => {
    expect(placement.tier).toBe("salvage");
    expect(placement.daysToExpiry).toBe(75);
  });

  it("values the whole lot at cost as the amount at risk", () => {
    expect(placement.valueAtRisk).toBe(144000);
  });

  it("qualifies the sanatorium, which consumes 90 a month", () => {
    const parque = candidate("L-4028", "ACC-PARQUE");
    expect(parque.capacity).toBe(135);
    expect(parque.coverage).toBe(1.13);
    expect(parque.eligible).toBe(true);
  });

  it("disqualifies the clinic that consumes 50 a month, even though it buys this sku", () => {
    const sanJorge = candidate("L-4028", "ACC-SANJORGE");
    expect(sanJorge.capacity).toBe(75);
    expect(sanJorge.disqualifiers).toContain("cannot_absorb");
    expect(sanJorge.eligible).toBe(false);
  });

  it("stops the discount at the floor instead of at the tier maximum", () => {
    // The salvage tier allows 45% off, which would price under cost+margin.
    expect(placement.pricing?.floorBinding).toBe(true);
    expect(placement.pricing?.offerPrice).toBe(1260);
    expect(placement.pricing?.discountPct).toBe(0.4);
    expect(placement.pricing?.marginPct).toBe(0.05);
  });

  it("ranks the account that can absorb it first", () => {
    expect(placement.candidates[0]?.accountId).toBe("ACC-PARQUE");
  });
});

describe("the honest failure: L-6612, 300 sutures, 98 days", () => {
  const placement = placeLot(lot("L-6612"), dataset, AS_OF);

  it("finds nobody who can absorb it", () => {
    expect(placement.candidates.every((c) => !c.eligible)).toBe(true);
  });

  it("still prices it, so a human can compare the offer against liquidation", () => {
    expect(placement.pricing).not.toBeNull();
    expect(placement.pricing?.salvageUnitValue).toBe(240);
  });

  it("does not pretend the best absorber is good enough", () => {
    const best = placement.candidates[0];
    expect(best?.disqualifiers).toContain("cannot_absorb");
  });
});

describe("credit status: a debt is a question, a block is a wall", () => {
  it("sends the account with an open balance to a human instead of ruling it out", () => {
    const tilos = candidate("L-5511", "ACC-TILOS");
    expect(tilos.disqualifiers).toEqual(["credit_debt"]);
    expect(tilos.eligible).toBe(false);
    expect(tilos.needsReview).toBe(true);
  });

  it("rules out the administratively blocked account outright", () => {
    const norte = candidate("L-4028", "ACC-NORTE");
    expect(norte.disqualifiers).toContain("credit_blocked");
    expect(norte.needsReview).toBe(false);
  });
});

describe("compatibility", () => {
  it("will not offer sutures to a laboratory", () => {
    const lab = candidate("L-4028", "ACC-LABCENTRO");
    expect(lab.disqualifiers).toContain("family_mismatch");
  });

  it("matches the cold-chain reagent to the laboratory that actually uses it", () => {
    const lab = candidate("L-3345", "ACC-LABCENTRO");
    expect(lab.eligible).toBe(true);
    expect(lab.coverage).toBeGreaterThan(2);
  });
});

describe("retire tier", () => {
  const placement = placeLot(lot("L-7703"), dataset, AS_OF);

  it("produces no price at all for a lot inside a month of expiry", () => {
    expect(placement.tier).toBe("retire");
    expect(placement.pricing).toBeNull();
  });
});

describe("scanInventory", () => {
  const placements = scanInventory(dataset, AS_OF);

  it("drops lots with healthy shelf life", () => {
    expect(placements.map((p) => p.lotId)).not.toContain("L-9001");
    expect(placements).toHaveLength(7);
  });

  it("orders by urgency, soonest expiry first", () => {
    const days = placements.map((p) => p.daysToExpiry);
    expect(days).toEqual([...days].sort((a, b) => a - b));
    expect(placements[0]?.lotId).toBe("L-7703");
  });

  it("adds up to the money actually on the table", () => {
    const atRisk = placements.reduce((sum, p) => sum + p.valueAtRisk, 0);
    expect(atRisk).toBeGreaterThan(1_000_000);
  });
});

describe("priceProposal", () => {
  const product = dataset.products.find((p) => p.sku === "GUA-NIT-M")!;

  it("applies the tier discount when it clears the floor", () => {
    const proposal = priceProposal(product, tierFor(153));
    expect(proposal.offerPrice).toBe(11920);
    expect(proposal.floorBinding).toBe(false);
  });

  it("reports the salvage alternative so the floor can be judged, not assumed", () => {
    const proposal = priceProposal(product, tierFor(153));
    expect(proposal.salvageUnitValue).toBe(1900);
    expect(proposal.floorPrice).toBe(9975);
  });

  it("never returns a price below cost", () => {
    for (const days of [35, 95, 185, 400]) {
      const proposal = priceProposal(product, tierFor(days));
      expect(proposal.offerPrice).toBeGreaterThanOrEqual(product.unitCost);
    }
  });
});
