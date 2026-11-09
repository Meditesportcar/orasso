import { describe, expect, it } from "vitest";

import { scrubBreadcrumb, scrubErrorEvent, scrubPrivate, scrubText } from "./privacy";

// Lot R7d2 : la position GPS de « Je suis sur place » n'arrive jamais dans un rapport d'erreur ni dans un fil d'Ariane,
// sous aucun des noms qu'elle peut porter (`lat` / `lng` de l'API, `latitude` / `longitude` du téléphone).
describe("la position n'est jamais dans un rapport (lot R7d2)", () => {
  it("un fil d'Ariane perd la position, sous tous ses noms", () => {
    const b = scrubBreadcrumb({
      message: "POST /api/events/x/presence",
      data: { lat: 42.78, lng: 3.03, latitude: 42.78, longitude: 3.03, accuracyM: 12, coords: { latitude: 1, lng: 2 } },
    });
    expect(JSON.stringify(b)).not.toMatch(/42\.78|3\.03/);
    expect(b.data).toMatchObject({ lat: "[retiré]", lng: "[retiré]", latitude: "[retiré]", longitude: "[retiré]" });
    expect(scrubPrivate({ accuracy_m: 9 })).toEqual({ accuracy_m: "[retiré]" });
  });

  it("une URL ou un message avec la position est nettoyé", () => {
    expect(scrubText("/api/x?lat=42.7&lng=3.0&latitude=42.7&longitude=3.0")).toBe(
      "/api/x?lat=[retiré]&lng=[retiré]&latitude=[retiré]&longitude=[retiré]",
    );
  });

  it("un événement d'erreur n'emporte ni le corps de la demande ni la position des extras", () => {
    const e = scrubErrorEvent({
      request: { url: "https://x/api/events/1/presence", data: { lat: 42.7, lng: 3.0, accuracyM: 5 } },
      extra: { position: { latitude: 42.7, longitude: 3.0 } },
      breadcrumbs: [{ data: { lat: 42.7 } }],
    });
    expect(JSON.stringify(e)).not.toMatch(/42\.7|3\.0/);
  });
});
