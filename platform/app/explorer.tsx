"use client";

/**
 * El explorador de lotes. Corre el mismo motor que usan los agentes, en el
 * navegador, sobre el mismo dataset: no puede contradecir lo que hace
 * StockScout en Paperclip.
 *
 * La barra de tiempo adelanta el reloj. Para que la simulación sea honesta,
 * cada cuenta sigue comprando al mismo ritmo (las compras se corren igual que
 * el reloj); lo único que cambia es cuánto le falta a cada lote para vencer.
 */
import { useMemo, useState, type KeyboardEvent } from "react";

import seed from "@/data/seed.json";
import { scanInventory, type Candidate, type Dataset, type Disqualifier, type Placement, type Tier } from "@/lib/expiry/engine";
import { cantidad, pesos } from "@/lib/expiry/format";
import { buildOffer, offerMessage } from "@/lib/expiry/offer";

const base = seed as unknown as Dataset;
const veces = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

/* -------------------------------------------------------------------------- */
/* fechas                                                                     */
/* -------------------------------------------------------------------------- */

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

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

const TIER: Record<Tier, { nombre: string; clase: string; color: string; porque: string }> = {
  healthy: { nombre: "Sano", clase: "", color: "var(--muted)", porque: "Más de nueve meses de vida. Se vende a precio de lista." },
  place: {
    nombre: "Colocar",
    clase: "tier-place",
    color: "var(--tier-place)",
    porque:
      "Entre seis y nueve meses. Es la última ventana para colocarlo casi sin tocar el margen, antes de cruzar los seis meses que el mercado ya trata como invendible.",
  },
  discount: {
    nombre: "Descuento",
    clase: "tier-discount",
    color: "var(--tier-discount)",
    porque:
      "Entre tres y seis meses. Ya pasó la línea en la que una distribuidora lo valúa en cero, así que un descuento real sale más barato que darlo de baja.",
  },
  salvage: {
    nombre: "Rescate",
    clase: "tier-salvage",
    color: "var(--tier-salvage)",
    porque:
      "Entre uno y tres meses. Es lo que el mercado secundario llama vencimiento corto, y cualquier oferta se compara con lo que pagaría un liquidador.",
  },
  retire: {
    nombre: "Baja",
    clase: "tier-retire",
    color: "var(--tier-retire)",
    porque:
      "Menos de un mes. No se ofrece para uso clínico, porque colocarlo le pasaría la pérdida a una clínica y dejaría producto por vencer en una estantería de atención.",
  },
};

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

function cuandoVence(dias: number): string {
  if (dias > 0) return `en ${dias} ${dias === 1 ? "día" : "días"}`;
  if (dias === 0) return "hoy";
  return `vencido hace ${-dias} ${dias === -1 ? "día" : "días"}`;
}

/* -------------------------------------------------------------------------- */
/* línea de vencimientos                                                      */
/* -------------------------------------------------------------------------- */

const HORIZON = 270;
const BANDS: { tier: Tier; desde: number; hasta: number }[] = [
  { tier: "retire", desde: 0, hasta: 30 },
  { tier: "salvage", desde: 30, hasta: 90 },
  { tier: "discount", desde: 90, hasta: 180 },
  { tier: "place", desde: 180, hasta: HORIZON },
];

function Linea({
  placements,
  hoy,
  elegido,
  elegir,
}: {
  placements: Placement[];
  hoy: string;
  elegido: string;
  elegir: (lotId: string) => void;
}) {
  const left = 24;
  const right = 976;
  const x = (dias: number) => left + (Math.min(Math.max(dias, 0), HORIZON) / HORIZON) * (right - left);
  const top = 44;
  const laneGap = 54;
  const axisY = 236;

  const maxValue = Math.max(...base.lots.map((lot) => {
    const product = base.products.find((pr) => pr.sku === lot.sku);
    return (product?.unitCost ?? 0) * lot.quantity;
  }));
  const radius = (value: number) => 7 + Math.sqrt(value / maxValue) * 13;

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

  const axis = Math.max(axisY, top + 34 + (laneEnds.length - 1) * laneGap + 40);
  const height = axis + 50;

  const onKey = (event: KeyboardEvent, lotId: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      elegir(lotId);
    }
  };

  return (
    <div className="timeline-scroll">
      <svg viewBox={`0 0 1000 ${height}`} role="group" aria-label="Cuándo vence cada lote. Elegí uno para ver cómo lo decide el motor.">
        {BANDS.map((band) => (
          <g key={band.tier}>
            <rect
              x={x(band.desde)}
              y={top}
              width={x(band.hasta) - x(band.desde)}
              height={axis - top}
              style={{ fill: TIER[band.tier].color, opacity: 0.07 }}
            />
            <text x={x(band.desde) + 8} y={top - 14} style={{ fill: TIER[band.tier].color, fontSize: 15, fontWeight: 700 }}>
              {TIER[band.tier].nombre}
            </text>
          </g>
        ))}

        <line x1={left} x2={right} y1={axis} y2={axis} style={{ stroke: "var(--ink)", strokeWidth: 1.5 }} />
        {[0, 30, 90, 180, HORIZON].map((dias) => {
          const anchor = dias === 0 ? "start" : dias === HORIZON ? "end" : "middle";
          const { d, m } = parts(sumarDias(hoy, dias));
          return (
            <g key={dias}>
              <line x1={x(dias)} x2={x(dias)} y1={top} y2={axis + 6} style={{ stroke: "var(--rule)", strokeWidth: 1 }} />
              <text x={x(dias)} y={axis + 24} textAnchor={anchor} style={{ fill: "var(--ink-soft)", fontSize: 14 }}>
                {dias === 0 ? "Hoy" : `${dias} días`}
              </text>
              <text x={x(dias)} y={axis + 42} textAnchor={anchor} style={{ fill: "var(--muted)", fontSize: 13 }}>
                {`${d} ${MESES_CORTOS[m - 1]}`}
              </text>
            </g>
          );
        })}

        {marks.map(({ p, cx, cy, r, destino }) => {
          const color = TIER[p.tier].color;
          const hollow = destino === "nadie";
          const activo = p.lotId === elegido;
          const vencido = p.daysToExpiry <= 0;
          return (
            <g
              key={p.lotId}
              className={`mark${activo ? " active" : ""}`}
              role="button"
              tabIndex={0}
              aria-pressed={activo}
              aria-label={`${p.lotId}, ${p.productName}, vence ${cuandoVence(p.daysToExpiry)}, ${pesos(p.valueAtRisk)} en riesgo`}
              onClick={() => elegir(p.lotId)}
              onKeyDown={(event) => onKey(event, p.lotId)}
            >
              <line x1={cx} x2={cx} y1={cy + r} y2={axis} style={{ stroke: color, strokeWidth: 1, opacity: 0.5 }} />
              {activo ? <circle cx={cx} cy={cy} r={r + 6} className="halo" style={{ stroke: color }} /> : null}
              <circle
                cx={cx}
                cy={cy}
                r={r}
                style={{
                  fill: hollow || vencido ? "var(--surface)" : color,
                  stroke: color,
                  strokeWidth: hollow || vencido ? 2.5 : 0,
                  strokeDasharray: vencido ? "3 3" : undefined,
                  opacity: hollow ? 1 : 0.9,
                }}
              />
              <rect x={cx - r - 4} y={cy - r - 4} width={r * 2 + 100} height={r * 2 + 8} style={{ fill: "transparent" }} />
              <text x={cx + r + 6} y={cy - 2} style={{ fill: "var(--ink)", fontSize: 15, fontWeight: 700 }}>
                {p.lotId}
              </text>
              <text x={cx + r + 6} y={cy + 15} style={{ fill: vencido ? "var(--tier-retire)" : "var(--muted)", fontSize: 13 }}>
                {vencido ? "vencido" : pesos(p.valueAtRisk)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* el detalle de un lote                                                      */
/* -------------------------------------------------------------------------- */

function Detalle({ p, data, hoy }: { p: Placement; data: Dataset; hoy: string }) {
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

  const liquidador = Math.round(product.unitCost * 0.2 * p.quantity);
  const maxCobertura = 1.5;

  return (
    <div className="detail" aria-live="polite">
      <header className="detail-head">
        <div>
          <p className="detail-kicker">
            <code>{p.lotId}</code> · {cantidad(p.quantity, product.unit)}
          </p>
          <h3>{p.productName}</h3>
          <p className="detail-when">
            Vence el {fechaCorta(p.expiry)}, <strong>{cuandoVence(p.daysToExpiry)}</strong>
          </p>
        </div>
        <span className={`tier ${tier.clase}`}>{vencido ? "Vencido" : tier.nombre}</span>
      </header>

      <p className="detail-why">{vencido ? "Ya venció. Se da de baja y se dispone como residuo peligroso." : tier.porque}</p>

      <div className="money">
        <div className="money-cell loss-cell">
          <span className="money-label">Si se vence en el depósito</span>
          <span className="money-value">−{pesos(p.valueAtRisk)}</span>
          <span className="money-sub">se pierde el costo entero</span>
        </div>
        <div className="money-cell">
          <span className="money-label">Si se lo lleva un liquidador</span>
          <span className="money-value">{pesos(liquidador)}</span>
          <span className="money-sub">recupera el 20% del costo</span>
        </div>
        <div className={`money-cell${venta ? " win-cell" : " off-cell"}`}>
          <span className="money-label">Si OpFarma lo coloca</span>
          <span className="money-value">{venta ? pesos(venta) : "No se puede"}</span>
          <span className="money-sub">
            {venta && p.pricing
              ? `a ${pesos(p.pricing.offerPrice)} por ${product.unit}, ${Math.round(p.pricing.marginPct * 100)}% sobre el costo`
              : destino === "baja"
                ? "ya no se ofrece para uso clínico"
                : "ninguna cuenta lo consume entero a tiempo"}
          </span>
        </div>
      </div>

      {p.pricing && destino !== "baja" ? (
        <p className="detail-price">
          Precio de lista {pesos(p.pricing.listPrice)}. Con el descuento del tramo queda en {pesos(p.pricing.offerPrice)},{" "}
          {Math.round(p.pricing.discountPct * 100)}% menos.{" "}
          {p.pricing.floorBinding
            ? `El descuento del tramo era mayor, pero el motor lo frenó en el piso de ${pesos(p.pricing.floorPrice)}.`
            : `El piso es ${pesos(p.pricing.floorPrice)}, y nunca se ofrece por debajo.`}
        </p>
      ) : null}

      <h4 className="detail-sub">Quién lo consume a tiempo</h4>
      <ul className="accounts">
        {p.candidates.map((c) => {
          const ancho = Math.min(c.coverage, maxCobertura) / maxCobertura;
          const ok = c.eligible;
          const revision = c.needsReview;
          return (
            <li key={c.accountId} className={ok ? "ok" : revision ? "review" : "out"}>
              <div className="acc-top">
                <span className="acc-name">{c.accountName}</span>
                <span className="acc-verdict">{ok ? "Lo consume a tiempo" : revision ? "Lo decide una persona" : "Queda afuera"}</span>
              </div>
              <div className="acc-bar" aria-hidden="true">
                <span className="acc-fill" style={{ width: `${ancho * 100}%` }} />
                <span className="acc-mark" style={{ left: `${(1 / maxCobertura) * 100}%` }} />
              </div>
              <p className="acc-why">
                {c.monthlyRate > 0
                  ? `Compra unos ${cantidad(Math.round(c.monthlyRate), product.unit)} por mes. `
                  : ""}
                {c.disqualifiers.length === 0
                  ? `Antes del vencimiento llega a usar ${veces.format(c.coverage)} veces el lote.`
                  : c.disqualifiers.map((reason) => motivo(reason, c, p, product.unit)).join(". ") + "."}
              </p>
            </li>
          );
        })}
      </ul>
      <p className="fine">La barra muestra cuánto del lote llega a usar cada cuenta antes de que venza. La línea marca el lote entero.</p>

      {mensaje && mejor ? (
        <>
          <h4 className="detail-sub">El mensaje que saldría, con dos aprobaciones</h4>
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
              : "En Paperclip, una persona aprueba primero el margen y después este texto exacto. Recién ahí sale por WhatsApp."}
          </p>
        </>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* el explorador                                                              */
/* -------------------------------------------------------------------------- */

const MARCAS = [
  { dias: 0, texto: "Hoy" },
  { dias: 30, texto: "En un mes" },
  { dias: 60, texto: "En dos meses" },
  { dias: 90, texto: "En tres meses" },
  { dias: 120, texto: "En cuatro meses" },
];

export function Explorer({ asOf }: { asOf: string }) {
  const [dias, setDias] = useState(0);
  const [elegido, setElegido] = useState("L-4028");

  const hoy = sumarDias(asOf, dias);
  const data = useMemo(() => datasetDentroDe(dias), [dias]);
  const placements = useMemo(() => scanInventory(data, hoy), [data, hoy]);

  const actual = placements.find((p) => p.lotId === elegido) ?? placements[0];

  const enRiesgo = placements.reduce((t, p) => t + p.valueAtRisk, 0);
  const colocables = placements.filter((p) => destinoDe(p) === "cuenta");
  const colocableValor = colocables.reduce((t, p) => t + p.valueAtRisk, 0);
  const perdidos = placements.filter((p) => p.tier === "retire");
  const perdidoValor = perdidos.reduce((t, p) => t + p.valueAtRisk, 0);

  return (
    <section className="section explorer" aria-labelledby="explorador">
      <h2 id="explorador">Lote por lote</h2>
      <p className="lede">
        Elegí un lote en la línea o en la tabla para ver cómo lo decide el motor. Para cada uno mira cuánto compró cada
        cuenta en los últimos 180 días, calcula cuánto llega a usar antes del vencimiento con un mes de margen, y le pone
        un precio que nunca baja del piso.
      </p>

      <div className="clock">
        <label htmlFor="reloj" className="clock-label">
          ¿Y si nadie hace nada?{" "}
          <span className="clock-date">
            {dias === 0 ? `Hoy, ${fechaLarga(hoy)}` : `Dentro de ${dias} días, el ${fechaLarga(hoy)}`}
          </span>
        </label>
        <input
          id="reloj"
          type="range"
          min={0}
          max={120}
          step={1}
          value={dias}
          onChange={(event) => setDias(Number(event.target.value))}
          list="reloj-marcas"
          aria-valuetext={dias === 0 ? "Hoy" : `Dentro de ${dias} días`}
        />
        <datalist id="reloj-marcas">
          {MARCAS.map((m) => (
            <option key={m.dias} value={m.dias} label={m.texto} />
          ))}
        </datalist>
        <div className="clock-ticks" aria-hidden="true">
          {MARCAS.map((m) => (
            <button key={m.dias} type="button" tabIndex={-1} onClick={() => setDias(m.dias)} className={m.dias === dias ? "on" : ""}>
              {m.texto}
            </button>
          ))}
        </div>
        <dl className="clock-stats">
          <div>
            <dt>En riesgo</dt>
            <dd>{pesos(enRiesgo)}</dd>
          </div>
          <div>
            <dt>Se pueden colocar</dt>
            <dd>
              {colocables.length} {colocables.length === 1 ? "lote" : "lotes"}, {pesos(colocableValor)}
            </dd>
          </div>
          <div className="lost">
            <dt>Ya no tienen arreglo</dt>
            <dd>
              {perdidos.length} {perdidos.length === 1 ? "lote" : "lotes"}, {pesos(perdidoValor)}
            </dd>
          </div>
        </dl>
        <p className="fine">
          La simulación supone que cada cuenta sigue comprando al mismo ritmo. Lo único que cambia es el tiempo que le
          queda a cada lote.
        </p>
      </div>

      <Linea placements={placements} hoy={hoy} elegido={actual?.lotId ?? ""} elegir={setElegido} />
      <ul className="timeline-legend">
        <li>
          <span className="dot solid" /> Hay una cuenta que lo consume antes de que venza
        </li>
        <li>
          <span className="dot hollow" /> Ninguna cuenta lo consume entero a tiempo
        </li>
        <li>El tamaño es la plata que se pierde si se vence en el depósito</li>
      </ul>

      <div className="explore">
        <div className="table-scroll">
          <table className="lots pick">
            <thead>
              <tr>
                <th scope="col">Lote</th>
                <th scope="col">Vence</th>
                <th scope="col" className="num">
                  En riesgo
                </th>
              </tr>
            </thead>
            <tbody>
              {placements.map((p) => {
                const activo = p.lotId === actual?.lotId;
                const vencido = p.daysToExpiry <= 0;
                return (
                  <tr key={p.lotId} className={activo ? "active" : ""} onClick={() => setElegido(p.lotId)}>
                    <td className="lot">
                      <button type="button" aria-pressed={activo} onClick={() => setElegido(p.lotId)}>
                        <code>{p.lotId}</code>
                      </button>
                      <span className="sub">{p.productName}</span>
                    </td>
                    <td>
                      <span className={`tier ${TIER[p.tier].clase}`}>{vencido ? "Vencido" : TIER[p.tier].nombre}</span>
                      <span className="sub">
                        {fechaCorta(p.expiry)}, {cuandoVence(p.daysToExpiry)}
                      </span>
                    </td>
                    <td className="num">{pesos(p.valueAtRisk)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {actual ? <Detalle p={actual} data={data} hoy={hoy} /> : null}
      </div>

      <p className="fine">
        Datos de ejemplo. El inventario y las compras son un dataset armado para la demo, no un sistema de gestión real.
        El cálculo es el mismo que usan los agentes cuando trabajan en Paperclip.
      </p>
    </section>
  );
}
