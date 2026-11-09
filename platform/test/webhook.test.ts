import { createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { keepOwn, readStoreConfig, recentEvents, recordSent, saveEvents } from "@/lib/events-store";
import { maskNumber, parseWebhook, verifySignature, verifySubscription } from "@/lib/webhook";

const SECRET = "app-secret-de-prueba";
const sign = (body: string, secret = SECRET) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

// La forma de los avisos tal como la documenta Meta.
const statusPayload = (status: string, extra: Record<string, unknown> = {}) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA_ID",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "15551565112", phone_number_id: "123" },
            statuses: [{ id: "wamid.ABC", status, timestamp: "1794200000", recipient_id: "5491122223333", ...extra }],
          },
        },
      ],
    },
  ],
});

describe("verifySignature", () => {
  const body = JSON.stringify(statusPayload("delivered"));

  it("acepta un aviso firmado con el secreto de la app", () => {
    expect(verifySignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rechaza una firma hecha con otro secreto", () => {
    expect(verifySignature(body, sign(body, "otro"), SECRET)).toBe(false);
  });

  it("rechaza un cuerpo modificado después de firmar", () => {
    expect(verifySignature(body.replace("delivered", "read"), sign(body), SECRET)).toBe(false);
  });

  it("rechaza la ausencia de firma o un formato raro", () => {
    expect(verifySignature(body, null, SECRET)).toBe(false);
    expect(verifySignature(body, "sha1=abc", SECRET)).toBe(false);
    expect(verifySignature(body, "sha256=zz", SECRET)).toBe(false);
  });
});

describe("parseWebhook", () => {
  it("convierte un estado en un evento chico, con el número enmascarado", () => {
    const [event] = parseWebhook(statusPayload("delivered"));
    expect(event).toEqual({
      kind: "status",
      wamid: "wamid.ABC",
      status: "delivered",
      recipient: "…3333",
      at: new Date(1794200000 * 1000).toISOString(),
    });
  });

  it("conserva el error cuando el envío falló", () => {
    const [event] = parseWebhook(
      statusPayload("failed", { errors: [{ code: 131026, title: "Message undeliverable" }] }),
    );
    expect(event).toMatchObject({ status: "failed", error: { code: 131026, title: "Message undeliverable" } });
  });

  it("registra una respuesta del cliente sin guardar su contenido", () => {
    const events = parseWebhook({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                messages: [
                  { from: "5491122223333", type: "text", timestamp: "1794200000", text: { body: "Sí, nos interesa" } },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(events).toEqual([
      { kind: "inbound", from: "…3333", type: "text", at: new Date(1794200000 * 1000).toISOString() },
    ]);
    expect(JSON.stringify(events)).not.toContain("interesa");
  });

  it("ignora lo que no es de WhatsApp o trae estados desconocidos", () => {
    expect(parseWebhook({ object: "page", entry: [] })).toEqual([]);
    expect(parseWebhook(statusPayload("deleted"))).toEqual([]);
    expect(parseWebhook(null)).toEqual([]);
  });

  it("enmascara siempre, aunque el número venga corto", () => {
    expect(maskNumber("12")).toBe("…");
    expect(maskNumber(undefined)).toBe("…");
  });
});

describe("verifySubscription", () => {
  const params = (mode: string, token: string, challenge = "1158201444") =>
    new URLSearchParams({ "hub.mode": mode, "hub.verify_token": token, "hub.challenge": challenge });

  it("devuelve el desafío cuando el token coincide", () => {
    expect(verifySubscription(params("subscribe", "mi-token"), "mi-token")).toEqual({
      ok: true,
      challenge: "1158201444",
    });
  });

  it("rechaza un token distinto o un modo que no es suscripción", () => {
    expect(verifySubscription(params("subscribe", "otro"), "mi-token")).toEqual({ ok: false });
    expect(verifySubscription(params("unsubscribe", "mi-token"), "mi-token")).toEqual({ ok: false });
  });
});

describe("el almacén de eventos", () => {
  it("lee las variables de la integración de Vercel o de Upstash", () => {
    expect(readStoreConfig({})).toBeNull();
    expect(readStoreConfig({ KV_REST_API_URL: "https://x.upstash.io/", KV_REST_API_TOKEN: "t" })).toEqual({
      url: "https://x.upstash.io",
      token: "t",
    });
    expect(readStoreConfig({ UPSTASH_REDIS_REST_URL: "https://y.upstash.io", UPSTASH_REDIS_REST_TOKEN: "u" })).toEqual({
      url: "https://y.upstash.io",
      token: "u",
    });
  });

  it("guarda con LPUSH y recorta la lista, en un solo pipeline", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => new Response("[]", { status: 200 }));
    await saveEvents(
      parseWebhook(statusPayload("read")),
      { url: "https://x.upstash.io", token: "t" },
      fetchImpl as unknown as typeof fetch,
    );

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://x.upstash.io/pipeline");
    const commands = JSON.parse(init.body);
    expect(commands[0][0]).toBe("LPUSH");
    expect(JSON.parse(commands[0][2])).toMatchObject({ wamid: "wamid.ABC", status: "read" });
    expect(commands[1]).toEqual(["LTRIM", "opfarma:whatsapp:events", "0", "199"]);
  });

  it("no llama al almacén si no hay eventos", async () => {
    const fetchImpl = vi.fn();
    await saveEvents([], { url: "https://x", token: "t" }, fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("anota cada envío propio en el conjunto de mensajes de OpFarma", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => new Response('{"result":1}', { status: 200 }));
    await recordSent("wamid.MIO", { url: "https://x", token: "t" }, fetchImpl as unknown as typeof fetch);
    expect(JSON.parse(fetchImpl.mock.calls[0]![1].body)).toEqual(["SADD", "opfarma:whatsapp:sent", "wamid.MIO"]);
  });

  describe("en una cuenta compartida con otra app", () => {
    const store = { url: "https://x", token: "t" };
    const mixed = [
      ...parseWebhook(statusPayload("delivered")), // wamid.ABC, de OpFarma
      ...parseWebhook(statusPayload("read")).map((e) => ({ ...e, wamid: "wamid.DE_OTRA_APP" })),
      { kind: "inbound" as const, from: "…3333", type: "text", at: "2026-11-09T00:00:00.000Z" },
    ];
    // El almacén contesta SISMEMBER: 1 para el propio, 0 para el ajeno.
    const fetchImpl = vi
      .fn()
      .mockImplementation(async () => new Response(JSON.stringify([{ result: 1 }, { result: 0 }]), { status: 200 }));

    it("guarda sólo los avisos de mensajes propios y descarta las respuestas", async () => {
      const kept = await keepOwn(mixed, store, { sharedAccount: true }, fetchImpl as unknown as typeof fetch);
      expect(kept).toHaveLength(1);
      expect(kept[0]).toMatchObject({ kind: "status", wamid: "wamid.ABC" });
    });

    it("con una cuenta propia, conserva también las respuestas", async () => {
      const kept = await keepOwn(mixed, store, { sharedAccount: false }, fetchImpl as unknown as typeof fetch);
      expect(kept.map((e) => e.kind)).toEqual(["status", "inbound"]);
    });
  });

  it("devuelve los eventos y descarta entradas corruptas", async () => {
    const stored = [JSON.stringify(parseWebhook(statusPayload("delivered"))[0]), "{no es json"];
    const fetchImpl = vi
      .fn()
      .mockImplementation(async () => new Response(JSON.stringify({ result: stored }), { status: 200 }));
    const events = await recentEvents({ url: "https://x", token: "t" }, 10, fetchImpl as unknown as typeof fetch);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ status: "delivered" });
  });
});
