import { describe, expect, it } from "vitest";

import seed from "@/data/seed.json";
import { draftId } from "@/lib/drafts";
import type { Dataset } from "@/lib/expiry/engine";
import {
  buildGrokHandoff,
  buildSocialDraft,
  toLittleText,
  LINKEDIN_MAX_COMMENTARY,
  loadSocialConfig,
  PLACEHOLDER_AUTHOR,
  SocialRefused,
} from "@/lib/social";

const dataset = seed as unknown as Dataset;
const AS_OF = seed.asOf;

describe("buildSocialDraft: el posteo de LinkedIn de un lote", () => {
  it("arma el posteo de L-6612, el lote que ninguna cuenta absorbe entero", () => {
    const draft = buildSocialDraft("L-6612", dataset, AS_OF);
    expect(draft.network).toBe("linkedin");
    expect(draft.commentary).toContain("sutura de nylon 3-0");
    expect(draft.commentary).toContain("14/02/2027");
    expect(draft.commentary).toContain("por sobre");
    expect(draft.commentary.length).toBeLessThanOrEqual(LINKEDIN_MAX_COMMENTARY);
    expect(draft.payload.visibility).toBe("PUBLIC");
    expect(draft.payload.lifecycleState).toBe("PUBLISHED");
  });

  it("usa el precio del motor, nunca uno inventado", () => {
    const draft = buildSocialDraft("L-6612", dataset, AS_OF);
    const pricing = draft.placement.pricing!;
    expect(pricing.offerPrice).toBeGreaterThanOrEqual(pricing.floorPrice);
    expect(draft.commentary).toContain(`$${pricing.offerPrice.toLocaleString("es-AR")}`);
  });

  it("no nombra a ningún cliente ni promete efectos sobre la salud", () => {
    const draft = buildSocialDraft("L-6612", dataset, AS_OF);
    for (const account of dataset.accounts) expect(draft.commentary).not.toContain(account.name);
    expect(draft.commentary).not.toMatch(/cura|sana|garantiza|mejora la salud/i);
  });

  it("el draft_id es el hash del pedido exacto a LinkedIn", () => {
    const draft = buildSocialDraft("L-6612", dataset, AS_OF);
    expect(draft.draftId).toBe(draftId(draft.payload));
    expect(buildSocialDraft("L-6612", dataset, AS_OF).draftId).toBe(draft.draftId);
  });

  it("si cambia el autor, cambia el draft_id: no se puede publicar otra cosa con la misma aprobación", () => {
    const a = buildSocialDraft("L-6612", dataset, AS_OF);
    const b = buildSocialDraft("L-6612", dataset, AS_OF, { authorUrn: "urn:li:organization:123" });
    expect(a.payload.author).toBe(PLACEHOLDER_AUTHOR);
    expect(b.payload.author).toBe("urn:li:organization:123");
    expect(b.draftId).not.toBe(a.draftId);
  });

  it("no publica un lote de menos de un mes", () => {
    expect(() => buildSocialDraft("L-7703", dataset, AS_OF)).toThrow(SocialRefused);
  });

  it("no publica un lote que no existe", () => {
    expect(() => buildSocialDraft("L-0000", dataset, AS_OF)).toThrow(SocialRefused);
  });
});

describe("buildGrokHandoff: el traspaso a Grok Bot", () => {
  it("lleva el posteo aprobado sin cambios y pide confirmación antes de publicar", () => {
    const draft = buildSocialDraft("L-6612", dataset, AS_OF);
    const handoff = buildGrokHandoff(draft, {
      slug: "contentdrips",
      name: "ContentDrips",
      url: "https://grokbot.dev/plugins/contentdrips/",
    });
    expect(handoff.draftId).toBe(draft.draftId);
    expect(handoff.instructionForGrok).toContain(draft.commentary);
    expect(handoff.instructionForGrok).toMatch(/esperá mi confirmación/);
    expect(handoff.steps.join(" ")).toMatch(/nunca el agente/);
  });
});

describe("loadSocialConfig", () => {
  it("sin credenciales queda en dry-run y dice qué falta", () => {
    const config = loadSocialConfig({});
    expect(config.configured).toBe(false);
    expect(config.publishingEnabled).toBe(false);
    expect(config.missing).toEqual(["LINKEDIN_ACCESS_TOKEN", "LINKEDIN_AUTHOR_URN"]);
  });

  it("publicar exige SOCIAL_ALLOW_PUBLISH exactamente en true", () => {
    const base = { LINKEDIN_ACCESS_TOKEN: "x", LINKEDIN_AUTHOR_URN: "urn:li:organization:1" };
    expect(loadSocialConfig({ ...base, SOCIAL_ALLOW_PUBLISH: "TRUE" }).publishingEnabled).toBe(false);
    expect(loadSocialConfig({ ...base, SOCIAL_ALLOW_PUBLISH: "true" }).publishingEnabled).toBe(true);
  });
});

describe("toLittleText: el formato de texto de LinkedIn", () => {
  it("escapa los paréntesis del código del producto y deja las etiquetas como hashtags", () => {
    const out = toLittleText("Son 300 sobres (SUT-3010).\n\n#InsumosMédicos #Clínicas");
    expect(out).toBe("Son 300 sobres \\(SUT-3010\\).\n\n#InsumosMédicos #Clínicas");
  });

  it("escapa un # suelto en medio del texto", () => {
    expect(toLittleText("Lote #4 * 2")).toBe("Lote \\#4 \\* 2");
  });

  it("el posteo que se manda va escapado, y el que lee la persona no", () => {
    const draft = buildSocialDraft("L-6612", dataset, AS_OF);
    expect(draft.commentary).toContain("(SUT-3010)");
    expect(draft.payload.commentary).toContain("\\(SUT-3010\\)");
    expect(draft.payload.commentary).toContain("#InsumosMédicos");
  });
});

describe("loadSocialConfig: quién publica", () => {
  it("acepta una persona como autor", () => {
    const config = loadSocialConfig({ LINKEDIN_ACCESS_TOKEN: "x", LINKEDIN_AUTHOR_URN: "urn:li:person:782bbtaQ" });
    expect(config.configured).toBe(true);
    expect(config.authorUrn).toBe("urn:li:person:782bbtaQ");
  });

  it("sigue aceptando LINKEDIN_ORGANIZATION_URN", () => {
    expect(loadSocialConfig({ LINKEDIN_ACCESS_TOKEN: "x", LINKEDIN_ORGANIZATION_URN: "urn:li:organization:9" }).authorUrn).toBe(
      "urn:li:organization:9",
    );
  });

  it("rechaza un autor mal escrito antes de llamar a LinkedIn", () => {
    const config = loadSocialConfig({ LINKEDIN_ACCESS_TOKEN: "x", LINKEDIN_AUTHOR_URN: "OpFarma" });
    expect(config.configured).toBe(false);
    expect(config.problems[0]).toMatch(/urn:li:organization/);
  });
});
