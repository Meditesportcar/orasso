// Statut d'une candidature affiché avec le composant StatusBadge (ou une chip quand le système n'a pas de badge).
import { applicationStatusLabels, type MyApplication } from "@orasso/shared";
import { Chip, StatusBadge } from "@orasso/design-system/native";

export function ApplicationStatusBadge({ app }: { app: Pick<MyApplication, "status" | "checkedInAt" | "waitlistRank"> }) {
  switch (app.status) {
    case "pending":
      return <StatusBadge status="pending" />;
    case "accepted":
      return <StatusBadge status={app.checkedInAt ? "onsite" : "retained"} />;
    case "waitlisted":
    case "offered":
      return <StatusBadge status="waitlist" rank={app.waitlistRank ?? undefined} />;
    case "refused":
      return <StatusBadge status="refused" />;
    case "cancelled":
      return <StatusBadge status="cancelled" />;
    default:
      return <Chip>{applicationStatusLabels[app.status]}</Chip>;
  }
}
