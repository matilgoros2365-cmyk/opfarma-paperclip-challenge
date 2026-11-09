/**
 * Dashboard de sólo lectura.
 *
 * No es un segundo plano de control: no modifica nada. Responde tres preguntas
 * que se va a hacer cualquiera que revise el desafío: qué lotes están en riesgo
 * y adónde los manda el motor, qué puede hacer hoy el canal de WhatsApp, y cómo
 * está la compañía en Paperclip. Cuando no puede responder algo, dice por qué
 * en vez de mostrar un estado vacío que parezca "no hay nada que hacer".
 */
import { describeChannel, loadChannelConfig, readDraftConfig } from "@/lib/channel";
import { asOfDate, dataset } from "@/lib/expiry/dataset";
import { scanInventory, type Placement, type Tier } from "@/lib/expiry/engine";
import { listAgents, listIssues, loadPaperclipConfig, STATUS_ORDER, type Issue } from "@/lib/paperclip";

export const dynamic = "force-dynamic";

const REPO = "https://github.com/matilgoros2365-cmyk/opfarma-paperclip-challenge";

/* -------------------------------------------------------------------------- */
/* estilos                                                                    */
/* -------------------------------------------------------------------------- */

const muted = "#8b94a3";
const soft = "#b6bdc8";

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
  color: muted,
  marginBottom: 10,
};

const th: React.CSSProperties = {
  textAlign: "left",
  fontWeight: 500,
  fontSize: 12,
  color: muted,
  padding: "0 12px 8px 0",
  borderBottom: "1px solid #232830",
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "10px 12px 10px 0",
  borderBottom: "1px solid #1a1e25",
  fontSize: 14,
  verticalAlign: "top",
};

const num: React.CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };

const link: React.CSSProperties = { color: "#9fc1e0" };

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

/* -------------------------------------------------------------------------- */
/* formato                                                                    */
/* -------------------------------------------------------------------------- */

const pesos = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

function fecha(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

const TIER: Record<Tier, { nombre: string; color: string }> = {
  healthy: { nombre: "Sano", color: "#7fb98a" },
  place: { nombre: "Colocar", color: "#9fc1e0" },
  discount: { nombre: "Descuento", color: "#e9c182" },
  salvage: { nombre: "Rescate", color: "#e8a07a" },
  retire: { nombre: "Baja", color: "#e07a7a" },
};

/* -------------------------------------------------------------------------- */
/* inventario                                                                 */
/* -------------------------------------------------------------------------- */

type Destino =
  | { kind: "cuenta"; nombre: string; cobertura: number }
  | { kind: "revision"; nombre: string; cobertura: number }
  | { kind: "nadie" }
  | { kind: "baja" };

function destinoDe(placement: Placement): Destino {
  if (placement.tier === "retire") return { kind: "baja" };
  const best = placement.candidates[0];
  if (best?.eligible) return { kind: "cuenta", nombre: best.accountName, cobertura: best.coverage };
  const review = placement.candidates.find((candidate) => candidate.needsReview);
  if (review) return { kind: "revision", nombre: review.accountName, cobertura: review.coverage };
  return { kind: "nadie" };
}

function DestinoCell({ destino }: { destino: Destino }) {
  switch (destino.kind) {
    case "cuenta":
      return (
        <>
          {destino.nombre}
          <div style={{ fontSize: 12, color: muted }}>cobertura {decimal.format(destino.cobertura)}</div>
        </>
      );
    case "revision":
      return (
        <>
          {destino.nombre}
          <div style={{ fontSize: 12, color: "#e9c182" }}>
            cobertura {decimal.format(destino.cobertura)} · tiene deuda, decide una persona
          </div>
        </>
      );
    case "nadie":
      return <span style={{ color: "#e9c182" }}>Ninguna cuenta lo consume entero antes de que venza</span>;
    case "baja":
      return <span style={{ color: "#e07a7a" }}>Demasiado cerca del vencimiento para ofrecerlo</span>;
  }
}

function InventoryPanel() {
  const asOf = asOfDate();
  const placements = scanInventory(dataset, asOf);

  const enRiesgo = placements.reduce((total, p) => total + p.valueAtRisk, 0);
  const colocables = placements.filter((p) => destinoDe(p).kind === "cuenta");
  const colocableValor = colocables.reduce((total, p) => total + p.valueAtRisk, 0);
  const bajas = placements.filter((p) => p.tier === "retire");

  const kpis = [
    { valor: String(placements.length), texto: "lotes necesitan una decisión" },
    { valor: pesos.format(enRiesgo), texto: "en riesgo si se vencen en depósito" },
    { valor: `${colocables.length} · ${pesos.format(colocableValor)}`, texto: "tienen una cuenta que los consume a tiempo" },
    { valor: String(bajas.length), texto: bajas.length === 1 ? "hay que darlo de baja" : "hay que darlos de baja" },
  ];

  return (
    <section style={card}>
      <div style={label}>Inventario al {fecha(asOf)}</div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: 12,
          marginBottom: 22,
        }}
      >
        {kpis.map((kpi) => (
          <div key={kpi.texto} style={{ background: "#0d1015", border: "1px solid #1a1e25", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 20, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{kpi.valor}</div>
            <div style={{ fontSize: 13, color: muted }}>{kpi.texto}</div>
          </div>
        ))}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
          <thead>
            <tr>
              <th style={th}>Lote</th>
              <th style={th}>Producto</th>
              <th style={{ ...th, textAlign: "right" }}>Vence</th>
              <th style={th}>Tramo</th>
              <th style={{ ...th, textAlign: "right" }}>En riesgo</th>
              <th style={th}>Destino que propone el motor</th>
              <th style={{ ...th, textAlign: "right" }}>Precio de oferta</th>
            </tr>
          </thead>
          <tbody>
            {placements.map((p) => {
              const tier = TIER[p.tier];
              const destino = destinoDe(p);
              return (
                <tr key={p.lotId}>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>
                    <code>{p.lotId}</code>
                  </td>
                  <td style={td}>
                    {p.productName}
                    <div style={{ fontSize: 12, color: muted }}>
                      {p.quantity} × {dataset.products.find((product) => product.sku === p.sku)?.unit ?? "unidad"}
                    </div>
                  </td>
                  <td style={num}>
                    {fecha(p.expiry)}
                    <div style={{ fontSize: 12, color: muted }}>{p.daysToExpiry} días</div>
                  </td>
                  <td style={{ ...td, color: tier.color, whiteSpace: "nowrap" }}>{tier.nombre}</td>
                  <td style={num}>{pesos.format(p.valueAtRisk)}</td>
                  <td style={td}>
                    <DestinoCell destino={destino} />
                  </td>
                  <td style={num}>
                    {p.pricing && destino.kind !== "baja" ? (
                      <>
                        {pesos.format(p.pricing.offerPrice)}
                        <div style={{ fontSize: 12, color: muted }}>
                          −{Math.round(p.pricing.discountPct * 100)}%{p.pricing.floorBinding ? " · topeado en el piso" : ""}
                        </div>
                      </>
                    ) : (
                      <span style={{ color: muted }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p style={{ margin: "16px 0 0", fontSize: 13, color: muted }}>
        Lo calcula en vivo el mismo motor que usan los agentes, sobre un dataset sembrado (no un ERP real). La cobertura es
        cuánto del lote consume la cuenta antes del vencimiento según su rotación de los últimos 180 días: arriba de 1 lo
        absorbe entero. El precio sale del tramo de vencimiento y nunca baja del piso de margen; no lo decide el modelo.
      </p>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* controles                                                                  */
/* -------------------------------------------------------------------------- */

function ControlsPanel() {
  const controles = [
    {
      quien: "MarginReviewer, agente revisor",
      que: "Valida que la cuenta consuma el lote a tiempo, que el precio respete el piso y que la cuenta no tenga deuda ni bloqueo.",
    },
    {
      quien: "Una persona",
      que: "Aprueba el margen. Es una etapa de la política de ejecución de la tarea: el agente no puede cerrarla sin esa firma.",
    },
    {
      quien: "Una persona, otra vez",
      que: "Aprueba cada envío por WhatsApp. Paperclip frena la llamada y pone una tarjeta en la tarea; el revisor tiene el envío bloqueado.",
    },
  ];

  return (
    <section style={card}>
      <div style={label}>Quién firma qué</div>
      <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: soft }}>
        {controles.map((control) => (
          <li key={control.quien} style={{ marginBottom: 8 }}>
            <strong style={{ color: "#e8eaed", fontWeight: 600 }}>{control.quien}.</strong> {control.que}
          </li>
        ))}
      </ol>
      <p style={{ margin: "12px 0 0", fontSize: 13, color: muted }}>
        Y abajo de todo, el servidor: el envío sólo acepta el payload exacto que se aprobó, porque recalcula su hash y lo
        compara con el <code>draft_id</code>.
      </p>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* canal                                                                      */
/* -------------------------------------------------------------------------- */

async function ChannelPanel() {
  const draft = readDraftConfig();

  if (!draft.configured) {
    return (
      <section style={card}>
        <div style={label}>Canal de WhatsApp</div>
        <p style={{ margin: "0 0 10px", fontSize: 20, fontWeight: 600 }}>
          Sólo dry-run
          <span style={{ color: muted, fontWeight: 400, fontSize: 15 }}> · sin credenciales de Meta · Graph {draft.graphVersion}</span>
        </p>
        <p style={{ margin: 0, fontSize: 14, color: soft }}>
          Los borradores se arman y se validan igual, con su <code>draft_id</code>. Un envío aprobado devuelve el payload
          exacto que habría salido, sin entregar nada. Con las credenciales cargadas, el mismo borrador sale sin cambiar
          nada más.
        </p>
      </section>
    );
  }

  const { declared, observed } = await describeChannel(loadChannelConfig());

  return (
    <section style={card}>
      <div style={label}>Canal de WhatsApp</div>
      <p style={{ margin: "0 0 12px", fontSize: 20, fontWeight: 600 }}>
        {declared.sendingEnabled ? "Envío habilitado" : "Sólo dry-run"}
        <span style={{ color: muted, fontWeight: 400, fontSize: 15 }}>
          {" · "}
          {declared.mode === "test_number" ? "número de prueba de Meta" : "número propio"}
          {" · Graph "}
          {declared.graphVersion}
        </span>
      </p>
      {observed.reachable ? (
        <p style={{ margin: 0, fontSize: 14, color: soft }}>
          Meta informa: {observed.displayPhoneNumber ?? "número oculto"}
          {observed.verifiedName ? ` · ${observed.verifiedName}` : ""}
          {observed.qualityRating ? ` · calidad ${observed.qualityRating}` : ""}
        </p>
      ) : (
        <Notice tone="warn">No se pudo consultar la Graph API: {observed.reason}</Notice>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* compañía                                                                   */
/* -------------------------------------------------------------------------- */

function IssueRow({ issue }: { issue: Issue }) {
  const gated = issue.executionPolicy != null;
  return (
    <li style={{ display: "flex", gap: 10, alignItems: "baseline", marginBottom: 8, fontSize: 14 }}>
      <code style={{ color: muted, fontSize: 12 }}>{issue.status}</code>
      <span>{issue.title}</span>
      {gated ? (
        <span style={{ fontSize: 11, color: "#e9c182", border: "1px solid #4a3317", borderRadius: 999, padding: "1px 8px" }}>
          aprobación humana
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
        <div style={label}>La compañía en Paperclip</div>
        <p style={{ margin: "0 0 10px", fontSize: 14, color: soft }}>
          Dos agentes: <strong style={{ color: "#e8eaed" }}>StockScout</strong>, que escanea, coloca y redacta, y reporta
          a <strong style={{ color: "#e8eaed" }}>MarginReviewer</strong>, que revisa y nunca envía. Tres tareas: detectar
          los lotes, validar y aprobar el margen de una oferta, y enviarla por WhatsApp.
        </p>
        <Notice tone="info">
          Paperclip corre local y una función deployada no lo alcanza, así que acá no se ve en vivo. Las corridas, las
          aprobaciones y la auditoría del envío están contadas en{" "}
          <a href={`${REPO}/blob/main/DECISIONS.md`} style={link}>
            DECISIONS.md
          </a>
          .
        </Notice>
      </section>
    );
  }

  const [issues, agents] = await Promise.all([listIssues(result.config), listAgents(result.config)]);

  return (
    <section style={card}>
      <div style={label}>La compañía en Paperclip</div>

      {agents.ok ? (
        <p style={{ margin: "0 0 16px", fontSize: 14, color: soft }}>
          {agents.data.length} agente{agents.data.length === 1 ? "" : "s"}:{" "}
          {agents.data.map((agent) => `${agent.name} (${agent.role ?? "sin rol"})`).join(" · ")}
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

/* -------------------------------------------------------------------------- */

export default function Page() {
  return (
    <>
      <header style={{ marginBottom: 32 }}>
        <p style={{ ...label, marginBottom: 6 }}>OpFarma · desafío técnico de Paperclip</p>
        <h1 style={{ margin: 0, fontSize: 30, lineHeight: 1.2, letterSpacing: "-0.01em" }}>
          Lotes por vencer, y a quién vendérselos antes de la fecha
        </h1>
        <p style={{ margin: "10px 0 0", color: muted, fontSize: 15, maxWidth: 680 }}>
          Una distribuidora de insumos médicos armada como compañía de agentes en Paperclip. Los agentes escanean el
          inventario, buscan qué cuenta consume cada lote antes de que venza y redactan la oferta; las personas aprueban el
          margen y cada envío. Esta página es de sólo lectura.
        </p>
      </header>

      <InventoryPanel />
      <ControlsPanel />
      <ChannelPanel />
      <CompanyPanel />

      <footer style={{ marginTop: 40, fontSize: 13, color: "#6f7885" }}>
        Servidores MCP: <code>/api/mcp/inventory</code> (escanear, colocar, armar la oferta) y{" "}
        <code>/api/mcp/whatsapp</code> (estado del canal, borrador, envío), protegidos con <code>MCP_API_KEY</code>. Código y
        decisiones en{" "}
        <a href={REPO} style={link}>
          GitHub
        </a>
        .
      </footer>
    </>
  );
}
