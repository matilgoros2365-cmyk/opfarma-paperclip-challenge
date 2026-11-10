/**
 * La plataforma de OpFarma, una vista de sólo lectura.
 *
 * No es un segundo plano de control y no modifica nada. Le cuenta a alguien que
 * llega sin contexto qué se vence, qué hace OpFarma con cada lote y quién firma
 * cada paso. El inventario lo calcula en vivo el mismo motor que usan los
 * agentes; lo que vive en Paperclip, que corre local, se muestra en vivo sólo
 * si la función lo alcanza, y si no, se dice por qué.
 */
import { describeChannel, explainUnreachable, loadChannelConfig, readDraftConfig } from "@/lib/channel";
import { readStoreConfig, recentEvents } from "@/lib/events-store";
import { asOfDate, dataset } from "@/lib/expiry/dataset";
import { scanInventory, type Placement } from "@/lib/expiry/engine";
import { listAgents, listIssues, loadPaperclipConfig, STATUS_ORDER } from "@/lib/paperclip";

import { Explorer } from "./explorer";

export const dynamic = "force-dynamic";

const REPO = "https://github.com/matilgoros2365-cmyk/opfarma-paperclip-challenge";
const DOC = (path: string) => `${REPO}/blob/main/${path}`;

/* -------------------------------------------------------------------------- */
/* formato                                                                    */
/* -------------------------------------------------------------------------- */

const pesosFmt = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
// En Argentina se escribe $3.004.000, sin el espacio que mete Intl.
const pesos = { format: (n: number) => pesosFmt.format(n).replace(/^\$\s/, "$") };
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function fechaLarga(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} de ${MESES[m! - 1]} de ${y}`;
}

/** Qué se hace con un lote, con el mismo criterio que usa el explorador. */
function destinoDe(placement: Placement): "cuenta" | "revision" | "nadie" | "baja" {
  if (placement.tier === "retire") return "baja";
  if (placement.candidates[0]?.eligible) return "cuenta";
  if (placement.candidates.some((candidate) => candidate.needsReview)) return "revision";
  return "nadie";
}

/* -------------------------------------------------------------------------- */
/* canal y compañía                                                           */
/* -------------------------------------------------------------------------- */

const ESTADO_ENVIO: Record<string, string> = {
  sent: "Enviado",
  delivered: "Entregado",
  read: "Leído",
  failed: "Falló",
};

function hora(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

async function DeliveryLog() {
  const store = readStoreConfig();
  if (!store) return null;

  let events;
  try {
    // Meta puede mandar el mismo aviso más de una vez: se muestra uno por estado.
    const seen = new Set<string>();
    events = (await recentEvents(store, 30))
      .filter((event) => event.kind === "status")
      .filter((event) => {
        const key = `${event.wamid}:${event.status}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 8);
  } catch {
    return <p className="notice">No se pudo leer el registro de entregas.</p>;
  }

  if (events.length === 0) {
    return <p>Todavía no llegó ningún aviso de entrega de Meta.</p>;
  }

  return (
    <>
      <p style={{ marginTop: 14 }}>Lo último que informó Meta sobre los envíos reales.</p>
      <ul className="issues">
        {events.map((event) => (
          <li key={`${event.wamid}-${event.status}`}>
            <span className="state">{ESTADO_ENVIO[event.status] ?? event.status}</span>
            <span>
              al número {event.recipient}, {hora(event.at)}
              {event.error ? ` (${event.error.title ?? `error ${event.error.code}`})` : ""}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

async function Channel() {
  const draft = readDraftConfig();

  if (!draft.configured) {
    return (
      <section className="section" aria-labelledby="canal">
        <h2 id="canal">WhatsApp, hoy</h2>
        <p className="status">
          Esta instancia sólo arma borradores <span>sin credenciales de Meta</span>
        </p>
        <p>
          Acá los mensajes se arman y se validan, cada uno con su <code>draft_id</code>, pero no se entregan. Los envíos
          reales salen de la instancia que corre junto a Paperclip, siempre con la aprobación de una persona, y Meta
          informa su estado a esta página.
        </p>
        <DeliveryLog />
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
        <p className="notice">{explainUnreachable(observed.reason)}</p>
      )}
      <DeliveryLog />
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
          Tres tareas. Detectar los lotes en riesgo, armar y revisar la oferta, y aprobar el margen y el mensaje antes de
          mandarla por WhatsApp.
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
  const colocables = placements.filter((p) => destinoDe(p) === "cuenta");
  const colocableValor = colocables.reduce((total, p) => total + p.valueAtRisk, 0);
  const bajas = placements.filter((p) => p.tier === "retire");
  const sinDestino = placements.filter((p) => destinoDe(p) === "nadie");

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

      <Explorer asOf={asOf} />

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
            <p>Paperclip frena la oferta y pide aprobación en la tarea, con el precio y el margen que calculó el código. Colocar mal un lote no borra la pérdida, se la pasa a una clínica.</p>
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
          tercero, el margen y el mensaje al cliente. El segundo control no venía configurado en Paperclip; lo detectó el
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
        Los agentes usan dos servidores MCP de esta misma aplicación, <code>/api/mcp/inventory</code> para escanear, colocar
        y armar ofertas, y <code>/api/mcp/whatsapp</code> para el estado del canal, los borradores y el envío. Los dos piden
        clave.
      </footer>
    </div>
  );
}
