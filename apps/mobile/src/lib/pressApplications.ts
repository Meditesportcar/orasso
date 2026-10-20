// Badge presse (lot 55) : une accréditation est une candidature de genre `media`, absente de `GET /me/applications`
// (réservé aux véhicules). Pour que le QR du jour J (kit enregistré sur le téléphone, rafraîchi la veille, hors ligne)
// serve aussi au média, ses accréditations retenues sont ramenées à la forme d'une candidature : seuls l'identifiant,
// le statut et l'événement comptent pour le kit.
import type { MediaAccreditationView, MyApplication } from "@orasso/shared";

export function accreditationAsApplication(a: MediaAccreditationView): MyApplication {
  return {
    id: a.id,
    status: a.status,
    event: {
      id: a.event.id,
      slug: a.event.slug,
      title: a.event.title,
      format: a.event.format,
      startsAt: a.event.startsAt,
      endsAt: a.event.endsAt,
      city: a.event.city,
      status: "published",
    },
    vehicle: null,
    day: null,
    waitlistRank: null,
    offerExpiresAt: null,
    withdrawDeadline: a.event.startsAt,
    withdrawnAfterLock: false,
    refusalReasons: null,
    refusalNote: a.refusalNote,
    zone: null,
    createdAt: a.createdAt,
    checkedInAt: null,
    pointsPending: false,
    points: null,
    malus: null,
    review: null,
    crew: null,
  };
}
