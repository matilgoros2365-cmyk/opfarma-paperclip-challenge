/**
 * Generates platform/data/seed.json deterministically.
 *
 * This is a SEEDED dataset, not real company data, and it is labelled as such
 * everywhere it surfaces. It exists so the placement engine can be exercised
 * end to end without a real ERP: a distributor's lot/expiry data is exactly
 * what no public API exposes.
 *
 * The numbers are chosen so the demo contains every case that matters,
 * including the ones where the engine refuses to produce an offer.
 *
 * Run: node scripts/make-seed.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, "../data/seed.json");

/** The date the whole scenario is anchored to. */
const AS_OF = "2026-11-08";

const products = [
  { sku: "SUT-3010", name: "Sutura de nylon 3-0", unit: "sobre", unitCost: 1200, listPrice: 2100, coldChain: false },
  { sku: "GUA-NIT-M", name: "Guantes de nitrilo talle M", unit: "caja x100", unitCost: 9500, listPrice: 14900, coldChain: false },
  { sku: "JER-10ML", name: "Jeringa 10 ml luer lock", unit: "caja x100", unitCost: 7800, listPrice: 12500, coldChain: false },
  { sku: "REA-GLU", name: "Reactivo glucosa oxidasa", unit: "kit", unitCost: 42000, listPrice: 68000, coldChain: true },
  { sku: "ANT-IOD", name: "Iodopovidona solucion 500 ml", unit: "frasco", unitCost: 3100, listPrice: 5200, coldChain: false },
  { sku: "ELE-ECG", name: "Electrodos ECG adulto", unit: "bolsa x50", unitCost: 5400, listPrice: 8900, coldChain: false },
];

const families = {
  "SUT-3010": "suturas",
  "GUA-NIT-M": "proteccion",
  "JER-10ML": "inyectables",
  "REA-GLU": "laboratorio",
  "ANT-IOD": "antisepticos",
  "ELE-ECG": "cardiologia",
};

const accounts = [
  {
    id: "ACC-PARQUE",
    name: "Sanatorio del Parque",
    kind: "sanatorio",
    whatsapp: "5491100000001",
    creditStatus: "ok",
    families: ["suturas", "proteccion", "inyectables", "cardiologia"],
  },
  {
    id: "ACC-SANJORGE",
    name: "Clinica San Jorge",
    kind: "clinica",
    whatsapp: "5491100000002",
    creditStatus: "ok",
    families: ["suturas", "proteccion", "inyectables"],
  },
  {
    id: "ACC-LABCENTRO",
    name: "Laboratorio Centro",
    kind: "laboratorio",
    whatsapp: "5491100000003",
    creditStatus: "ok",
    families: ["laboratorio", "proteccion"],
  },
  {
    id: "ACC-TILOS",
    name: "Residencia Los Tilos",
    kind: "geriatrico",
    whatsapp: "5491100000004",
    // Has an open balance: a human decides, the engine does not rule it out.
    creditStatus: "debt",
    families: ["proteccion", "antisepticos", "inyectables"],
  },
  {
    id: "ACC-NORTE",
    name: "Policlinico Norte",
    kind: "policlinico",
    whatsapp: "5491100000005",
    // Administratively blocked: a hard stop.
    creditStatus: "blocked",
    families: ["suturas", "proteccion", "antisepticos", "cardiologia"],
  },
  {
    id: "ACC-BELGRANO",
    name: "Centro Odontologico Belgrano",
    kind: "consultorio",
    whatsapp: "5491100000006",
    creditStatus: "ok",
    families: ["antisepticos", "proteccion"],
  },
];

/**
 * Monthly consumption we want each account to show, per sku. The generator
 * turns these into six monthly purchases inside the 180-day lookback, so the
 * engine derives the rate from history instead of being told it.
 */
const monthlyRates = {
  "ACC-PARQUE": { "SUT-3010": 90, "GUA-NIT-M": 14, "ELE-ECG": 25, "JER-10ML": 20 },
  "ACC-SANJORGE": { "SUT-3010": 50, "GUA-NIT-M": 8 },
  "ACC-LABCENTRO": { "REA-GLU": 4, "GUA-NIT-M": 6 },
  "ACC-TILOS": { "GUA-NIT-M": 12, "ANT-IOD": 15 },
  "ACC-NORTE": { "SUT-3010": 60, "ANT-IOD": 20 },
  "ACC-BELGRANO": { "ANT-IOD": 40, "GUA-NIT-M": 5 },
};

/** Six monthly order dates, all inside 180 days of AS_OF. */
const orderDates = [
  "2026-05-20",
  "2026-06-20",
  "2026-07-20",
  "2026-08-20",
  "2026-09-20",
  "2026-10-20",
];

const purchases = [];
for (const [accountId, perSku] of Object.entries(monthlyRates)) {
  for (const [sku, rate] of Object.entries(perSku)) {
    for (const date of orderDates) {
      purchases.push({ accountId, sku, quantity: rate, date });
    }
  }
}

/**
 * Lots, chosen to cover every tier and every interesting failure:
 *
 * L-4028  75d  salvage   the headline case: one account absorbs it, one cannot
 * L-5511 153d  discount  best absorber is the account with an open balance
 * L-6612  98d  discount  NOBODY can absorb it - the honest "liquidate" case
 * L-8890 114d  discount  clean single match
 * L-3345 193d  place     cold chain, small lot, comfortable match
 * L-2201 222d  place     large lot, matched by a small but steady consumer
 * L-7703  27d  retire    engine refuses to offer it at all
 * L-9001 450d  healthy   filtered out of the scan entirely
 */
const lots = [
  { lotId: "L-4028", sku: "SUT-3010", quantity: 120, expiry: "2027-01-22" },
  { lotId: "L-5511", sku: "GUA-NIT-M", quantity: 40, expiry: "2027-04-10" },
  { lotId: "L-6612", sku: "SUT-3010", quantity: 300, expiry: "2027-02-14" },
  { lotId: "L-8890", sku: "ELE-ECG", quantity: 60, expiry: "2027-03-02" },
  { lotId: "L-3345", sku: "REA-GLU", quantity: 10, expiry: "2027-05-20" },
  { lotId: "L-2201", sku: "ANT-IOD", quantity: 200, expiry: "2027-06-18" },
  { lotId: "L-7703", sku: "REA-GLU", quantity: 18, expiry: "2026-12-05" },
  { lotId: "L-9001", sku: "JER-10ML", quantity: 30, expiry: "2028-02-01" },
];

const dataset = {
  _note:
    "SEEDED DATA - not a real company. Generated by scripts/make-seed.mjs. Lot and expiry data is what no public API exposes, so the scenario is seeded and labelled.",
  asOf: AS_OF,
  products,
  families,
  accounts,
  purchases,
  lots,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");

console.log(`seed written: ${OUT}`);
console.log(
  `  ${products.length} products, ${accounts.length} accounts, ${lots.length} lots, ${purchases.length} purchases`,
);
