/**
 * Content-addressed drafts.
 *
 * The problem this solves: a human approves a message, and then something
 * else is sent. Here the draft id IS the hash of the payload, so the send
 * tool can prove that what it is about to deliver is byte-for-byte what was
 * approved. If a single character of the body changed, the id no longer
 * matches and the send is refused.
 *
 * It also means this server needs no database and no session state, which is
 * why it can run as a serverless function.
 */
import { createHash } from "node:crypto";

export const DRAFT_PREFIX = "wd_";
const ID_LENGTH = 20;

/** Deterministic JSON: keys sorted, undefined dropped. Same payload, same string. */
export function canonicalize(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
}

export function draftId(payload: unknown): string {
  const digest = createHash("sha256").update(canonicalize(payload), "utf8").digest("hex");
  return DRAFT_PREFIX + digest.slice(0, ID_LENGTH);
}

export class DraftMismatchError extends Error {
  readonly expected: string;
  readonly claimed: string;

  constructor(claimed: string, expected: string) {
    super(
      "The payload does not match the approved draft id. Refusing to send: a human approved a different message. Draft the message again and approve the new draft.",
    );
    this.name = "DraftMismatchError";
    this.claimed = claimed;
    this.expected = expected;
  }
}

/** Throws unless the payload is exactly the one that produced the claimed id. */
export function assertDraftMatches(claimedId: string, payload: unknown): void {
  const expected = draftId(payload);
  if (claimedId !== expected) throw new DraftMismatchError(claimedId, expected);
}
