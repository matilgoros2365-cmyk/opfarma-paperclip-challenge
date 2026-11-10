/**
 * El texto del posteo de LinkedIn, sin nada de servidor.
 *
 * Vive aparte de social.ts para que la plataforma lo muestre en el navegador
 * tal cual lo arma GrowthScout, sin traer el hash de los borradores, que usa
 * node:crypto.
 */
import type { Placement } from "./expiry/engine";
import { cantidad, fecha, pesos } from "./expiry/format";

function meses(daysToExpiry: number): string {
  const n = Math.max(1, Math.floor((daysToExpiry - 30) / 30));
  return n === 1 ? "30 días" : `${n} meses`;
}

function minuscula(nombre: string): string {
  return nombre.charAt(0).toLowerCase() + nombre.slice(1);
}

export function commentaryFor(p: Placement, unit: string): string {
  const pricing = p.pricing!;
  const pct = Math.round(pricing.discountPct * 100);
  return [
    `¿En tu servicio usan ${minuscula(p.productName)}? Tenemos un lote que te puede servir.`,
    "",
    `Son ${cantidad(p.quantity, unit)} (${p.sku}) con vencimiento el ${fecha(p.expiry)}. Los ofrecemos con ${pct}% de descuento, a ${pesos(pricing.offerPrice)} por ${unit} en lugar de ${pesos(pricing.listPrice)}.`,
    "",
    `Le conviene a un servicio que pueda usar el lote completo en los próximos ${meses(p.daysToExpiry)}. Así se aprovecha a tiempo y un insumo en buen estado no termina descartado.`,
    "",
    "Si te interesa, escribinos por mensaje privado y lo coordinamos.",
    "",
    "#InsumosMédicos #ComprasHospitalarias #Clínicas",
  ].join("\n");
}
