// Lot 35c : modification d'un véhicule dans l'appli (champs changés seulement, plaque, catégories).
import type { VehicleFull } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { hasChanges, touchesPlate, vehicleEditForm, vehicleUpdateBody } from "./vehicleEdit";

const car = {
  id: "v1",
  status: "active",
  year: 1995,
  color: "Rouge",
  engine: "2.5 L",
  powerHp: 170,
  weightKg: 1300,
  preparation: null,
  description: "Ma E36",
  plate: "AB-123-CD",
  unregistered: false,
  categories: [{ id: "c1", slug: "youngtimer", label: "Youngtimer" }],
} as unknown as VehicleFull;

describe("modifier un véhicule", () => {
  it("le formulaire reprend la fiche et rien ne part tant que rien ne change", () => {
    const form = vehicleEditForm(car);
    expect(form).toMatchObject({ year: "1995", plate: "AB-123-CD", preparation: "", categoryIds: ["c1"] });
    const res = vehicleUpdateBody(form, car, 2026);
    expect(res).toEqual({ body: {} });
    expect(hasChanges(res)).toBe(false);
  });

  it("seuls les champs changés partent ; vide = effacé", () => {
    const form = { ...vehicleEditForm(car), color: " Bleu ", engine: "", weightKg: "1250" };
    expect(vehicleUpdateBody(form, car, 2026)).toEqual({ body: { color: "Bleu", engine: null, weightKg: 1250 } });
  });

  it("refuse les nombres hors limites", () => {
    const base = vehicleEditForm(car);
    for (const patch of [
      { year: "1700" },
      { year: "2040" },
      { powerHp: "0" },
      { powerHp: "2,5" },
      { weightKg: "10" },
    ]) {
      expect(vehicleUpdateBody({ ...base, ...patch }, car, 2026)).toHaveProperty("error");
    }
  });

  it("changer la plaque ou le statut « non immatriculé » touche la plaque (transfert possible)", () => {
    const base = vehicleEditForm(car);
    const changed = vehicleUpdateBody({ ...base, plate: "ZZ-999-ZZ" }, car, 2026);
    expect(changed).toEqual({ body: { plate: "ZZ-999-ZZ" } });
    expect("body" in changed && touchesPlate(changed.body)).toBe(true);
    const unregistered = vehicleUpdateBody({ ...base, unregistered: true }, car, 2026);
    expect(unregistered).toEqual({ body: { unregistered: true, plate: null } });
    expect(vehicleUpdateBody({ ...base, plate: "" }, car, 2026)).toEqual({ error: "Plaque obligatoire." });
    expect("body" in changed && touchesPlate({ color: "Bleu" })).toBe(false);
  });

  it("un véhicule archivé peut perdre sa plaque", () => {
    const sold = { ...car, status: "sold" } as VehicleFull;
    expect(vehicleUpdateBody({ ...vehicleEditForm(sold), plate: "" }, sold, 2026)).toEqual({ body: { plate: null } });
  });

  it("les catégories partent quand la sélection change (l'ordre ne compte pas)", () => {
    const base = vehicleEditForm(car);
    expect(vehicleUpdateBody({ ...base, categoryIds: ["c1"] }, car, 2026)).toEqual({ body: {} });
    expect(vehicleUpdateBody({ ...base, categoryIds: ["c1", "c2"] }, car, 2026)).toEqual({
      body: { categoryIds: ["c1", "c2"] },
    });
    expect(vehicleUpdateBody({ ...base, categoryIds: [] }, car, 2026)).toEqual({ body: { categoryIds: [] } });
  });
});
