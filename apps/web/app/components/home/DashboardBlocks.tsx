// Blocs « tableau de bord » de l'Accueil du site (lot R7a2, maquette R7.4) : En cours, Mes sorties, Mon crew, Du nouveau
// chez tes potes. Mêmes données et mêmes mots que l'appli (`GET /me/home`, `homeBlockLabels`). Aucun néon et aucun bouton
// principal ici (celui de l'écran est « Voter » pendant un événement, sinon celui de « Prochaine sortie »).
import { Button, Icon } from "@orasso/design-system/web";
import {
  agoLabel,
  applicationStatusLabels,
  type HomeFriendNews,
  type HomeFriendsNews,
  type HomeLive,
  type HomeMyCrew,
  type HomeMyOutings,
  type HomeOuting,
  homeBlockLabels,
  outingDetail,
} from "@orasso/shared";

import { formatDayShort, formatTime } from "../../lib/format";
import { Block } from "../HomeWidgets";

const untilFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Europe/Paris",
});

/** Un vote est ouvert ET la personne peut voter (droit calculé par l'API, jamais déduit de `votes.open`). */
export const canVoteNow = (live: HomeLive) => live.votes.open > 0 && live.votes.canVote === true;

/** « En cours · jour 2 sur 4 » : prend la place de « Prochaine sortie » pendant l'événement. */
export function LiveLine({ live, accessHref }: { live: HomeLive; accessHref: string | null }) {
  const voting = canVoteNow(live);
  return (
    <section className="hm-block hm-live" data-testid="home-live-line" aria-labelledby="hm-live-title">
      <span className="o-t-label hm-live__tag">{homeBlockLabels.liveEyebrow(live.dayIndex, live.dayCount)}</span>
      <h2 className="o-t-poster-m" id="hm-live-title">
        {live.event.title}
      </h2>
      <p className="hm-block__muted">
        {live.event.city ? `${live.event.city} · ` : ""}Jusqu'au {untilFmt.format(new Date(live.event.endsAt))}
      </p>
      <div className="hm-actions">
        {accessHref && (
          <Button variant={voting ? "secondary" : "primary"} icon="qr" href={accessHref} data-testid="home-live-access">
            Mon accès
          </Button>
        )}
        <Button variant="secondary" icon="next" href={`/e/${live.event.slug}`} data-testid="home-live-sheet">
          {homeBlockLabels.liveSheet}
        </Button>
      </div>
    </section>
  );
}

export function LiveBlock({ live }: { live: HomeLive }) {
  const day = live.programToday;
  return (
    <Block id="live" title={homeBlockLabels.liveTitle}>
      <p className="hm-block__muted">{live.event.title}</p>
      {live.onSiteCount !== null && (
        <p data-testid="home-live-onsite">
          {live.onSiteCount > 0 && <strong className="o-t-poster-m">{live.onSiteCount} </strong>}
          {homeBlockLabels.liveOnSite(live.onSiteCount)}
        </p>
      )}
      {live.votes.open > 0 && (
        <div className="hm-actions" data-testid="home-live-votes">
          <span>
            <Icon name="trophy" size={18} /> {homeBlockLabels.liveVotes(live.votes.open)}
          </span>
          {canVoteNow(live) && (
            <Button variant="primary" icon="trophy" href={`/app/vote/${live.event.slug}`} data-testid="home-live-vote">
              {homeBlockLabels.liveVote}
            </Button>
          )}
        </div>
      )}
      {day && (
        <div data-testid="home-live-program">
          <span className="o-t-label hm-block__muted">{homeBlockLabels.liveProgram}</span>
          <p>
            <strong>
              {formatTime(day.startsAt)} – {formatTime(day.endsAt)}
            </strong>
            {day.instructions ? ` · ${day.instructions}` : ""}
          </p>
        </div>
      )}
    </Block>
  );
}

function outingStatus(o: HomeOuting): string {
  if (o.ongoing && (o.status === "accepted" || o.status === "ticket")) return "En cours";
  if (o.status === "ticket") return "Billet";
  if (o.status === "waitlisted" && o.waitlistRank)
    return `Attente · ${o.waitlistRank}${o.waitlistRank === 1 ? "er" : "e"}`;
  return applicationStatusLabels[o.status];
}

export function MyOutingsBlock({ data }: { data: HomeMyOutings }) {
  return (
    <Block id="my_outings" title={homeBlockLabels.outingsTitle}>
      {data.items.map((o) => (
        <a key={o.key} className="hm-line" href={`/e/${o.slug}`} data-testid="home-my-outing">
          <span className="o-t-meta hm-line__date">{formatDayShort(o.startsAt)}</span>
          <span className="hm-line__body">
            <strong>{o.title}</strong>
            {outingDetail(o) && <span className="o-t-caption hm-block__muted">{outingDetail(o)}</span>}
            <span className="o-t-caption hm-block__muted">{outingStatus(o)}</span>
          </span>
        </a>
      ))}
      <a href="/app/sorties">{homeBlockLabels.seeAll}</a>
    </Block>
  );
}

export function MyCrewBlock({ data }: { data: HomeMyCrew }) {
  const { crew, lastPost, nextOuting } = data;
  const sub = [
    homeBlockLabels.crewMembers(crew.membersCount),
    data.unread > 0 ? homeBlockLabels.crewUnread(data.unread) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Block id="my_crew" title={homeBlockLabels.crewTitle}>
      <a className="hm-line" href="/app/crew" data-testid="home-my-crew-card">
        <span className="hm-line__body">
          <strong>{crew.name}</strong>
          <span className="o-t-caption hm-block__muted">{sub}</span>
        </span>
      </a>
      {lastPost && (
        <p data-testid="home-my-crew-post">
          <strong>{lastPost.author.pseudo}</strong> {lastPost.text ?? homeBlockLabels.crewPhoto}
          <br />
          <span className="o-t-caption hm-block__muted">
            {agoLabel(lastPost.createdAt, new Date())} · {homeBlockLabels.crewReplies(lastPost.replies)}
          </span>
        </p>
      )}
      {nextOuting && (
        <p data-testid="home-my-crew-outing">
          <strong>{homeBlockLabels.crewNextOuting} :</strong> {formatDayShort(nextOuting.startsAt)}, {nextOuting.title}{" "}
          · {homeBlockLabels.crewGoing(nextOuting.going)}
        </p>
      )}
      <div className="hm-actions">
        <a href="/app/crew">{homeBlockLabels.crewLink}</a>
        {data.conversationId && <a href={`/app/boite/${data.conversationId}`}>{homeBlockLabels.crewDiscussion}</a>}
      </div>
    </Block>
  );
}

function newsHref(n: HomeFriendNews): string {
  if (n.target?.type === "event") return `/e/${n.target.slug}`;
  if (n.target?.type === "vehicle") return `/v/${n.target.id}`;
  return "/app/fil";
}

export function FriendsNewsBlock({ data }: { data: HomeFriendsNews }) {
  return (
    <Block id="friends_news" title={homeBlockLabels.friendsTitle}>
      {data.items.map((n) => (
        <a key={n.id} className="hm-line" href={newsHref(n)} data-testid="home-friend-news">
          <span className="hm-line__body">
            <strong>{n.text}</strong>
            <span className="o-t-caption hm-block__muted">{n.caption ?? agoLabel(n.at, new Date())}</span>
          </span>
        </a>
      ))}
      <a href="/app/fil">{homeBlockLabels.friendsLink}</a>
    </Block>
  );
}
