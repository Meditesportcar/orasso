import { Chip, Icon } from "@orasso/design-system/web";
import {
  authorFichePath,
  type EventMentionsSection,
  type EventPublic,
  type FeedPostView,
  eventJournalLabels as L,
  type MentionItem,
  type MentionsPage,
  mentionsPhase,
  publicationPath,
} from "@orasso/shared";
import { useState } from "react";
import { useRevalidator } from "react-router";

import { FicheBar, ficheHandle } from "../components/FicheBar";
import { PostMenu } from "../components/publications/PostMenu";
import { apiFetch } from "../lib/api.client";
import { apiOrThrow, requireMe } from "../lib/api.server";
import { nowMs } from "../lib/clock";
import "../styles/event-journal.css";
import type { Route } from "./+types/event-mentions";

// L'écran « Mentions · N » d'un événement (lot R8d, maquette R8.5 `mentionsH`), mêmes mots et mêmes règles que l'appli. Mode B
// (fiche). Session requise (les mentions ne sont jamais servies à un visiteur). « Sur place » : une carte par pro ou prestataire,
// « Sa fiche » ; « Passionnés » : comptes publics, et après la fin seulement ceux dont la présence est validée (tampon « Présent »).
// Un responsable de la fiche a un « … » par mention (« Masquer de la fiche » / « Remettre sur la fiche ») et le filtre « Masquées ».
export const handle = ficheHandle;

async function readAll(request: Request, eventId: string, section: EventMentionsSection, hidden: boolean) {
  const out: MentionItem[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 10; i++) {
    const q: string = new URLSearchParams({
      section,
      ...(cursor ? { cursor } : {}),
      ...(hidden ? { hidden: "1" } : {}),
    }).toString();
    const res: MentionsPage = await apiOrThrow<MentionsPage>(request, `/events/${eventId}/mentions?${q}`);
    out.push(...res.items);
    cursor = res.nextCursor;
    if (!cursor) break;
  }
  return out;
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const me = await requireMe(request);
  const event = await apiOrThrow<EventPublic>(request, `/events/by-slug/${encodeURIComponent(params.slug)}`);
  const manager = Boolean(me.personas?.some((p) => p.kind === "organizer" && p.id === event.structure.id));
  const get = async (section: EventMentionsSection) => {
    try {
      return await readAll(request, event.id, section, manager);
    } catch (error) {
      // Un responsable refusé (second facteur) lit comme tout le monde.
      if (manager) return readAll(request, event.id, section, false);
      throw error;
    }
  };
  const [onSite, fans] = await Promise.all([get("on_site"), get("fans")]);
  return {
    event: { id: event.id, slug: event.slug, title: event.title, endsAt: event.endsAt },
    manager,
    onSite,
    fans,
    after: mentionsPhase(event, new Date(nowMs())) === "after",
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [
    { title: `Mentions · ${loaderData?.event.title ?? "Événement"} · Orasso` },
    { name: "robots", content: "noindex" },
  ];
}

export default function EventMentions({ loaderData }: Route.ComponentProps) {
  const { event, manager, onSite, fans, after } = loaderData;
  const revalidator = useRevalidator();
  const [filter, setFilter] = useState<"visible" | "hidden">("visible");
  const [menu, setMenu] = useState<MentionItem | null>(null);
  const total = onSite.filter((i) => !i.hidden).length + fans.filter((i) => !i.hidden).length;
  const shown = (items: MentionItem[]) =>
    items.filter((i) => (manager ? (filter === "hidden" ? i.hidden : !i.hidden) : true));
  const places = shown(onSite);
  const people = shown(fans);

  async function toggleHidden(item: MentionItem): Promise<string | null> {
    const res = await apiFetch(
      `/mentions/${encodeURIComponent(`e:${event.id}`)}/${encodeURIComponent(item.post.id)}/hidden`,
      {
        method: item.hidden ? "DELETE" : "PUT",
      },
    );
    if (!res.ok) return res.error.message || L.actionError;
    revalidator.revalidate();
    return null;
  }

  const dots = (item: MentionItem) =>
    manager ? (
      <button
        type="button"
        className="evm__dots"
        aria-label={L.menuOpen}
        onClick={() => setMenu(item)}
        data-testid="mention-menu"
      >
        <Icon name="more" size={18} />
      </button>
    ) : null;

  const subtitle = (post: FeedPostView) => {
    const kind =
      post.author.kind === "provider" ? L.kindProvider : post.author.kind === "pro" ? L.kindPro : L.kindMedia;
    return `${kind} · ${after ? L.stateAfter : L.stateBefore}`;
  };

  return (
    <>
      <FicheBar
        title={L.mentionsTitle(total)}
        facts={event.title}
        back={`/e/${event.slug}`}
        closeLabel={L.backToEvent}
      />
      <div className="evm" data-testid="event-mentions">
        {manager ? (
          <div className="evm__filters" role="tablist">
            {(["visible", "hidden"] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filter === f}
                className="evm__filter"
                onClick={() => setFilter(f)}
                data-testid={`mentions-filter-${f}`}
              >
                <Chip selected={filter === f}>{f === "visible" ? L.filterVisible : L.filterHidden}</Chip>
              </button>
            ))}
          </div>
        ) : null}

        {places.length > 0 ? (
          <section className="evm__section" data-testid="mentions-on-site">
            <div className="evm__head">
              <Icon name="truck" size={16} />
              <strong>{L.onSite}</strong>
              <span>{places.length}</span>
            </div>
            {places.map((item) => {
              const href = authorFichePath(item.post.author);
              const photo = item.post.photos[0];
              return (
                <article key={item.post.id} className="evm__place" data-testid="mention-on-site">
                  <div className="evm__who">
                    <div>
                      <strong>{item.post.author.name}</strong>
                      <small>{subtitle(item.post)}</small>
                      {item.hidden ? <small>{L.hiddenTag}</small> : null}
                    </div>
                    {dots(item)}
                  </div>
                  <a
                    className="evm__shot"
                    href={publicationPath(item.post.id, { web: true })}
                    aria-label={item.post.caption ?? item.post.author.name}
                  >
                    {photo ? <img src={photo.url} alt="" loading="lazy" decoding="async" /> : null}
                  </a>
                  {item.post.caption ? <p className="s-prewrap">{item.post.caption}</p> : null}
                  {href ? (
                    <a className="o-button o-button--secondary" href={href} data-testid="mention-her-page">
                      <Icon name="next" size={16} />
                      {L.herPage}
                    </a>
                  ) : null}
                </article>
              );
            })}
          </section>
        ) : null}

        {people.length > 0 ? (
          <section className="evm__section" data-testid="mentions-fans">
            <div className="evm__head">
              <Icon name="profile" size={16} />
              <strong>{after ? L.fansAfter : L.fansBefore}</strong>
              <span>{people.length}</span>
            </div>
            <div className="evm__rail">
              {people.map((item) => {
                const photo = item.post.photos[0];
                return (
                  <div key={item.post.id} className="evm__fan" data-testid="mention-fan">
                    <a
                      className="evm__fanshot"
                      href={publicationPath(item.post.id, { web: true })}
                      aria-label={item.post.author.pseudo}
                    >
                      {photo ? <img src={photo.url} alt="" loading="lazy" decoding="async" /> : null}
                      <span className="evm__name">{item.post.author.pseudo}</span>
                      {item.post.attach?.presenceValidated ? (
                        <span className="evm__stamp" data-testid="mention-present">
                          <Icon name="stamp" size={12} />
                          {L.present}
                        </span>
                      ) : null}
                    </a>
                    {manager ? (
                      <button
                        type="button"
                        className="evj-dots"
                        aria-label={L.menuOpen}
                        onClick={() => setMenu(item)}
                        data-testid="mention-menu"
                      >
                        <Icon name="more" size={18} />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <p className="s-muted o-t-caption" data-testid="mentions-fans-note">
              {after ? L.fansNoteAfter : L.fansNoteBefore}
            </p>
          </section>
        ) : null}

        {places.length === 0 && people.length === 0 ? <p className="s-muted">{L.mentionsEmpty}</p> : null}
      </div>

      <PostMenu
        post={menu?.post ?? null}
        canDelete={false}
        hide={menu ? { hidden: menu.hidden, onToggle: () => toggleHidden(menu) } : undefined}
        onClose={() => setMenu(null)}
      />
    </>
  );
}
