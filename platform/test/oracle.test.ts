/**
 * Verificación independiente del motor.
 *
 * Este archivo no importa ninguna función de cálculo del motor. Rehace todas
 * las cuentas desde la especificación escrita (research/EXPIRY.md y
 * DECISIONS.md), con otro método para las fechas, y las compara con lo que
 * devuelve el motor para cada combinación de lote y cuenta del dataset.
 *
 * Si alguien cambia una regla del motor sin cambiar la especificación, o al
 * revés, esto falla. También fija los números que citan los documentos y la
 * página, para que no queden desactualizados en silencio.
 */
import { describe, expect, it } from "vitest";

import seed from "@/data/seed.json";
import { placeLot, scanInventory, tierFor, type Dataset } from "@/lib/expiry/engine";

const dataset = seed as unknown as Dataset;
const AS_OF = seed.asOf;

/* ---------------------------------------------------- especificación, a mano */

// Días entre dos fechas contando día por día, sin restar timestamps.
function diasEntre(desde: string, hasta: string): number {
  const d = new Date(`${desde}T12:00:00Z`);
  const fin = new Date(`${hasta}T12:00:00Z`);
  let n = 0;
  const paso = d <= fin ? 1 : -1;
  while (d.toISOString().slice(0, 10) !== fin.toISOString().slice(0, 10)) {
    d.setUTCDate(d.getUTCDate() + paso);
    n += paso;
  }
  return n;
}

// Tramos: colocar 181–270, descuento 91–180, rescate 31–90, baja 30 o menos.
function tramo(dias: number): { nombre: string; descuento: number } {
  if (dias >= 271) return { nombre: "healthy", descuento: 0 };
  if (dias >= 181) return { nombre: "place", descuento: 0.08 };
  if (dias >= 91) return { nombre: "discount", descuento: 0.2 };
  if (dias >= 31) return { nombre: "salvage", descuento: 0.45 };
  return { nombre: "retire", descuento: 0 };
}

const VENTANA = 180; // días de historial
const RESGUARDO = 30; // días que no se le dejan al cliente
const MARGEN_MINIMO = 0.05;
const RESCATE = 0.2; // lo que pagaría un liquidador, sobre el costo

function especificacion(lotId: string, accountId: string) {
  const lote = dataset.lots.find((l) => l.lotId === lotId)!;
  const producto = dataset.products.find((p) => p.sku === lote.sku)!;
  const cuenta = dataset.accounts.find((a) => a.id === accountId)!;

  const dias = diasEntre(AS_OF, lote.expiry);
  const t = tramo(dias);

  let comprado = 0;
  for (const compra of dataset.purchases) {
    if (compra.accountId !== accountId || compra.sku !== lote.sku) continue;
    const antiguedad = diasEntre(compra.date, AS_OF);
    if (antiguedad >= 0 && antiguedad <= VENTANA) comprado += compra.quantity;
  }
  const porMes = comprado / (VENTANA / 30);
  const capacidad = (porMes / 30) * Math.max(0, dias - RESGUARDO);

  const familia = dataset.families[lote.sku];
  const motivos: string[] = [];
  if (porMes === 0) motivos.push("no_history");
  if (capacidad < lote.quantity) motivos.push("cannot_absorb");
  if (familia && !cuenta.families.includes(familia)) motivos.push("family_mismatch");
  if (cuenta.creditStatus === "blocked") motivos.push("credit_blocked");
  if (cuenta.creditStatus === "debt") motivos.push("credit_debt");

  const piso = Math.max(producto.unitCost * (1 + MARGEN_MINIMO), producto.unitCost * RESCATE);
  const precio = Math.max(producto.listPrice * (1 - t.descuento), piso);

  return {
    dias,
    tramo: t.nombre,
    porMes,
    capacidad,
    cobertura: capacidad / lote.quantity,
    motivos,
    elegible: motivos.length === 0,
    precio,
    enRiesgo: producto.unitCost * lote.quantity,
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/* ------------------------------------------------------------- comparación */

describe("el motor coincide con la especificación, lote por lote y cuenta por cuenta", () => {
  for (const lote of dataset.lots) {
    for (const cuenta of dataset.accounts) {
      it(`${lote.lotId} × ${cuenta.id}`, () => {
        const esperado = especificacion(lote.lotId, cuenta.id);
        const placement = placeLot(lote, dataset, AS_OF);
        const candidato = placement.candidates.find((c) => c.accountId === cuenta.id)!;

        expect(placement.daysToExpiry).toBe(esperado.dias);
        expect(placement.tier).toBe(esperado.tramo);
        expect(placement.valueAtRisk).toBe(r2(esperado.enRiesgo));
        expect(candidato.monthlyRate).toBe(r2(esperado.porMes));
        expect(candidato.capacity).toBe(r2(esperado.capacidad));
        expect(candidato.coverage).toBe(r2(esperado.cobertura));
        expect([...candidato.disqualifiers].sort()).toEqual([...esperado.motivos].sort());
        expect(candidato.eligible).toBe(esperado.elegible);

        if (placement.pricing) {
          expect(placement.pricing.offerPrice).toBe(r2(esperado.precio));
        }
      });
    }
  }
});

describe("los bordes de los tramos, día por día", () => {
  // El dataset no tiene lotes justo en 30, 90, 180 o 270 días, así que sin
  // esto un borde corrido en un día pasaría inadvertido.
  it("de 0 a 400 días, el tramo y el descuento coinciden con la especificación", () => {
    for (let dias = 0; dias <= 400; dias++) {
      const regla = tierFor(dias);
      const esperado = tramo(dias);
      expect({ dias, tramo: regla.tier, descuento: regla.maxDiscount }).toEqual({
        dias,
        tramo: esperado.nombre,
        descuento: esperado.descuento,
      });
    }
  });
});

describe("los números que citan los documentos y la página", () => {
  const scan = scanInventory(dataset, AS_OF);
  const conDestino = scan.filter((p) => p.tier !== "retire" && p.candidates[0]?.eligible);

  it("7 lotes necesitan una decisión", () => {
    expect(scan).toHaveLength(7);
  });

  it("$3.004.000 en riesgo al costo", () => {
    expect(scan.reduce((total, p) => total + p.valueAtRisk, 0)).toBe(3_004_000);
  });

  it("5 lotes colocables, por $1.888.000", () => {
    expect(conDestino).toHaveLength(5);
    expect(conDestino.reduce((total, p) => total + p.valueAtRisk, 0)).toBe(1_888_000);
  });

  it("L-7703 se da de baja y representa $756.000", () => {
    const baja = scan.filter((p) => p.tier === "retire");
    expect(baja.map((p) => p.lotId)).toEqual(["L-7703"]);
    expect(baja[0]!.valueAtRisk).toBe(756_000);
  });

  it("L-4028 a Sanatorio del Parque: $1.260 por sobre, frenado en el piso", () => {
    const p = scan.find((x) => x.lotId === "L-4028")!;
    expect(p.candidates[0]!.accountId).toBe("ACC-PARQUE");
    expect(p.pricing!.offerPrice).toBe(1260);
    expect(p.pricing!.floorBinding).toBe(true);
  });

  it("L-6612 no tiene ninguna cuenta que lo absorba entero", () => {
    const p = scan.find((x) => x.lotId === "L-6612")!;
    expect(p.candidates.some((c) => c.eligible)).toBe(false);
  });
});
