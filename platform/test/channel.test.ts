import { describe, expect, it, vi } from "vitest";

import {
  assertRecipientAllowed,
  describeChannel,
  explainUnreachable,
  endpointFor,
  loadChannelConfig,
  readDraftConfig,
} from "@/lib/channel";
import { ChannelError } from "@/lib/whatsapp";

const baseEnv = {
  META_PHONE_NUMBER_ID: "123456789",
  META_WHATSAPP_TOKEN: "tok",
};

describe("loadChannelConfig", () => {
  it("names every missing variable at once", () => {
    try {
      loadChannelConfig({});
      expect.unreachable("should have thrown");
    } catch (error) {
      const channelError = error as ChannelError;
      expect(channelError.code).toBe("not_configured");
      expect(channelError.message).toContain("META_PHONE_NUMBER_ID");
      expect(channelError.message).toContain("META_WHATSAPP_TOKEN");
    }
  });

  it("defaults to the pinned Graph version and to test-number mode", () => {
    const config = loadChannelConfig(baseEnv);
    expect(config.graphVersion).toBe("v27.0");
    expect(config.mode).toBe("test_number");
  });

  it("enables sending only for the exact string true", () => {
    expect(loadChannelConfig({ ...baseEnv, WHATSAPP_ALLOW_SEND: "true" }).sendingEnabled).toBe(true);
    for (const value of ["TRUE", "1", "yes", "on", "false", ""]) {
      expect(loadChannelConfig({ ...baseEnv, WHATSAPP_ALLOW_SEND: value }).sendingEnabled).toBe(false);
    }
  });

  it("tolerates surrounding whitespace, because that is a typo and not an intent", () => {
    // A stray space in a deployment variable should not silently flip a rail
    // the operator meant to switch on.
    expect(loadChannelConfig({ ...baseEnv, WHATSAPP_ALLOW_SEND: " true " }).sendingEnabled).toBe(true);
  });

  it("is off when the flag is absent", () => {
    expect(loadChannelConfig(baseEnv).sendingEnabled).toBe(false);
  });

  it("normalises the allowlist to digits", () => {
    const config = loadChannelConfig({
      ...baseEnv,
      META_ALLOWED_RECIPIENTS: "+54 9 11 2222-3333, 5491199998888",
    });
    expect(config.allowedRecipients).toEqual(["5491122223333", "5491199998888"]);
  });
});

describe("assertRecipientAllowed", () => {
  const testNumber = loadChannelConfig({ ...baseEnv, META_ALLOWED_RECIPIENTS: "5491122223333" });

  it("allows a recipient Meta has on the list", () => {
    expect(() => assertRecipientAllowed("+54 9 11 2222 3333", testNumber)).not.toThrow();
  });

  it("blocks one that is not, before spending a call on Meta", () => {
    try {
      assertRecipientAllowed("5491199998888", testNumber);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as ChannelError).code).toBe("recipient_not_allowed");
      expect((error as ChannelError).message).toContain("131030");
    }
  });

  it("does not restrict a registered business number", () => {
    const ownNumber = loadChannelConfig({ ...baseEnv, META_CHANNEL_MODE: "own_number" });
    expect(() => assertRecipientAllowed("5491199998888", ownNumber)).not.toThrow();
  });

  it("treats an empty allowlist as unknown, not as nobody allowed", () => {
    const unlisted = loadChannelConfig(baseEnv);
    expect(() => assertRecipientAllowed("5491199998888", unlisted)).not.toThrow();
  });
});

describe("describeChannel", () => {
  it("separates what Meta reports from what the deployment declares", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          display_phone_number: "+1 555 156 5112",
          verified_name: "Test Number",
          quality_rating: "GREEN",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const description = await describeChannel(
      loadChannelConfig(baseEnv),
      fetchImpl as unknown as typeof fetch,
    );

    expect(description.declared.mode).toBe("test_number");
    expect(description.observed).toMatchObject({ reachable: true, qualityRating: "GREEN" });
  });

  it("reports unreachable with a reason instead of throwing", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ENOTFOUND"));

    const description = await describeChannel(
      loadChannelConfig(baseEnv),
      fetchImpl as unknown as typeof fetch,
    );

    expect(description.observed.reachable).toBe(false);
  });

  it("states the dry-run constraint when sending is disabled", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));

    const description = await describeChannel(
      loadChannelConfig(baseEnv),
      fetchImpl as unknown as typeof fetch,
    );

    expect(description.constraints.some((c) => c.includes("Sending is disabled"))).toBe(true);
  });

  it("always states the 24h window rule, which is easy to forget", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));

    const description = await describeChannel(
      loadChannelConfig({ ...baseEnv, META_CHANNEL_MODE: "own_number", WHATSAPP_ALLOW_SEND: "true" }),
      fetchImpl as unknown as typeof fetch,
    );

    expect(description.constraints.some((c) => c.includes("24h"))).toBe(true);
  });
});

describe("readDraftConfig: un borrador no necesita credenciales de Meta", () => {
  it("no falla cuando faltan todas las credenciales", () => {
    expect(() => readDraftConfig({})).not.toThrow();
  });

  it("reporta que no está configurado y qué falta, en vez de reventar", () => {
    const config = readDraftConfig({});
    expect(config.configured).toBe(false);
    expect(config.missing).toEqual(["META_PHONE_NUMBER_ID", "META_WHATSAPP_TOKEN"]);
    expect(config.phoneNumberId).toBeNull();
  });

  it("queda configurado recién con las dos credenciales", () => {
    expect(readDraftConfig({ META_PHONE_NUMBER_ID: "123" }).configured).toBe(false);
    expect(readDraftConfig(baseEnv).configured).toBe(true);
  });

  it("conserva el modo y el allowlist aunque no haya credenciales", () => {
    const config = readDraftConfig({ META_ALLOWED_RECIPIENTS: "5491122223333" });
    expect(config.mode).toBe("test_number");
    expect(config.allowedRecipients).toEqual(["5491122223333"]);
  });

  it("deja el envío apagado por defecto", () => {
    expect(readDraftConfig({}).sendingEnabled).toBe(false);
  });
});

describe("endpointFor", () => {
  it("arma el endpoint real cuando hay número", () => {
    expect(endpointFor({ graphVersion: "v27.0", phoneNumberId: "123" })).toBe(
      "POST https://graph.facebook.com/v27.0/123/messages",
    );
  });

  it("deja un marcador visible cuando falta, en vez de imprimir null", () => {
    expect(endpointFor({ graphVersion: "v27.0", phoneNumberId: null })).toContain("{META_PHONE_NUMBER_ID}");
  });
});

describe("explainUnreachable", () => {
  it("explains an expired Meta token in plain words", () => {
    const text = explainUnreachable(
      "Error validating access token: Session has expired on Monday, 09-Nov-26 14:00:00 PST.",
    );
    expect(text).toMatch(/token de Meta venció/);
    expect(text).not.toMatch(/Session has expired/);
  });

  it("explains a network failure", () => {
    expect(explainUnreachable("TypeError: fetch failed")).toMatch(/No se pudo llegar a Meta/);
  });

  it("keeps any other reason visible", () => {
    expect(explainUnreachable("Unsupported get request.")).toBe(
      "No se pudo consultar a Meta: Unsupported get request.",
    );
  });
});
