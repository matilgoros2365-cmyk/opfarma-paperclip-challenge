import { describe, expect, it } from "vitest";

import seed from "@/data/seed.json";
import type { Dataset, Lot } from "@/lib/expiry/engine";
import { buildOffer, offerMessage, OfferRefused } from "@/lib/expiry/offer";

const dataset = seed as unknown as Dataset;
const AS_OF = seed.asOf;

function lot(lotId: string): Lot {
  const found = dataset.lots.find((candidate) => candidate.lotId === lotId);
  if (!found) throw new Error(`seed has no lot ${lotId}`);
  return found;
}

function attempt(lotId: string, accountId: string) {
  return () => buildOffer(lot(lotId), accountId, dataset, AS_OF);
}

describe("the guardrail: an offer cannot be built for a disqualified account", () => {
  it("refuses the clinic that buys this sku but cannot consume the lot in time", () => {
    expect(attempt("L-4028", "ACC-SANJORGE")).toThrow(OfferRefused);
    try {
      attempt("L-4028", "ACC-SANJORGE")();
      expect.unreachable("should have refused");
    } catch (error) {
      const refusal = error as OfferRefused;
      expect(refusal.reasons).toContain("cannot_absorb");
      expect(refusal.message).toContain("cannot consume the lot before it expires");
    }
  });

  it("refuses the administratively blocked account", () => {
    try {
      attempt("L-4028", "ACC-NORTE")();
      expect.unreachable("should have refused");
    } catch (error) {
      expect((error as OfferRefused).reasons).toContain("credit_blocked");
    }
  });

  it("refuses an account that is not set up for the product family", () => {
    try {
      attempt("L-4028", "ACC-LABCENTRO")();
      expect.unreachable("should have refused");
    } catch (error) {
      expect((error as OfferRefused).reasons).toContain("family_mismatch");
    }
  });

  it("refuses a lot inside a month of expiry, for a clinical reason", () => {
    try {
      attempt("L-7703", "ACC-LABCENTRO")();
      expect.unreachable("should have refused");
    } catch (error) {
      expect((error as OfferRefused).message).toContain("move the loss onto a clinic");
    }
  });

  it("refuses a lot that does not need intervention at all", () => {
    try {
      attempt("L-9001", "ACC-PARQUE")();
      expect.unreachable("should have refused");
    } catch (error) {
      expect((error as OfferRefused).message).toContain("healthy shelf life");
    }
  });

  it("refuses an account that does not exist", () => {
    expect(attempt("L-4028", "ACC-NOPE")).toThrow(OfferRefused);
  });
});

describe("the headline offer: L-4028 to Sanatorio del Parque", () => {
  const { offer } = buildOffer(lot("L-4028"), "ACC-PARQUE", dataset, AS_OF);

  it("explains why this account and not another", () => {
    expect(offer.fit.monthlyConsumption).toBe(90);
    expect(offer.fit.absorptionCapacity).toBe(135);
    expect(offer.fit.coverage).toBe(1.13);
    expect(offer.fit.explanation).toContain("safety margin");
  });

  it("does the money arithmetic, all of it, in code", () => {
    expect(offer.money).toMatchObject({
      listUnitPrice: 2100,
      offerUnitPrice: 1260,
      lineTotal: 151200,
      listTotal: 252000,
      customerSaves: 100800,
      valueAtRisk: 144000,
      salvageTotal: 28800,
      marginPct: 0.05,
    });
  });

  it("puts the offer well above what a liquidator would pay", () => {
    expect(offer.money.lineTotal).toBeGreaterThan(offer.money.salvageTotal * 4);
  });

  it("warns that the floor capped the discount, instead of hiding it", () => {
    expect(offer.warnings.some((w) => w.includes("capped at the floor price"))).toBe(true);
  });
});

describe("a debt is a question for a human", () => {
  const { offer } = buildOffer(lot("L-5511"), "ACC-TILOS", dataset, AS_OF);

  it("builds the offer but does not clear the balance itself", () => {
    expect(offer.accountName).toBe("Residencia Los Tilos");
    expect(offer.warnings.some((w) => w.includes("open balance"))).toBe(true);
    expect(offer.warnings.some((w) => w.includes("A human must decide"))).toBe(true);
  });
});

describe("cold chain", () => {
  it("flags delivery conditions for a refrigerated reagent", () => {
    const { offer } = buildOffer(lot("L-3345"), "ACC-LABCENTRO", dataset, AS_OF);
    expect(offer.warnings.some((w) => w.includes("Cold chain"))).toBe(true);
  });
});

describe("offerMessage", () => {
  const { offer } = buildOffer(lot("L-4028"), "ACC-PARQUE", dataset, AS_OF);
  const body = offerMessage(offer);

  it("states quantity, expiry and price plainly, the way they are written in Argentina", () => {
    expect(body).toContain("Cantidad: 120 sobres");
    expect(body).toContain("Vencimiento: 22/01/2027 (en 75 días)");
    expect(body).toContain("Precio: $1.260 por sobre (lista $2.100)");
    expect(body).toContain("Total: $151.200");
  });

  it("is written with accents and in the same register as the template", () => {
    expect(body).toContain("usarían");
    expect(body).toContain("avísennos");
    expect(body).not.toMatch(/\bdias\b|\busarian\b|decinos/);
  });

  it("does not hide the short shelf life", () => {
    expect(body).toContain("Vencimiento");
  });

  it("makes no health claim and promises no clinical outcome", () => {
    for (const forbidden of ["mejor", "garantiza", "seguro", "cura", "recomendado por"]) {
      expect(body.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("gives the recipient an easy way out", () => {
    expect(body).toContain("no insistimos");
  });
});
