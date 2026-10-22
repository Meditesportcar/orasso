// Statut d'une candidature en pastille sans néon (lot 43). Le `StatusBadge` du système de design est incliné et porte le
// néon moutarde de « Retenue » : sur un écran qui en montre plusieurs (tickets de Sorties, cartes de l'Accueil), il
// romprait la règle « un seul néon par écran » (le seul est celui du bouton principal). Ici la même information en
// pastille : pleine (moutarde) quand la place est à toi, contour sinon ; lisible sans la couleur.

import { Chip, Tag } from "@orasso/design-system/native";
import { applicationStatusLabels, type MyApplication } from "@orasso/shared";

const rank = (n: number) => (n === 1 ? "1er" : `${n}e`);

export type StatusTagKind = "retained" | "onsite" | "pending" | "waitlist" | "refused" | "cancelled";

const LABELS: Record<StatusTagKind, string> = {
  retained: "Retenue",
  onsite: "Sur place",
  pending: "En attente",
  waitlist: "Liste d'attente",
  refused: "Refusée",
  cancelled: "Annulé",
};

export function StatusTag({
  status,
  rank: place,
  on,
}: {
  status: StatusTagKind;
  rank?: number | null;
  /** Lot C1 : sur l'affiche (`PosterHero`), l'étiquette inclinée `.tag` de l'artefact, aux couleurs de l'affiche. */
  on?: "poster";
}) {
  const filled = status === "retained" || status === "onsite";
  const label = status === "waitlist" && place ? `${LABELS.waitlist} · ${rank(place)}` : LABELS[status];
  if (on === "poster") {
    return (
      <Tag on="poster" tone={filled ? "acc" : "line"}>
        {label}
      </Tag>
    );
  }
  return (
    <Chip surface="plate" selected={filled}>
      {status === "waitlist" && place ? `${LABELS.waitlist} · ${rank(place)}` : LABELS[status]}
    </Chip>
  );
}

export function ApplicationStatusTag({
  app,
  on,
}: {
  app: Pick<MyApplication, "status" | "checkedInAt" | "waitlistRank">;
  on?: "poster";
}) {
  switch (app.status) {
    case "pending":
      return <StatusTag status="pending" on={on} />;
    case "accepted":
      return <StatusTag status={app.checkedInAt ? "onsite" : "retained"} on={on} />;
    case "waitlisted":
    case "offered":
      return <StatusTag status="waitlist" rank={app.waitlistRank} on={on} />;
    case "refused":
      return <StatusTag status="refused" on={on} />;
    case "cancelled":
      return <StatusTag status="cancelled" on={on} />;
    default:
      return on === "poster" ? (
        <Tag on="poster" tone="line">
          {applicationStatusLabels[app.status]}
        </Tag>
      ) : (
        <Chip surface="plate">{applicationStatusLabels[app.status]}</Chip>
      );
  }
}
