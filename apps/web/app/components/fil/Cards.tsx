// Les cartes du Fil sur le site (lot R7e2, maquette R7.6) : mêmes genres, mêmes mots que l'appli. Les photos d'une
// publication viennent d'une route privée (`/api/feed-posts/:id/photos/:name`) : le navigateur envoie le cookie de session.
import { Icon } from "@orasso/design-system/web";
import {
  FEED_ASPECT_RATIOS,
  type FeedCard,
  type FeedCardKind,
  type FeedPostView,
  feedScreenLabels as L,
} from "@orasso/shared";
import { useState } from "react";

import { PersonAvatar } from "../People";
import { CommentsPreview } from "./CommentsPreview";
import { CommercialBadge } from "./CommercialBadge";
import { MemoryCard } from "./MemoryCard";
import { PostActions } from "./PostActions";
import { type CardProps, OrgLogo, Shell } from "./Shell";
import { SponsoredCard } from "./SponsoredCard";
import { SpotMeetupCard } from "./SpotMeetupCard";
import { UnknownCard } from "./UnknownCard";

function EventRecommendedCard({ card, onMenu, faded }: CardProps<"event_recommended">) {
  const e = card.payload.event;
  const when = new Date(e.startsAt).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Europe/Paris",
  });
  return (
    <Shell
      card={card}
      head={<OrgLogo url={e.structure.logoUrl} name={e.structure.name} />}
      title={e.title}
      href={`/e/${e.slug}`}
      onMenu={onMenu}
      faded={faded}
      actions={
        <a className="fil-link" href={`/e/${e.slug}`} data-testid="feed-event-open">
          <Icon name="next" size={16} /> {L.seeEvent}
        </a>
      }
    >
      {e.posterUrl || e.photoUrl ? (
        <a className="fil-media" href={`/e/${e.slug}`} aria-label={e.title}>
          <img src={(e.photoUrl ?? e.posterUrl) as string} alt="" loading="lazy" />
        </a>
      ) : null}
      <p className="o-t-body">
        <strong>{e.structure.name}</strong> · {when}
        {e.city ? ` · ${e.city}` : ""}
      </p>
    </Shell>
  );
}

function VehiclePublicCard({ card, onMenu, faded }: CardProps<"vehicle_public">) {
  const { vehicle, owner } = card.payload;
  return (
    <Shell
      card={card}
      head={<PersonAvatar url={owner.avatarUrl} pseudo={owner.pseudo} size={38} />}
      title={owner.pseudo}
      href={`/u/${encodeURIComponent(owner.pseudo)}`}
      onMenu={onMenu}
      faded={faded}
    >
      <p className="o-t-body">
        {L.vehicleAdded} : <strong>{vehicle.label}</strong>
      </p>
      <a className="fil-media fil-media--tall" href={`/v/${vehicle.id}`} aria-label={vehicle.label}>
        <img src={vehicle.photoUrl} alt={vehicle.label} loading="lazy" />
      </a>
    </Shell>
  );
}

function LineupCard({ card, onMenu, faded }: CardProps<"lineup">) {
  const { event, count, photoUrls } = card.payload;
  return (
    <Shell
      card={card}
      head={<OrgLogo url={event.structure.logoUrl} name={event.structure.name} />}
      title={L.lineupTitle(event.title)}
      onMenu={onMenu}
      faded={faded}
      actions={
        <a className="fil-link" href={`/e/${event.slug}/plateau`} data-testid="feed-lineup-open">
          <Icon name="grid" size={16} /> {L.seeLineup}
        </a>
      }
    >
      <p className="o-t-body">
        <strong>{L.lineupCount(count)}</strong>
        {event.city ? ` · ${event.city}` : ""}
      </p>
      {photoUrls.length ? (
        <div className="fil-grid">
          {photoUrls.slice(0, 4).map((url) => (
            <img key={url} src={url} alt="" loading="lazy" />
          ))}
        </div>
      ) : null}
    </Shell>
  );
}

function VoteResultCard({ card, onMenu, faded }: CardProps<"vote_result">) {
  const { event, podium } = card.payload;
  return (
    <Shell
      card={card}
      head={
        <span className="fil-logo fil-logo--trophy" aria-hidden="true">
          <Icon name="trophy" size={20} />
        </span>
      }
      title={L.voteResult(event.title)}
      onMenu={onMenu}
      faded={faded}
      actions={
        <a className="fil-link" href={`/app/vote/${event.slug}`} data-testid="feed-vote-open">
          <Icon name="trophy" size={16} /> {L.seeVote}
        </a>
      }
    >
      {podium[0]?.photoUrl ? (
        <div className="fil-media">
          <img src={podium[0].photoUrl} alt="" loading="lazy" />
        </div>
      ) : null}
      {podium.map((p) => (
        <div key={p.rank} className="fil-podium" data-testid="feed-podium-row">
          <span className="fil-podium__rank o-t-number">{p.rank}</span>
          <span className="fil-podium__name">
            <strong>{p.vehicleLabel}</strong>
            {p.pseudo ? <small>{p.pseudo}</small> : null}
          </span>
          <span className="o-t-caption">{L.votes(p.votes)}</span>
        </div>
      ))}
    </Shell>
  );
}

function AnnouncementCard({ card, onMenu, faded }: CardProps<"announcement">) {
  const { event, announcement } = card.payload;
  return (
    <Shell
      card={card}
      head={<OrgLogo url={event.structure.logoUrl} name={event.structure.name} />}
      title={event.structure.name}
      href={`/o/${event.structure.slug}`}
      onMenu={onMenu}
      faded={faded}
      actions={
        <a className="fil-link" href={`/e/${event.slug}`} data-testid="feed-announcement-open">
          <Icon name="next" size={16} /> {L.seeEvent}
        </a>
      }
    >
      {announcement.imageUrl ? (
        <div className="fil-media">
          <img src={announcement.imageUrl} alt="" loading="lazy" />
        </div>
      ) : null}
      <p className="o-t-body">{announcement.body}</p>
      <p className="o-t-caption">{event.title}</p>
    </Shell>
  );
}

function ProCard({ card, onMenu, faded }: CardProps<"pro">) {
  const { pro } = card.payload;
  const where = [pro.city, pro.department].filter(Boolean).join(" · ");
  return (
    <Shell
      card={card}
      head={<OrgLogo url={pro.logoUrl} name={pro.name} />}
      title={pro.name}
      href={`/p/${pro.slug}`}
      onMenu={onMenu}
      faded={faded}
      actions={
        <a className="fil-link" href={`/p/${pro.slug}`} data-testid="feed-pro-open">
          <Icon name="next" size={16} /> {L.seePro}
        </a>
      }
    >
      {pro.photoUrl ? (
        <div className="fil-media">
          <img src={pro.photoUrl} alt="" loading="lazy" />
        </div>
      ) : null}
      {pro.activities.length || where ? (
        <p className="o-t-body">{[pro.activities.join(", "), where].filter(Boolean).join(" · ")}</p>
      ) : null}
    </Shell>
  );
}

/** Photos d'une publication : au format de la publication, défilement horizontal, « 1 / 3 ». */
export function FeedPhotos({ post }: { post: Pick<FeedPostView, "photos" | "aspect" | "author"> }) {
  const [index, setIndex] = useState(0);
  const n = post.photos.length;
  return (
    <div
      className="fil-photos"
      style={{ aspectRatio: String(FEED_ASPECT_RATIOS[post.aspect]) }}
      data-testid="feed-post-photos"
    >
      <div
        className="fil-photos__track"
        onScroll={(e) => {
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
          if (i !== index) setIndex(i);
        }}
      >
        {post.photos.map((p, i) => (
          <div key={p.url} className="fil-photos__slide">
            <img
              src={p.url}
              alt={L.photoAlt(post.author.pseudo, i + 1, n)}
              width={p.width}
              height={p.height}
              loading="lazy"
            />
          </div>
        ))}
      </div>
      {n > 1 ? (
        <span className="fil-photos__count" aria-hidden="true" data-testid="feed-post-photo-count">
          {L.photoOf(index + 1, n)}
        </span>
      ) : null}
    </div>
  );
}

function FeedPostCard({ card, onMenu, faded }: CardProps<"feed_post">) {
  const post = card.payload.post;
  return (
    <Shell
      card={card}
      head={<PersonAvatar url={post.author.avatarUrl} pseudo={post.author.pseudo} size={38} />}
      title={post.author.pseudo}
      href={post.mine ? undefined : `/u/${encodeURIComponent(post.author.pseudo)}`}
      onMenu={onMenu}
      faded={faded}
      banner={<CommercialBadge partner={post.commercialPartner} />}
      actions={<PostActions post={post} />}
    >
      <FeedPhotos post={post} />
      {post.caption ? (
        <p className="o-t-body" data-testid="feed-post-caption">
          {post.caption}
        </p>
      ) : null}
      {post.vehicle || post.event ? (
        <div className="fil-pills">
          {post.vehicle ? (
            <span className="fil-pill" data-testid="feed-post-vehicle">
              <Icon name="vehicle" size={14} /> {post.vehicle.label}
            </span>
          ) : null}
          {post.event ? (
            <a className="fil-pill" href={`/e/${post.event.slug}`} data-testid="feed-post-event">
              <Icon name="calendar" size={14} /> {post.event.title}
            </a>
          ) : null}
        </div>
      ) : null}
      <CommentsPreview post={post} />
    </Shell>
  );
}

// biome-ignore lint/suspicious/noExplicitAny: chaque carte reçoit la carte de son genre, le registre les range ensemble.
export const cardRegistry: { [K in FeedCardKind]: (props: CardProps<any>) => React.ReactElement | null } = {
  event_recommended: EventRecommendedCard,
  vehicle_public: VehiclePublicCard,
  lineup: LineupCard,
  vote_result: VoteResultCard,
  announcement: AnnouncementCard,
  pro: ProCard,
  spot_meetup: SpotMeetupCard,
  feed_post: FeedPostCard,
  memory: MemoryCard,
  sponsored: SponsoredCard,
};

/** Le composant d'un genre ; `UnknownCard` pour un genre que ce registre ne connaît pas. */
export function cardFor(kind: string): (props: CardProps) => React.ReactElement | null {
  return (Object.hasOwn(cardRegistry, kind) ? cardRegistry[kind as FeedCardKind] : UnknownCard) as (
    props: CardProps,
  ) => React.ReactElement | null;
}
