/**
 * Read-only client for the Paperclip control plane.
 *
 * The dashboard this feeds is deployed on Vercel while the control plane runs
 * wherever it was installed. Those two facts can disagree: a Paperclip bound
 * to 127.0.0.1 is not reachable from a serverless function, and that is a
 * legitimate state, not a bug. So every call here resolves to either data or
 * a stated reason, and never throws into the page.
 */

export interface PaperclipConfig {
  apiUrl: string;
  apiKey: string;
  companyId: string;
}

export type ConfigResult =
  | { configured: true; config: PaperclipConfig }
  | { configured: false; missing: string[] };

export function loadPaperclipConfig(
  env: Record<string, string | undefined> = process.env,
): ConfigResult {
  const apiUrl = env.PAPERCLIP_API_URL?.trim();
  const apiKey = env.PAPERCLIP_API_KEY?.trim();
  const companyId = env.PAPERCLIP_COMPANY_ID?.trim();

  const missing: string[] = [];
  if (!apiUrl) missing.push("PAPERCLIP_API_URL");
  if (!apiKey) missing.push("PAPERCLIP_API_KEY");
  if (!companyId) missing.push("PAPERCLIP_COMPANY_ID");

  if (!apiUrl || !apiKey || !companyId) return { configured: false, missing };

  return {
    configured: true,
    config: { apiUrl: apiUrl.replace(/\/+$/, ""), apiKey, companyId },
  };
}

export type Fetched<T> = { ok: true; data: T } | { ok: false; reason: string };

async function get<T>(config: PaperclipConfig, path: string): Promise<Fetched<T>> {
  const url = `${config.apiUrl}${path}`;
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      cache: "no-store",
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      return {
        ok: false,
        reason:
          response.status === 401
            ? "The control plane rejected the token (401). PAPERCLIP_API_KEY is missing or expired."
            : `The control plane answered HTTP ${response.status}${body?.error ? `: ${body.error}` : ""}.`,
      };
    }

    return { ok: true, data: (await response.json()) as T };
  } catch (cause) {
    return {
      ok: false,
      reason:
        `Could not reach the control plane at ${config.apiUrl}. ` +
        `A Paperclip bound to loopback is not reachable from a deployed function. (${String(cause)})`,
    };
  }
}

/* -------------------------------------------------------------------------- */
/* shapes, kept to what the dashboard actually reads                          */
/* -------------------------------------------------------------------------- */

export type IssueStatus =
  | "backlog"
  | "todo"
  | "in_progress"
  | "in_review"
  | "done"
  | "blocked"
  | "cancelled";

export interface Issue {
  id: string;
  title: string;
  status: IssueStatus;
  priority?: string;
  assigneeAgentId?: string | null;
  executionPolicy?: unknown;
}

export interface Agent {
  id: string;
  name: string;
  role?: string;
  title?: string;
  status?: string;
  reportsTo?: string | null;
  budgetMonthlyCents?: number;
  spentMonthlyCents?: number;
}

/** Paperclip list endpoints answer either an array or an envelope; accept both. */
function unwrap<T>(payload: unknown, key: string): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object") {
    const candidate = (payload as Record<string, unknown>)[key];
    if (Array.isArray(candidate)) return candidate as T[];
    const data = (payload as Record<string, unknown>).data;
    if (Array.isArray(data)) return data as T[];
  }
  return [];
}

export async function listIssues(config: PaperclipConfig): Promise<Fetched<Issue[]>> {
  const result = await get<unknown>(config, `/companies/${config.companyId}/issues?view=rows`);
  return result.ok ? { ok: true, data: unwrap<Issue>(result.data, "issues") } : result;
}

export async function listAgents(config: PaperclipConfig): Promise<Fetched<Agent[]>> {
  const result = await get<unknown>(config, `/companies/${config.companyId}/agents`);
  return result.ok ? { ok: true, data: unwrap<Agent>(result.data, "agents") } : result;
}

export const STATUS_ORDER: IssueStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "blocked",
  "in_review",
  "done",
  "cancelled",
];
