/**
 * MCP server: WhatsApp. The second "hand", and the only one that reaches a
 * person outside the company.
 *
 * Three tools, with a deliberate asymmetry:
 *
 *   whatsapp_channel_status   read-only, free, always safe      Allowed
 *   whatsapp_draft_message    pure, free, builds the payload    Allowed
 *   whatsapp_send_message     reaches a real phone              human approval
 *   whatsapp_delivery_status  read-only, what Meta reported      Allowed
 *
 * The draft hash is what makes that approval mean something: send recomputes
 * the id from the arguments it was handed and refuses if it differs from the
 * approved draft. A human approves one message and that exact message is what
 * leaves — demonstrably, not by convention.
 */
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";

import {
  assertRecipientAllowed,
  describeChannel,
  endpointFor,
  loadChannelConfig,
  readDraftConfig,
} from "@/lib/channel";
import { assertDraftMatches, DraftMismatchError, draftId } from "@/lib/drafts";
import { readStoreConfig, recentEvents, recordSent } from "@/lib/events-store";
import { renderTemplate } from "@/lib/expiry/template";
import { withApiKey } from "@/lib/mcp-auth";
import { fail, ok, refuse, type ToolResult } from "@/lib/mcp-result";
import { buildPayload, ChannelError, deliver, messageSchema, renderPreview, type Message } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const maxDuration = 30;

const messageInput = {
  to: z
    .string()
    .describe("Recipient in full international format, digits only, country code included (e.g. 5491122223333)."),
  kind: z
    .enum(["text", "template"])
    .describe("Free-form text (only inside the 24h customer service window) or a pre-approved template."),
  body: z.string().optional().describe('Message text. Required when kind is "text".'),
  template_name: z.string().optional().describe("Template name as approved in the WhatsApp account."),
  language: z.string().optional().describe("Template language code, e.g. es_AR. Defaults to es_AR."),
  variables: z
    .array(z.string())
    .optional()
    .describe("Template body variables, in order, filling {{1}}, {{2}}, ..."),
};

function coerceMessage(args: {
  kind: "text" | "template";
  body?: string | undefined;
  template_name?: string | undefined;
  language?: string | undefined;
  variables?: string[] | undefined;
}): Message {
  if (args.kind === "text") {
    if (!args.body?.trim()) {
      throw new ChannelError("A text message needs a body.", "missing_body", {
        remedy: 'Pass the message text in "body", or use kind "template".',
      });
    }
    return messageSchema.parse({ kind: "text", body: args.body });
  }

  if (!args.template_name?.trim()) {
    throw new ChannelError("A template message needs template_name.", "missing_template_name", {
      remedy: 'Pass the approved template name, or use kind "text" inside the 24h window.',
    });
  }

  return messageSchema.parse({
    kind: "template",
    name: args.template_name,
    language: args.language ?? "es_AR",
    variables: args.variables ?? [],
  });
}

const handler = createMcpHandler((server) => {
  server.registerTool(
    "whatsapp_channel_status",
    {
      title: "WhatsApp channel status",
      description:
        "Report what this WhatsApp channel can and cannot do right now: the configuration the deployment declares, what Meta reports about the sending number, and the constraints that apply. Call this before promising anything about delivery.",
      inputSchema: z.object({}),
    },
    async (): Promise<ToolResult> => {
      try {
        const draft = readDraftConfig();

        // Sin credenciales el canal no está roto: está en dry-run. Es un
        // estado válido y se informa como tal, no como error.
        if (!draft.configured) {
          return ok(
            "Channel has no Meta credentials, so it works in dry-run only: drafts are built and validated, nothing can be delivered.",
            {
              configured: false,
              missing: draft.missing,
              mode: draft.mode,
              graphVersion: draft.graphVersion,
              sendingEnabled: draft.sendingEnabled,
              constraints: [
                `Missing ${draft.missing.join(", ")}. Once they are set, the same draft can be delivered without changing anything else.`,
                "Free-form text only reaches a recipient within 24h of their last inbound message. Outside that window Meta requires a pre-approved template.",
              ],
            },
          );
        }

        const description = await describeChannel(loadChannelConfig());
        return ok(
          description.declared.sendingEnabled
            ? "Channel is configured and sending is ENABLED."
            : "Channel is configured and sending is DISABLED (dry-run only).",
          description,
        );
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "whatsapp_draft_message",
    {
      title: "Draft a WhatsApp message",
      description:
        "Build the exact Graph API payload that would deliver a WhatsApp message, without sending anything. Returns a draft_id that is the hash of that payload. Attach the result to the task so a human can read what would be sent and approve it.",
      inputSchema: z.object(messageInput),
    },
    async (args): Promise<ToolResult> => {
      try {
        const config = readDraftConfig();
        const message = coerceMessage(args);
        const payload = buildPayload(args.to, message);
        const id = draftId(payload);

        const blockers: string[] = [];
        if (!config.configured) {
          blockers.push(
            `No Meta credentials (${config.missing.join(", ")}): this is a dry-run and the payload cannot be delivered yet.`,
          );
        }
        try {
          assertRecipientAllowed(args.to, config);
        } catch (error) {
          if (!(error instanceof ChannelError)) throw error;
          blockers.push(`${error.message}${error.remedy ? ` ${error.remedy}` : ""}`);
        }
        if (!config.sendingEnabled) {
          blockers.push("Sending is disabled in this deployment, so this draft cannot be delivered as configured.");
        }

        return ok(
          blockers.length === 0
            ? "Draft ready. Nothing has been sent."
            : "Draft ready, but delivery would fail as configured. Nothing has been sent.",
          {
            draft_id: id,
            recipient: payload.to,
            preview: renderPreview(message),
            reads_as:
              message.kind === "template" ? (renderTemplate(message.name, message.variables) ?? undefined) : message.body,
            payload,
            endpoint: endpointFor(config),
            blockers,
            next_step:
              "A human approves the send. To deliver, call whatsapp_send_message with this draft_id, the same arguments, and confirm: true. Any change to the arguments invalidates the draft_id.",
          },
        );
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "whatsapp_send_message",
    {
      title: "Send an approved WhatsApp message",
      description:
        "Deliver a previously drafted WhatsApp message. Requires the draft_id from whatsapp_draft_message, the same arguments used to draft it, and confirm: true. Refuses if the arguments no longer hash to the approved draft_id. This is the only tool that reaches a real phone.",
      inputSchema: z.object({
        ...messageInput,
        draft_id: z.string().describe("The draft_id returned by whatsapp_draft_message for exactly these arguments."),
        confirm: z
          .boolean()
          .describe("Must be true. An explicit acknowledgement that this call delivers a real message."),
      }),
    },
    async (args): Promise<ToolResult> => {
      try {
        const draft = readDraftConfig();
        const message = coerceMessage(args);
        const payload = buildPayload(args.to, message);

        // 1. The arguments must be the ones that were approved.
        assertDraftMatches(args.draft_id, payload);

        // 2. The caller must mean it.
        if (!args.confirm) {
          return refuse("confirm must be true to deliver a real message. The draft is valid; nothing was sent.");
        }

        // 3. The deployment must be able to send, and allowed to. Either way,
        //    the exact payload comes back as an explicit dry-run.
        if (!draft.configured || !draft.sendingEnabled) {
          return ok(
            !draft.configured
              ? "Not delivered: there are no Meta credentials, so this stays a dry-run. This is the exact payload that would have been delivered."
              : "Not delivered: sending is disabled in this deployment. This is the exact payload that would have been delivered.",
            {
              dry_run: true,
              draft_id: args.draft_id,
              payload,
              endpoint: endpointFor(draft),
              how_to_enable: !draft.configured
                ? `Set ${draft.missing.join(", ")} and WHATSAPP_ALLOW_SEND=true.`
                : "Set WHATSAPP_ALLOW_SEND=true in the deployment environment.",
            },
          );
        }

        // 4. Don't call Meta when we already know it will refuse.
        const config = loadChannelConfig();
        assertRecipientAllowed(args.to, config);

        const receipt = await deliver(payload, config);

        // Desde acá, los avisos de este mensaje son de OpFarma y el webhook los
        // guarda. Si el almacén falla, el envío ya salió: se informa, no se oculta.
        const store = readStoreConfig();
        let tracking = store ? "recorded" : "no event store configured";
        if (store) {
          try {
            await recordSent(receipt.wamid, store);
          } catch (error) {
            tracking = `could not record the message id: ${String(error)}`;
          }
        }

        return ok(
          "Sent: Meta accepted the message and returned its id. That is not proof of delivery: Meta confirms delivery, reading or failure afterwards through the status webhook. Check whatsapp_delivery_status.",
          {
            dry_run: false,
            draft_id: args.draft_id,
            recipient: payload.to,
            preview: renderPreview(message),
            ...receipt,
            delivery_tracking: tracking,
            next_step: "Call whatsapp_delivery_status with this wamid to record whether it was delivered and read.",
          },
        );
      } catch (error) {
        if (error instanceof DraftMismatchError) {
          return refuse(error.message, { approved_draft: error.claimed, these_arguments_hash_to: error.expected });
        }
        return fail(error);
      }
    },
  );

  server.registerTool(
    "whatsapp_delivery_status",
    {
      title: "WhatsApp delivery status",
      description:
        "What Meta reported after a send: sent, delivered, read or failed, as received by the status webhook. Pass the wamid returned by whatsapp_send_message to follow one message, or nothing to see the latest events. Use it to record in the task whether the message actually arrived.",
      inputSchema: z.object({
        wamid: z.string().optional().describe("The message id returned by whatsapp_send_message."),
      }),
    },
    async ({ wamid }): Promise<ToolResult> => {
      try {
        const store = readStoreConfig();
        if (!store) {
          return ok(
            "No event store is configured here, so delivery statuses cannot be read from this server. The webhook still validates and logs them.",
            { configured: false, how_to_enable: "Set KV_REST_API_URL and KV_REST_API_TOKEN (an Upstash Redis store)." },
          );
        }

        const events = await recentEvents(store, 200);
        const statuses = events.filter((event) => event.kind === "status");
        if (!wamid) {
          return ok(`${events.length} recent event(s), most recent first.`, { events: events.slice(0, 20) });
        }

        // Meta puede repetir un aviso; uno por estado alcanza.
        const mine = statuses
          .filter((event) => event.wamid === wamid)
          .filter((event, i, all) => all.findIndex((other) => other.status === event.status) === i);
        if (mine.length === 0) {
          return ok(
            "Meta has not reported anything for this message yet. Statuses usually arrive within seconds; if nothing shows up, check the webhook subscription.",
            { wamid, events: [] },
          );
        }

        const order = ["sent", "delivered", "read", "failed"];
        const latest = [...mine].sort((a, b) => order.indexOf(b.status) - order.indexOf(a.status))[0]!;
        return ok(`Latest status reported by Meta: ${latest.status}.`, { wamid, latest, history: mine });
      } catch (error) {
        return fail(error);
      }
    },
  );
});

const guarded = withApiKey(handler);

export { guarded as GET, guarded as POST };
