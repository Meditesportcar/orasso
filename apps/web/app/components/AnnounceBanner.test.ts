// Bandeau d'annonce du site (lot M6, tour 2) : liens internes seulement, notification coupée = pas de bandeau.
import { describe, expect, it } from "vitest";

import { announcementOf, internalPath } from "./AnnounceBanner";

describe("internalPath", () => {
  it("accepte un chemin interne, refuse tout le reste", () => {
    expect(internalPath("/app/sorties")).toBe("/app/sorties");
    expect(internalPath("/a")).toBe("/a");
    expect(internalPath("//evil.example")).toBeNull();
    expect(internalPath("/\\evil.example")).toBeNull();
    expect(internalPath("/")).toBeNull();
    expect(internalPath("https://evil.example")).toBeNull();
    expect(internalPath("javascript:alert(1)")).toBeNull();
    expect(internalPath(undefined)).toBeNull();
    expect(internalPath(42)).toBeNull();
  });
});

describe("announcementOf", () => {
  it("ne garde pas le lien externe d'une annonce", () => {
    const a = announcementOf({
      id: "n1",
      type: "application_accepted",
      title: "Retenue",
      data: { link: "//evil.example" },
    });
    expect(a?.href).toBeNull();
    expect(
      announcementOf({ id: "n1", type: "application_accepted", title: "Retenue", data: { link: "/app/sorties" } })
        ?.href,
    ).toBe("/app/sorties");
  });

  it("ignore une notification coupée par le compte (`delivered: false`)", () => {
    const base = { id: "n2", type: "application_accepted", title: "Retenue" };
    expect(announcementOf({ ...base, delivered: false })).toBeNull();
    expect(announcementOf({ ...base, delivered: true })).not.toBeNull();
    expect(announcementOf(base)).not.toBeNull();
  });
});
