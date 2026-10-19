// Statut d'une candidature en pastille sans néon (lot 43). Le `StatusBadge` du système de design est incliné et porte le
// néon moutarde de « Retenue » : sur un écran qui en montre plusieurs (tickets de Sorties, cartes de l'Accueil), il
// romprait la règle « un seul néon par écran » (le seul est celui du bouton principal). Ici la même information en
// pastille : pleine (moutarde) quand la place est à toi, contour sinon ; lisible sans la couleur.

import { Chip } from "@orasso/design-system/native";
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

export function StatusTag({ status, rank: place }: { status: StatusTagKind; rank?: number | null }) {
  const filled = status === "retained" || status === "onsite";
  return (
    <Chip surface="plate" selected={filled}>
      {status === "waitlist" && place ? `${LABELS.waitlist} · ${rank(place)}` : LABELS[status]}
    </Chip>
  );
}

export function ApplicationStatusTag({ app }: { app: Pick<MyApplication, "status" | "checkedInAt" | "waitlistRank"> }) {
  switch (app.status) {
    case "pending":
      return <StatusTag status="pending" />;
    case "accepted":
      return <StatusTag status={app.checkedInAt ? "onsite" : "retained"} />;
    case "waitlisted":
    case "offered":
      return <StatusTag status="waitlist" rank={app.waitlistRank} />;
    case "refused":
      return <StatusTag status="refused" />;
    case "cancelled":
      return <StatusTag status="cancelled" />;
    default:
      return <Chip surface="plate">{applicationStatusLabels[app.status]}</Chip>;
  }
}
