/**
 * Read-only dashboard.
 *
 * Deliberately not a second control plane: it never mutates anything. It
 * answers two questions a reviewer of this challenge will ask - what does the
 * company look like right now, and what is this WhatsApp channel actually
 * allowed to do - and when it cannot answer, it says why instead of showing
 * an empty state that looks like "nothing to do".
 */
import { describeChannel, loadChannelConfig } from "@/lib/channel";
import { listAgents, listIssues, loadPaperclipConfig, STATUS_ORDER, type Issue } from "@/lib/paperclip";
import { ChannelError } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

const card: React.CSSProperties = {
  border: "1px solid #232830",
  borderRadius: 12,
  padding: "20px 22px",
  background: "#11141a",
  marginBottom: 20,
};

const label: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#8b94a3",
  marginBottom: 10,
};

function Notice({ tone, children }: { tone: "warn" | "info"; children: React.ReactNode }) {
  return (
    <p
      style={{
        margin: "8px 0 0",
        padding: "10px 12px",
        borderRadius: 8,
        fontSize: 14,
        background: tone === "warn" ? "#2a1f12" : "#121a24",
        border: `1px solid ${tone === "warn" ? "#4a3317" : "#1d2b3a"}`,
        color: tone === "warn" ? "#e9c182" : "#9fc1e0",
      }}
    >
      {children}
    </p>
  );
}

async function ChannelPanel() {
  let description;
  try {
    description = await describeChannel(loadChannelConfig());
  } catch (error) {
    const reason = error instanceof ChannelError ? error.message : String(error);
    return (
      <section style={card}>
        <div style={label}>WhatsApp channel</div>
        <Notice tone="warn">{reason}</Notice>
      </section>
    );
  }

  const { declared, observed, constraints } = description;

  return (
    <section style={card}>
      <div style={label}>WhatsApp channel</div>
      <p style={{ margin: "0 0 12px", fontSize: 20, fontWeight: 600 }}>
        {declared.sendingEnabled ? "Sending enabled" : "Dry-run only"}
        <span style={{ color: "#8b94a3", fontWeight: 400, fontSize: 15 }}>
          {" · "}
          {declared.mode === "test_number" ? "Meta test number" : "registered business number"}
          {" · Graph "}
          {declared.graphVersion}
        </span>
      </p>

      {observed.reachable ? (
        <p style={{ margin: 0, fontSize: 14, color: "#b6bdc8" }}>
          Meta reports: {observed.displayPhoneNumber ?? "number hidden"}
          {observed.verifiedName ? ` · ${observed.verifiedName}` : ""}
          {observed.qualityRating ? ` · quality ${observed.qualityRating}` : ""}
        </p>
      ) : (
        <Notice tone="warn">Graph API not reachable: {observed.reason}</Notice>
      )}

      <div style={{ ...label, marginTop: 18 }}>Constraints that apply</div>
      <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#b6bdc8" }}>
        {constraints.map((constraint) => (
          <li key={constraint} style={{ marginBottom: 6 }}>
            {constraint}
          </li>
        ))}
      </ul>
    </section>
  );
}

function IssueRow({ issue }: { issue: Issue }) {
  const gated = issue.executionPolicy != null;
  return (
    <li style={{ display: "flex", gap: 10, alignItems: "baseline", marginBottom: 8, fontSize: 14 }}>
      <code style={{ color: "#8b94a3", fontSize: 12 }}>{issue.status}</code>
      <span>{issue.title}</span>
      {gated ? (
        <span style={{ fontSize: 11, color: "#e9c182", border: "1px solid #4a3317", borderRadius: 999, padding: "1px 8px" }}>
          review gate
        </span>
      ) : null}
    </li>
  );
}

async function CompanyPanel() {
  const result = loadPaperclipConfig();

  if (!result.configured) {
    return (
      <section style={card}>
        <div style={label}>Company</div>
        <Notice tone="info">
          Not wired to a control plane yet. Set {result.missing.join(", ")} to show the live company.
        </Notice>
      </section>
    );
  }

  const [issues, agents] = await Promise.all([listIssues(result.config), listAgents(result.config)]);

  return (
    <section style={card}>
      <div style={label}>Company</div>

      {agents.ok ? (
        <p style={{ margin: "0 0 16px", fontSize: 14, color: "#b6bdc8" }}>
          {agents.data.length} agent{agents.data.length === 1 ? "" : "s"}:{" "}
          {agents.data.map((agent) => `${agent.name} (${agent.role ?? "role unset"})`).join(" · ")}
        </p>
      ) : (
        <Notice tone="warn">{agents.reason}</Notice>
      )}

      {issues.ok ? (
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {[...issues.data]
            .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))
            .map((issue) => (
              <IssueRow key={issue.id} issue={issue} />
            ))}
        </ul>
      ) : (
        <Notice tone="warn">{issues.reason}</Notice>
      )}
    </section>
  );
}

export default function Page() {
  return (
    <>
      <header style={{ marginBottom: 32 }}>
        <p style={{ ...label, marginBottom: 6 }}>Paperclip · technical challenge</p>
        <h1 style={{ margin: 0, fontSize: 30, lineHeight: 1.2, letterSpacing: "-0.01em" }}>
          A company of agents with a hand on WhatsApp
        </h1>
        <p style={{ margin: "10px 0 0", color: "#8b94a3", fontSize: 15, maxWidth: 640 }}>
          The control plane decides <em>who</em> does the work and <em>who signs off</em>. This page is
          read-only: it shows the company as it stands and exactly what the outbound channel is allowed
          to do right now.
        </p>
      </header>

      <ChannelPanel />
      <CompanyPanel />

      <footer style={{ marginTop: 40, fontSize: 13, color: "#6f7885" }}>
        MCP endpoint for this channel: <code>/api/mcp</code> · three tools, of which one can reach a
        phone, and only with an approved draft id.
      </footer>
    </>
  );
}
