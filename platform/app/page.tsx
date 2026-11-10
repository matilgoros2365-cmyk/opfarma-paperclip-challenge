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

import Link from "next/link";

import { Explorer } from "./explorer";
import { DOC, Documentos, REPO } from "./docs";
import { Cover, Masthead } from "./masthead";
import { Steps } from "./steps";

export const dynamic = "force-dynamic";


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
          Tres agentes. StockScout escanea el inventario, coloca cada lote y redacta las ofertas. MarginReviewer revisa sus
          números y no puede enviar nada. GrowthScout ofrece en LinkedIn los lotes que ninguna cuenta absorbe.
        </p>
        <p>
          Cinco tareas. Detectar los lotes en riesgo, armar y revisar la oferta, aprobar el margen y el mensaje antes de
          mandarla por WhatsApp, preparar el posteo en LinkedIn del lote que ninguna cuenta absorbe, y dejar ese posteo listo
          para Grok Bot.
        </p>
        <p>
          Paperclip corre en la computadora de cada persona, así que desde acá no se ve en vivo. El historial real de las
          tareas, con cada aprobación, está exportado en <Link href="/paperclip">la compañía en Paperclip</Link>.
        </p>
        <p>
          <Link href="/paperclip" className="ev-cta">
            Ver la compañía trabajando
          </Link>
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
    <>
      <Cover />
      <Masthead actual="plataforma" nota={`Inventario al ${fechaLarga(asOf)}`} />
      <main className="page">
      <section className="hero" id="problema" aria-labelledby="problema-t">
        <h2 id="problema-t" className="hero-title">
          {placements.length} lotes de insumos médicos se vencen en el depósito si nadie los mueve.
        </h2>
        <p>
          Valen {pesos.format(enRiesgo)} al costo. Saber qué se vence es fácil; lo difícil es encontrar a quién vendérselo a
          tiempo. {colocables.length} de estos lotes tienen una cuenta que los consume antes de la fecha, por{" "}
          {pesos.format(colocableValor)}. {sinDestino.length === 1 ? "Uno es demasiado grande" : `${sinDestino.length} son demasiado grandes`} para
          cualquier cuenta, y {bajas.length === 1 ? "otro ya no tiene arreglo" : `${bajas.length} ya no tienen arreglo`}.
        </p>
        <Documentos
          items={[
            { path: "research/EXPIRY.md", titulo: "El problema", detalle: "Por qué los lotes se vencen y de dónde salen los tramos" },
            { path: "README.md", titulo: "README", detalle: "Qué se entrega y cómo levantarlo en 10 minutos" },
          ]}
        />
      </section>

      <Explorer asOf={asOf} />

      <section className="section" aria-labelledby="quien">
        <h2 id="quien">Quién firma cada paso</h2>
        <p className="lede">
          Los agentes hacen lo que a mano no da el tiempo. Las personas firman donde un error lo paga otro.
        </p>
        <Steps />
        <p className="steps-aside">
          Si ninguna cuenta absorbe el lote entero, GrowthScout arma un posteo para LinkedIn y deja listo el traspaso a Grok
          Bot. Tampoco publica sin que una persona lo apruebe, y no puede tocar márgenes ni mandar WhatsApp.
        </p>
        <Documentos
          items={[
            { path: "DECISIONS.md", titulo: "Decisiones", detalle: "Qué elegí y por qué, en media página" },
            { path: "docs/REGISTRO-DE-DECISIONES.md", titulo: "Registro de decisiones", detalle: "Cada decisión con sus opciones" },
            { path: "docs/BITACORA.md", titulo: "Bitácora técnica", detalle: "Cada obstáculo y cómo se resolvió" },
          ]}
        />
      </section>

      <div className="split" id="canal">
        <Channel />
        <Company />
      </div>
      <Documentos
        items={[
          { path: "research/CANALES.md", titulo: "Por qué tres canales", detalle: "WhatsApp, LinkedIn y Grok Bot, con fuentes" },
          { path: "docs/PRODUCCION.md", titulo: "WhatsApp en producción", detalle: "Qué falta para pasar del número de prueba" },
          { path: "VERIFICATION.md", titulo: "Cómo lo verifiqué", detalle: "Las pruebas, los envíos reales y la matriz de permisos" },
          { path: "research/RESEARCH.md", titulo: "Paperclip, en una página", detalle: "Qué es y cómo lo usé" },
        ]}
      />

      <aside className="note" id="por-que" aria-labelledby="nota">
        <h2 id="nota">Por qué está armado así</h2>
        <p>
          Armé OpFarma para el desafío técnico de Paperclip. Elegí este problema porque en insumos médicos un lote vencido es
          plata perdida, y porque decidir a quién ofrecérselo a tiempo es justo el trabajo que una persona no llega a hacer con
          cientos de cuentas.
        </p>
        <p>
          Dejé el precio en código y no en el modelo, y puse a una persona en los lugares donde un error le cuesta a un
          tercero, el margen, el mensaje al cliente y el posteo. El control del mensaje no venía configurado en Paperclip; lo
          detectó el propio agente cuando el envío pasó sin pedir permiso.
        </p>
        <ul>
          <li>
            <a href={DOC("DECISIONS.md")}>Qué decidí y con qué me choqué</a>
          </li>
          <li>
            <a href={DOC("research/PAPERCLIP.md")}>Paperclip, en versión extendida</a>
          </li>
          <li>
            <a href={DOC("deploy/README.md")}>Por qué Paperclip corre local</a>
          </li>
          <li>
            <a href={REPO}>El código</a>
          </li>
        </ul>
      </aside>

      <footer className="colophon">
        Los agentes usan tres servidores MCP de esta misma aplicación. <code>/api/mcp/inventory</code> escanea, coloca y fija
        las ofertas, <code>/api/mcp/whatsapp</code> maneja el canal, los borradores y el envío, y <code>/api/mcp/social</code>{" "}
        arma el posteo de LinkedIn y el traspaso a Grok Bot. Los tres piden clave.
      </footer>
      </main>
    </>
  );
}
