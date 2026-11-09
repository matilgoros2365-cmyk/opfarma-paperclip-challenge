import { describe, expect, it } from "vitest";

import seed from "@/data/seed.json";
import type { Dataset } from "@/lib/expiry/engine";
import { buildOffer } from "@/lib/expiry/offer";
import { OFFER_TEMPLATE, offerTemplateVariables, renderTemplate } from "@/lib/expiry/template";

const dataset = seed as unknown as Dataset;
const lot = (id: string) => dataset.lots.find((l) => l.lotId === id)!;
const placeholders = (OFFER_TEMPLATE.body.match(/\{\{\d+\}\}/g) ?? []).length;

describe("la plantilla cumple las reglas de Meta", () => {
  it("numera las variables de 1 en adelante, sin saltos", () => {
    const numbers = [...OFFER_TEMPLATE.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
  });

  it("no empieza ni termina con una variable", () => {
    expect(OFFER_TEMPLATE.body.trimStart().startsWith("{{")).toBe(false);
    expect(OFFER_TEMPLATE.body.trimEnd().endsWith("}}")).toBe(false);
  });

  it("trae un ejemplo por variable, que Meta pide al darla de alta", () => {
    expect(OFFER_TEMPLATE.examples).toHaveLength(placeholders);
  });

  it("respeta los límites de largo del cuerpo y del pie", () => {
    expect(OFFER_TEMPLATE.body.length).toBeLessThanOrEqual(1024);
    expect(OFFER_TEMPLATE.footer.length).toBeLessThanOrEqual(60);
  });
});

describe("las variables de cada oferta", () => {
  const offers = [
    ["L-4028", "ACC-PARQUE"],
    ["L-8890", "ACC-PARQUE"],
    ["L-5511", "ACC-PARQUE"],
    ["L-3345", "ACC-LABCENTRO"],
    ["L-2201", "ACC-BELGRANO"],
  ] as const;

  for (const [lotId, accountId] of offers) {
    it(`${lotId}: una por marcador, sin saltos de línea`, () => {
      const { offer } = buildOffer(lot(lotId), accountId, dataset, seed.asOf);
      const variables = offerTemplateVariables(offer);
      expect(variables).toHaveLength(placeholders);
      for (const value of variables) {
        expect(value.trim()).not.toBe("");
        expect(value).not.toMatch(/[\n\t]|\s{4,}/);
      }
    });
  }

  it("L-4028 se lee como lo va a leer el sanatorio", () => {
    const { offer } = buildOffer(lot("L-4028"), "ACC-PARQUE", dataset, seed.asOf);
    expect(offerTemplateVariables(offer)).toEqual([
      "Sanatorio del Parque",
      "Sutura de nylon 3-0",
      "22/01/2027",
      "120 sobres",
      "$1.260",
      "$151.200",
      "40%",
    ]);
    const text = renderTemplate(OFFER_TEMPLATE.name, offerTemplateVariables(offer))!;
    expect(text).toContain("Hola, Sanatorio del Parque.");
    expect(text).toContain("Tenemos 120 sobres disponibles a $1.260 por unidad, $151.200 en total");
    expect(text).not.toMatch(/\{\{\d+\}\}/);
  });

  it("pluraliza unidades compuestas", () => {
    const { offer } = buildOffer(lot("L-5511"), "ACC-PARQUE", dataset, seed.asOf);
    expect(offerTemplateVariables(offer)[3]).toBe("40 cajas x100");
  });

  it("no renderiza plantillas que no conoce", () => {
    expect(renderTemplate("hello_world", [])).toBeNull();
  });
});
