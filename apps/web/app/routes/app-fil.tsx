import { navLabels } from "@orasso/shared";
import { data } from "react-router";
// Onglet Le Fil (lot R7a1, D38) : la place est prise, l'écran viendra du lot R7e2. En attendant, la page rend les
// notifications du Journal (`components/JournalView.tsx`, mêmes données) sous le titre « Le Fil », avec la bande ORASSO et
// la barre d'onglets (mode A). Tour 3 : sans « Tout marquer comme lu ». Lot R7c2 : `routes/journal.tsx` a disparu avec la
// Boîte ; le Fil garde l'action « couper les invitations d'une personne » (« ⋯ » d'une notification d'invitation).
import { JournalView } from "../components/JournalView";
import { muteInviterAction } from "../lib/eventInvite.server";
import { loadJournal } from "../lib/journal.server";
import type { Route } from "./+types/app-fil";

export async function loader({ request }: Route.LoaderArgs) {
  return loadJournal(request);
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  if (intent === "invite_mute") {
    const res = await muteInviterAction(request, form);
    return data(
      { error: res.data.inviteError ?? null, notice: res.data.inviteNotice ?? null },
      { status: res.init?.status ?? 200 },
    );
  }
  return data({ error: "Action inconnue.", notice: null }, { status: 400 });
}

export function meta() {
  return [{ title: `${navLabels.fil.title} · Orasso` }, { name: "robots", content: "noindex" }];
}

export default function AppFil({ loaderData, actionData }: Route.ComponentProps) {
  return <JournalView loaderData={loaderData} actionData={actionData} title={navLabels.fil.title} />;
}
