// Les votes d'un événement, côté passionné (lot R7l3, maquette R7.17 `vs_list`, parité de l'appli `/votes/<événement>`) : une
// ligne par vote (« Toutes catégories · Voté », « Plus belle japonaise · Ouvert », « Concours de rupteur · 8 min
// restantes », « Plus belle allemande · Ouvre à 16 h », « Clos · voir le classement »). Ouverte depuis la fiche de
// l'événement, le Jour J et la notification « vote lancé ». Les règles sont celles de l'API : la page affiche ce qu'elle répond.
import { Button } from "@orasso/design-system/web";
import { votePassTexts as T } from "@orasso/shared";
import { useRevalidator } from "react-router";

import { FicheBar, ficheHandle } from "../components/FicheBar";
import { useOrassoNow } from "../components/votes/useVoteClock";
import { VoteRows, votesHeading } from "../components/votes/VoteRows";
import { useLiveRevalidate } from "../lib/useLiveRevalidate";
import { loadVotes } from "../lib/vote.server";
import type { Route } from "./+types/votes";
import "../styles/votes-pass.css";

// Lot M7 : fiche ou parcours, mode B (en-tête de fiche, sans bande ni barre d'onglets).
export const handle = ficheHandle;

export function meta({ loaderData: d }: Route.MetaArgs) {
  return [{ title: `Votes${d?.event ? ` · ${d.event.title}` : ""} · Orasso` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  return loadVotes(request, params.slug);
}

export default function Votes({ loaderData }: Route.ComponentProps) {
  const { event, list, back, slug } = loaderData;
  const revalidator = useRevalidator();
  const now = useOrassoNow();
  // Temps réel : un message utile relit la page (au plus une fois toutes les 10 s) ; la reconnexion aussi.
  const { connected } = useLiveRevalidate(
    event ? `event:${event.id}:votes` : null,
    (m) =>
      m.type === "votes.changed" ||
      m.type === "theme_votes.changed" ||
      m.type === "votes.opened" ||
      m.type === "votes.closed" ||
      m.type === "votes.candidates.changed",
  );
  const items = list?.items ?? [];

  return (
    <div className="s-stack" data-testid="votes" data-live={connected ? "on" : "off"}>
      <FicheBar title={list ? votesHeading(items) : T.listTitle} facts={event?.title} back={back} />
      {!event || !list ? (
        <>
          <p className="s-error" role="alert" data-testid="votes-failed">
            {T.listLoadFailed}
          </p>
          <Button
            variant="secondary"
            icon="undo"
            onClick={() => void revalidator.revalidate()}
            data-testid="votes-retry"
          >
            {T.retry}
          </Button>
        </>
      ) : items.length === 0 ? (
        <p className="s-muted">{T.listEmpty}</p>
      ) : (
        <VoteRows items={items} now={now} slug={event.slug ?? slug} back={back} />
      )}
    </div>
  );
}
