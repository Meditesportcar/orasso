import { Button, Chip, Plate, VehicleCard } from "@orasso/design-system/web";
import { gradeLabels, socialLabels, type UserProfileView } from "@orasso/shared";
import { useNavigation } from "react-router";

import { FriendAction, PersonAvatar } from "../components/People";
import { apiOrThrow } from "../lib/api.server";
import { formatDay, formatTime } from "../lib/format";
import { friendAction } from "../lib/friends.server";
import type { Route } from "./+types/profil";

// Profil d'un autre (lot 17, ARCHITECTURE-SUITE § 2.2 et 2.5) : complet pour un compte public ou un ami, réduit
// (pseudo, photo, grade, marque et modèle) pour un compte privé. Jamais la plaque. Réservé aux connectés.
export function meta({ params }: Route.MetaArgs) {
  return [{ title: `${params.pseudo} · Orasso` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  return { profile: await apiOrThrow<UserProfileView>(request, `/users/${encodeURIComponent(params.pseudo)}`) };
}

export async function action({ request }: Route.ActionArgs) {
  return friendAction(request, await request.formData());
}

export default function Profil({ loaderData, actionData }: Route.ComponentProps) {
  const p = loaderData.profile;
  const busy = useNavigation().state !== "idle";
  const isSelf = p.audience === "self";
  const limited = p.audience === "public_limited";
  return (
    <div className="s-narrow s-stack" data-testid="profil" data-audience={p.audience}>
      <div className="s-row s-row--top">
        <PersonAvatar url={p.avatarUrl} pseudo={p.pseudo} size={72} />
        <div className="s-grow s-stack s-stack--tight">
          <h1 className="s-title">{p.pseudo}</h1>
          <div className="s-row s-row--tight">
            <Chip variant="accent">{gradeLabels[p.grade]}</Chip>
            {p.friendsCount !== null && <Chip>{socialLabels.friendsCount(p.friendsCount)}</Chip>}
            {p.departments && p.departments.length > 0 && <Chip>{p.departments.join(", ")}</Chip>}
          </div>
        </div>
      </div>

      {p.bio && <p className="s-prewrap">{p.bio}</p>}
      {limited && <p className="s-notice">{socialLabels.privateNotice}</p>}
      {actionData?.friendError && (
        <p className="s-error" role="alert">
          {actionData.friendError}
        </p>
      )}

      {isSelf ? (
        <Button variant="secondary" icon="profile" href="/app/moi">
          Modifier mon profil
        </Button>
      ) : (
        <div className="s-row">
          <FriendAction
            state={p.friendship.state}
            pseudo={p.pseudo}
            userId={p.userId}
            requestId={p.friendship.id}
            primary
            busy={busy}
          />
          {/* Messagerie (lot 18) et signalement (lot 32) : visibles, désactivés. */}
          <Button variant="secondary" icon="chat" disabled>
            {socialLabels.messageSoon}
          </Button>
          <Button variant="secondary" icon="alert" disabled>
            {socialLabels.reportSoon}
          </Button>
        </div>
      )}

      {p.contact && (
        <section className="s-section" aria-labelledby="contact-titre" data-testid="profil-contact">
          <h2 id="contact-titre" className="s-h2">
            Coordonnées
          </h2>
          <p className="o-t-caption s-muted">Visibles de toi parce qu'il ou elle est inscrit à tes événements.</p>
          <dl className="s-recap">
            <dt>Nom</dt>
            <dd>{[p.contact.firstName, p.contact.lastName].filter(Boolean).join(" ") || "—"}</dd>
            <dt>Téléphone</dt>
            <dd>{p.contact.phone ?? "—"}</dd>
            <dt>E-mail</dt>
            <dd>{p.contact.email ?? "—"}</dd>
          </dl>
        </section>
      )}

      <section className="s-section" aria-labelledby="vehicules-titre">
        <h2 id="vehicules-titre" className="s-h2">
          {socialLabels.vehicles}
        </h2>
        {p.vehicles.length === 0 ? (
          <p className="s-muted">{socialLabels.noVehicles}</p>
        ) : (
          <div className="s-grid">
            {p.vehicles.map((v) => (
              <a key={v.id} className="s-cardlink" href={`/v/${v.id}`} data-testid="profil-vehicle">
                {v.photoUrl ? (
                  <VehicleCard first name={v.label} photo={<img src={v.photoUrl} alt="" loading="lazy" />} />
                ) : (
                  <Plate as="article" className="s-vrow">
                    <span className="o-t-poster-m o-never-truncate">{v.label}</span>
                  </Plate>
                )}
              </a>
            ))}
          </div>
        )}
      </section>

      {p.upcomingEvents && (
        <section className="s-section" aria-labelledby="evenements-titre">
          <h2 id="evenements-titre" className="s-h2">
            {socialLabels.upcomingEvents}
          </h2>
          {p.upcomingEvents.length === 0 ? (
            <p className="s-muted">{socialLabels.noUpcoming}</p>
          ) : (
            <ul className="s-docs">
              {p.upcomingEvents.map((e) => (
                <li key={e.slug}>
                  <a href={`/e/${e.slug}`}>{e.title}</a>{" "}
                  <span className="o-t-caption s-muted">
                    {formatDay(e.startsAt)} · {formatTime(e.startsAt)}
                    {e.city ? ` · ${e.city}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {p.pastEvents && p.pastEvents.count > 0 && (
            <p className="o-t-caption s-muted">
              {socialLabels.pastEventsCount(p.pastEvents.count)} : {p.pastEvents.titles.join(" · ")}
            </p>
          )}
        </section>
      )}

      {p.crews && (
        <section className="s-section" aria-labelledby="crews-titre">
          <h2 id="crews-titre" className="s-h2">
            {socialLabels.crews}
          </h2>
          <p className="s-muted">{socialLabels.crewsEmpty}</p>
        </section>
      )}
    </div>
  );
}
