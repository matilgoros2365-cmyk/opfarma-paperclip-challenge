/**
 * MCP server: OpFarma inventory. One of two "hands" the company's agents use.
 *
 * Everything here is READ-ONLY on the business: it looks at inventory and
 * history and proposes. Nothing in this file reaches a customer. That is why
 * all three tools are set to Allowed in Paperclip, while the single tool that
 * can reach a phone lives in the other MCP server and is set to Ask first.
 *
 * The guardrail that matters is in lib/expiry/offer.ts, not in any prompt:
 * inventory_draft_offer cannot build an offer for an account the engine
 * disqualified. An agent cannot reason its way around a tool that refuses.
 */
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";

import seed from "@/data/seed.json";
import { placeLot, scanInventory, type Dataset } from "@/lib/expiry/engine";
import { buildOffer, offerMessage, OfferRefused } from "@/lib/expiry/offer";
import { withApiKey } from "@/lib/mcp-auth";
import { fail, ok, refuse, type ToolResult } from "@/lib/mcp-result";

export const runtime = "nodejs";
export const maxDuration = 30;

const dataset = seed as unknown as Dataset;

/**
 * The scenario is anchored to the seed's asOf date so the demo is
 * reproducible. Set INVENTORY_AS_OF to override, or "today" to use the clock.
 */
function asOfDate(): string {
  const override = process.env.INVENTORY_AS_OF?.trim();
  if (override && override !== "today") return override;
  if (override === "today") return new Date().toISOString().slice(0, 10);
  return seed.asOf;
}

function findLot(lotId: string) {
  return dataset.lots.find((lot) => lot.lotId === lotId);
}

const SEED_NOTE =
  "Data source: seeded dataset (platform/data/seed.json), not a live ERP. Lot and expiry data is exactly what no public API exposes.";

const handler = createMcpHandler((server) => {
  server.registerTool(
    "inventory_scan_expiring",
    {
      title: "Scan inventory for lots at risk",
      description:
        "List every lot that needs a decision before it expires, soonest first, with the money at risk and which tier it falls in. Read-only. Lots with healthy shelf life are excluded, so an empty result means there is genuinely nothing to do.",
      inputSchema: z.object({}),
    },
    async (): Promise<ToolResult> => {
      try {
        const asOf = asOfDate();
        const placements = scanInventory(dataset, asOf);
        const totalAtRisk = placements.reduce((sum, p) => sum + p.valueAtRisk, 0);

        return ok(
          placements.length === 0
            ? `Nothing at risk as of ${asOf}.`
            : `${placements.length} lots need a decision as of ${asOf}. $${Math.round(totalAtRisk)} at risk if nothing is done.`,
          {
            as_of: asOf,
            note: SEED_NOTE,
            total_value_at_risk: Math.round(totalAtRisk),
            lots: placements.map((placement) => ({
              lot_id: placement.lotId,
              sku: placement.sku,
              product: placement.productName,
              quantity: placement.quantity,
              expiry: placement.expiry,
              days_to_expiry: placement.daysToExpiry,
              tier: placement.tier,
              value_at_risk: placement.valueAtRisk,
              eligible_accounts: placement.candidates.filter((c) => c.eligible).length,
              accounts_needing_review: placement.candidates.filter((c) => c.needsReview).length,
            })),
            next_step:
              "Call inventory_place_lot on the lots you intend to act on to see who can absorb each one and why.",
          },
        );
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "inventory_place_lot",
    {
      title: "Find who can absorb a lot",
      description:
        "For one lot: its tier, the price the rules allow, and every account ranked by whether it can actually consume the lot before expiry — with the reason each disqualified account was ruled out. Read-only. Qualification is by consumption rate, not by willingness to buy.",
      inputSchema: z.object({
        lot_id: z.string().describe("The lot to place, e.g. L-4028."),
      }),
    },
    async ({ lot_id }): Promise<ToolResult> => {
      try {
        const lot = findLot(lot_id);
        if (!lot) {
          return refuse(`there is no lot ${lot_id} in this inventory.`, {
            known_lots: dataset.lots.map((entry) => entry.lotId),
          });
        }

        const asOf = asOfDate();
        const placement = placeLot(lot, dataset, asOf);
        const eligible = placement.candidates.filter((candidate) => candidate.eligible);
        const review = placement.candidates.filter((candidate) => candidate.needsReview);

        let headline: string;
        if (eligible.length > 0) {
          headline = `${eligible.length} account(s) can absorb lot ${lot_id} before it expires in ${placement.daysToExpiry} days.`;
        } else if (review.length > 0) {
          headline = `No account qualifies outright for lot ${lot_id}, but ${review.length} could if a human clears an open balance.`;
        } else {
          headline = `No account can absorb lot ${lot_id} before expiry. $${placement.valueAtRisk} is at risk and liquidation may be the only option left.`;
        }

        return ok(headline, {
          as_of: asOf,
          note: SEED_NOTE,
          lot: {
            lot_id: placement.lotId,
            sku: placement.sku,
            product: placement.productName,
            quantity: placement.quantity,
            expiry: placement.expiry,
            days_to_expiry: placement.daysToExpiry,
            value_at_risk: placement.valueAtRisk,
          },
          tier: { name: placement.tier, why: placement.tierRationale },
          pricing: placement.pricing,
          candidates: placement.candidates,
          next_step:
            eligible.length > 0 || review.length > 0
              ? "Call inventory_draft_offer with the lot and the account you choose. It will refuse any account ruled out here."
              : "There is no account to offer this to. Report that to the reviewer instead of lowering the bar.",
        });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "inventory_draft_offer",
    {
      title: "Draft a placement offer for review",
      description:
        "Build the full offer for one lot and one account: the fit explanation, the unit and total price, the margin, what the customer saves, what the lot is worth if it expires, and what a liquidator would pay instead. Also returns a ready message body. Sends nothing. Refuses outright for any account the engine disqualified.",
      inputSchema: z.object({
        lot_id: z.string().describe("The lot to place, e.g. L-4028."),
        account_id: z.string().describe("The account to offer it to, e.g. ACC-PARQUE."),
      }),
    },
    async ({ lot_id, account_id }): Promise<ToolResult> => {
      try {
        const lot = findLot(lot_id);
        if (!lot) {
          return refuse(`there is no lot ${lot_id} in this inventory.`, {
            known_lots: dataset.lots.map((entry) => entry.lotId),
          });
        }

        const asOf = asOfDate();
        const { offer } = buildOffer(lot, account_id, dataset, asOf);

        return ok(
          offer.warnings.length === 0
            ? `Offer drafted for ${offer.accountName}. Nothing has been sent.`
            : `Offer drafted for ${offer.accountName}, with ${offer.warnings.length} point(s) a human has to clear. Nothing has been sent.`,
          {
            as_of: asOf,
            note: SEED_NOTE,
            offer,
            message_body: offerMessage(offer),
            next_step:
              "Attach this to the task for review. Once a human approves the margin, pass message_body to whatsapp_draft_message, then whatsapp_send_message — that call asks for approval before anything leaves.",
          },
        );
      } catch (error) {
        if (error instanceof OfferRefused) {
          return refuse(error.message, {
            reasons: error.reasons,
            candidate: error.candidate,
            rule: "Qualification is by consumption rate, compatibility and account standing. A deeper discount does not fix an account that cannot use the stock — it only moves the loss.",
          });
        }
        return fail(error);
      }
    },
  );
});

const guarded = withApiKey(handler);

export { guarded as GET, guarded as POST };
