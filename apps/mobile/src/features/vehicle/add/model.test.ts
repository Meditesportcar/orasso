import type { CategoryOption, VehicleFull } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import {
  ageNote,
  applyMode,
  blurredCount,
  continueBlocked,
  createBody,
  type Draft,
  detectionUnavailable,
  dimmedNote,
  draftFromVehicle,
  draftIsEmpty,
  emptyDraft,
  filterRows,
  fitPhoto,
  keptCategories,
  liveCard,
  needsPlateDecision,
  nextMove,
  originCategories,
  preparedCategory,
  STEP,
  shortName,
  stepIssue,
  stepOfError,
  stepToRevisit,
  styleCategories,
  updateBody,
  visibleStyles,
  withCover,
  yearChoices,
} from "./model";

const cat = (slug: string, over: Partial<CategoryOption> = {}): CategoryOption => ({
  id: `id-${slug}`,
  slug,
  label: slug.toUpperCase(),
  minVehicleAge: null,
  allowedVehicleTypes: null,
  allowedCountries: null,
  makeMode: "any",
  eligible: true,
  refusal: null,
  reason: null,
  ...over,
});

const CATEGORIES = [
  cat("jdm", { label: "JDM", allowedCountries: ["JP"] }),
  cat("allemande", { label: "Allemande", allowedCountries: ["DE"], eligible: false, refusal: "country" }),
  cat("sportive", { label: "Sportive" }),
  cat("youngtimer", { label: "Youngtimer", eligible: false, refusal: "age", reason: "Véhicule trop récent" }),
  cat("ancienne", { label: "Ancienne", eligible: false, refusal: "age", reason: "Véhicule trop récent" }),
];

const toyota = { id: "mk", name: "Toyota", slug: "toyota", country: "JP", isOther: false };
const supra = { id: "md", makeId: "mk", name: "GR Supra", vehicleType: "car" as const, isOther: false };
const a90 = { id: "gn", modelId: "md", name: "A90", yearFrom: 2019, yearTo: null, isOther: false };

const filled = (over: Partial<Draft> = {}): Draft => ({
  ...emptyDraft(),
  makeId: "mk",
  modelId: "md",
  generationId: "gn",
  engine: "3.0 L6 turbo",
  powerHp: "340",
  weightKg: "1495",
  year: 2021,
  color: "Blanche",
  categoryIds: ["id-jdm", "id-sportive"],
  photos: [{ key: "a", uri: "file:///a.jpg", width: 1200, height: 900, rects: [], noPlate: true }],
  plate: "GA-662-KS",
  ...over,
});

describe("référentiel", () => {
  it("recherche sans accent ni casse, « Autre » toujours là et en dernier", () => {
    const rows = [
      { id: "o", name: "Autre", isOther: true },
      { id: "c", name: "Citroën", isOther: false },
      { id: "b", name: "BMW", isOther: false },
    ];
    expect(filterRows(rows, "").map((r) => r.id)).toEqual(["b", "c", "o"]);
    expect(filterRows(rows, "citroen").map((r) => r.id)).toEqual(["c", "o"]);
    expect(filterRows(rows, "ferrari").map((r) => r.id)).toEqual(["o"]);
  });

  it("années proposées : celles de la génération, bornées à l'an prochain", () => {
    expect(yearChoices(a90, 2026)).toEqual([2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027]);
    expect(yearChoices({ yearFrom: 1993, yearTo: 2002 }, 2026)).toHaveLength(10);
    expect(yearChoices({ yearFrom: null, yearTo: null }, 2026)).toEqual([]);
    expect(yearChoices(undefined, 2026)).toEqual([]);
  });
});

describe("catégories", () => {
  it("origine déduite du pays de la marque, origines étrangères cachées, styles à choisir", () => {
    expect(originCategories(CATEGORIES, "JP").map((c) => c.slug)).toEqual(["jdm"]);
    expect(originCategories(CATEGORIES, null)).toEqual([]);
    expect(styleCategories(CATEGORIES).map((c) => c.slug)).toEqual(["sportive", "youngtimer", "ancienne"]);
  });

  it("garde l'origine et les styles éligibles seulement", () => {
    expect(keptCategories(["id-sportive", "id-youngtimer", "id-allemande"], CATEGORIES, "JP")).toEqual([
      "id-jdm",
      "id-sportive",
    ]);
  });

  it("dit pourquoi les catégories d'âge sont grisées", () => {
    expect(ageNote(CATEGORIES, 2021)).toBe("Youngtimer et Ancienne : grisées, ta voiture est de 2021.");
    expect(ageNote(CATEGORIES, undefined)).toBeNull();
  });
});

describe("styles (lot M1)", () => {
  const rows = [
    ...CATEGORIES,
    cat("moto", { label: "Moto", eligible: false, refusal: "type" }),
    cat("supercar", { label: "Supercar", eligible: false, refusal: "make" }),
    cat("preparee", { label: "Préparée" }),
  ];
  it("cache ce qui n'a rien à voir avec ce véhicule, garde l'âge barré avec une phrase", () => {
    expect(visibleStyles(rows).map((c) => c.slug)).toEqual(["sportive", "youngtimer", "ancienne", "preparee"]);
    expect(dimmedNote(rows, 2021, "car")).toBe("Youngtimer et Ancienne sont grisées : ta voiture est de 2021.");
    expect(dimmedNote(rows, 2021, "moto")).toMatch(/ta moto est de 2021/);
    expect(dimmedNote(rows, undefined, "car")).toBeNull();
    expect(preparedCategory(rows)?.slug).toBe("preparee");
    expect(preparedCategory(CATEGORIES)).toBeNull();
  });
});

describe("étapes", () => {
  it("suivent l'ordre de Damien : photos, plaque, marque et modèle, fiche technique, catégories", () => {
    expect(STEP).toEqual({ photos: 0, plate: 1, identity: 2, specs: 3, categories: 4 });
  });

  it("chaque étape dit ce qui manque", () => {
    expect(stepIssue(STEP.identity, emptyDraft())).toBe("Choisis la marque.");
    expect(stepIssue(STEP.identity, filled({ generationId: undefined }))).toMatch(/génération/);
    expect(stepIssue(STEP.identity, filled({ generationId: null }))).toBeNull();
    expect(stepIssue(STEP.specs, filled({ powerHp: "abc" }))).toMatch(/Puissance/);
    expect(stepIssue(STEP.photos, filled({ photos: [] }))).toMatch(/au moins une photo/);
    expect(stepIssue(STEP.plate, filled({ plate: "" }))).toMatch(/ancien véhicule/);
    expect(stepIssue(STEP.plate, filled({ plate: "", former: true }))).toBeNull();
    const pending = filled({ photos: [{ key: "a", uri: "u", width: 1, height: 1, rects: [], detection: "pending" }] });
    expect(stepIssue(STEP.plate, pending)).toMatch(/cherche/);
  });

  it("la fiche se construit étape par étape : photo, plaque, modèle, fiche, catégories", () => {
    const ref = { make: toyota, model: supra, generation: a90, categories: CATEGORIES };
    const d = filled();
    expect(liveCard(d, STEP.photos, ref)).toMatchObject({
      name: "Toyota GR Supra",
      generation: "A90 · depuis 2019",
      cover: "file:///a.jpg",
      photos: 1,
      plate: false,
      specs: null,
    });
    expect(liveCard(emptyDraft(), STEP.photos, {})).toMatchObject({ name: null, photos: 0, cover: null });
    expect(liveCard(d, STEP.plate, ref).plate).toBe(true);
    expect(liveCard(d, STEP.identity, ref).specs).toBeNull();
    expect(liveCard(d, STEP.specs, ref).specs).toBe("3.0 L6 turbo · 340 ch · 2021 · blanche");
    expect(liveCard(d, STEP.specs, ref).categories).toEqual([]);
    expect(liveCard(d, STEP.categories, ref).categories).toEqual(["JDM", "Sportive"]);
    expect(shortName(ref, "car")).toBe("GR Supra");
    expect(shortName({}, "moto")).toBe("moto");
  });
});

describe("envoi", () => {
  it("corps de création : ancien véhicule = souvenir sans plaque, « Autre » couleur = pas de couleur", () => {
    expect(createBody(filled())).toMatchObject({
      plate: "GA-662-KS",
      status: "active",
      powerHp: 340,
      color: "Blanche",
    });
    expect(createBody(filled({ former: true, plate: "", color: "Autre" }))).toMatchObject({
      plate: null,
      status: "keepsake",
      color: null,
    });
    expect(createBody(filled({ former: true, status: "sold" })).status).toBe("sold");
  });

  it("description et préparation partent avec la fiche (lot M1)", () => {
    const body = createBody(filled({ description: "  Sortie du dimanche.  ", preparation: ["wheels", "exhaust"] }));
    expect(body.description).toBe("Sortie du dimanche.");
    expect(body.preparation).toBe("Échappement · Jantes");
    expect(createBody(filled()).preparation).toBeNull();
    const before = { ...vehicleLike(), preparation: "Moteur · Freins\nReprog", description: "Ok" };
    const d = draftFromVehicle(before);
    expect(d.preparation).toEqual(["engine", "brakes"]);
    expect(d.preparationNote).toBe("Reprog");
    expect(updateBody(d, before)).toEqual({});
  });

  const vehicle = {
    id: "v1",
    vehicleType: "car",
    makeId: "mk",
    modelId: "md",
    generationId: "gn",
    year: 2021,
    engine: "3.0 L6 turbo",
    powerHp: 340,
    weightKg: 1495,
    color: "Blanche",
    plate: "ga-662-ks",
    unregistered: false,
    status: "active",
    categories: [
      { id: "id-jdm", slug: "jdm", label: "JDM" },
      { id: "id-sportive", slug: "sportive", label: "Sportive" },
    ],
    photos: [
      { id: "p1", position: 1, url: "/api/files/p1.webp", width: 1200, height: 900, plateBlurred: false },
      { id: "p2", position: 2, url: "/api/files/p2.webp", width: 1200, height: 900, plateBlurred: true },
    ],
  } as unknown as VehicleFull;

  it("modification : seuls les champs changés partent (la plaque réécrite ne change rien)", () => {
    const d = draftFromVehicle(vehicle);
    expect(d.photos.map((p) => p.remoteId)).toEqual(["p1", "p2"]);
    expect(updateBody({ ...d, plate: "GA-662-KS" }, vehicle)).toEqual({});
    expect(updateBody({ ...d, powerHp: "360", categoryIds: ["id-jdm"] }, vehicle)).toEqual({
      powerHp: 360,
      categoryIds: ["id-jdm"],
    });
    expect(updateBody({ ...d, former: true, plate: "" }, vehicle)).toEqual({ plate: null, status: "keepsake" });
  });

  it("lot R4e : la version se saisit, part nettoyée, suit le modèle sur la fiche qui se construit", () => {
    const d = draftFromVehicle(vehicle);
    expect(d.version).toBe("");
    expect(updateBody({ ...d, version: "  GTI " }, vehicle)).toEqual({ version: "GTI" });
    const withVersion = { ...vehicle, version: "GTI" } as VehicleFull;
    expect(draftFromVehicle(withVersion).version).toBe("GTI");
    expect(updateBody(draftFromVehicle(withVersion), withVersion)).toEqual({});
    expect(updateBody({ ...draftFromVehicle(withVersion), version: " " }, withVersion)).toEqual({ version: null });
    expect(createBody(filled({ version: "x".repeat(40) })).version).toHaveLength(30);
    expect(draftIsEmpty({ ...emptyDraft(), version: "CC" })).toBe(false);
    const card = liveCard(filled({ version: "RZ" }), STEP.specs, { make: toyota, model: supra, generation: a90 });
    expect(card.name).toBe("Toyota GR Supra RZ");
  });

  it("plaques floutées : cadres posés et photos déjà floutées", () => {
    const d = draftFromVehicle(vehicle);
    const rect = { x: 0.1, y: 0.6, w: 0.3, h: 0.1 };
    const photos = [
      { ...(d.photos[0] as Draft["photos"][number]), rects: [rect] },
      { key: "new", uri: "file:///n.jpg", width: 800, height: 600, rects: [rect] },
    ];
    expect(blurredCount({ ...d, photos })).toBe(2);
    expect(blurredCount(d)).toBe(1); // p2 déjà floutée
  });

  it("lot M1, tour 2 : en modification, une plaque sûre d'une nouvelle photo est masquée d'office", () => {
    const d = draftFromVehicle(vehicle);
    expect(d.blurMode).toBe("auto");
    const detected = [{ x: 0.2, y: 0.7, w: 0.2, h: 0.08 }];
    const photos = applyMode(
      [...d.photos, { key: "n", uri: "file:///n.jpg", width: 1, height: 1, rects: [], detected }],
      "auto",
    );
    expect(photos.at(-1)?.rects).toEqual(detected);
    expect(photos[0]?.rects).toEqual([]); // la photo déjà en ligne n'est pas touchée
  });

  it("couverture et mode Automatique", () => {
    const photos = filled().photos.concat({ key: "b", uri: "file:///b.jpg", width: 1, height: 1, rects: [] });
    expect(withCover(photos, 1).map((p) => p.key)).toEqual(["b", "a"]);
    const detected = [{ x: 0.2, y: 0.7, w: 0.2, h: 0.08 }];
    const withDetection = photos.map((p) => ({ ...p, detected }));
    expect(applyMode(withDetection, "auto")[0]?.rects).toEqual(detected);
    expect(applyMode(withDetection, "manual")[0]?.rects).toEqual([]);
  });
});

describe("lot M1, tour 2 : vie privée de la plaque pendant l'import", () => {
  const photo = (over: Partial<Draft["photos"][number]> = {}) => ({
    key: "a",
    uri: "file:///a.jpg",
    width: 1200,
    height: 900,
    rects: [],
    noPlate: true,
    ...over,
  });

  it("import retardé : « Continuer » est grisé et ne fait rien, à toutes les étapes", () => {
    const d = filled();
    for (const step of Object.values(STEP)) {
      expect(continueBlocked(step, d, true)).toBe(true);
      expect(nextMove(step, d, true)).toEqual({ kind: "wait" });
    }
    expect(continueBlocked(STEP.plate, d, false)).toBe(false);
    expect(nextMove(STEP.photos, d, false)).toEqual({ kind: "step", step: STEP.plate });
  });

  it("une photo arrivée après l'étape Plaque ramène à cette étape, sans rien envoyer", () => {
    // Photo 1 validée ; la photo 2 arrive (import fini) pendant qu'on est à la fiche technique.
    const later = filled({
      photos: [photo(), photo({ key: "b", uri: "file:///b.jpg", noPlate: false, detection: "pending" })],
    });
    expect(stepToRevisit(later, STEP.specs)).toBe(STEP.plate);
    expect(nextMove(STEP.specs, later, false)).toMatchObject({ kind: "fix", step: STEP.plate });
    expect(nextMove(STEP.categories, later, false)).toMatchObject({ kind: "fix", step: STEP.plate });
    // Détection finie, toujours sans décision : encore l'étape Plaque.
    const found = filled({ photos: [photo(), photo({ key: "b", noPlate: false, detection: "none" })] });
    expect(nextMove(STEP.categories, found, false)).toMatchObject({ kind: "fix", step: STEP.plate });
    // Décidée (cadre posé) : l'envoi peut partir.
    const ok = filled({
      photos: [photo(), photo({ key: "b", noPlate: false, rects: [{ x: 0.1, y: 0.6, w: 0.3, h: 0.1 }] })],
    });
    expect(stepToRevisit(ok, STEP.categories)).toBeNull();
    expect(nextMove(STEP.categories, ok, false)).toEqual({ kind: "send" });
  });

  it("brouillon vide : on quitte sans confirmation ; sinon on confirme", () => {
    expect(draftIsEmpty(emptyDraft())).toBe(true);
    expect(draftIsEmpty({ ...emptyDraft(), photos: [photo()] })).toBe(false);
    expect(draftIsEmpty({ ...emptyDraft(), plate: "AB" })).toBe(false);
    expect(draftIsEmpty({ ...emptyDraft(), makeId: "mk" })).toBe(false);
  });

  it("fiche technique libre : bornes de la décision de Damien", () => {
    expect(stepIssue(STEP.specs, filled({ engine: "", powerHp: "", weightKg: "" }))).toBeNull();
    expect(stepIssue(STEP.specs, filled({ powerHp: "2000", weightKg: "10000" }))).toBeNull();
    expect(stepIssue(STEP.specs, filled({ powerHp: "2001" }))).toMatch(/Puissance/);
    expect(stepIssue(STEP.specs, filled({ weightKg: "49" }))).toMatch(/Poids/);
    expect(stepIssue(STEP.specs, filled({ engine: "x".repeat(61) }))).toMatch(/60 caractères/);
  });
});

describe("relecture du lot 51", () => {
  const local = (over: Partial<Draft["photos"][number]> = {}) => ({
    key: "l",
    uri: "file:///l.jpg",
    width: 1200,
    height: 900,
    rects: [],
    ...over,
  });

  it("une photo nouvelle sans cadre ne part pas sans « aucune plaque visible »", () => {
    expect(needsPlateDecision(local())).toBe(true);
    expect(needsPlateDecision(local({ noPlate: true }))).toBe(false);
    expect(needsPlateDecision(local({ rects: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.1 }] }))).toBe(false);
    expect(needsPlateDecision(local({ remoteId: "p1" }))).toBe(false);
    expect(stepIssue(STEP.plate, filled({ photos: [local({ noPlate: true }), local({ key: "m" })] }))).toMatch(
      /^Photo 2 :/,
    );
  });

  it("plaque trop courte refusée avant l'envoi (normalizePlate)", () => {
    expect(stepIssue(STEP.plate, filled({ plate: "a-1" }))).toMatch(/invalide/);
    expect(stepIssue(STEP.plate, filled({ plate: "ab-1" }))).toBeNull();
  });

  it("sans détection possible, l'automatique n'a pas lieu d'être", () => {
    expect(detectionUnavailable([local({ detection: "unavailable" }), local({ remoteId: "x" })])).toBe(true);
    expect(detectionUnavailable([local({ detection: "unavailable" }), local({ detection: "none" })])).toBe(false);
    expect(detectionUnavailable([])).toBe(false);
  });

  it("l'éditeur montre la photo entière à son format : 9:16 et panorama", () => {
    expect(fitPhoto(1080, 1920, 358, 460)).toEqual({ w: 259, h: 460 });
    expect(fitPhoto(3000, 1000, 358, 460)).toEqual({ w: 358, h: 119 });
    expect(fitPhoto(1200, 900, 358, 460)).toEqual({ w: 358, h: 269 });
    expect(fitPhoto(1200, 900, 0, 460)).toEqual({ w: 0, h: 0 });
  });

  it("une erreur de champ à l'envoi ramène à son étape", () => {
    const err = (status: number, code: string, message: string, fields?: Record<string, string>) => ({
      status,
      code,
      message,
      details: fields ? { fields } : undefined,
    });
    expect(stepOfError(err(409, "plate_taken", "Plaque déjà enregistrée"))).toBe(STEP.plate);
    expect(stepOfError(err(400, "validation_error", "Données invalides", { plate: "Plaque obligatoire" }))).toBe(
      STEP.plate,
    );
    expect(stepOfError(err(400, "validation_error", "Données invalides", { powerHp: "trop grand" }))).toBe(STEP.specs);
    expect(stepOfError(err(400, "validation_error", "Données invalides", { "categoryIds.0": "x" }))).toBe(
      STEP.categories,
    );
    expect(stepOfError(err(415, "unsupported_media_type", "Image illisible"))).toBe(STEP.photos);
    expect(stepOfError(err(0, "network", "Pas de connexion"))).toBeNull();
    expect(stepOfError(err(500, "internal", "Erreur"))).toBeNull();
    expect(stepOfError(new Error("x"))).toBeNull();
  });
});

function vehicleLike(): VehicleFull {
  return {
    id: "v9",
    vehicleType: "car",
    makeId: "mk",
    modelId: "md",
    generationId: "gn",
    year: 2021,
    engine: null,
    powerHp: null,
    weightKg: null,
    color: null,
    plate: "AB-123-CD",
    unregistered: false,
    status: "active",
    categories: [],
    photos: [],
    description: null,
    preparation: null,
  } as unknown as VehicleFull;
}

describe("modèle absent de la liste (lot R4a, maquette R4.8)", () => {
  const peugeot = { id: "pg", name: "Peugeot", slug: "peugeot", country: "FR", isOther: false };
  const autre = { id: "pa", makeId: "pg", name: "Autre", vehicleType: "car" as const, isOther: true };
  const typed = (over: Partial<Draft> = {}) =>
    filled({ makeId: "pg", modelId: "pa", generationId: null, typing: "model", proposedModel: "207 CC", ...over });

  it("« Continuer » dès 2 caractères ; la génération n'est pas demandée, l'année l'est", () => {
    expect(stepIssue(STEP.identity, typed({ proposedModel: "2" }))).toMatch(/nom du modèle/);
    expect(stepIssue(STEP.identity, typed())).toBeNull();
    expect(stepIssue(STEP.identity, typed({ typing: "make", proposedMake: " " }))).toMatch(/nom de la marque/);
    expect(stepIssue(STEP.specs, typed({ year: undefined }))).toMatch(/année/);
    expect(stepIssue(STEP.specs, typed({ year: 2008 }))).toBeNull();
  });

  it("la fiche en direct dit tout de suite « Peugeot 207 CC », à ajouter à la liste", () => {
    const card = liveCard(typed(), STEP.identity, { make: peugeot, model: autre });
    expect(card.name).toBe("Peugeot 207 CC");
    expect(card.generation).toBe("Génération non précisée");
    expect(card.toBeListed).toBe(true);
    expect(liveCard(typed({ proposedModel: "" }), STEP.identity, { make: peugeot, model: autre }).generation).toBe(
      "Tape le nom du modèle",
    );
    expect(shortName({ make: peugeot, model: autre, typedModel: "207 CC" }, "car")).toBe("207 CC");
  });

  it("le nom tapé part nettoyé, seulement quand on tape", () => {
    expect(createBody(typed({ proposedModel: "  207   CC " }))).toMatchObject({
      proposedMake: null,
      proposedModel: "207 CC",
      generationId: null,
    });
    expect(createBody(typed({ typing: undefined }))).toMatchObject({ proposedMake: null, proposedModel: null });
    expect(createBody(typed({ typing: "make", proposedMake: "Lotus", proposedModel: "Exige" }))).toMatchObject({
      proposedMake: "Lotus",
      proposedModel: "Exige",
    });
  });

  it("marque tapée : l'origine se choisit à la main et reste", () => {
    const fr = cat("francaise", { id: "id-fr", allowedCountries: ["FR"] });
    expect(keptCategories(["id-fr"], [fr], null)).toEqual([]);
    expect(keptCategories(["id-fr"], [fr], null, true)).toEqual(["id-fr"]);
  });
});
