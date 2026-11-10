"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/* -------------------------------------------------------------------------- */
/* la portada                                                                 */
/* -------------------------------------------------------------------------- */

const INDICE: { href: string; titulo: string; detalle: string }[] = [
  { href: "#problema", titulo: "El problema", detalle: "Qué se vence en el depósito y cuánto vale" },
  { href: "#deposito-seccion", titulo: "El depósito, lote por lote", detalle: "Elegí un lote o adelantá el reloj" },
  { href: "#quien", titulo: "Quién firma cada paso", detalle: "Qué hace cada agente y qué aprueba una persona" },
  { href: "#canal", titulo: "WhatsApp y la compañía", detalle: "El canal real y las tareas en Paperclip" },
  { href: "/paperclip", titulo: "La compañía en Paperclip", detalle: "El historial real, reproducido paso a paso" },
];

/** La portada de la plataforma. El índice es el orden en que conviene leerla. */
export function Cover() {
  const video = useRef<HTMLVideoElement>(null);

  // Con menos movimiento pedido, el video queda quieto en su primer cuadro.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) video.current?.pause();
  }, []);

  return (
    <header className="cover">
      <video
        ref={video}
        className="cover-video"
        src="/portada.mp4"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden="true"
        tabIndex={-1}
      />
      <div className="cover-veil" aria-hidden="true" />
      <div className="cover-inner">
        <h1 className="cover-title">
          Op<span>Farma</span>
        </h1>
        <p className="cover-lede">
          Una compañía de agentes que busca a quién venderle cada lote de insumos médicos antes de que se venza. Una persona
          aprueba cada paso que compromete plata o le habla a un cliente.
        </p>

        <nav className="cover-index" aria-label="Índice">
          <ol>
            {INDICE.map((item, i) => (
              <li key={item.href}>
                <a href={item.href}>
                  <span className="idx-n">{i + 1}</span>
                  <span className="idx-t">{item.titulo}</span>
                  <span className="idx-d">{item.detalle}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <a href="#problema" className="cover-arrow">
          <span>Empezar</span>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M12 4v15M5 12l7 7 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
        <p className="cover-foot">Desafío técnico de Paperclip, noviembre de 2026</p>
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* la barra                                                                   */
/* -------------------------------------------------------------------------- */

const SECCIONES_PLATAFORMA = [
  { id: "problema", texto: "El problema" },
  { id: "deposito-seccion", texto: "El depósito" },
  { id: "quien", texto: "Quién firma" },
  { id: "canal", texto: "WhatsApp" },
];

const SECCIONES_PAPERCLIP = [
  { id: "org", texto: "Los agentes" },
  { id: "tareas", texto: "Las tareas" },
];

/**
 * La barra fija de arriba. Lleva a cada sección y marca en cuál está la
 * persona, así no se pierde en una página larga.
 */
export function Masthead({ actual, nota }: { actual: "plataforma" | "paperclip"; nota: string }) {
  const secciones = actual === "plataforma" ? SECCIONES_PLATAFORMA : SECCIONES_PAPERCLIP;
  const [activa, setActiva] = useState<string | null>(null);

  useEffect(() => {
    const elementos = secciones.map((s) => document.getElementById(s.id)).filter((e): e is HTMLElement => !!e);
    const onScroll = () => {
      const linea = 120;
      let actual: string | null = null;
      for (const el of elementos) {
        if (el.getBoundingClientRect().top - linea <= 0) actual = el.id;
      }
      setActiva(actual);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [secciones]);

  return (
    <nav className="bar" aria-label="Secciones">
      <div className="bar-inner">
        <Link href="/" className="wordmark" aria-label="OpFarma, inicio">
          Op<span>Farma</span>
        </Link>
        <ul className="bar-links">
          {secciones.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className={activa === s.id ? "is-active" : undefined} aria-current={activa === s.id ? "true" : undefined}>
                {s.texto}
              </a>
            </li>
          ))}
          <li>
            {actual === "plataforma" ? (
              <Link href="/paperclip" className="bar-page">
                La compañía en Paperclip
              </Link>
            ) : (
              <Link href="/" className="bar-page">
                Volver a la plataforma
              </Link>
            )}
          </li>
        </ul>
        <p className="bar-note">{nota}</p>
      </div>
    </nav>
  );
}
