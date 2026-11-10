"use client";

/**
 * El depósito, lote por lote. Corre el mismo motor que usan los agentes, en el
 * navegador, sobre el mismo dataset: no puede contradecir lo que hace
 * StockScout en Paperclip.
 *
 * Cada lote es una etiqueta en el pasillo de su tramo. El reloj adelanta la
 * fecha y las etiquetas se corren hacia la baja. Para que la simulación sea
 * honesta, cada cuenta sigue comprando al mismo ritmo (las compras se corren
 * igual que el reloj); lo único que cambia es cuánto le falta a cada lote.
 */
import { useMemo, useRef, useState } from "react";

import seed from "@/data/seed.json";
import { scanInventory, type Candidate, type Dataset, type Disqualifier, type Placement, type Tier } from "@/lib/expiry/engine";
import { cantidad, pesos } from "@/lib/expiry/format";
import { buildOffer, offerMessage } from "@/lib/expiry/offer";
import { commentaryFor } from "@/lib/social-text";

import { DOC, Documentos } from "./docs";

const base = seed as unknown as Dataset;
const veces = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

/* -------------------------------------------------------------------------- */
/* fechas                                                                     */
/* -------------------------------------------------------------------------- */

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function parts(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return { y: y!, m: m!, d: d! };
}

function sumarDias(iso: string, dias: number): string {
  const { y, m, d } = parts(iso);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

function fechaLarga(iso: string): string {
  const { y, m, d } = parts(iso);
  return `${d} de ${MESES[m - 1]} de ${y}`;
}

function fechaCorta(iso: string): string {
  const { y, m, d } = parts(iso);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

/** El mismo dataset, con el reloj adelantado y las cuentas comprando igual que antes. */
function datasetDentroDe(dias: number): Dataset {
  if (dias === 0) return base;
  return { ...base, purchases: base.purchases.map((p) => ({ ...p, date: sumarDias(p.date, dias) })) };
}

/* -------------------------------------------------------------------------- */
/* textos                                                                     */
/* -------------------------------------------------------------------------- */

const TIER: Record<Tier, { nombre: string; rango: string; porque: string }> = {
  healthy: { nombre: "Sano", rango: "más de 9 meses", porque: "Más de nueve meses de vida. Se vende a precio de lista." },
  place: {
    nombre: "Colocar",
    rango: "de 6 a 9 meses",
    porque:
      "Es la última ventana para colocarlo casi sin tocar el margen, antes de cruzar los seis meses que el mercado ya trata como invendible.",
  },
  discount: {
    nombre: "Descuento",
    rango: "de 3 a 6 meses",
    porque:
      "Ya pasó la línea en la que una distribuidora lo valúa en cero, así que un descuento real sale más barato que darlo de baja.",
  },
  salvage: {
    nombre: "Rescate",
    rango: "de 1 a 3 meses",
    porque:
      "Es lo que el mercado secundario llama vencimiento corto, y cualquier oferta se compara con lo que pagaría un liquidador.",
  },
  retire: {
    nombre: "Baja",
    rango: "menos de un mes",
    porque:
      "No se ofrece para uso clínico, porque colocarlo le pasaría la pérdida a una clínica y dejaría producto por vencer en una estantería de atención.",
  },
};

const PASILLOS: Tier[] = ["place", "discount", "salvage", "retire"];

function motivo(reason: Disqualifier, c: Candidate, p: Placement, unit: string): string {
  switch (reason) {
    case "no_history":
      return "No compró este producto en los últimos seis meses";
    case "cannot_absorb":
      return `Llega a usar ${cantidad(Math.floor(c.capacity), unit)} antes del vencimiento, y el lote tiene ${p.quantity}`;
    case "family_mismatch":
      return "No trabaja con esta familia de productos";
    case "credit_blocked":
      return "La cuenta está bloqueada";
    case "credit_debt":
      return "Tiene deuda, así que lo decide una persona";
  }
}

type Destino = "cuenta" | "revision" | "nadie" | "baja";

function destinoDe(p: Placement): Destino {
  if (p.tier === "retire") return "baja";
  if (p.candidates[0]?.eligible) return "cuenta";
  if (p.candidates.some((c) => c.needsReview)) return "revision";
  return "nadie";
}

function destinoTexto(p: Placement): string {
  switch (destinoDe(p)) {
    case "cuenta":
      return `Lo consume ${p.candidates[0]!.accountName}`;
    case "revision":
      return "Lo decide una persona";
    case "nadie":
      return "Ninguna cuenta lo absorbe, va a LinkedIn";
    case "baja":
      return "Se da de baja";
  }
}

function cuandoVence(dias: number): string {
  if (dias > 0) return `en ${dias} ${dias === 1 ? "día" : "días"}`;
  if (dias === 0) return "hoy";
  return `vencido hace ${-dias} ${dias === -1 ? "día" : "días"}`;
}

function lotes(n: number, mayuscula = false): string {
  const t = n === 0 ? "ningún lote" : n === 1 ? "un lote" : `${n} lotes`;
  return mayuscula ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/* -------------------------------------------------------------------------- */
/* una etiqueta                                                               */
/* -------------------------------------------------------------------------- */

function Etiqueta({ p, activo, elegir }: { p: Placement; activo: boolean; elegir: (lotId: string) => void }) {
  const vencido = p.daysToExpiry <= 0;
  const destino = destinoDe(p);
  return (
    <li>
      <button
        type="button"
        className={`label tier-${p.tier}${activo ? " is-active" : ""}${vencido ? " is-expired" : ""}`}
        aria-pressed={activo}
        onClick={() => elegir(p.lotId)}
      >
        <span className="label-top">
          <span className="label-code">{p.lotId}</span>
          <span className="label-value">{pesos(p.valueAtRisk)}</span>
        </span>
        <span className="label-product">{p.productName}</span>
        <span className="label-expiry">
          Vto. {fechaCorta(p.expiry)}, {cuandoVence(p.daysToExpiry)}
        </span>
        {vencido ? (
          <span className="label-fate fate-vencido">
            <span className="box-tag box-danger">Vencido</span> se dispone como residuo
          </span>
        ) : (
          <span className={`label-fate fate-${destino}`}>{destinoTexto(p)}</span>
        )}
      </button>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* la ficha de un lote                                                        */
/* -------------------------------------------------------------------------- */

function Ficha({ p, data, hoy }: { p: Placement; data: Dataset; hoy: string }) {
  const product = data.products.find((pr) => pr.sku === p.sku)!;
  const lot = data.lots.find((l) => l.lotId === p.lotId)!;
  const tier = TIER[p.tier];
  const destino = destinoDe(p);
  const vencido = p.daysToExpiry <= 0;

  const mejor = p.candidates.find((c) => c.eligible) ?? p.candidates.find((c) => c.needsReview);
  let mensaje: string | null = null;
  let venta: number | null = null;
  if (mejor && destino !== "baja") {
    try {
      const { offer } = buildOffer(lot, mejor.accountId, data, hoy);
      mensaje = offerMessage(offer);
      venta = offer.money.lineTotal;
    } catch {
      mensaje = null;
    }
  }

  const posteo = destino === "nadie" && p.pricing ? commentaryFor(p, product.unit) : null;

  const costo = p.valueAtRisk;
  const liquidador = Math.round(product.unitCost * 0.2 * p.quantity);
  const escala = Math.max(costo, venta ?? 0);
  const ancho = (n: number) => `${(n / escala) * 100}%`;
  const maxCobertura = 1.5;

  return (
    <article className="ficha" aria-live="polite" aria-labelledby="ficha-titulo">
      <header className={`ficha-head tier-${p.tier}`}>
        <div className="ficha-id">
          <span className="ficha-code">{p.lotId}</span>
          <span className="ficha-qty">{cantidad(p.quantity, product.unit)}</span>
        </div>
        <h3 id="ficha-titulo">{p.productName}</h3>
        <p className="ficha-when">
          Vence el {fechaCorta(p.expiry)}, <strong>{cuandoVence(p.daysToExpiry)}</strong>. Está en el tramo{" "}
          <strong>{tier.nombre.toLowerCase()}</strong>, {tier.rango} de vida.
        </p>
        <p className="ficha-why">{vencido ? "Ya venció. Se da de baja y se dispone como residuo peligroso." : tier.porque}</p>
      </header>

      <div className="ficha-body">
        <div className="ficha-col">
          <h4>De los {pesos(costo)} que costó, cuánto vuelve</h4>
          <ul className="returns">
            <li className="ret-loss">
              <span className="ret-label">Si se vence en el depósito</span>
              <span className="ret-bar" aria-hidden="true">
                <span className="ret-cost" style={{ left: ancho(costo) }} />
              </span>
              <span className="ret-value">$0</span>
              <span className="ret-sub">se pierde el costo entero</span>
            </li>
            <li className="ret-liq">
              <span className="ret-label">Si se lo lleva un liquidador</span>
              <span className="ret-bar" aria-hidden="true">
                <span className="ret-fill" style={{ width: ancho(liquidador) }} />
                <span className="ret-cost" style={{ left: ancho(costo) }} />
              </span>
              <span className="ret-value">{pesos(liquidador)}</span>
              <span className="ret-sub">el 20% del costo</span>
            </li>
            <li className={venta ? "ret-win" : "ret-off"}>
              <span className="ret-label">Si OpFarma lo coloca</span>
              <span className="ret-bar" aria-hidden="true">
                {venta ? <span className="ret-fill" style={{ width: ancho(venta) }} /> : null}
                <span className="ret-cost" style={{ left: ancho(costo) }} />
              </span>
              <span className="ret-value">{venta ? pesos(venta) : "No se puede"}</span>
              <span className="ret-sub">
                {venta && p.pricing
                  ? `a ${pesos(p.pricing.offerPrice)} por ${product.unit}, ${Math.round(p.pricing.marginPct * 100)}% sobre el costo`
                  : destino === "baja"
                    ? "ya no se ofrece para uso clínico"
                    : "ninguna cuenta lo consume entero a tiempo"}
              </span>
            </li>
          </ul>
          <p className="fine">La línea punteada marca lo que costó el lote.</p>

          {p.pricing && destino !== "baja" ? (
            <p className="ficha-price">
              Precio de lista {pesos(p.pricing.listPrice)}. Con el descuento del tramo queda en {pesos(p.pricing.offerPrice)},{" "}
              {Math.round(p.pricing.discountPct * 100)}% menos.{" "}
              {p.pricing.floorBinding
                ? `El descuento del tramo era mayor, pero el motor lo frenó en el piso de ${pesos(p.pricing.floorPrice)}.`
                : `El piso es ${pesos(p.pricing.floorPrice)}, y nunca se ofrece por debajo.`}
            </p>
          ) : null}

          <h4>Quién lo consume a tiempo</h4>
          <ul className="accounts">
            {p.candidates.map((c) => {
              const llena = Math.min(c.coverage, maxCobertura) / maxCobertura;
              const estado = c.eligible ? "ok" : c.needsReview ? "review" : "out";
              return (
                <li key={c.accountId} className={estado}>
                  <div className="acc-top">
                    <span className="acc-name">{c.accountName}</span>
                    <span className="acc-verdict">
                      {c.eligible ? "Lo consume a tiempo" : c.needsReview ? "Lo decide una persona" : "Queda afuera"}
                    </span>
                  </div>
                  <div className="acc-bar" aria-hidden="true">
                    <span className="acc-fill" style={{ width: `${llena * 100}%` }} />
                    <span className="acc-mark" style={{ left: `${(1 / maxCobertura) * 100}%` }} />
                  </div>
                  <p className="acc-why">
                    {c.monthlyRate > 0 ? `Compra unos ${cantidad(Math.round(c.monthlyRate), product.unit)} por mes. ` : ""}
                    {c.disqualifiers.length === 0
                      ? `Antes del vencimiento llega a usar ${veces.format(c.coverage)} veces el lote.`
                      : c.disqualifiers.map((reason) => motivo(reason, c, p, product.unit)).join(". ") + "."}
                  </p>
                </li>
              );
            })}
          </ul>
          <p className="fine">La barra muestra cuánto del lote llega a usar cada cuenta antes de que venza. La raya marca el lote entero.</p>
        </div>

        <div className="ficha-col ficha-out">
          {mensaje && mejor ? (
            <>
              <h4>El WhatsApp que saldría</h4>
              <div className="phone">
                <div className="phone-head">
                  <span className="phone-avatar" aria-hidden="true">
                    O
                  </span>
                  <span>
                    OpFarma <span className="phone-to">a {mejor.accountName}</span>
                  </span>
                </div>
                <div className="bubble">
                  {mensaje.split("\n").map((line, i) => (line ? <p key={i}>{line}</p> : <br key={i} />))}
                </div>
              </div>
              <p className="fine">
                {mejor.needsReview
                  ? "Antes de ofrecerlo, una persona tiene que decidir si se le vende a una cuenta con deuda."
                  : "En Paperclip, una persona aprueba primero el margen y después este texto exacto. Recién ahí sale."}
              </p>
            </>
          ) : posteo ? (
            <>
              <h4>El posteo que saldría en LinkedIn</h4>
              <div className="post">
                <div className="post-head">
                  <span className="post-logo" aria-hidden="true">
                    O
                  </span>
                  <span>
                    OpFarma <span className="post-sub">Distribuidora de insumos médicos</span>
                  </span>
                </div>
                <div className="post-body">
                  {posteo.split("\n").map((line, i) => (line ? <p key={i}>{line}</p> : null))}
                </div>
              </div>
              <p className="fine">
                Ninguna cuenta actual lo consume entero, así que se ofrece a clínicas que todavía no son clientes. Lo arma
                GrowthScout y sale sólo si una persona lo aprueba en Paperclip. Qué falta para publicarlo de verdad está en{" "}
                <a href={DOC("docs/LINKEDIN.md")} target="_blank" rel="noopener noreferrer">
                  el paso a paso de LinkedIn
                </a>
                .
              </p>
            </>
          ) : (
            <>
              <h4>No sale ninguna oferta</h4>
              <p className="ficha-none">
                {destino === "baja"
                  ? "Con menos de un mes de vida no se ofrece para uso clínico. El agente lo deja anotado en la tarea para que una persona lo dé de baja."
                  : "Ninguna cuenta lo consume a tiempo y no hay un precio que respete el piso."}
              </p>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/* el depósito                                                                */
/* -------------------------------------------------------------------------- */

const MARCAS = [
  { dias: 0, texto: "Hoy" },
  { dias: 30, texto: "Un mes" },
  { dias: 60, texto: "Dos meses" },
  { dias: 90, texto: "Tres meses" },
  { dias: 120, texto: "Cuatro meses" },
];

export function Explorer({ asOf }: { asOf: string }) {
  const [dias, setDias] = useState(0);
  const [elegido, setElegido] = useState("L-4028");
  const ficha = useRef<HTMLDivElement>(null);

  const hoy = sumarDias(asOf, dias);
  const data = useMemo(() => datasetDentroDe(dias), [dias]);
  const placements = useMemo(() => scanInventory(data, hoy), [data, hoy]);

  const actual = placements.find((p) => p.lotId === elegido) ?? placements[0];

  const enRiesgo = placements.reduce((t, p) => t + p.valueAtRisk, 0);
  const colocables = placements.filter((p) => destinoDe(p) === "cuenta");
  const colocableValor = colocables.reduce((t, p) => t + p.valueAtRisk, 0);
  const perdidos = placements.filter((p) => p.tier === "retire");
  const perdidoValor = perdidos.reduce((t, p) => t + p.valueAtRisk, 0);

  const elegir = (lotId: string) => {
    setElegido(lotId);
    const el = ficha.current;
    if (!el) return;
    // Sólo se desplaza si la ficha quedó fuera de la vista.
    if (el.getBoundingClientRect().top > window.innerHeight - 160) {
      const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: quieto ? "auto" : "smooth", block: "start" });
    }
  };

  const { y, m, d } = parts(hoy);

  return (
    <section className="depot" id="deposito-seccion" aria-labelledby="deposito">
      <div className="depot-head">
        <div className="depot-intro">
          <h2 id="deposito">El depósito, lote por lote</h2>
          <p>
            Cada etiqueta es un lote, en el pasillo del tramo que le toca según cuánto le falta para vencer. Elegí una para
            ver cómo la decide el motor, o mové el reloj para ver qué pasa si nadie hace nada.
          </p>
        </div>
        <div className={`date-readout${dias > 0 ? " is-future" : ""}`} aria-hidden="true">
          <span className="date-readout-label">{dias === 0 ? "Fecha del inventario" : `Simulado, dentro de ${dias} días`}</span>
          <span className="date-readout-value">
            {d} de {MESES[m - 1]} de {y}
          </span>
        </div>
      </div>

      <div className="clock">
        <label htmlFor="reloj" className="sr-only">
          Adelantar el reloj
        </label>
        <input
          id="reloj"
          type="range"
          min={0}
          max={120}
          step={1}
          value={dias}
          onChange={(event) => setDias(Number(event.target.value))}
          aria-valuetext={dias === 0 ? `Hoy, ${fechaLarga(hoy)}` : `Dentro de ${dias} días, el ${fechaLarga(hoy)}`}
          style={{ ["--pos" as string]: `${(dias / 120) * 100}%` }}
        />
        <div className="clock-ticks">
          {MARCAS.map((marca) => (
            <button
              key={marca.dias}
              type="button"
              onClick={() => setDias(marca.dias)}
              className={marca.dias === dias ? "on" : ""}
              aria-label={marca.dias === 0 ? "Volver a hoy" : `Adelantar ${marca.texto.toLowerCase()}`}
            >
              {marca.texto}
            </button>
          ))}
        </div>
      </div>

      <p className="depot-summary" aria-live="polite">
        {dias === 0 ? "Hoy" : `Dentro de ${dias} días`} hay <strong>{pesos(enRiesgo)}</strong> en riesgo al costo.{" "}
        {colocables.length === 0 ? (
          <>Ya ningún lote tiene una cuenta que lo consuma a tiempo, y </>
        ) : (
          <>
            {lotes(colocables.length, true)} todavía {colocables.length === 1 ? "tiene" : "tienen"} una cuenta que{" "}
            {colocables.length === 1 ? "lo consume" : "los consume"} a tiempo, por <strong>{pesos(colocableValor)}</strong>, y{" "}
          </>
        )}
        <span className="lost">
          {lotes(perdidos.length)} ya no {perdidos.length === 1 ? "tiene" : "tienen"} arreglo
          {perdidos.length > 0 ? `, ${pesos(perdidoValor)}` : ""}
        </span>
        .
      </p>

      <div className="shelf">
        {PASILLOS.map((tier) => {
          const enPasillo = placements.filter((p) => p.tier === tier);
          return (
            <div key={tier} className={`aisle tier-${tier}`}>
              <h3 className="aisle-head">
                {TIER[tier].nombre} <span>{TIER[tier].rango}</span>
              </h3>
              {enPasillo.length > 0 ? (
                <ul className="aisle-lots">
                  {enPasillo.map((p) => (
                    <Etiqueta key={p.lotId} p={p} activo={p.lotId === actual?.lotId} elegir={elegir} />
                  ))}
                </ul>
              ) : (
                <p className="aisle-empty">Ningún lote</p>
              )}
            </div>
          );
        })}
      </div>
      <p className="fine">
        La simulación supone que cada cuenta sigue comprando al mismo ritmo. Lo único que cambia es el tiempo que le
        queda a cada lote.
      </p>

      <div ref={ficha} className="ficha-anchor">
        {actual ? <Ficha p={actual} data={data} hoy={hoy} /> : null}
      </div>

      <p className="fine">
        Datos de ejemplo. El inventario y las compras son un dataset armado para la demo, no un sistema de gestión real.
        El cálculo es el mismo que usan los agentes cuando trabajan en Paperclip.
      </p>
      <Documentos
        items={[
          { path: "research/EXPIRY.md", titulo: "Cómo decide el motor", detalle: "Los tramos, los descuentos y el piso de precio" },
          { path: "platform/lib/expiry/engine.ts", titulo: "El motor, en código", detalle: "El mismo cálculo que usan los agentes" },
          { path: "platform/data/seed.json", titulo: "Los datos de ejemplo", detalle: "Inventario, cuentas y compras" },
        ]}
      />
    </section>
  );
}
