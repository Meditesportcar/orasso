import { Button, Chip, Plate, VehicleCard } from "@orasso/design-system/web";
import { CONTACT_MESSAGE_MAX, gradeLabels, messagingLabels, socialLabels, type UserProfileView } from "@orasso/shared";
import { Form, useNavigation } from "react-router";

import { CrewRow } from "../components/Crews";
import { FriendAction, PersonAvatar } from "../components/People";
import { ReportDialog } from "../components/ReportDialog";
import { apiOrThrow } from "../lib/api.server";
import { formatDay, formatTime } from "../lib/format";
import { friendAction } from "../lib/friends.server";
import { isMessageIntent, type MessageActionData, messageAction } from "../lib/messaging.server";
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
  const form = await request.formData();
  // Message (lot 18) : conversation entre amis, sinon demande de contact.
  if (isMessageIntent(String(form.get("intent") ?? ""))) return messageAction(request, form);
  return friendAction(request, form);
}

export default function Profil({ loaderData, actionData: rawAction }: Route.ComponentProps) {
  const p = loaderData.profile;
  const actionData = rawAction as ({ friendError?: string | null } & Partial<MessageActionData>) | undefined;
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
          {/* Messagerie (lot 18) : ami → conversation ; sinon demande de contact. Signaler : lot 32. */}
          <Form method="post">
            <input type="hidden" name="intent" value="message_open" />
            <input type="hidden" name="userId" value={p.userId} />
            <Button type="submit" variant="secondary" icon="chat" loading={busy} data-testid="message-open">
              {messagingLabels.message}
            </Button>
          </Form>
          <ReportDialog targetType="profile" targetId={p.userId} />
        </div>
      )}

      {actionData?.messageError && (
        <p className="s-error" role="alert">
          {actionData.messageError}
        </p>
      )}
      {actionData?.contactSent && (
        <p className="s-notice s-notice--ok" data-testid="contact-sent">
          {messagingLabels.contactRequestSent(actionData.contactSent)}
        </p>
      )}
      {actionData?.contact && (
        <Form method="post" className="s-form s-card" data-testid="contact-form">
          <h2 className="s-h2">{messagingLabels.contactRequest}</h2>
          <p className="o-t-caption s-muted">{messagingLabels.contactRequestHint}</p>
          <input type="hidden" name="intent" value="contact_request" />
          <input type="hidden" name="pseudo" value={p.pseudo} />
          <label className="s-label o-t-label" htmlFor="contact-message">
            Message
          </label>
          <textarea
            id="contact-message"
            name="message"
            className="s-textarea"
            rows={4}
            maxLength={CONTACT_MESSAGE_MAX}
            placeholder={messagingLabels.contactRequestPlaceholder}
            required
          />
          <Button type="submit" variant="secondary" icon="chat" loading={busy}>
            {messagingLabels.contactRequestSend}
          </Button>
        </Form>
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
          {p.crews.length === 0 ? (
            <p className="s-muted">{socialLabels.crewsEmpty}</p>
          ) : (
            <ul className="s-people" data-testid="profil-crews">
              {p.crews.map((c) => (
                <CrewRow key={c.id} crew={c} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
