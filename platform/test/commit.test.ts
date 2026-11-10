import { describe, expect, it } from "vitest";

import seed from "@/data/seed.json";
import { commitOffer, marginPercentOf, OfferMismatch } from "@/lib/expiry/commit";
import type { Dataset, Lot } from "@/lib/expiry/engine";
import { buildOffer, OfferRefused } from "@/lib/expiry/offer";

const dataset = seed as unknown as Dataset;
const AS_OF = seed.asOf;

function lot(lotId: string): Lot {
  const found = dataset.lots.find((candidate) => candidate.lotId === lotId);
  if (!found) throw new Error(`seed has no lot ${lotId}`);
  return found;
}

// Los números que citan los documentos y la página para L-4028 y L-8890.
const L4028 = { unitPrice: 1260, marginPercent: 5, lineTotal: 151200 };
const L8890 = { unitPrice: 7120, lineTotal: 427200 };

describe("commitOffer: lo que se aprueba es lo que calculó el motor", () => {
  it("fija la oferta de L-4028 cuando los números coinciden con el motor", () => {
    const { commitment } = commitOffer(lot("L-4028"), "ACC-PARQUE", L4028, dataset, AS_OF);
    expect(commitment).toMatchObject({
      lotId: "L-4028",
      accountId: "ACC-PARQUE",
      accountName: "Sanatorio del Parque",
      unitPrice: 1260,
      marginPercent: 5,
      lineTotal: 151200,
      asOf: AS_OF,
    });
    expect(commitment.commitmentId).toMatch(/^oc_[0-9a-f]{20}$/);
  });

  it("da el mismo identificador para la misma oferta", () => {
    const a = commitOffer(lot("L-4028"), "ACC-PARQUE", L4028, dataset, AS_OF).commitment.commitmentId;
    const b = commitOffer(lot("L-4028"), "ACC-PARQUE", L4028, dataset, AS_OF).commitment.commitmentId;
    expect(a).toBe(b);
  });

  it("fija la oferta de L-8890, la que se aprueba en el video", () => {
    const { offer } = buildOffer(lot("L-8890"), "ACC-PARQUE", dataset, AS_OF);
    const { commitment } = commitOffer(
      lot("L-8890"),
      "ACC-PARQUE",
      { ...L8890, marginPercent: marginPercentOf(offer) },
      dataset,
      AS_OF,
    );
    expect(commitment.unitPrice).toBe(7120);
    expect(commitment.lineTotal).toBe(427200);
    expect(commitment.marginPercent).toBeGreaterThanOrEqual(5);
  });

  it("rechaza un precio distinto del del motor y dice cuál es el correcto", () => {
    expect(() =>
      commitOffer(lot("L-4028"), "ACC-PARQUE", { ...L4028, unitPrice: 1200 }, dataset, AS_OF),
    ).toThrow(OfferMismatch);
    try {
      commitOffer(lot("L-4028"), "ACC-PARQUE", { ...L4028, unitPrice: 1200 }, dataset, AS_OF);
    } catch (error) {
      const mismatch = error as OfferMismatch;
      expect(mismatch.mismatches).toEqual([{ field: "unitPrice", claimed: 1200, engine: 1260 }]);
      expect(mismatch.message).toContain("unitPrice is 1260, not 1200");
    }
  });

  it("rechaza un margen inflado aunque el precio sea el correcto", () => {
    expect(() =>
      commitOffer(lot("L-4028"), "ACC-PARQUE", { ...L4028, marginPercent: 12 }, dataset, AS_OF),
    ).toThrow(OfferMismatch);
  });

  it("rechaza un total que no corresponde al lote entero", () => {
    expect(() =>
      commitOffer(lot("L-4028"), "ACC-PARQUE", { ...L4028, lineTotal: 75600 }, dataset, AS_OF),
    ).toThrow(OfferMismatch);
  });

  it("no deja fijar una oferta para una cuenta que el motor descalificó", () => {
    expect(() => commitOffer(lot("L-4028"), "ACC-NORTE", L4028, dataset, AS_OF)).toThrow(OfferRefused);
  });
});
