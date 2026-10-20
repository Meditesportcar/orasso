import type { MediaAccreditationView } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { accreditationAsApplication } from "./pressApplications";

const accreditation = (over: Partial<MediaAccreditationView>): MediaAccreditationView => ({
  id: "a1",
  status: "accepted",
  formats: ["photo"],
  message: null,
  createdAt: "2026-10-16T10:00:00Z",
  decidedAt: "2026-10-17T10:00:00Z",
  refusalNote: null,
  event: {
    id: "e1",
    slug: "nocturne",
    title: "Nocturne",
    format: "night",
    startsAt: "2026-10-22T17:00:00Z",
    endsAt: "2026-10-22T21:00:00Z",
    city: "Canet",
    department: "66",
    structureName: "MSC",
  },
  pass: { id: "p1", valid: true },
  briefing: null,
  coverage: { contents: 0, views: 0 },
  canWithdraw: true,
  ...over,
});

describe("badge presse : l'accréditation nourrit le kit du jour J", () => {
  it("garde l'identifiant, le statut et l'événement ; pas de véhicule, pas de zone", () => {
    const app = accreditationAsApplication(accreditation({}));
    expect(app).toMatchObject({ id: "a1", status: "accepted", vehicle: null, zone: null, checkedInAt: null });
    expect(app.event).toMatchObject({ slug: "nocturne", startsAt: "2026-10-22T17:00:00Z", status: "published" });
  });
  it("le statut est repris tel quel : une demande retirée ou refusée fait quitter le kit du téléphone", () => {
    expect(accreditationAsApplication(accreditation({ status: "refused" })).status).toBe("refused");
    expect(accreditationAsApplication(accreditation({ status: "cancelled" })).status).toBe("cancelled");
  });
});
