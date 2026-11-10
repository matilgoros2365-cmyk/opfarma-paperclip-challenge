/**
 * MCP server: OpFarma inventory. One of two "hands" the company's agents use.
 *
 * Nothing in this file reaches a customer. Three tools only read inventory and
 * history and propose. The fourth, inventory_commit_offer, is the human
 * decision on the margin: Paperclip holds it for approval (a require_approval
 * policy that scripts/setup-company.mjs creates), the same way it holds the
 * only tool that can reach a phone, in the other MCP server.
 *
 * The guardrail that matters is in lib/expiry/offer.ts, not in any prompt:
 * inventory_draft_offer cannot build an offer for an account the engine
 * disqualified. An agent cannot reason its way around a tool that refuses.
 */
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";

import { commitOffer, marginPercentOf, OfferMismatch } from "@/lib/expiry/commit";
import { asOfDate, dataset } from "@/lib/expiry/dataset";
import { placeLot, scanInventory } from "@/lib/expiry/engine";
import { buildOffer, offerMessage, OfferRefused } from "@/lib/expiry/offer";
import { activeOfferTemplate, offerTemplateVariables } from "@/lib/expiry/template";
import { withApiKey } from "@/lib/mcp-auth";
import { fail, ok, refuse, type ToolResult } from "@/lib/mcp-result";

export const runtime = "nodejs";
export const maxDuration = 30;

function findLot(lotId: string) {
  return dataset.lots.find((lot) => lot.lotId === lotId);
}

const REFUSAL_RULE =
  "Qualification is by consumption rate, compatibility and account standing. A deeper discount does not fix an account that cannot use the stock — it only moves the loss.";

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
        const template = activeOfferTemplate();

        return ok(
          offer.warnings.length === 0
            ? `Offer drafted for ${offer.accountName}. Nothing has been sent.`
            : `Offer drafted for ${offer.accountName}, with ${offer.warnings.length} point(s) a human has to clear. Nothing has been sent.`,
          {
            as_of: asOf,
            note: SEED_NOTE,
            offer,
            message_body: offerMessage(offer),
            // An offer is business-initiated, so outside the 24h window Meta only
            // delivers it as an approved template. These are its exact arguments.
            whatsapp_template: {
              to: offer.whatsapp,
              kind: "template",
              template_name: template.name,
              language: template.language,
              variables: offerTemplateVariables(offer, template),
            },
            commit_arguments: {
              lot_id: offer.lotId,
              account_id: offer.accountId,
              unit_price: offer.money.offerUnitPrice,
              margin_percent: marginPercentOf(offer),
              line_total: offer.money.lineTotal,
            },
            next_step:
              "Attach this to the task for review. After review, call inventory_commit_offer with commit_arguments exactly as given: that call asks a human to approve the margin. Only then pass whatsapp_template to whatsapp_draft_message (use message_body as text only inside a 24h window the customer opened), then whatsapp_send_message, which asks a human to approve the message.",
          },
        );
      } catch (error) {
        if (error instanceof OfferRefused) {
          return refuse(error.message, {
            reasons: error.reasons,
            candidate: error.candidate,
            rule: REFUSAL_RULE,
          });
        }
        return fail(error);
      }
    },
  );

  server.registerTool(
    "inventory_commit_offer",
    {
      title: "Approve the margin of an offer",
      description:
        "Fix the price and margin of one offer, as a human decision. Pass the commit_arguments that inventory_draft_offer returned, unchanged: lot, account, unit price, margin in percent and line total. The server recomputes the offer and refuses any number that differs from the engine, so what the human approves is exactly what the code calculated. In Paperclip this call is held for human approval. Returns a commitment_id; draft the WhatsApp message only after it.",
      inputSchema: z.object({
        lot_id: z.string().describe("The lot, e.g. L-8890."),
        account_id: z.string().describe("The account, e.g. ACC-PARQUE."),
        unit_price: z.number().describe("Offer price per unit, in pesos, as returned by inventory_draft_offer."),
        margin_percent: z.number().describe("Margin over cost in percent (5 means 5%), as returned by inventory_draft_offer."),
        line_total: z.number().describe("Total for the whole lot, in pesos, as returned by inventory_draft_offer."),
      }),
    },
    async ({ lot_id, account_id, unit_price, margin_percent, line_total }): Promise<ToolResult> => {
      try {
        const lot = findLot(lot_id);
        if (!lot) {
          return refuse(`there is no lot ${lot_id} in this inventory.`, {
            known_lots: dataset.lots.map((entry) => entry.lotId),
          });
        }

        const asOf = asOfDate();
        const { offer, commitment } = commitOffer(
          lot,
          account_id,
          { unitPrice: unit_price, marginPercent: margin_percent, lineTotal: line_total },
          dataset,
          asOf,
        );
        const template = activeOfferTemplate();

        return ok(
          `Margin approved for ${offer.accountName}: ${lot_id} at $${unit_price} per ${offer.unit}, ${margin_percent}% margin, $${line_total} in total. Nothing has been sent.`,
          {
            commitment_id: commitment.commitmentId,
            commitment,
            message_body: offerMessage(offer),
            whatsapp_template: {
              to: offer.whatsapp,
              kind: "template",
              template_name: template.name,
              language: template.language,
              variables: offerTemplateVariables(offer, template),
            },
            next_step:
              "Record the commitment_id in the task. Then whatsapp_draft_message with this exact offer, and whatsapp_send_message, which asks a human to approve the message.",
          },
        );
      } catch (error) {
        if (error instanceof OfferMismatch) {
          return refuse(error.message, { mismatches: error.mismatches });
        }
        if (error instanceof OfferRefused) {
          return refuse(error.message, {
            reasons: error.reasons,
            candidate: error.candidate,
            rule: REFUSAL_RULE,
          });
        }
        return fail(error);
      }
    },
  );
});

const guarded = withApiKey(handler);

export { guarded as GET, guarded as POST };
