import { describe, expect, it } from "vitest";
import { eventCreateSchema, eventUpdateSchema, zoneCreateSchema, zoneUpdateSchema } from "./event";
import { profileUpdateSchema } from "./profile";
import { structureCreateSchema, structureUpdateSchema } from "./structure";
import { vehicleUpdateSchema } from "./vehicle";

describe("schémas de mise à jour", () => {
  it("un PATCH partiel ne contient que les champs envoyés (aucune valeur par défaut)", () => {
    expect(eventUpdateSchema.parse({ title: "Nouveau titre" })).toEqual({ title: "Nouveau titre" });
    expect(structureUpdateSchema.parse({ name: "Club" })).toEqual({ name: "Club" });
    expect(zoneUpdateSchema.parse({ name: "Libre" })).toEqual({ name: "Libre" });
    expect(vehicleUpdateSchema.parse({ color: "Bleu" })).toEqual({ color: "Bleu" });
    expect(profileUpdateSchema.parse({ bio: "Salut" })).toEqual({ bio: "Salut" });
  });

  it("la création garde les valeurs par défaut des docs", () => {
    const e = eventCreateSchema.parse({
      title: "Rasso",
      format: "gathering",
      startsAt: "2026-06-20T16:00:00Z",
      endsAt: "2026-06-20T20:00:00Z",
      admittedVehicleTypes: ["car"],
      admission: "open",
      registrationsOpenAt: "2026-06-01T10:00:00Z",
      addressLine: "Quai du port",
      city: "Canet-en-Roussillon",
    });
    expect(e).toMatchObject({
      capacity: null,
      maxVehiclesPerUser: 1,
      publicAccess: "free",
      previewHours: 24,
      lockOffsetMinutes: 120,
    });
    expect(structureCreateSchema.parse({ kind: "club", name: "Club" })).toMatchObject({ departments: [], socials: {} });
    expect(zoneCreateSchema.parse({ code: "JDM", name: "JDM" }).position).toBe(0);
  });
});
