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
import { apiFetch } from "../../lib/api.client";
import { useChannel } from "../../lib/useChannel";

/** La route « Publier une story » est créée par le lot R7f3 (fusionné juste après celui-ci) : le « + » y mène toujours. */
const PUBLISH_HREF = "/app/story/publier";

export const storyHref = (key: string) => `/app/story/${encodeURIComponent(key)}`;

export function StoriesBar({
  userId,
  pseudo,
  avatarUrl,
}: {
  userId: string;
  pseudo: string;
  avatarUrl: string | null;
}) {
  const [bar, setBar] = useState<StoryBar | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    const res = await apiFetch<StoryBar>("/stories/bar");
    if (mine !== seq.current) return;
    if (!res.ok) {
      setError(res.status === 429 ? L.tooMany : L.loadError);
      return;
    }
    setBar(res.data);
    setError(null);
  }, []);

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
          {mineState ? (
            <>
              <a
                href={storyHref(`u:${userId}`)}
                className="stories-bar__link"
                aria-label={L.openMine}
                data-testid="stories-mine-ring"
              >
                <AvatarRing ring={mineState} size="lg" src={avatarUrl} name={pseudo} />
              </a>
              <a
                href={PUBLISH_HREF}
                className="stories-bar__plus"
                aria-label={L.addStoryHint}
                data-testid="stories-add"
              >
                <Icon name="add" size={12} />
              </a>
            </>
          ) : (
            <a href={PUBLISH_HREF} className="stories-bar__add" aria-label={L.addStoryHint} data-testid="stories-add">
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
                href={storyHref(a.key)}
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
