/**
 * El dataset sembrado y la fecha contra la que se calcula todo.
 *
 * Lo comparten el servidor MCP de inventario y el dashboard, así los dos ven
 * exactamente el mismo escenario. La fecha queda anclada al asOf del seed para
 * que la demo sea reproducible: INVENTORY_AS_OF la pisa, y "today" usa el reloj.
 */
import seed from "@/data/seed.json";

import type { Dataset } from "./engine";

export const dataset = seed as unknown as Dataset;

export function asOfDate(env: Record<string, string | undefined> = process.env): string {
  const override = env.INVENTORY_AS_OF?.trim();
  if (override === "today") return new Date().toISOString().slice(0, 10);
  if (override) return override;
  return seed.asOf;
}
