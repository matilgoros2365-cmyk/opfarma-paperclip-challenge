/**
 * Shared shaping for MCP tool results.
 *
 * Everything these tools return ends up pasted into a Paperclip task thread,
 * where a human reads it to make a decision. So each result carries a
 * one-line verdict a person can read at a glance, and the structured payload
 * underneath for the agent to work with.
 */
import { ChannelError } from "./whatsapp";

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export function ok(summary: string, data: unknown): ToolResult {
  return {
    content: [
      { type: "text", text: `${summary}\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`` },
    ],
  };
}

export function text(body: string): ToolResult {
  return { content: [{ type: "text", text: body }] };
}

export function refuse(reason: string, data?: unknown): ToolResult {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text:
          `Refused: ${reason}` +
          (data === undefined ? "" : `\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``),
      },
    ],
  };
}

export function fail(error: unknown): ToolResult {
  if (error instanceof ChannelError) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: [
            `Channel error (${error.code}): ${error.message}`,
            error.remedy ? `\nWhat would fix it: ${error.remedy}` : "",
            error.detail ? `\n\`\`\`json\n${JSON.stringify(error.detail, null, 2)}\n\`\`\`` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    };
  }

  if (error instanceof Error) {
    return { isError: true, content: [{ type: "text", text: `${error.name}: ${error.message}` }] };
  }

  return { isError: true, content: [{ type: "text", text: `Unexpected failure: ${String(error)}` }] };
}
