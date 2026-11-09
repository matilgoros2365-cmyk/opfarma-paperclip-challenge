/**
 * Bearer-key guard for the MCP endpoints.
 *
 * These are public HTTPS URLs. Without a key, anyone holding the address
 * could ask the inventory server for the customer list, or ask the WhatsApp
 * server to deliver a message. Paperclip presents the key as
 * "Authorization: Bearer <key>" when the connection is set up with an API key.
 *
 * The key is compared in constant time, and a server with no MCP_API_KEY set
 * refuses every request rather than defaulting to open — a missing variable in
 * a deployment should not silently publish the endpoint.
 */
import { timingSafeEqual } from "node:crypto";

type Handler = (request: Request) => Promise<Response> | Response;

function matches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function withApiKey(handler: Handler): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const expected = process.env.MCP_API_KEY?.trim();

    if (!expected) {
      return Response.json(
        {
          error: "server_misconfigured",
          detail: "MCP_API_KEY is not set in this deployment, so the endpoint is closed.",
        },
        { status: 503 },
      );
    }

    // Two ways to present the key, because not every client can set headers.
    //
    // 1. Authorization: Bearer <key> — preferred, and what a well-behaved
    //    MCP client sends.
    // 2. ?key=<key> in the URL — the pattern Zapier uses and Paperclip
    //    supports ("paste the complete MCP URL, including its token"). The
    //    whole URL is then the secret, so it must be treated as one: URLs
    //    end up in proxy and server logs, which a header does not.
    const header = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    const query = new URL(request.url).searchParams.get("key")?.trim() ?? "";
    const presented = header || query;

    if (!presented || !matches(presented, expected)) {
      return Response.json(
        { error: "unauthorized", detail: "This MCP server requires a bearer key." },
        { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
      );
    }

    return handler(request);
  };
}
