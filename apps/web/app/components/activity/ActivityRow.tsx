import { Icon, type IconName } from "@orasso/design-system/web";
import {
  type ActivityDay,
  type ActivityItem,
  activityWhen,
  albumTagLabels,
  groupedTitle,
  publicationLinkOf,
} from "@orasso/shared";
import type { MouseEvent } from "react";

import { now } from "../../lib/clock";
import { PersonAvatar } from "../People";
import { StoryMentionActions } from "./StoryMentionActions";

// Une ligne de l'Activité du site (lot R7c2, maquette R7.2 `.r7act`) : mêmes mots que l'appli (`groupedTitle`,
// `activityWhen`). À gauche les avatars (un grand, ou trois empilés pour une ligne regroupée), sinon une pastille d'icône ;
// au milieu la phrase et le moment ; une pastille moutarde tant que la ligne n'est pas lue.

/** L'icône d'une ligne sans personne (une notification du système, d'un événement, d'un vote…). */
export function iconOfType(type: string): IconName {
  if (type.startsWith("vote_")) return "trophy";
  if (type.startsWith("partner")) return "briefcase";
  if (type.startsWith("spot_meetup")) return "place";
  if (type === "schedule_change" || type === "event_updated" || type === "event_cancelled") return "calendar";
  if (type === "presence_validated" || type === "application_accepted") return "check";
  if (type.includes("stamp")) return "stamp";
  if (type === "memory") return "spark";
  return "bell";
}

/** Attente maximale de l'écriture « lu » avant de suivre le lien (une API lente ne retient pas la navigation). */
const READ_WAIT_MS = 1500;

/**
 * Toucher un lien de l'Activité (tour 2) : « lu » est posé **d'abord**, puis on navigue (sinon la navigation coupe la
 * requête et la ligne reste non lue). Clic avec ctrl, cmd, maj ou bouton du milieu : nouvel onglet, la page reste, le
 * navigateur suit le lien tout seul.
 */
export function openAfterRead(
  event: MouseEvent<HTMLElement>,
  path: string | null,
  markRead: () => Promise<void> | void,
) {
  const modified = event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
  if (!path || modified || event.defaultPrevented) {
    void markRead();
    return;
  }
  event.preventDefault();
  const wait = new Promise<void>((resolve) => setTimeout(resolve, READ_WAIT_MS));
  void Promise.race([Promise.resolve(markRead()).catch(() => undefined), wait]).then(() => {
    window.location.assign(path);
  });
}

/** Le lien d'une ligne : un chemin du site seulement (jamais une adresse extérieure). */
export function pathOfItem(item: Pick<ActivityItem, "data">): string | null {
  // Lot R8b2 : une notification qui porte `postId` ouvre la publication seule (les commentaires s'ouvrent avec `commentId`).
  const post = publicationLinkOf(item.data, { web: true });
  if (post) return post;
  const raw = item.data.link ?? item.data.screen ?? null;
  return typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//") ? raw : null;
}

/** Ce que la notification d'une identification porte : le logo du média, son nom, jusqu'à quatre vignettes. */
function albumTaggedParts(item: ActivityItem) {
  const d = item.data;
  return {
    logo: typeof d.mediaLogoUrl === "string" ? d.mediaLogoUrl : null,
    media: typeof d.mediaName === "string" ? d.mediaName : "?",
    thumbs: Array.isArray(d.thumbs) ? d.thumbs.filter((u): u is string => typeof u === "string").slice(0, 4) : [],
  };
}

function Avatars({ item }: { item: ActivityItem }) {
  const actors = item.actors;
  if (actors.length === 0) {
    return (
      <span className="act-row__ico" aria-hidden="true">
        <Icon name={iconOfType(item.type)} size={20} />
      </span>
    );
  }
  if (actors.length === 1 || item.count <= 1) {
    const a = actors[0];
    return <PersonAvatar url={a?.avatarUrl ?? null} pseudo={a?.pseudo ?? "?"} size={40} />;
  }
  return (
    <span className="act-avs" aria-hidden="true">
      {actors.map((a) => (
        <PersonAvatar key={a.pseudo} url={a.avatarUrl} pseudo={a.pseudo} size={32} />
      ))}
    </span>
  );
}

export function ActivityRow({
  item,
  day,
  onOpen,
  organizerIds,
  target,
}: {
  item: ActivityItem;
  /** Lot R9d : une cible explicite, prioritaire sur le lien lu dans la notification (l'Activité d'une structure). */
  target?: string | null;
  day: ActivityDay;
  onOpen: () => Promise<void> | void;
  /** Les structures que je gère (lot R7h) : seules celles-là offrent « Ajouter à ma story ». */
  organizerIds?: readonly string[];
}) {
  const { names, rest } = groupedTitle(item.title, item.actors, item.count);
  const when = activityWhen(new Date(item.latestAt), now(), day);
  const path = target ?? pathOfItem(item);
  // Lot R9f : « <média> a publié 6 photos de ta … » : le logo du média, le titre, la bande de quatre vignettes et « Voir mes photos ».
  const tagged = item.type === "album_tagged" ? albumTaggedParts(item) : null;
  const content = tagged ? (
    <>
      <PersonAvatar url={tagged.logo} pseudo={tagged.media} size={40} />
      <span className="act-row__text" data-testid="activity-album-tagged">
        <strong>{item.title}</strong>
        {tagged.thumbs.length > 0 && (
          <span className="act-strip" data-testid="activity-album-strip">
            {tagged.thumbs.map((url) => (
              <span key={url} className="act-strip__thumb">
                <img src={url} alt="" loading="lazy" />
              </span>
            ))}
          </span>
        )}
        <span className="o-t-caption act-go">
          {albumTagLabels.seeMyPhotos}
          <Icon name="next" size={14} />
        </span>
        <span className="o-t-caption s-muted" suppressHydrationWarning>
          {when}
        </span>
      </span>
      {item.read ? null : (
        <span className="act-row__dot" data-testid="activity-unread" role="img" aria-label="Non lu" />
      )}
    </>
  ) : (
    <>
      <Avatars item={item} />
      <span className="act-row__text">
        {names ? (
          <span>
            <strong>{names}</strong>
            {rest}
          </span>
        ) : (
          <span>
            <strong>{item.title}</strong>
            {item.body ? ` · ${item.body}` : ""}
          </span>
        )}
        <span className="o-t-caption s-muted" suppressHydrationWarning>
          {when}
        </span>
      </span>
      {item.read ? null : (
        <span className="act-row__dot" data-testid="activity-unread" role="img" aria-label="Non lu" />
      )}
    </>
  );
  return (
    <li className="act-row" data-testid="activity-row" data-type={item.type} data-read={item.read}>
      {path ? (
        <a className="act-row__link" href={path} onClick={(e) => openAfterRead(e, path, onOpen)}>
          {content}
        </a>
      ) : (
        <button type="button" className="act-row__link act-row__link--button" onClick={() => void onOpen()}>
          {content}
        </button>
      )}
      {item.type === "story_mention" ? <StoryMentionActions item={item} organizerIds={organizerIds} /> : null}
    </li>
  );
}
