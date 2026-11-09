import { describe, expect, it, vi } from "vitest";

import { buildPayload, ChannelError, deliver, normalizeRecipient, renderPreview } from "@/lib/whatsapp";

const config = { phoneNumberId: "123456789", token: "tok", graphVersion: "v27.0" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("normalizeRecipient", () => {
  it("strips the separators humans type", () => {
    expect(normalizeRecipient("+54 9 11 2222-3333")).toBe("5491122223333");
  });

  it("rejects something too short to be an international number", () => {
    expect(() => normalizeRecipient("22223333")).toThrow(ChannelError);
  });

  it("explains how to fix it instead of only failing", () => {
    try {
      normalizeRecipient("1234");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as ChannelError).code).toBe("invalid_recipient");
      expect((error as ChannelError).remedy).toContain("country code");
    }
  });
});

describe("buildPayload", () => {
  it("builds the text shape Meta expects, with link previews off", () => {
    expect(buildPayload("5491122223333", { kind: "text", body: "hola" })).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "5491122223333",
      type: "text",
      text: { preview_url: false, body: "hola" },
    });
  });

  it("omits components entirely when a template has no variables", () => {
    const payload = buildPayload("5491122223333", {
      kind: "template",
      name: "hello_world",
      language: "en_US",
      variables: [],
    });
    expect(payload.template).toEqual({ name: "hello_world", language: { code: "en_US" } });
    expect(payload.template && "components" in payload.template).toBe(false);
  });

  it("maps template variables to ordered body parameters", () => {
    const payload = buildPayload("5491122223333", {
      kind: "template",
      name: "stock_alert",
      language: "es_AR",
      variables: ["guantes nitrilo M", "12"],
    });
    expect(payload.template?.components).toEqual([
      {
        type: "body",
        parameters: [
          { type: "text", text: "guantes nitrilo M" },
          { type: "text", text: "12" },
        ],
      },
    ]);
  });
});

describe("renderPreview", () => {
  it("returns the text a human will read", () => {
    expect(renderPreview({ kind: "text", body: "hola" })).toBe("hola");
  });

  it("shows which variable fills which placeholder", () => {
    const preview = renderPreview({
      kind: "template",
      name: "stock_alert",
      language: "es_AR",
      variables: ["guantes", "12"],
    });
    expect(preview).toContain("{{1}} = guantes");
    expect(preview).toContain("{{2}} = 12");
  });
});

describe("deliver", () => {
  const payload = buildPayload("5491122223333", { kind: "text", body: "hola" });

  it("returns the message id as the delivery receipt", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        messaging_product: "whatsapp",
        contacts: [{ wa_id: "5491122223333" }],
        messages: [{ id: "wamid.ABC123" }],
      }),
    );

    const receipt = await deliver(payload, config, fetchImpl as unknown as typeof fetch);

    expect(receipt.wamid).toBe("wamid.ABC123");
    expect(receipt.waId).toBe("5491122223333");
    expect(receipt.graphVersion).toBe("v27.0");
  });

  it("posts to the pinned Graph version with a bearer token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ messages: [{ id: "wamid.X" }] }));

    await deliver(payload, config, fetchImpl as unknown as typeof fetch);

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v27.0/123456789/messages");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body as string)).toEqual(payload);
  });

  it("translates the test-number allowlist rejection into something actionable", async () => {
    // mockImplementation, not mockResolvedValue: a Response body can only be
    // read once, and this test calls deliver twice.
    const fetchImpl = vi.fn().mockImplementation(() =>
      Promise.resolve(
        jsonResponse(
          {
            error: {
              message: "(#131030) Recipient phone number not in allowed list",
              code: 131030,
              fbtrace_id: "Axyz",
            },
          },
          400,
        ),
      ),
    );

    await expect(deliver(payload, config, fetchImpl as unknown as typeof fetch)).rejects.toMatchObject({
      code: "meta_131030",
    });

    try {
      await deliver(payload, config, fetchImpl as unknown as typeof fetch);
    } catch (error) {
      const channelError = error as ChannelError;
      expect(channelError.remedy).toContain("test number");
      expect(channelError.detail).toMatchObject({ metaCode: 131030, fbtraceId: "Axyz" });
    }
  });

  it("flags an expired console token rather than echoing Meta's wording", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { message: "Error validating access token", code: 190 } }, 401));

    try {
      await deliver(payload, config, fetchImpl as unknown as typeof fetch);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as ChannelError).remedy).toContain("System User token");
    }
  });

  it("refuses to claim success when Meta answers 200 without a message id", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ messaging_product: "whatsapp" }));

    await expect(deliver(payload, config, fetchImpl as unknown as typeof fetch)).rejects.toMatchObject({
      code: "missing_wamid",
    });
  });

  it("does not swallow a network failure", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(deliver(payload, config, fetchImpl as unknown as typeof fetch)).rejects.toMatchObject({
      code: "network_error",
    });
  });
});
