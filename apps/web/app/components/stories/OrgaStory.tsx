import { Button } from "@orasso/design-system/web";
import { storyShareLabels as L, type StoriesByAuthor, type StoryMentions } from "@orasso/shared";
import { useEffect, useRef, useState } from "react";
import { Form, useNavigation, useRevalidator } from "react-router";

import { apiFetch } from "../../lib/api.client";
import { MentionPager, type PagerState } from "./mention-pages";
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

/**
 * Les pages suivantes des mentions (« Voir plus »), tenues par `MentionPager` (tours 5 et 6). Quand la première page change,
 * ou au retour d'un geste de la personne (« Ajouter », « Retirer »), les pages déjà chargées sont relues à la même
 * profondeur ; une première page identique ne relance rien et les revalidations se regroupent. Relecture et « Voir plus »
 * sont sérialisés ; une lecture rattachée à une première page qui a changé est écartée et reprend du nouveau curseur.
 */
function useMentionPages(structureId: string, first: StoryMentions | null, afterAction: boolean) {
  const [state, setState] = useState<PagerState>({ items: [], next: null, depth: 0, busy: false, error: null });
  const id = useRef(structureId);
  id.current = structureId;
  const [pager] = useState(
    () =>
      new MentionPager(
        (cursor) =>
          apiFetch<StoryMentions>(`/structures/${id.current}/story-mentions?cursor=${encodeURIComponent(cursor)}`),
        setState,
      ),
  );
  // Chaque nouvelle première page (revalidation, geste) : le pager relit les pages chargées et écarte les lectures dépassées ;
  // au retour d'un geste de la personne (`afterAction`, une fois par geste), il relit même si la première page n'a pas changé.
  // biome-ignore lint/correctness/useExhaustiveDependencies: déclenchée par la première page et par le retour d'un geste
  useEffect(() => pager.sync(first, afterAction), [first, afterAction]);
  const next = state.depth > 0 ? state.next : (first?.nextCursor ?? null);
  return { items: state.items, next, busy: state.busy, error: state.error, more: () => pager.more() };
}

export function OrgaStory({
  structureId,
  mentions,
  mine,
  failed,
  mineFailed,
  notice,
  afterAction,
  withMentions,
}: {
  structureId: string;
  mentions: StoryMentions | null;
  mine: StoriesByAuthor | null;
  failed: boolean;
  /** La lecture de « Ma story » a échoué : la section reste, avec l'erreur et « Réessayer ». */
  mineFailed: boolean;
  notice: string | null;
  /**
   * Ce chargement revient d'un geste de la personne (« ?story=added|removed » dans l'adresse) : les pages « Voir plus » sont
   * relues une fois, même si la première page n'a pas changé. Vient du chargeur, pas du message affiché (qui reste visible
   * une revalidation de plus) : une seule relecture forcée par geste.
   */
  afterAction: boolean;
  /** Les mentions seulement le jour de l'événement ; « Ma story » (et ses retraits) tant qu'une story est en ligne. */
  withMentions: boolean;
}) {
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const revalidator = useRevalidator();
  const stories = mine?.stories ?? [];
  const pages = useMentionPages(structureId, mentions, afterAction);
  // « Ignorer » (comme dans l'appli) laisse la mention de côté le temps de la page ; rien n'est enregistré.
  const [ignored, setIgnored] = useState<ReadonlySet<string>>(new Set());
  const firstIds = new Set((mentions?.items ?? []).map((m) => m.storyId));
  const shown = [...(mentions?.items ?? []), ...pages.items.filter((m) => !firstIds.has(m.storyId))].filter(
    (m) => !ignored.has(m.storyId),
  );
  return (
    <section className="orga__panel s-stack" aria-labelledby="story-title" data-testid="orga-story">
      {withMentions ? (
        <>
          <h2 id="story-title" className="s-h2">
            {mentions ? L.mentionsCount(mentions.count) : L.mentions}
          </h2>
          <p className="s-muted">{L.mentionsHint}</p>
        </>
      ) : null}
      {notice ? (
        <p className="s-notice" role="status" data-testid="orga-story-notice">
          {notice}
        </p>
      ) : null}
      {withMentions ? (
        <>
          {failed ? (
            <p className="s-notice" role="alert">
              {L.mentionsError}
            </p>
          ) : null}
          {mentions && mentions.items.length === 0 ? <p className="s-muted">{L.mentionsEmpty}</p> : null}
          <ul className="ostory" data-testid="orga-mentions">
            {shown.map((m) => (
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
                    <>
                      <Button
                        variant="secondary"
                        icon="add"
                        type="submit"
                        disabled={busy}
                        data-testid="orga-mention-add"
                      >
                        {L.add}
                      </Button>
                      <Button
                        variant="secondary"
                        icon="close"
                        type="button"
                        disabled={busy}
                        onClick={() => setIgnored((cur) => new Set(cur).add(m.storyId))}
                        data-testid="orga-mention-ignore"
                      >
                        {L.ignore}
                      </Button>
                    </>
                  )}
                </Form>
              </li>
            ))}
          </ul>
          {pages.error ? (
            <p className="s-notice" role="alert">
              {pages.error}
            </p>
          ) : null}
          {pages.next ? (
            <Button
              variant="secondary"
              icon="down"
              type="button"
              disabled={pages.busy}
              onClick={() => void pages.more()}
              data-testid="orga-mentions-more"
            >
              {L.mentionsMore}
            </Button>
          ) : null}
        </>
      ) : null}
      <h2 id={withMentions ? undefined : "story-title"} className="s-h2">
        {L.mine}
      </h2>
      <p className="s-muted">{L.mineHint}</p>
      {mine && stories.length === 0 ? <p className="s-muted">{L.mineEmpty}</p> : null}
      {mineFailed ? (
        <p className="s-notice" role="alert" data-testid="orga-mystory-error">
          {L.mineError}
        </p>
      ) : null}
      {failed || mineFailed ? (
        <Button
          variant="secondary"
          icon="undo"
          type="button"
          disabled={revalidator.state !== "idle"}
          onClick={() => revalidator.revalidate()}
          data-testid="orga-story-retry"
        >
          {L.retry}
        </Button>
      ) : null}
      <ul className="ostory" data-testid="orga-mystory">
        {stories.map((s) => (
          <li key={s.id} className="ostory__row" data-testid="orga-mystory-row">
            <Thumb storyId={s.id} alt="Story de la structure" />
            <span className="ostory__text">
              <span className="o-t-caption s-muted">{when(s.createdAt)}</span>
              {s.sharedFrom ? (
                <strong data-testid="orga-mystory-credit">{L.mineAddedBy(s.sharedFrom.name)}</strong>
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
