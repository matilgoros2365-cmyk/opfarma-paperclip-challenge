"use client";

/**
 * Quién firma cada paso. Los pasos se desbloquean en orden cuando la sección
 * entra en pantalla, porque así funciona el circuito: ningún paso arranca sin
 * que el anterior haya terminado, y los dos de una persona quedan firmados.
 */
import { useEffect, useRef, useState } from "react";

type Paso = { quien: string; titulo: string; texto: string; humano?: boolean };

const PASOS: Paso[] = [
  {
    quien: "StockScout, agente",
    titulo: "Encuentra a quién colocar cada lote",
    texto: "Escanea el inventario y cruza cada lote con la rotación de cada cuenta. Con cientos de cuentas, a mano no se hace.",
  },
  {
    quien: "El motor, con tests",
    titulo: "Pone el precio",
    texto: "Lo calcula el código según el tramo de vencimiento. El agente no lo puede cambiar ni ofrecer por debajo del piso.",
  },
  {
    quien: "MarginReviewer, agente",
    titulo: "Revisa la colocación",
    texto: "Valida que la cuenta lo consuma a tiempo, que el precio respete el piso y que no tenga deuda ni bloqueo.",
  },
  {
    quien: "Una persona",
    titulo: "Aprueba el margen",
    texto: "Paperclip frena la oferta y pide aprobación en la tarea, con el precio y el margen que calculó el código.",
    humano: true,
  },
  {
    quien: "Una persona, otra vez",
    titulo: "Aprueba cada mensaje",
    texto: "Paperclip frena el envío y pide aprobación. Sale sólo el texto exacto que se aprobó.",
    humano: true,
  },
];

export function Steps() {
  const [hechos, setHechos] = useState(PASOS.length);
  const [corriendo, setCorriendo] = useState(false);
  const raiz = useRef<HTMLOListElement>(null);

  // Sin JavaScript o con menos movimiento, se ven todos desbloqueados.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = raiz.current;
    if (!el) return;
    setHechos(0);
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setCorriendo(true);
          obs.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!corriendo) return;
    if (hechos >= PASOS.length) {
      setCorriendo(false);
      return;
    }
    const t = window.setTimeout(() => setHechos((n) => n + 1), hechos === 0 ? 300 : 900);
    return () => window.clearTimeout(t);
  }, [corriendo, hechos]);

  return (
    <>
      <ol ref={raiz} className="steps">
        {PASOS.map((p, i) => {
          const estado = i < hechos ? "done" : i === hechos && corriendo ? "now" : "locked";
          return (
            <li key={p.titulo} className={`step ${estado}${p.humano ? " human" : ""}`}>
              <span className="step-n">{i + 1}</span>
              <span className="who">{p.quien}</span>
              <h3>{p.titulo}</h3>
              <p>{p.texto}</p>
              <span className="step-box">
                {estado === "locked"
                  ? i === 0
                    ? "En espera"
                    : `Espera el paso ${i}`
                  : estado === "now"
                    ? p.humano
                      ? "Esperando la firma"
                      : "En curso"
                    : p.humano
                      ? "Firmado por una persona"
                      : "Hecho"}
              </span>
            </li>
          );
        })}
      </ol>
      {!corriendo && hechos >= PASOS.length ? (
        <button
          type="button"
          className="replay-btn steps-again"
          onClick={() => {
            setHechos(0);
            setCorriendo(true);
          }}
        >
          Ver el circuito de nuevo
        </button>
      ) : null}
    </>
  );
}
