import type { CategoryOption, VehicleFull } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import {
  ageNote,
  applyMode,
  blurredCount,
  createBody,
  type Draft,
  detectionUnavailable,
  draftFromVehicle,
  emptyDraft,
  filterRows,
  fitPhoto,
  keptCategories,
  liveCard,
  needsPlateDecision,
  originCategories,
  photoPlan,
  shortName,
  stepIssue,
  stepOfError,
  styleCategories,
  updateBody,
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

describe("étapes", () => {
  it("chaque étape dit ce qui manque", () => {
    expect(stepIssue(0, emptyDraft())).toBe("Choisis la marque.");
    expect(stepIssue(0, filled({ generationId: undefined }))).toMatch(/génération/);
    expect(stepIssue(0, filled({ generationId: null }))).toBeNull();
    expect(stepIssue(1, filled({ powerHp: "abc" }))).toMatch(/Puissance/);
    expect(stepIssue(3, filled({ photos: [] }))).toMatch(/au moins une photo/);
    expect(stepIssue(4, filled({ plate: "" }))).toMatch(/ancien véhicule/);
    expect(stepIssue(4, filled({ plate: "", former: true }))).toBeNull();
    const pending = filled({ photos: [{ key: "a", uri: "u", width: 1, height: 1, rects: [], detection: "pending" }] });
    expect(stepIssue(4, pending)).toMatch(/cherche/);
  });

  it("la carte se construit étape par étape", () => {
    const ref = { make: toyota, model: supra, generation: a90, categories: CATEGORIES };
    const d = filled();
    expect(liveCard(d, 0, ref)).toMatchObject({
      name: "Toyota GR Supra",
      generation: "A90 · depuis 2019",
      specs: null,
    });
    expect(liveCard(d, 1, ref).specs).toBe("3.0 L6 turbo · 340 ch · 2021 · blanche");
    expect(liveCard(d, 2, ref).categories).toEqual(["JDM", "Sportive"]);
    expect(liveCard(d, 2, ref).cover).toBeNull();
    expect(liveCard(d, 3, ref).cover).toBe("file:///a.jpg");
    expect(liveCard(d, 4, ref).plate).toBe(true);
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

  it("plan des photos : retraits, envois avec cadres, floutage des photos déjà en ligne", () => {
    const d = draftFromVehicle(vehicle);
    const rect = { x: 0.1, y: 0.6, w: 0.3, h: 0.1 };
    const photos = [
      { ...(d.photos[0] as Draft["photos"][number]), rects: [rect] },
      { key: "new", uri: "file:///n.jpg", width: 800, height: 600, rects: [rect] },
    ];
    expect(photoPlan({ ...d, photos }, vehicle.photos)).toEqual([
      { kind: "remove", photoId: "p2" },
      { kind: "upload", key: "new", rects: [rect] },
      { kind: "blur", key: "p1", photoId: "p1", rects: [rect] },
    ]);
    expect(blurredCount({ ...d, photos })).toBe(2);
    expect(blurredCount(d)).toBe(1); // p2 déjà floutée
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
    expect(stepIssue(4, filled({ photos: [local({ noPlate: true }), local({ key: "m" })] }))).toMatch(/^Photo 2 :/);
  });

  it("plaque trop courte refusée avant l'envoi (normalizePlate)", () => {
    expect(stepIssue(4, filled({ plate: "a-1" }))).toMatch(/invalide/);
    expect(stepIssue(4, filled({ plate: "ab-1" }))).toBeNull();
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
    expect(stepOfError(err(409, "plate_taken", "Plaque déjà enregistrée"))).toBe(4);
    expect(stepOfError(err(400, "validation_error", "Données invalides", { plate: "Plaque obligatoire" }))).toBe(4);
    expect(stepOfError(err(400, "validation_error", "Données invalides", { powerHp: "trop grand" }))).toBe(1);
    expect(stepOfError(err(400, "validation_error", "Données invalides", { "categoryIds.0": "x" }))).toBe(2);
    expect(stepOfError(err(415, "unsupported_media_type", "Image illisible"))).toBe(3);
    expect(stepOfError(err(0, "network", "Pas de connexion"))).toBeNull();
    expect(stepOfError(err(500, "internal", "Erreur"))).toBeNull();
    expect(stepOfError(new Error("x"))).toBeNull();
  });
});
