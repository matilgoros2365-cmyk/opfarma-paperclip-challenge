/**
 * Cómo se escriben los datos de una oferta para que los lea una persona en
 * Argentina: montos con punto de miles, fechas día/mes/año y cantidades en
 * plural. Lo usan el mensaje de texto y las plantillas, así se leen igual.
 */
const numero = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

/** 151200 → "$151.200". */
export function pesos(amount: number): string {
  return `$${numero.format(amount)}`;
}

/** "2027-01-22" → "22/01/2027". */
export function fecha(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** "sobre" → "sobres", "caja x100" → "cajas x100". Alcanza para las unidades del catálogo. */
export function plural(unit: string): string {
  const [first, ...rest] = unit.split(" ");
  return [`${first}s`, ...rest].join(" ");
}

/** 120 y "sobre" → "120 sobres"; 1 y "sobre" → "1 sobre". */
export function cantidad(quantity: number, unit: string): string {
  return `${quantity} ${quantity === 1 ? unit : plural(unit)}`;
}
