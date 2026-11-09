/**
 * La plataforma de OpFarma: una vista de sólo lectura.
 *
 * No es un segundo plano de control: no modifica nada. Le cuenta a alguien que
 * llega sin contexto qué se vence, qué hace OpFarma con cada lote y quién firma
 * cada paso. El inventario lo calcula en vivo el mismo motor que usan los
 * agentes; lo que vive en Paperclip, que corre local, se muestra en vivo sólo
 * si la función lo alcanza, y si no, se dice por qué.
 */
import { describeChannel, loadChannelConfig, readDraftConfig } from "@/lib/channel";
import { asOfDate, dataset } from "@/lib/expiry/dataset";
import { scanInventory, type Placement, type Tier } from "@/lib/expiry/engine";
import { listAgents, listIssues, loadPaperclipConfig, STATUS_ORDER } from "@/lib/paperclip";

export const dynamic = "force-dynamic";

const REPO = "https://github.com/matilgoros2365-cmyk/opfarma-paperclip-challenge";
const DOC = (path: string) => `${REPO}/blob/main/${path}`;

/* -------------------------------------------------------------------------- */
/* formato                                                                    */
/* -------------------------------------------------------------------------- */

const pesosFmt = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
// En Argentina se escribe $3.004.000, sin el espacio que mete Intl.
const pesos = { format: (n: number) => pesosFmt.format(n).replace(/^\$\s/, "$") };
const decimal = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function parts(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return { y: y!, m: m!, d: d! };
}

function fechaLarga(iso: string): string {
  const { y, m, d } = parts(iso);
  return `${d} de ${MESES[m - 1]} de ${y}`;
}

function fechaCorta(iso: string): string {
  const { y, m, d } = parts(iso);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

function sumarDias(iso: string, dias: number): string {
  const { y, m, d } = parts(iso);
  const date = new Date(Date.UTC(y, m - 1, d + dias));
  return date.toISOString().slice(0, 10);
}

function unidad(sku: string): string {
  return dataset.products.find((product) => product.sku === sku)?.unit ?? "unidad";
}

const TIER: Record<Tier, { nombre: string; clase: string; color: string }> = {
  healthy: { nombre: "Sano", clase: "", color: "var(--muted)" },
  place: { nombre: "Colocar", clase: "tier-place", color: "var(--tier-place)" },
  discount: { nombre: "Descuento", clase: "tier-discount", color: "var(--tier-discount)" },
  salvage: { nombre: "Rescate", clase: "tier-salvage", color: "var(--tier-salvage)" },
  retire: { nombre: "Baja", clase: "tier-retire", color: "var(--tier-retire)" },
};

/* -------------------------------------------------------------------------- */
/* qué hace OpFarma con cada lote                                             */
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

/* -------------------------------------------------------------------------- */
/* la línea de vencimientos                                                   */
/* -------------------------------------------------------------------------- */

const HORIZON = 270;
const BANDS: { tier: Tier; desde: number; hasta: number }[] = [
  { tier: "retire", desde: 0, hasta: 30 },
  { tier: "salvage", desde: 30, hasta: 90 },
  { tier: "discount", desde: 90, hasta: 180 },
  { tier: "place", desde: 180, hasta: HORIZON },
];

function Timeline({ placements, asOf }: { placements: Placement[]; asOf: string }) {
  const W = 1000;
  const left = 24;
  const right = 976;
  const x = (dias: number) => left + (Math.min(dias, HORIZON) / HORIZON) * (right - left);

  const top = 44;
  const laneGap = 54;
  const axisY = 236;

  const maxValue = Math.max(...placements.map((p) => p.valueAtRisk));
  const radius = (value: number) => 7 + Math.sqrt(value / maxValue) * 13;

  // Cada lote va en el primer carril donde su etiqueta no pisa a la anterior.
  const laneEnds: number[] = [];
  const marks = [...placements]
    .sort((a, b) => a.daysToExpiry - b.daysToExpiry)
    .map((p) => {
      const cx = x(p.daysToExpiry);
      const r = radius(p.valueAtRisk);
      let lane = laneEnds.findIndex((end) => end < cx - r - 6);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = cx + r + 92;
      return { p, cx, r, cy: top + 34 + lane * laneGap, destino: destinoDe(p) };
    });

  const ticks = [0, 30, 90, 180, HORIZON];

  return (
    <figure className="timeline" style={{ margin: 0 }}>
      <div className="timeline-scroll">
        <svg viewBox={`0 0 ${W} 280`} role="img" aria-labelledby="timeline-title timeline-desc">
          <title id="timeline-title">Cuándo vence cada lote</title>
          <desc id="timeline-desc">
            Los siete lotes ubicados según los días que faltan para su vencimiento, sobre los cuatro tramos que usa el motor
            para decidir qué hacer con cada uno.
          </desc>

          {BANDS.map((band) => (
            <g key={band.tier}>
              <rect
                x={x(band.desde)}
                y={top}
                width={x(band.hasta) - x(band.desde)}
                height={axisY - top}
                style={{ fill: TIER[band.tier].color, opacity: 0.07 }}
              />
              <text
                x={x(band.desde) + 8}
                y={top - 14}
                style={{ fill: TIER[band.tier].color, fontSize: 15, fontWeight: 700 }}
              >
                {TIER[band.tier].nombre}
              </text>
            </g>
          ))}

          <line x1={left} x2={right} y1={axisY} y2={axisY} style={{ stroke: "var(--ink)", strokeWidth: 1.5 }} />
          {ticks.map((dias) => (
            <g key={dias}>
              <line x1={x(dias)} x2={x(dias)} y1={top} y2={axisY + 6} style={{ stroke: "var(--rule)", strokeWidth: 1 }} />
              <text
                x={x(dias)}
                y={axisY + 24}
                textAnchor={dias === 0 ? "start" : dias === HORIZON ? "end" : "middle"}
                style={{ fill: "var(--ink-soft)", fontSize: 14 }}
              >
                {dias === 0 ? "Hoy" : `${dias} días`}
              </text>
              <text
                x={x(dias)}
                y={axisY + 42}
                textAnchor={dias === 0 ? "start" : dias === HORIZON ? "end" : "middle"}
                style={{ fill: "var(--muted)", fontSize: 13 }}
              >
                {(() => {
                  const { d, m } = parts(sumarDias(asOf, dias));
                  return `${d} ${MESES_CORTOS[m - 1]}`;
                })()}
              </text>
            </g>
          ))}

          {marks.map(({ p, cx, cy, r, destino }) => {
            const color = TIER[p.tier].color;
            const hollow = destino.kind === "nadie";
            return (
              <g key={p.lotId}>
                <line x1={cx} x2={cx} y1={cy + r} y2={axisY} style={{ stroke: color, strokeWidth: 1, opacity: 0.5 }} />
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  style={{
                    fill: hollow ? "var(--surface)" : color,
                    stroke: color,
                    strokeWidth: hollow ? 2.5 : 0,
                    opacity: hollow ? 1 : 0.9,
                  }}
                />
                <text x={cx + r + 6} y={cy - 2} style={{ fill: "var(--ink)", fontSize: 15, fontWeight: 700 }}>
                  {p.lotId}
                </text>
                <text x={cx + r + 6} y={cy + 15} style={{ fill: "var(--muted)", fontSize: 13 }}>
                  {pesos.format(p.valueAtRisk)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption>
        <ul className="timeline-legend">
          <li>
            <span className="dot solid" /> Hay una cuenta que lo consume antes de que venza
          </li>
          <li>
            <span className="dot hollow" /> Ninguna cuenta lo consume entero a tiempo
          </li>
          <li>El tamaño es la plata que se pierde si se vence en depósito</li>
        </ul>
      </figcaption>
    </figure>
  );
}

/* -------------------------------------------------------------------------- */
/* lote por lote                                                              */
/* -------------------------------------------------------------------------- */

function DestinoCell({ destino }: { destino: Destino }) {
  switch (destino.kind) {
    case "cuenta":
      return (
        <>
          {destino.nombre}
          <span className="sub">consume {decimal.format(destino.cobertura)} veces el lote antes del vencimiento</span>
        </>
      );
    case "revision":
      return (
        <>
          {destino.nombre}
          <span className="sub flag">tiene deuda: lo decide una persona</span>
        </>
      );
    case "nadie":
      return <span className="flag">Ninguna cuenta lo consume entero a tiempo</span>;
    case "baja":
      return <span className="loss">Ya no se puede ofrecer: se da de baja</span>;
  }
}

function LotTable({ placements }: { placements: Placement[] }) {
  return (
    <div className="table-scroll">
      <table className="lots">
        <thead>
          <tr>
            <th scope="col">Lote</th>
            <th scope="col">Producto</th>
            <th scope="col" className="num">
              Vence
            </th>
            <th scope="col">Tramo</th>
            <th scope="col" className="num">
              En riesgo
            </th>
            <th scope="col">A quién se le ofrece</th>
            <th scope="col" className="num">
              Precio de oferta
            </th>
          </tr>
        </thead>
        <tbody>
          {placements.map((p) => {
            const tier = TIER[p.tier];
            const destino = destinoDe(p);
            return (
              <tr key={p.lotId}>
                <td className="lot">
                  <code>{p.lotId}</code>
                </td>
                <td>
                  {p.productName}
                  <span className="sub">
                    {p.quantity} × {unidad(p.sku)}
                  </span>
                </td>
                <td className="num">
                  {fechaCorta(p.expiry)}
                  <span className="sub">en {p.daysToExpiry} días</span>
                </td>
                <td>
                  <span className={`tier ${tier.clase}`}>{tier.nombre}</span>
                </td>
                <td className="num">{pesos.format(p.valueAtRisk)}</td>
                <td>
                  <DestinoCell destino={destino} />
                </td>
                <td className="num">
                  {p.pricing && destino.kind !== "baja" ? (
                    <>
                      {pesos.format(p.pricing.offerPrice)}
                      <span className="sub">
                        {Math.round(p.pricing.discountPct * 100)}% menos
                        {p.pricing.floorBinding ? ", frenado en el piso" : ""}
                      </span>
                    </>
                  ) : (
                    <span className="sub">no aplica</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* canal y compañía                                                           */
/* -------------------------------------------------------------------------- */

async function Channel() {
  const draft = readDraftConfig();

  if (!draft.configured) {
    return (
      <section className="section" aria-labelledby="canal">
        <h2 id="canal">WhatsApp, hoy</h2>
        <p className="status">
          Sólo borradores <span>sin credenciales de Meta</span>
        </p>
        <p>
          Los mensajes se arman y se validan igual, cada uno con su <code>draft_id</code>. Si una persona aprueba el envío,
          el servidor devuelve el mensaje exacto que habría salido y no entrega nada.
        </p>
        <p>Con las credenciales cargadas, el mismo borrador sale sin tocar nada más.</p>
      </section>
    );
  }

  const { declared, observed } = await describeChannel(loadChannelConfig());

  return (
    <section className="section" aria-labelledby="canal">
      <h2 id="canal">WhatsApp, hoy</h2>
      <p className="status">
        {declared.sendingEnabled ? "Envío habilitado" : "Sólo borradores"}{" "}
        <span>{declared.mode === "test_number" ? "con el número de prueba de Meta" : "con número propio"}</span>
      </p>
      {observed.reachable ? (
        <p>
          Meta informa el número {observed.displayPhoneNumber ?? "(oculto)"}
          {observed.verifiedName ? `, a nombre de ${observed.verifiedName}` : ""}
          {observed.qualityRating ? `, con calidad ${observed.qualityRating}` : ""}.
        </p>
      ) : (
        <p className="notice">No se pudo consultar a Meta: {observed.reason}</p>
      )}
    </section>
  );
}

const ESTADOS: Record<string, string> = {
  backlog: "en espera",
  todo: "por hacer",
  in_progress: "en curso",
  in_review: "en revisión",
  blocked: "trabada",
  done: "hecha",
  cancelled: "cancelada",
};

async function Company() {
  const result = loadPaperclipConfig();

  if (!result.configured) {
    return (
      <section className="section" aria-labelledby="compania">
        <h2 id="compania">La compañía en Paperclip</h2>
        <p>
          Dos agentes. StockScout escanea el inventario, coloca cada lote y redacta las ofertas. MarginReviewer revisa sus
          números y no puede enviar mensajes.
        </p>
        <p>
          Tres tareas: detectar los lotes en riesgo, validar y aprobar el margen de una oferta, y mandarla por WhatsApp.
        </p>
        <p className="notice">
          Paperclip corre en una computadora y esta página no lo alcanza, así que acá no se ve en vivo. Las corridas, las
          aprobaciones y la auditoría del envío están en <a href={DOC("DECISIONS.md")}>las decisiones del proyecto</a>.
        </p>
      </section>
    );
  }

  const [issues, agents] = await Promise.all([listIssues(result.config), listAgents(result.config)]);

  return (
    <section className="section" aria-labelledby="compania">
      <h2 id="compania">La compañía en Paperclip</h2>
      {agents.ok ? (
        <p>{agents.data.map((agent) => agent.name).join(" y ")}.</p>
      ) : (
        <p className="notice">{agents.reason}</p>
      )}
      {issues.ok ? (
        <ul className="issues">
          {[...issues.data]
            .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))
            .map((issue) => (
              <li key={issue.id}>
                <span className="state">{ESTADOS[issue.status] ?? issue.status}</span>
                <span>{issue.title}</span>
              </li>
            ))}
        </ul>
      ) : (
        <p className="notice">{issues.reason}</p>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */

export default function Page() {
  const asOf = asOfDate();
  const placements = scanInventory(dataset, asOf);

  const enRiesgo = placements.reduce((total, p) => total + p.valueAtRisk, 0);
  const colocables = placements.filter((p) => destinoDe(p).kind === "cuenta");
  const colocableValor = colocables.reduce((total, p) => total + p.valueAtRisk, 0);
  const bajas = placements.filter((p) => p.tier === "retire");
  const sinDestino = placements.filter((p) => destinoDe(p).kind === "nadie");

  return (
    <div className="page">
      <header className="masthead">
        <span className="wordmark">
          Op<span>Farma</span>
        </span>
        <span className="masthead-date">Inventario al {fechaLarga(asOf)}</span>
      </header>

      <section className="hero">
        <h1>
          {placements.length} lotes de insumos médicos se vencen en el depósito si nadie los mueve.
        </h1>
        <p>
          Valen {pesos.format(enRiesgo)} al costo. Saber qué se vence es fácil; lo difícil es encontrar a quién vendérselo a
          tiempo. {colocables.length} de estos lotes tienen una cuenta que los consume antes de la fecha, por{" "}
          {pesos.format(colocableValor)}. {sinDestino.length === 1 ? "Uno es demasiado grande" : `${sinDestino.length} son demasiado grandes`} para
          cualquier cuenta, y {bajas.length === 1 ? "otro ya no tiene arreglo" : `${bajas.length} ya no tienen arreglo`}.
        </p>
      </section>

      <Timeline placements={placements} asOf={asOf} />

      <section className="section" aria-labelledby="lotes">
        <h2 id="lotes">Lote por lote</h2>
        <p className="lede">
          Para cada lote, el motor mira cuánto compró cada cuenta de ese producto en los últimos 180 días y calcula cuánto
          puede consumir antes del vencimiento, dejando un mes de margen. El precio sale del tramo y nunca baja del piso:
          el costo más un 5%, o lo que pagaría un liquidador si es más.
        </p>
        <LotTable placements={placements} />
        <p className="fine">
          Datos de ejemplo: el inventario y las compras son un dataset armado para la demo, no un sistema de gestión real.
          El cálculo es el mismo que usan los agentes cuando trabajan en Paperclip.
        </p>
      </section>

      <section className="section" aria-labelledby="quien">
        <h2 id="quien">Quién hace qué</h2>
        <p className="lede">
          Los agentes hacen lo que a mano no da el tiempo. Las personas firman donde un error lo paga otro.
        </p>
        <ol className="steps">
          <li>
            <h3>Encuentra a quién colocar cada lote</h3>
            <p>Escanea el inventario y cruza cada lote con la rotación de cada cuenta. Con cientos de cuentas, a mano no se hace.</p>
            <span className="who">StockScout, agente</span>
          </li>
          <li>
            <h3>Pone el precio</h3>
            <p>Lo calcula el motor según el tramo de vencimiento. El agente no lo puede cambiar ni ofrecer por debajo del piso.</p>
            <span className="who">Código, con tests</span>
          </li>
          <li>
            <h3>Revisa la colocación</h3>
            <p>Valida que la cuenta lo consuma a tiempo, que el precio respete el piso y que no tenga deuda ni bloqueo.</p>
            <span className="who">MarginReviewer, agente</span>
          </li>
          <li className="human">
            <h3>Aprueba el margen</h3>
            <p>La tarea no se puede cerrar sin esta firma. Colocar mal un lote no borra la pérdida: se la pasa a una clínica.</p>
            <span className="who">Una persona</span>
          </li>
          <li className="human">
            <h3>Aprueba cada mensaje</h3>
            <p>Paperclip frena el envío y pide aprobación en la tarea. Sale sólo el texto exacto que se aprobó.</p>
            <span className="who">Una persona, otra vez</span>
          </li>
        </ol>
      </section>

      <div className="split">
        <Channel />
        <Company />
      </div>

      <aside className="note" aria-labelledby="nota">
        <h2 id="nota">Por qué está armado así</h2>
        <p>
          Armé OpFarma para el desafío técnico de Paperclip. Elegí este problema porque en insumos médicos un lote vencido es
          plata perdida, y porque decidir a quién ofrecérselo a tiempo es justo el trabajo que una persona no llega a hacer con
          cientos de cuentas.
        </p>
        <p>
          Dejé el precio en código y no en el modelo, y puse a una persona en los dos lugares donde un error le cuesta a un
          tercero: el margen y el mensaje al cliente. El segundo control no venía configurado en Paperclip; lo detectó el
          propio agente cuando el envío pasó sin pedir permiso.
        </p>
        <ul>
          <li>
            <a href={DOC("DECISIONS.md")}>Qué decidí y con qué me choqué</a>
          </li>
          <li>
            <a href={DOC("research/RESEARCH.md")}>Qué es Paperclip, en una página</a>
          </li>
          <li>
            <a href={REPO}>El código</a>
          </li>
        </ul>
      </aside>

      <footer className="colophon">
        Los agentes usan dos servidores MCP de esta misma aplicación: <code>/api/mcp/inventory</code> para escanear, colocar
        y armar ofertas, y <code>/api/mcp/whatsapp</code> para el estado del canal, los borradores y el envío. Los dos piden
        clave.
      </footer>
    </div>
  );
}
