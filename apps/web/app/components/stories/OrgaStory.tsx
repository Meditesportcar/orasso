import { Button } from "@orasso/design-system/web";
import { storyShareLabels as L, type StoriesByAuthor, type StoryMentions } from "@orasso/shared";
import { useEffect, useState } from "react";
import { Form, useNavigation } from "react-router";

import "../../styles/stories.css";

// Les stories de l'organisateur (lot R7h, maquette R7.14 `og_men`, `og_add`, `og_mine`) sur la page de l'événement : « Mentions
// · N » (les stories qui identifient la structure ou un de ses événements) avec « Ajouter à ma story », puis « Ma story »
// (celles de la structure, avec le crédit de l'auteur d'origine et « Retirer »). Tout vient de l'API, qui juge ce qui est
// visible ; les aperçus sont lus dans le navigateur seulement (jamais d'adresse de média dans le HTML rendu par le serveur,
// comme la visionneuse).

/**
 * Aperçu 9:16 réduit, posé après le chargement de la page (route protégée `/api/stories/:id/thumb`, cookie de session) :
 * ni les données du chargeur ni le HTML rendu par le serveur ne portent d'adresse de média, seulement l'identifiant.
 */
function Thumb({ storyId, alt }: { storyId: string; alt: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => setSrc(`/api/stories/${storyId}/thumb`), [storyId]);
  return (
    <span className="ostory__thumb" aria-hidden={src ? undefined : true}>
      {src ? <img src={src} alt={alt} loading="lazy" /> : null}
    </span>
  );
}

const when = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(new Date(iso));

export function OrgaStory({
  mentions,
  mine,
  failed,
  notice,
}: {
  mentions: StoryMentions | null;
  mine: StoriesByAuthor | null;
  failed: boolean;
  notice: string | null;
}) {
  const busy = useNavigation().state !== "idle";
  const stories = mine?.stories ?? [];
  return (
    <section className="orga__panel s-stack" aria-labelledby="story-title" data-testid="orga-story">
      <h2 id="story-title" className="s-h2">
        {mentions ? L.mentionsCount(mentions.count) : L.mentions}
      </h2>
      <p className="s-muted">{L.mentionsHint}</p>
      {notice ? (
        <p className="s-notice" role="status" data-testid="orga-story-notice">
          {notice}
        </p>
      ) : null}
      {failed ? (
        <p className="s-notice" role="alert">
          {L.mentionsError}
        </p>
      ) : null}
      {mentions && mentions.items.length === 0 ? <p className="s-muted">{L.mentionsEmpty}</p> : null}
      <ul className="ostory" data-testid="orga-mentions">
        {(mentions?.items ?? []).map((m) => (
          <li key={m.storyId} className="ostory__row" data-testid="orga-mention">
            <Thumb storyId={m.storyId} alt={`Story de ${m.authorName}`} />
            <span className="ostory__text">
              <strong>{m.authorName}</strong>
              <span className="o-t-caption s-muted">{when(m.createdAt)}</span>
              {m.caption ? <span className="o-t-caption s-muted">{m.caption}</span> : null}
            </span>
            <Form method="post" className="ostory__act">
              <input type="hidden" name="intent" value={m.copyId ? "story-remove" : "story-share"} />
              <input type="hidden" name="storyId" value={m.copyId ?? m.storyId} />
              {m.copyId ? (
                <Button
                  variant="secondary"
                  icon="close"
                  type="submit"
                  disabled={busy}
                  data-testid="orga-mention-remove"
                >
                  {L.remove}
                </Button>
              ) : (
                <Button variant="secondary" icon="add" type="submit" disabled={busy} data-testid="orga-mention-add">
                  {L.add}
                </Button>
              )}
            </Form>
          </li>
        ))}
      </ul>

      <h2 className="s-h2">{L.mine}</h2>
      <p className="s-muted">{L.mineHint}</p>
      {mine && stories.length === 0 ? <p className="s-muted">{L.mineEmpty}</p> : null}
      <ul className="ostory" data-testid="orga-mystory">
        {stories.map((s) => (
          <li key={s.id} className="ostory__row" data-testid="orga-mystory-row">
            <Thumb storyId={s.id} alt="Story de la structure" />
            <span className="ostory__text">
              <span className="o-t-caption s-muted">{when(s.createdAt)}</span>
              {s.sharedFrom ? (
                <strong data-testid="orga-mystory-credit">{L.mineAddedBy(s.sharedFrom.authorPseudo)}</strong>
              ) : null}
              {s.caption ? <span className="o-t-caption s-muted">{s.caption}</span> : null}
            </span>
            <Form method="post" className="ostory__act">
              <input type="hidden" name="intent" value="story-remove" />
              <input type="hidden" name="storyId" value={s.id} />
              <Button variant="secondary" icon="close" type="submit" disabled={busy} data-testid="orga-mystory-remove">
                {L.remove}
              </Button>
            </Form>
          </li>
        ))}
      </ul>
    </section>
  );
}
