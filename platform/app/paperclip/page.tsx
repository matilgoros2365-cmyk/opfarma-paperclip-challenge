/**
 * La compañía en Paperclip, tal como trabajó.
 *
 * Paperclip corre en la máquina de cada persona, así que quien evalúa no lo
 * puede abrir. Esta página muestra el historial real de las tareas, exportado
 * con scripts/export-evidence.mjs y limpio de datos personales. Es una foto con
 * fecha, y lo dice.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { Marked } from "marked";

import evidence from "@/data/paperclip-evidence.json";

import { Masthead } from "../masthead";
import { Replay, type ReplayEvent } from "./replay";
import { Documentos } from "../docs";

export const metadata: Metadata = {
  title: "OpFarma en Paperclip",
  description: "El historial real de la compañía de agentes de OpFarma en Paperclip: tareas, agentes y aprobaciones humanas.",
};

type Approval = {
  kind: "approval";
  at: string;
  resolvedAt: string | null;
  status: string;
  requestedBy: string | null;
  resolvedBy: string | null;
  tool: string;
  app: string;
  args: Record<string, unknown> | null;
};
type Comment = { kind: "comment"; at: string; author: string | null; body: string };
type Event = Approval | Comment;
type Issue = {
  identifier: string;
  title: string;
  status: string;
  assignee: string | null;
  description: string;
  createdAt: string;
  events: Event[];
};

const data = evidence as unknown as {
  exportedAt: string;
  paperclipVersion: string | null;
  agents: { name: string; role: string; title: string; reportsTo: string | null }[];
  issues: Issue[];
};

/* -------------------------------------------------------------------------- */

// Lo que escriben los agentes es markdown. El HTML crudo se escapa: parte del
// texto viene de terceros (el prompt de grokbot.dev) y no tiene que ejecutarse.
const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const md = new Marked({ gfm: true, breaks: false });
md.use({
  renderer: {
    html: (token) => escapeHtml(token.text),
    link: ({ href, text }) =>
      /^https:\/\//.test(href ?? "") ? `<a href="${escapeHtml(href)}" rel="noopener noreferrer">${text}</a>` : text,
  },
});
const render = (body: string) => md.parse(body) as string;

function hora(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function fechaLarga(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** La primera línea con texto, sin marcas de markdown, para el resumen plegado. */
function titular(body: string): string {
  const line = body
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0) ?? "";
  return line.replace(/^#+\s*/, "").replace(/[*_`>]/g, "").slice(0, 140);
}

const HERRAMIENTA: Record<string, string> = {
  "Approve the margin of an offer": "Fijar el margen de la oferta",
  "Send an approved WhatsApp message": "Mandar el mensaje por WhatsApp",
  "Publish an approved LinkedIn post": "Publicar el posteo en LinkedIn",
};

const ESTADO: Record<string, string> = {
  done: "terminada",
  in_review: "en revisión",
  in_progress: "en curso",
  blocked: "trabada",
  todo: "por hacer",
};

/* -------------------------------------------------------------------------- */

const CAPITULOS: { id: string; via?: string; titulo: string; texto: string }[] = [
  {
    id: "OPF-1",
    titulo: "StockScout encuentra los lotes en riesgo",
    texto:
      "Escanea el inventario con las herramientas de la plataforma, coloca cada lote y deja en la tarea lo que una persona tiene que decidir.",
  },
  {
    id: "OPF-5",
    titulo: "Arma la oferta y la revisa otro agente",
    texto:
      "StockScout arma la oferta de L-8890. Al cerrarla, Paperclip la pasa sola a MarginReviewer, que recalcula consumo, piso de precio y estado de cuenta por su cuenta.",
  },
  {
    id: "OPF-6",
    via: "B2, WhatsApp",
    titulo: "Dos aprobaciones humanas y el mensaje real",
    texto:
      "Paperclip frena dos veces y pide aprobación, primero del margen y después del mensaje exacto. Con las dos, el mensaje sale por la Cloud API de Meta y llega al celular.",
  },
  {
    id: "OPF-7",
    via: "B3, LinkedIn",
    titulo: "El posteo, con un rechazo a propósito",
    texto:
      "El lote L-6612 no tiene una cuenta que lo absorba, así que se ofrece a clínicas nuevas. La primera tarjeta se rechazó porque cambió el texto; el agente lo registró sin publicar, rehízo el borrador y la segunda se aprobó. Sin credenciales de LinkedIn, el resultado es un dry-run con el pedido exacto.",
  },
  {
    id: "OPF-8",
    via: "B1, Grokbot",
    titulo: "El traspaso a Grok Bot",
    texto:
      "El agente busca en el directorio de grokbot.dev por su MCP, elige el plugin que publica en LinkedIn con confirmación humana y arma el paquete para que una persona lo pegue en Grok.",
  },
  {
    id: "OPF-9",
    titulo: "El rol de growth publica",
    texto:
      "Las redes pasaron a GrowthScout, un agente separado del comercial. Arma su posteo, pide aprobación y devuelve el dry-run.",
  },
  {
    id: "OPF-10",
    titulo: "La prueba de permisos",
    texto:
      "Se le pide a StockScout que publique en LinkedIn, que no es su área. Puede armar el borrador, pero Paperclip ni siquiera le muestra la herramienta de publicar.",
  },
];

const PERMISOS: { herramienta: string; StockScout: string; GrowthScout: string; MarginReviewer: string }[] = [
  { herramienta: "Fijar el margen", StockScout: "aprueba una persona", GrowthScout: "bloqueado", MarginReviewer: "bloqueado" },
  { herramienta: "Mandar WhatsApp", StockScout: "aprueba una persona", GrowthScout: "bloqueado", MarginReviewer: "bloqueado" },
  { herramienta: "Publicar en LinkedIn", StockScout: "bloqueado", GrowthScout: "aprueba una persona", MarginReviewer: "bloqueado" },
  { herramienta: "Borradores y búsqueda en Grokbot", StockScout: "permitido", GrowthScout: "permitido", MarginReviewer: "permitido" },
];

/* -------------------------------------------------------------------------- */

function aReplay(e: Event): ReplayEvent {
  if (e.kind === "comment") {
    return {
      kind: "comment",
      author: e.author === "Persona" ? "La operadora" : (e.author ?? "Alguien"),
      time: hora(e.at),
      title: titular(e.body),
      html: render(e.body),
    };
  }
  return {
    kind: "approval",
    ok: e.status === "accepted",
    tool: HERRAMIENTA[e.tool] ?? e.tool,
    app: e.app,
    requestedBy: e.requestedBy ?? "un agente",
    requestedAt: hora(e.at),
    resolvedAt: hora(e.resolvedAt),
    args: e.args ? Object.entries(e.args).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]) : [],
  };
}

export default function PaperclipPage() {
  const issues = new Map(data.issues.map((i) => [i.identifier, i]));
  const aprobaciones = data.issues.flatMap((i) => i.events).filter((e): e is Approval => e.kind === "approval");
  const aprobadas = aprobaciones.filter((a) => a.status === "accepted").length;
  const rechazadas = aprobaciones.length - aprobadas;

  return (
    <>
      <Masthead actual="paperclip" nota={`Exportado el ${fechaLarga(data.exportedAt)}`} />
      <main className="page">
      <section className="hero">
        <h1 className="hero-title">La compañía en Paperclip, tal como trabajó.</h1>
        <p>
          Paperclip corre en la computadora de cada persona, así que no se puede abrir desde acá. Esto es el historial
          real de siete tareas, exportado de Paperclip {data.paperclipVersion ?? ""} con los datos personales
          enmascarados. Tres agentes, {aprobaciones.length} tarjetas de aprobación ({aprobadas} aprobadas y{" "}
          {rechazadas === 1 ? "una rechazada" : `${rechazadas} rechazadas`}) y las tres vías del desafío.
        </p>
        <p className="fine">
          Cada tarea se reproduce al llegar a ella, con el ritmo inventado y los datos reales. Cómo levantar la compañía en tu máquina está en el{" "}
          <a href="https://github.com/matilgoros2365-cmyk/opfarma-paperclip-challenge#cómo-levantarlo-en-unos-10-minutos">
            README
          </a>
          .
        </p>
      </section>

      <section className="section" aria-labelledby="org">
        <h2 id="org">Los agentes y lo que puede hacer cada uno</h2>
        <p className="lede">
          Cada agente usa sólo las herramientas de su área, y lo que decide algo pide una persona. Lo impone Paperclip
          con políticas, no las instrucciones. Las tareas de abajo se reproducen solas al llegar a cada una.
        </p>
        <ul className="ev-agents">
          {data.agents.map((a) => (
            <li key={a.name}>
              <strong>{a.name}</strong>
              <span>{a.title}</span>
              <span className="sub">
                rol <code>{a.role}</code>
                {a.reportsTo ? `, reporta a ${a.reportsTo}` : ", raíz del organigrama"}
              </span>
            </li>
          ))}
        </ul>
        <div className="table-scroll">
          <table className="lots ev-matrix">
            <thead>
              <tr>
                <th scope="col">Herramienta</th>
                <th scope="col">StockScout</th>
                <th scope="col">GrowthScout</th>
                <th scope="col">MarginReviewer</th>
              </tr>
            </thead>
            <tbody>
              {PERMISOS.map((p) => (
                <tr key={p.herramienta}>
                  <td>{p.herramienta}</td>
                  {(["StockScout", "GrowthScout", "MarginReviewer"] as const).map((k) => (
                    <td key={k} className={`ev-perm ${p[k] === "bloqueado" ? "deny" : p[k] === "permitido" ? "allow" : "ask"}`}>
                      {p[k]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <nav className="ev-toc" id="tareas" aria-label="Las tareas">
        {CAPITULOS.map((c) => (
          <a key={c.id} href={`#${c.id}`}>
            <code>{c.id}</code> {c.titulo}
          </a>
        ))}
      </nav>

      {CAPITULOS.map((c) => {
        const issue = issues.get(c.id);
        if (!issue) return null;
        return (
          <section key={c.id} id={c.id} className="section ev-chapter" aria-labelledby={`${c.id}-t`}>
            <p className="ev-kicker">
              <code>{issue.identifier}</code>
              {c.via ? <span className="ev-via">{c.via}</span> : null}
              <span>{issue.assignee ?? "sin asignar"}</span>
            </p>
            <h2 id={`${c.id}-t`}>{c.titulo}</h2>
            <p className="lede">{c.texto}</p>
            <p className="ev-task">
              La tarea en Paperclip, <em>{issue.title}</em>
            </p>
            <Replay
              events={issue.events.map(aReplay)}
              status={issue.status}
              statusLabel={`Tarea ${ESTADO[issue.status] ?? issue.status}`}
            />
          </section>
        );
      })}

      <Documentos
        items={[
          { path: "VERIFICATION.md", titulo: "Cómo lo verifiqué", detalle: "Cada prueba, con su resultado" },
          { path: "docs/BITACORA.md", titulo: "Bitácora técnica", detalle: "Los obstáculos de cada tarea y cómo se resolvieron" },
          { path: "research/PAPERCLIP.md", titulo: "Paperclip, en versión extendida", detalle: "Políticas, aprobaciones y lo que encontré usándolo" },
          { path: "scripts/setup-company.mjs", titulo: "El script que arma la compañía", detalle: "Agentes, permisos y tareas, en un comando" },
        ]}
      />

      <footer className="colophon">
        Exportado con <code>scripts/export-evidence.mjs</code>, que enmascara teléfonos, identificadores de mensajes,
        rutas y claves, y se niega a escribir si queda alguno. <Link href="/">Volver a la plataforma</Link>.
      </footer>
      </main>
    </>
  );
}
