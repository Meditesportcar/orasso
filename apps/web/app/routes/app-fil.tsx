import { navLabels } from "@orasso/shared";
import type { Route } from "./+types/app-fil";
import { JournalView } from "./journal";

// Onglet Le Fil (lot R7a1, D38) : la place est prise, l'écran viendra du lot R7e2. En attendant, la page rend le Journal
// actuel (`routes/journal.tsx`, mêmes données, même formulaire « Tout marquer comme lu ») sous le titre « Le Fil », avec la
// bande ORASSO et la barre d'onglets (mode A).
export { action, loader } from "./journal";

export function meta() {
  return [{ title: `${navLabels.fil.title} · Orasso` }, { name: "robots", content: "noindex" }];
}

export default function AppFil({ loaderData, actionData }: Route.ComponentProps) {
  return <JournalView loaderData={loaderData} actionData={actionData} title={navLabels.fil.title} segments={false} />;
}
