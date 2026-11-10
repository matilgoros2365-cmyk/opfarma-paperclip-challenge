/**
 * MCP server: redes. La tercera "mano", para colocar entre clínicas que
 * todavía no son clientes el lote que ninguna cuenta absorbe a tiempo.
 *
 *   social_channel_status   qué falta para publicar de verdad        Allowed
 *   social_draft_post       arma el pedido exacto a LinkedIn         Allowed
 *   social_publish_post     publica, o devuelve el dry-run           human approval
 *   social_grok_handoff     arma el traspaso para Grok Bot           Allowed
 *
 * El draft_id cumple la misma función que en WhatsApp: publish recalcula el
 * borrador desde el lote y se niega si no da el mismo id que se aprobó.
 *
 * social_grok_handoff no le habla a Grok. Grok Bot no tiene una API para que
 * otro sistema le dé órdenes, y el directorio grokbot.dev pide que sus prompts
 * se le muestren a una persona, nunca se ejecuten solos. La herramienta arma
 * el paquete que esa persona pega en Grok.
 */
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";

import { asOfDate, dataset } from "@/lib/expiry/dataset";
import { withApiKey } from "@/lib/mcp-auth";
import { fail, ok, refuse, type ToolResult } from "@/lib/mcp-result";
import { buildGrokHandoff, buildSocialDraft, LINKEDIN_ENDPOINT, loadSocialConfig, SocialRefused } from "@/lib/social";

export const runtime = "nodejs";
export const maxDuration = 30;

function draftFor(lotId: string) {
  const config = loadSocialConfig();
  return buildSocialDraft(lotId, dataset, asOfDate(), config);
}

const handler = createMcpHandler((server) => {
  server.registerTool(
    "social_channel_status",
    {
      title: "Social channel status",
      description:
        "Report which network this deployment posts to (LinkedIn, as a company page), whether real publishing is configured and enabled, and what is missing. Read-only.",
      inputSchema: z.object({}),
    },
    async (): Promise<ToolResult> => {
      const config = loadSocialConfig();
      return ok(
        config.configured && config.publishingEnabled
          ? "LinkedIn publishing is configured and ENABLED."
          : "LinkedIn publishing is not live: posts are drafted and validated, and publish returns an explicit dry-run.",
        {
          network: "linkedin",
          endpoint: LINKEDIN_ENDPOINT,
          configured: config.configured,
          publishing_enabled: config.publishingEnabled,
          missing: config.missing,
          constraints: [
            "Posting as a company page requires LinkedIn to approve the app for the Community Management API (w_organization_social). Without that approval there is no token to post with.",
            "The post never names a customer and never makes a health claim. It states product, quantity, expiry and price.",
          ],
        },
      );
    },
  );

  server.registerTool(
    "social_draft_post",
    {
      title: "Draft a LinkedIn post for a lot",
      description:
        "Build the LinkedIn post that offers one lot to institutions that are not customers yet: the copy, a format hint, an image hint, and the exact request the LinkedIn Posts API would receive, with a draft_id that is the hash of that request. Publishes nothing. Use it for lots no current account can absorb in time. Refuses lots with healthy shelf life and lots under a month from expiry.",
      inputSchema: z.object({
        lot_id: z.string().describe("The lot to advertise, e.g. L-6612."),
      }),
    },
    async ({ lot_id }): Promise<ToolResult> => {
      try {
        const draft = draftFor(lot_id);
        return ok(`LinkedIn post drafted for ${lot_id}. Nothing has been published.`, {
          network: draft.network,
          lot_id: draft.lotId,
          draft_id: draft.draftId,
          commentary: draft.commentary,
          format_hint: draft.formatHint,
          image_hint: draft.imageHint,
          request: { method: "POST", url: draft.endpoint, body: draft.payload },
          next_step:
            "Attach this to the task. Then social_publish_post with this lot_id, draft_id and confirm true. That call asks a human for approval before anything is published.",
        });
      } catch (error) {
        if (error instanceof SocialRefused) return refuse(error.message);
        return fail(error);
      }
    },
  );

  server.registerTool(
    "social_publish_post",
    {
      title: "Publish an approved LinkedIn post",
      description:
        "Publish a previously drafted LinkedIn post. Requires the lot_id, the draft_id from social_draft_post and confirm: true. Refuses if the post no longer hashes to the approved draft_id. Without LinkedIn credentials it returns an explicit dry-run with the exact request that would have been sent.",
      inputSchema: z.object({
        lot_id: z.string().describe("The lot the post is about."),
        draft_id: z.string().describe("The draft_id returned by social_draft_post."),
        confirm: z.boolean().describe("Must be true. An explicit acknowledgement that this publishes a public post."),
      }),
    },
    async ({ lot_id, draft_id, confirm }): Promise<ToolResult> => {
      try {
        const config = loadSocialConfig();
        const draft = draftFor(lot_id);

        if (draft.draftId !== draft_id) {
          return refuse(
            `the post for ${lot_id} does not match the approved draft_id (it is ${draft.draftId} now). Draft it again and get it approved; nothing was published.`,
          );
        }
        if (!confirm) {
          return refuse("confirm must be true to publish. The draft is valid; nothing was published.");
        }

        if (!config.configured || !config.publishingEnabled) {
          return ok(
            "Not published: this is an explicit dry-run. This is the exact request LinkedIn would have received.",
            {
              dry_run: true,
              draft_id,
              request: { method: "POST", url: draft.endpoint, body: draft.payload },
              headers: { "LinkedIn-Version": config.apiVersion, "X-Restli-Protocol-Version": "2.0.0" },
              why: !config.configured
                ? `Missing ${config.missing.join(" and ")}. Posting as a company page needs LinkedIn to approve the app for the Community Management API.`
                : "Publishing is disabled in this deployment (SOCIAL_ALLOW_PUBLISH is not true).",
            },
          );
        }

        const response = await fetch(draft.endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN!.trim()}`,
            "Content-Type": "application/json",
            "LinkedIn-Version": config.apiVersion,
            "X-Restli-Protocol-Version": "2.0.0",
          },
          body: JSON.stringify(draft.payload),
        });
        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          return refuse(`LinkedIn answered HTTP ${response.status}. Nothing was published.`, { detail: detail.slice(0, 500) });
        }
        return ok("Published: LinkedIn accepted the post.", {
          dry_run: false,
          draft_id,
          post_urn: response.headers.get("x-restli-id"),
        });
      } catch (error) {
        if (error instanceof SocialRefused) return refuse(error.message);
        return fail(error);
      }
    },
  );

  server.registerTool(
    "social_grok_handoff",
    {
      title: "Prepare a Grok Bot handoff for a post",
      description:
        "Package an approved LinkedIn post for a human to hand to Grok Bot. Pass the lot_id and draft_id of the post, and the Grokbot directory entry you chose (slug, name and url, as returned by the Grokbot MCP server's search_directory or get_entry). Returns the steps and the exact instruction to paste into Grok. Executes nothing: Grok Bot has no API for other systems, and grokbot.dev asks that its prompts are shown to a person, never run automatically.",
      inputSchema: z.object({
        lot_id: z.string(),
        draft_id: z.string().describe("The draft_id of the approved post."),
        plugin_slug: z.string().describe("Grokbot directory slug, e.g. contentdrips."),
        plugin_name: z.string(),
        plugin_url: z.string().url().describe("The entry's page on grokbot.dev."),
      }),
    },
    async ({ lot_id, draft_id, plugin_slug, plugin_name, plugin_url }): Promise<ToolResult> => {
      try {
        if (!/^https:\/\/(www\.)?grokbot\.dev\//.test(plugin_url)) {
          return refuse("plugin_url must be a grokbot.dev page.");
        }
        const draft = draftFor(lot_id);
        if (draft.draftId !== draft_id) {
          return refuse(`the post for ${lot_id} does not match draft_id ${draft_id}. Hand off only the post a human approved.`);
        }
        const handoff = buildGrokHandoff(draft, { slug: plugin_slug, name: plugin_name, url: plugin_url });
        return ok(`Grok Bot handoff ready for ${lot_id}, through ${plugin_name}. Nothing was executed.`, {
          draft_id: handoff.draftId,
          plugin: handoff.plugin,
          steps: handoff.steps,
          instruction_for_grok: handoff.instructionForGrok,
          next_step: "Attach this to the task for a human to paste into Grok Bot.",
        });
      } catch (error) {
        if (error instanceof SocialRefused) return refuse(error.message);
        return fail(error);
      }
    },
  );
});

const guarded = withApiKey(handler);

export { guarded as GET, guarded as POST };
