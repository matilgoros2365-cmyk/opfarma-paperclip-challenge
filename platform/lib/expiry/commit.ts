/**
 * Fijar una oferta: la decisión humana sobre el margen.
 *
 * Paperclip v2026.1106.0 no deja aprobar desde la interfaz la etapa humana de
 * una política de ejecución (el servidor exige un comentario en el mismo
 * pedido y ningún control lo manda). Las aprobaciones que sí tienen botón son
 * las de una herramienta con política require_approval. Por eso la aprobación
 * del margen es una herramienta: StockScout la llama con los números de la
 * oferta, Paperclip la frena y muestra la tarjeta, y una persona aprueba.
 *
 * La tarjeta muestra los argumentos que mandó el agente. Para que lo aprobado
 * sea exactamente lo que calculó el motor, acá se recalcula la oferta y se
 * rechaza cualquier número que no coincida. Es el mismo principio que el
 * draft_id del WhatsApp: se aprueba un valor verificable, no una descripción.
 */
import { createHash } from "node:crypto";

import type { Dataset, Lot } from "./engine";
import { buildOffer, type Offer } from "./offer";

export interface ClaimedOffer {
  unitPrice: number;
  marginPercent: number;
  lineTotal: number;
}

export interface OfferCommitment {
  commitmentId: string;
  lotId: string;
  accountId: string;
  accountName: string;
  unitPrice: number;
  marginPercent: number;
  lineTotal: number;
  asOf: string;
}

export class OfferMismatch extends Error {
  constructor(
    public readonly mismatches: Array<{ field: keyof ClaimedOffer; claimed: number; engine: number }>,
  ) {
    super(
      `the offer does not match the engine: ${mismatches
        .map((m) => `${m.field} is ${m.engine}, not ${m.claimed}`)
        .join("; ")}. Copy the numbers from inventory_draft_offer without rounding or editing them.`,
    );
    this.name = "OfferMismatch";
  }
}

/** El margen del motor es una fracción (0.05); en la tarjeta va en por ciento (5). */
export function marginPercentOf(offer: Offer): number {
  return Math.round(offer.money.marginPct * 1000) / 10;
}

export function commitOffer(
  lot: Lot,
  accountId: string,
  claimed: ClaimedOffer,
  dataset: Dataset,
  asOf: string,
): { offer: Offer; commitment: OfferCommitment } {
  // buildOffer lanza OfferRefused si la cuenta no puede absorber el lote:
  // tampoco se puede fijar una oferta que no se podía armar.
  const { offer } = buildOffer(lot, accountId, dataset, asOf);

  const engine: ClaimedOffer = {
    unitPrice: offer.money.offerUnitPrice,
    marginPercent: marginPercentOf(offer),
    lineTotal: offer.money.lineTotal,
  };

  const mismatches = (Object.keys(engine) as Array<keyof ClaimedOffer>)
    .filter((field) => Math.abs(claimed[field] - engine[field]) > 0.005)
    .map((field) => ({ field, claimed: claimed[field], engine: engine[field] }));

  if (mismatches.length > 0) throw new OfferMismatch(mismatches);

  const fixed = { lotId: lot.lotId, accountId: offer.accountId, ...engine, asOf };
  const commitmentId =
    "oc_" + createHash("sha256").update(JSON.stringify(fixed)).digest("hex").slice(0, 20);

  return {
    offer,
    commitment: { commitmentId, ...fixed, accountName: offer.accountName },
  };
}
