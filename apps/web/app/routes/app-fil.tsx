import { navLabels } from "@orasso/shared";
// Onglet Le Fil (lot R7a1, D38) : la place est prise, l'écran viendra du lot R7e2. En attendant, la page rend les
// notifications du Journal (`routes/journal.tsx`, mêmes données, même formulaire « Tout marquer comme lu », seul moyen de
// les marquer : la page ne lit rien d'elle-même) sous le titre « Le Fil », avec la bande ORASSO et la barre d'onglets
// (mode A). Tour 2 : comme dans l'appli, les notifications seules (ni messages ni demandes, qui restent dans la Boîte).
import { loadJournal } from "../lib/journal.server";
import type { Route } from "./+types/app-fil";
import { JournalView } from "./journal";

export { action } from "./journal";

export async function loader({ request }: Route.LoaderArgs) {
  return loadJournal(request, true);
}

export function meta() {
  return [{ title: `${navLabels.fil.title} · Orasso` }, { name: "robots", content: "noindex" }];
}

export default function AppFil({ loaderData, actionData }: Route.ComponentProps) {
  return <JournalView loaderData={loaderData} actionData={actionData} title={navLabels.fil.title} segments={false} />;
}
