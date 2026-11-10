"use client";

/**
 * Reproduce el historial de una tarea como si estuviera pasando. Los mensajes
 * de los agentes aparecen después de un "escribiendo", y cada tarjeta de
 * aprobación queda esperando a una persona antes de resolverse.
 *
 * Los datos son los mismos que exportó Paperclip: lo único que se inventa es
 * el ritmo. La reproducción arranca cuando la tarea entra en pantalla, se puede
 * saltear y no corre si la persona pidió menos movimiento.
 */
import { useEffect, useRef, useState } from "react";

export type ReplayEvent =
  | { kind: "comment"; author: string; time: string; title: string; html: string }
  | {
      kind: "approval";
      ok: boolean;
      tool: string;
      app: string;
      requestedBy: string;
      requestedAt: string;
      resolvedAt: string;
      args: [string, string][];
    };

// Cada evento tiene dos cuadros. Un comentario, "escribiendo" y el texto. Una
// aprobación, la tarjeta esperando y la tarjeta resuelta.
function duracion(cuadro: number, eventos: ReplayEvent[]): number {
  const e = eventos[Math.floor(cuadro / 2)]!;
  const primero = cuadro % 2 === 0;
  if (e.kind === "comment") return primero ? 950 : 450;
  return primero ? 1900 : 900;
}

export function Replay({ events, status, statusLabel }: { events: ReplayEvent[]; status: string; statusLabel: string }) {
  const total = events.length * 2;
  const [cuadro, setCuadro] = useState(total);
  const [corriendo, setCorriendo] = useState(false);
  const [armado, setArmado] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  // Al montar, si se puede animar, se esconde todo y se espera a que la tarea
  // entre en pantalla. Sin JavaScript o con menos movimiento, se ve completa.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = raiz.current;
    if (!el) return;
    setCuadro(0);
    setArmado(true);
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setCorriendo(true);
          obs.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!corriendo) return;
    if (cuadro >= total) {
      setCorriendo(false);
      return;
    }
    const t = window.setTimeout(() => setCuadro((c) => c + 1), duracion(cuadro, events));
    return () => window.clearTimeout(t);
  }, [corriendo, cuadro, total, events]);

  const terminado = cuadro >= total;
  const enCurso = armado && !terminado;

  return (
    <div ref={raiz} className="replay">
      <div className="replay-bar">
        <p className={`replay-status${enCurso ? " live" : ""}`} aria-live="polite">
          {enCurso ? (
            <>
              <span className="pulse" aria-hidden="true" /> En curso
            </>
          ) : (
            <span className={`final st-${status}`}>{statusLabel}</span>
          )}
        </p>
        {armado ? (
          enCurso ? (
            <button
              type="button"
              className="replay-btn"
              onClick={() => {
                setCorriendo(false);
                setCuadro(total);
              }}
            >
              Ver todo
            </button>
          ) : (
            <button
              type="button"
              className="replay-btn"
              onClick={() => {
                setCuadro(0);
                setCorriendo(true);
              }}
            >
              Reproducir de nuevo
            </button>
          )
        ) : null}
      </div>

      <ol className="ev-timeline">
        {events.map((e, i) => {
          const desde = i * 2;
          if (cuadro < desde) return null;
          const resuelto = cuadro > desde;
          if (e.kind === "comment") {
            return resuelto ? (
              <li key={i} className="ev-comment appear">
                <details>
                  <summary>
                    <span className="ev-author">{e.author}</span>
                    <span className="ev-time">{e.time}</span>
                    <span className="ev-title">{e.title}</span>
                  </summary>
                  <div className="ev-body" dangerouslySetInnerHTML={{ __html: e.html }} />
                </details>
              </li>
            ) : (
              <li key={i} className="ev-typing appear">
                <span className="ev-author">{e.author}</span> está escribiendo
                <span className="dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              </li>
            );
          }
          const estado = !resuelto ? "wait" : e.ok ? "ok" : "no";
          return (
            <li key={i} className={`ev-approval ${estado} appear`}>
              <div className="ev-approval-main">
              <div className="ev-approval-head">
                <span className="ev-badge">
                  {estado === "wait" ? (
                    <>
                      <span className="pulse" aria-hidden="true" /> Esperando la aprobación de una persona
                    </>
                  ) : estado === "ok" ? (
                    "Aprobada por una persona"
                  ) : (
                    "Rechazada por una persona"
                  )}
                </span>
                <span className="ev-time">
                  pedida {e.requestedAt}
                  {resuelto && e.resolvedAt ? `, resuelta ${e.resolvedAt}` : ""}
                </span>
              </div>
              <p className="ev-approval-tool">
                <strong>{e.tool}</strong>, en {e.app}, a pedido de {e.requestedBy}
              </p>
              {e.args.length > 0 ? (
                <dl className="ev-args">
                  {e.args.map(([k, v]) => (
                    <div key={k}>
                      <dt>
                        <code>{k}</code>
                      </dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              </div>
              <div className={`cert cert-${estado}`} aria-hidden="true">
                <span className="cert-head">{estado === "wait" ? "Pendiente" : estado === "ok" ? "Aprobado" : "Rechazado"}</span>
                <span className="cert-body">{estado === "wait" ? "falta la firma" : `por una persona, ${e.resolvedAt}`}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
