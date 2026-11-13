// La barre de stories du Fil sur le site (lot R7f2, maquette R7.6 `.r7stories`) : « Ta story » d'abord (« + » sans story, ton
// anneau sinon), puis un rond par auteur (`GET /stories/bar`, déjà trié par l'API : non vues d'abord) : anneau clair (abonnés),
// rouge brique (crew), moutarde « EN COURS » (sans néon : un seul néon par écran, celui du bouton principal), anneau fin quand tout est vu. Le nom
// dessous ne se coupe jamais. Lue dans le navigateur (cookie de session, rien dans le HTML rendu par le serveur) : au retour
// sur l'onglet et quand `story.ready` arrive sur `user:{id}`. Une panne n'est jamais une barre vide : « Réessayer ».
// Mêmes règles et mêmes mots que l'appli (`@orasso/shared`).
import { AvatarRing, Button, Icon } from "@orasso/design-system/web";
import { barDisplay, storyViewerLabels as L, mineRingState, type StoryBar } from "@orasso/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import "../../styles/stories.css";
import { useCasquette } from "../../lib/actor";
import { apiFetch } from "../../lib/api.client";
import { useChannel } from "../../lib/useChannel";

/** « Publier une story » : le « + » y mène ; en casquette, au nom de la page (`?auteur=<clé>`, lot R9h). */
const PUBLISH_HREF = "/app/story/publier";
const publishHref = (actor: string | null) =>
  actor ? `${PUBLISH_HREF}?auteur=${encodeURIComponent(actor)}` : PUBLISH_HREF;

/** Depuis la barre du Fil (lot R8s) : `?suite=barre`, la lecture enchaîne les auteurs suivants de la barre. */
export const storyHref = (key: string, barre?: string | null) =>
  `/app/story/${encodeURIComponent(key)}?suite=barre${barre ? `&barre=${encodeURIComponent(barre)}` : ""}`;

export function StoriesBar({
  userId,
  pseudo,
  avatarUrl,
}: {
  userId: string;
  pseudo: string;
  avatarUrl: string | null;
}) {
  // Lot R9h (T51) : en casquette, `GET /stories/bar` avec l'acteur rend `mine` = les stories de la page, et le premier rond porte son
  // logo ; hors espace de casquette, `null` et rien ne change.
  const casquette = useCasquette();
  const actor = casquette?.key ?? null;
  const ownKey = actor ?? `u:${userId}`;
  const ownName = casquette?.name ?? pseudo;
  const ownAvatar = casquette ? casquette.logoUrl : avatarUrl;
  const addHref = publishHref(actor);
  const [bar, setBar] = useState<StoryBar | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    const res = await apiFetch<StoryBar>("/stories/bar", { actor });
    if (mine !== seq.current) return;
    if (!res.ok) {
      setError(res.status === 429 ? L.tooMany : L.loadError);
      return;
    }
    setBar(res.data);
    setError(null);
  }, [actor]);

  useEffect(() => {
    void load();
    const again = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", again);
    window.addEventListener("pageshow", again);
    return () => {
      document.removeEventListener("visibilitychange", again);
      window.removeEventListener("pageshow", again);
    };
  }, [load]);
  useChannel(`user:${userId}`, (m) => {
    if (m.type === "story.ready") void load();
  });

  const mineState = mineRingState(bar?.mine ?? null);
  const display = barDisplay(bar?.authors ?? []);

  return (
    <nav className="stories-bar" aria-label={L.barTitle} data-testid="stories-bar">
      <ul className="stories-bar__row">
        <li className="stories-bar__item" data-testid="stories-mine">
          {mineState || casquette ? (
            <>
              <a
                href={mineState ? storyHref(ownKey, actor) : addHref}
                className="stories-bar__link"
                aria-label={mineState ? L.openMine : L.addStoryHint}
                data-testid="stories-mine-ring"
              >
                <AvatarRing ring={mineState} size="lg" src={ownAvatar} name={ownName} />
              </a>
              <a href={addHref} className="stories-bar__plus" aria-label={L.addStoryHint} data-testid="stories-add">
                <Icon name="add" size={12} />
              </a>
            </>
          ) : (
            <a href={addHref} className="stories-bar__add" aria-label={L.addStoryHint} data-testid="stories-add">
              <Icon name="add" size={24} />
            </a>
          )}
          <span className="stories-bar__name">{L.addStory}</span>
        </li>
        {(bar?.authors ?? []).map((a, i) => {
          const d = display[i];
          if (!d) return null;
          return (
            <li key={a.key} className="stories-bar__item" data-testid={`stories-author-${a.key}`}>
              <a
                href={storyHref(a.key, actor)}
                className="stories-bar__link"
                aria-label={`${L.openStories(a.pseudoOrName)}${a.crewName ? `, ${a.crewName}` : ""}`}
              >
                <AvatarRing ring={d.state} neon={false} size="lg" src={a.avatarUrl} name={a.pseudoOrName} />
                {d.liveLabel ? (
                  <span className="stories-bar__live" data-testid="stories-live-label">
                    {L.live}
                  </span>
                ) : null}
              </a>
              <span className={d.liveLabel ? "stories-bar__name stories-bar__name--live" : "stories-bar__name"}>
                {a.pseudoOrName}
              </span>
            </li>
          );
        })}
      </ul>
      {error && !bar ? (
        <div className="stories-bar__error" role="alert" data-testid="stories-error">
          <p className="o-t-caption">{error}</p>
          <Button variant="secondary" icon="undo" onClick={() => void load()} data-testid="stories-retry">
            {L.retry}
          </Button>
        </div>
      ) : null}
    </nav>
  );
}
