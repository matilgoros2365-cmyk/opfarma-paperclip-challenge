import { describe, expect, it } from "vitest";

import { assertDraftMatches, canonicalize, draftId, DraftMismatchError } from "@/lib/drafts";
import { buildPayload } from "@/lib/whatsapp";

describe("canonicalize", () => {
  it("is independent of key order", () => {
    expect(canonicalize({ a: 1, b: 2 })).toBe(canonicalize({ b: 2, a: 1 }));
  });

  it("drops undefined values instead of emitting them", () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it("preserves array order, which is meaningful for template variables", () => {
    expect(canonicalize(["b", "a"])).not.toBe(canonicalize(["a", "b"]));
  });
});

describe("draftId", () => {
  const payload = buildPayload("54 9 11 2222 3333", { kind: "text", body: "Stock de guantes nitrilo M" });

  it("is stable for the same payload", () => {
    expect(draftId(payload)).toBe(draftId(payload));
  });

  it("is prefixed so it is recognisable in a task thread", () => {
    expect(draftId(payload)).toMatch(/^wd_[0-9a-f]{20}$/);
  });

  it("changes when a single character of the body changes", () => {
    const tampered = buildPayload("54 9 11 2222 3333", {
      kind: "text",
      body: "Stock de guantes nitrilo L",
    });
    expect(draftId(tampered)).not.toBe(draftId(payload));
  });

  it("changes when the recipient changes", () => {
    const other = buildPayload("5491199998888", { kind: "text", body: "Stock de guantes nitrilo M" });
    expect(draftId(other)).not.toBe(draftId(payload));
  });
});

describe("assertDraftMatches", () => {
  it("accepts the payload that produced the id", () => {
    const payload = buildPayload("5491122223333", { kind: "text", body: "ok" });
    expect(() => assertDraftMatches(draftId(payload), payload)).not.toThrow();
  });

  it("rejects a payload edited after approval", () => {
    const approved = buildPayload("5491122223333", { kind: "text", body: "Confirmamos el envío" });
    const id = draftId(approved);
    const edited = buildPayload("5491122223333", { kind: "text", body: "Confirmamos el envío y el pago" });

    expect(() => assertDraftMatches(id, edited)).toThrow(DraftMismatchError);
  });

  it("reports both ids so the mismatch is auditable", () => {
    const approved = buildPayload("5491122223333", { kind: "text", body: "a" });
    const edited = buildPayload("5491122223333", { kind: "text", body: "b" });
    try {
      assertDraftMatches(draftId(approved), edited);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(DraftMismatchError);
      const mismatch = error as DraftMismatchError;
      expect(mismatch.claimed).toBe(draftId(approved));
      expect(mismatch.expected).toBe(draftId(edited));
    }
  });
});
