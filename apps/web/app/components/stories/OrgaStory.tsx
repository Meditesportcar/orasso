import { Button } from "@orasso/design-system/web";
import { storyShareLabels as L, type StoriesByAuthor, type StoryMentionItem, type StoryMentions } from "@orasso/shared";
import { useEffect, useRef, useState } from "react";
import { Form, useNavigation } from "react-router";

import { apiFetch } from "../../lib/api.client";
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
 * Empreinte de la première page des mentions : change quand son contenu change (nouvelle mention, ajout, retrait), pas à
 * chaque rechargement identique (le vote du public revalide la page toutes les quelques secondes).
 */
const firstPageKey = (first: StoryMentions | null) =>
  first
    ? `${first.count}|${first.nextCursor ?? ""}|${first.items.map((m) => `${m.storyId}:${m.copyId ?? ""}`).join(",")}`
    : "";

/**
 * Les pages suivantes des mentions (« Voir plus »). Elles se rattachent à l'empreinte de la première page courante et à
 * un compteur de gestes (ajout, retrait) : quand l'une des deux change, les pages suivantes sont vidées et la réponse d'une
 * page demandée pour une première page dépassée est rejetée (même règle que l'appli). Un rechargement qui rend la même
 * première page (vote du public) ne vide rien et n'abandonne pas une page en cours.
 */
function useMentionPages(structureId: string, first: StoryMentions | null, epoch: number) {
  const key = `${epoch}#${firstPageKey(first)}`;
  const [tail, setTail] = useState<{
    base: string;
    items: StoryMentionItem[];
    next: string | null | undefined;
    busy: boolean;
    error: string | null;
  } | null>(null);
  const current = useRef(key);
  current.current = key;
  const mine = tail && tail.base === key ? tail : null;
  const items = mine?.items ?? [];
  const next = mine && mine.next !== undefined ? mine.next : (first?.nextCursor ?? null);
  const more = async () => {
    if (!first || !next || mine?.busy) return;
    const base = key;
    setTail({ base, items, next, busy: true, error: null });
    const res = await apiFetch<StoryMentions>(
      `/structures/${structureId}/story-mentions?cursor=${encodeURIComponent(next)}`,
    );
    // Première page remplacée entre-temps : cette réponse est périmée, elle ne s'ajoute à rien.
    if (current.current !== base) return;
    setTail(
      res.ok
        ? { base, items: [...items, ...res.data.items], next: res.data.nextCursor, busy: false, error: null }
        : { base, items, next, busy: false, error: res.error.message },
    );
  };
  return { items, next, busy: Boolean(mine?.busy), error: mine?.error ?? null, more };
}

export function OrgaStory({
  structureId,
  mentions,
  mine,
  failed,
  notice,
  withMentions,
}: {
  structureId: string;
  mentions: StoryMentions | null;
  mine: StoriesByAuthor | null;
  failed: boolean;
  notice: string | null;
  /** Les mentions seulement le jour de l'événement ; « Ma story » (et ses retraits) tant qu'une story est en ligne. */
  withMentions: boolean;
}) {
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const stories = mine?.stories ?? [];
  // Un geste (ajout, retrait) change ce que les pages suivantes montrent : on les vide, la première page est relue.
  const [epoch, setEpoch] = useState(0);
  const intent = nav.formData ? String(nav.formData.get("intent") ?? "") : "";
  useEffect(() => {
    if (intent === "story-share" || intent === "story-remove") setEpoch((n) => n + 1);
  }, [intent]);
  const pages = useMentionPages(structureId, mentions, epoch);
  // « Ignorer » (comme dans l'appli) laisse la mention de côté le temps de la page ; rien n'est enregistré.
  const [ignored, setIgnored] = useState<ReadonlySet<string>>(new Set());
  const shown = [...(mentions?.items ?? []), ...pages.items].filter((m) => !ignored.has(m.storyId));
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
