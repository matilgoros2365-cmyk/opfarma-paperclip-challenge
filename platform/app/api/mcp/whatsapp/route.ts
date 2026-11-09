/**
 * MCP server: WhatsApp. The second "hand", and the only one that reaches a
 * person outside the company.
 *
 * Three tools, with a deliberate asymmetry:
 *
 *   whatsapp_channel_status   read-only, free, always safe      Allowed
 *   whatsapp_draft_message    pure, free, builds the payload    Allowed
 *   whatsapp_send_message     reaches a real phone              Ask first
 *
 * The draft hash is what makes that approval mean something: send recomputes
 * the id from the arguments it was handed and refuses if it differs from the
 * approved draft. A human approves one message and that exact message is what
 * leaves — demonstrably, not by convention.
 */
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";

import { assertRecipientAllowed, describeChannel, loadChannelConfig } from "@/lib/channel";
import { assertDraftMatches, DraftMismatchError, draftId } from "@/lib/drafts";
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
        const config = loadChannelConfig();
        const description = await describeChannel(config);
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
        const config = loadChannelConfig();
        const message = coerceMessage(args);
        const payload = buildPayload(args.to, message);
        const id = draftId(payload);

        const blockers: string[] = [];
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
            payload,
            endpoint: `POST https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`,
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
        const config = loadChannelConfig();
        const message = coerceMessage(args);
        const payload = buildPayload(args.to, message);

        // 1. The arguments must be the ones that were approved.
        assertDraftMatches(args.draft_id, payload);

        // 2. The caller must mean it.
        if (!args.confirm) {
          return refuse("confirm must be true to deliver a real message. The draft is valid; nothing was sent.");
        }

        // 3. The deployment must allow sending at all.
        if (!config.sendingEnabled) {
          return ok(
            "Refused: sending is disabled in this deployment. This is the payload that would have been delivered.",
            {
              dry_run: true,
              draft_id: args.draft_id,
              payload,
              endpoint: `POST https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`,
              how_to_enable: "Set WHATSAPP_ALLOW_SEND=true in the deployment environment.",
            },
          );
        }

        // 4. Don't call Meta when we already know it will refuse.
        assertRecipientAllowed(args.to, config);

        const receipt = await deliver(payload, config);

        return ok("Delivered. Meta returned a message id, which is the receipt for this send.", {
          dry_run: false,
          draft_id: args.draft_id,
          recipient: payload.to,
          preview: renderPreview(message),
          ...receipt,
        });
      } catch (error) {
        if (error instanceof DraftMismatchError) {
          return refuse(error.message, { approved_draft: error.claimed, these_arguments_hash_to: error.expected });
        }
        return fail(error);
      }
    },
  );
});

const guarded = withApiKey(handler);

export { guarded as GET, guarded as POST };
