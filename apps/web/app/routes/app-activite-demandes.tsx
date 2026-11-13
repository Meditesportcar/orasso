import { Button, Chip, Icon } from "@orasso/design-system/web";
import {
  coauthorLabels,
  crewInviteLabels,
  crewLabels,
  eventInviteLabels,
  type FollowPerson,
  followRequestNotificationTitle,
  gradeLabels,
  type InboxSummary,
  invitationLabels,
  messagingLabels,
  networkLabels,
  partnershipLabels,
  plateTransferLabels,
  proActivityLabels,
  type RequestItem,
  type RequestsPage,
  requestCountSpoken,
  requestCountText,
  requestRowCounts,
  type StaffRole,
  staffRoleLabels,
  widestWordEm,
} from "@orasso/shared";
import { type CSSProperties, useEffect, useRef } from "react";
import { data, Form, useNavigation } from "react-router";

import { CrewLogo } from "../components/Crews";
import { InviteMenu } from "../components/EventInvite";
import { PersonAvatar } from "../components/People";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import { crewAction, isCrewIntent } from "../lib/crews.server";
import { type InviteNoticeData, muteInviterAction } from "../lib/eventInvite.server";
import { type FollowActionData, followAction, isFollowIntent } from "../lib/follow.server";
import { formatDateTime } from "../lib/format";
import "../styles/coauthors.css";
import "../styles/event-invite.css";
import "../styles/partnerships.css";
import type { Route } from "./+types/app-activite-demandes";

// Activité > Demandes (lot 18, refait au lot R7c2, tour 2) : tout ce qui attend ta réponse, lu sur `GET /me/requests` comme
// l'appli (50 par page, curseur `nextCursor` : « Suivants » ouvre la page d'après, `?apres=`). Toutes les sortes y sont :
// abonnement (lot R6b), crew (demande, invitation, venue à confirmer), invitations à un événement (d'un organisateur, de
// passionnés), staff, transferts de plaque. Les actions restent celles de chaque domaine. Les demandes de message sont dans
// Messages (`/app/messages/demandes`) : une ligne y mène quand il y en a (d'anciens liens d'e-mails mènent encore ici).
/** Lot R6c : libellé court local (pas dans `crewInviteLabels`) d'une invitation reçue d'un membre. */
const LEADER_CONFIRMS = "Si tu acceptes, le chef confirme ton arrivée.";

export function meta() {
  return [{ title: "Demandes · Activité · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireMe(request);
  const cursor = new URL(request.url).searchParams.get("apres") ?? "";
  const [page, summary] = await Promise.all([
    apiOrThrow<RequestsPage>(request, `/me/requests${cursor ? `?${new URLSearchParams({ cursor }).toString()}` : ""}`),
    api<InboxSummary>(request, "/me/inbox/summary"),
  ]);
  // Résumé en panne : les nombres se lisent dans la première page (jamais « 0 » parce que le résumé manque).
  const counts = requestRowCounts(summary.ok ? summary.data : null, cursor ? null : page);
  return {
    items: page.items.filter((r) => r.kind !== "contact"),
    nextCursor: page.nextCursor,
    after: cursor !== "",
    activityRequests: counts.activityRequests,
    messageRequests: counts.messageRequests ?? 0,
    // Résumé en panne et liste en plusieurs pages : les nombres sont des minimums (« 12+ »).
    atLeast: counts.atLeast,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  if (isFollowIntent(intent)) return followAction(request, form);
  // Lot R7-fix-invite : « Couper les invitations de … » depuis le « ⋯ » de la carte d'une invitation de passionné (lot R6c).
  if (intent === "invite_mute") return muteInviterAction(request, form);
  if (isCrewIntent(intent)) {
    const res = await crewAction(request, form);
    return data({ formError: res.data.crewError }, { status: res.init?.status ?? 200 });
  }
  // Invitation à rejoindre une structure (lot 24) : accepter ou refuser, seul le destinataire le peut.
  if (intent === "staff_accept" || intent === "staff_decline") {
    const structureId = encodeURIComponent(String(form.get("structureId") ?? ""));
    const answer = intent === "staff_accept" ? "accept" : "decline";
    const res = await api(request, `/me/memberships/${structureId}/${answer}`, { method: "POST" });
    if (!res.ok) return data({ formError: res.error.message }, { status: res.status });
    return data({ formError: null as string | null });
  }
  // Transfert de plaque reçu (lot 31) : mêmes routes que le Garage (confirmer, « ce n'est pas le cas »).
  if (intent === "transfer-accept" || intent === "transfer-decline") {
    const id = encodeURIComponent(String(form.get("transferId") ?? ""));
    const res = await api(request, `/plate-transfers/${id}/${intent.slice(9)}`, { method: "POST" });
    if (!res.ok) return data({ formError: res.error.message }, { status: res.status });
    return data({ formError: null as string | null });
  }
  // Lot R7m1 : proposition de partenariat d'un pro : accepter ou refuser, seule la personne visée le peut.
  if (intent === "partnership-accept" || intent === "partnership-decline") {
    const id = encodeURIComponent(String(form.get("partnershipId") ?? ""));
    const res = await api(request, `/me/partnerships/${id}/${intent.slice(12)}`, { method: "POST" });
    if (!res.ok) return data({ formError: res.error.message }, { status: res.status });
    return data({ formError: null as string | null });
  }
  // Lot R8o : invitation à publier avec quelqu'un (pour moi ou pour une page que je gère) : accepter ou refuser. La confirmation
  // est celle de la maquette (R8.13 `p-collab`).
  if (intent === "coauthor-accept" || intent === "coauthor-decline") {
    const id = encodeURIComponent(String(form.get("postId") ?? ""));
    const answer = intent === "coauthor-accept" ? "accept" : "decline";
    const res = await api(request, `/me/feed-coauthor-requests/${id}/${answer}`, { method: "POST" });
    if (!res.ok) return data({ formError: res.error.message }, { status: res.status });
    const author = String(form.get("author") ?? "");
    return data({
      formError: null as string | null,
      coauthorNotice: answer === "accept" ? coauthorLabels.accepted : coauthorLabels.declined(author),
    });
  }
  return data({ formError: "Action inconnue." }, { status: 400 });
}

// --- lecture sûre du `payload` (liste blanche de l'API, propre à chaque sorte) -------------------------------------------
const str = (o: Record<string, unknown> | null | undefined, key: string): string | null => {
  const v = o?.[key];
  return typeof v === "string" && v ? v : null;
};
const obj = (o: Record<string, unknown> | null | undefined, key: string): Record<string, unknown> | null => {
  const v = o?.[key];
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
};
const list = (o: Record<string, unknown>, key: string): Record<string, unknown>[] => {
  const v = o[key];
  return Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object") : [];
};
const fromOf = (r: RequestItem): { name: string; imageUrl: string | null } =>
  r.from.type === "person"
    ? { name: r.from.pseudo, imageUrl: r.from.avatarUrl }
    : { name: r.from.name, imageUrl: r.from.logoUrl };

function Person({ p }: { p: Pick<FollowPerson, "pseudo" | "avatarUrl" | "grade"> }) {
  return (
    <>
      <PersonAvatar url={p.avatarUrl} pseudo={p.pseudo} size={44} />
      <div className="s-person__main">
        <a className="s-person__name o-t-title" href={`/u/${encodeURIComponent(p.pseudo)}`}>
          {p.pseudo}
        </a>
        <Chip>{gradeLabels[p.grade]}</Chip>
      </div>
    </>
  );
}

function DecideFollow({ userId, pseudo, busy }: { userId: string; pseudo: string; busy: boolean }) {
  return (
    <Form method="post" className="r6row__acts">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="pseudo" value={pseudo} />
      <Button
        type="submit"
        name="intent"
        value="follow_accept"
        variant="secondary"
        icon="check"
        loading={busy}
        data-testid="net-request-accept"
      >
        {networkLabels.accept}
      </Button>
      <Button
        type="submit"
        name="intent"
        value="follow_decline"
        variant="close"
        label={networkLabels.decline(pseudo)}
        className="fl-x"
        disabled={busy}
        data-testid="net-request-decline"
      />
    </Form>
  );
}

/** Deux boutons, chacun son formulaire : `accept` et `decline` portent leur `intent` ; `fields` les identifiants de l'action. */
function Decide({
  fields,
  accept,
  decline,
  acceptLabel,
  declineLabel,
  busy,
}: {
  fields: Record<string, string>;
  accept: string;
  decline: string;
  acceptLabel: string;
  declineLabel: string;
  busy: boolean;
}) {
  return (
    <div className="s-row">
      {([accept, decline] as const).map((intent, i) => (
        <Form method="post" key={intent}>
          <input type="hidden" name="intent" value={intent} />
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <Button type="submit" variant="secondary" icon={i === 0 ? "check" : "close"} loading={busy}>
            {i === 0 ? acceptLabel : declineLabel}
          </Button>
        </Form>
      ))}
    </div>
  );
}

function FollowCard({ r, busy }: { r: RequestItem; busy: boolean }) {
  const { name, imageUrl } = fromOf(r);
  const grade = r.payload.grade as FollowPerson["grade"];
  // Le véhicule principal du demandeur (marque et modèle seulement), comme avant le lot (tour 3).
  const vehicle = str(r.payload, "vehicle");
  return (
    <li className="s-person" data-testid="request-follow">
      <Person p={{ pseudo: name, avatarUrl: imageUrl, grade }} />
      <div className="s-person__main">
        <span className="s-label o-t-label">{followRequestNotificationTitle}</span>
        {vehicle && <span className="o-t-caption s-muted o-never-truncate">{vehicle}</span>}
      </div>
      <DecideFollow userId={r.id} pseudo={name} busy={busy} />
    </li>
  );
}

function CrewCard({ r, busy }: { r: RequestItem; busy: boolean }) {
  const crew = obj(r.payload, "crew");
  const crewName = str(crew, "name") ?? "";
  const slug = str(crew, "slug");
  const { name, imageUrl } = fromOf(r);
  if (r.payload.variant === "confirmation") {
    const event = obj(r.payload, "event");
    const vehicle = str(r.payload, "vehicleLabel");
    const before = str(r.payload, "confirmBefore");
    return (
      <li className="s-person" data-testid="request-crew-confirmation">
        <CrewLogo url={imageUrl} name={crewName || name} size={44} />
        <div className="s-person__main s-fit">
          <span className="s-label o-t-label">{crewLabels.confirmTitle(crewName || name)}</span>
          <a
            href={`/e/${str(event, "slug") ?? ""}`}
            className="o-t-title s-req-title"
            style={{ "--em": widestWordEm(str(event, "title") ?? "") } as CSSProperties}
          >
            {str(event, "title")}
          </a>
          {vehicle && <span className="o-never-truncate">{vehicle}</span>}
          {before && <span className="o-t-caption s-muted">{crewLabels.confirmBefore(formatDateTime(before))}</span>}
        </div>
        <div className="s-row">
          <Button variant="secondary" icon="qr" href="/app/sorties">
            {crewLabels.confirmVenue}
          </Button>
          <Form method="post">
            <input type="hidden" name="intent" value="crew_not_coming" />
            <input type="hidden" name="applicationId" value={r.id} />
            <Button type="submit" variant="secondary" icon="close" loading={busy}>
              {crewLabels.notComing}
            </Button>
          </Form>
        </div>
      </li>
    );
  }
  const invitedBy = str(r.payload, "invitedBy");
  const message = str(r.payload, "message");
  return (
    <li className="s-person" data-testid="request-crew-request">
      <CrewLogo url={str(crew, "logoUrl")} name={crewName} size={44} />
      <div className="s-person__main">
        <span className="s-label o-t-label">{crewLabels.requestFrom(name, crewName)}</span>
        <a className="o-t-title o-never-truncate" href={`/c/${slug ?? ""}`}>
          {crewName}
        </a>
        {/* Lot R6c (R6.7) : demande née de l'invitation d'un membre. */}
        {invitedBy && (
          <span className="o-t-caption s-muted" data-testid="request-invited-by">
            {crewInviteLabels.invitedBy(invitedBy)}
          </span>
        )}
        {message && <p className="o-t-caption s-muted s-prewrap">{message}</p>}
      </div>
      <Decide
        fields={{ crewId: r.id, userId: str(r.payload, "requesterId") ?? "" }}
        accept="crew_request_accept"
        decline="crew_request_decline"
        acceptLabel={crewLabels.accept}
        declineLabel={crewLabels.decline}
        busy={busy}
      />
    </li>
  );
}

function CrewInvitationCard({ r, busy }: { r: RequestItem; busy: boolean }) {
  const crew = obj(r.payload, "crew");
  const crewName = str(crew, "name") ?? "";
  const { name: inviter } = fromOf(r);
  return (
    <li className="s-person" data-testid="request-crew-invitation">
      <CrewLogo url={str(crew, "logoUrl")} name={crewName} size={44} />
      <div className="s-person__main">
        <span className="s-label o-t-label">{crewLabels.invitationFrom(crewName)}</span>
        <a className="o-t-title o-never-truncate" href={`/c/${str(crew, "slug") ?? ""}`}>
          {crewName}
        </a>
        <span className="o-t-caption s-muted">{crewLabels.leaderOf(inviter)}</span>
        {/* Lot R6c (R6.7) : invitation d'un membre (le chef confirme). */}
        {r.payload.leaderConfirms === true && (
          <span className="o-t-caption s-muted" data-testid="request-leader-confirms">
            {LEADER_CONFIRMS}
          </span>
        )}
      </div>
      <Decide
        fields={{ crewId: r.id, userId: "" }}
        accept="crew_invitation_accept"
        decline="crew_invitation_decline"
        acceptLabel={crewLabels.accept}
        declineLabel={crewLabels.decline}
        busy={busy}
      />
    </li>
  );
}

function StaffCard({ r, busy }: { r: RequestItem; busy: boolean }) {
  const { name, imageUrl } = fromOf(r);
  const role = str(r.payload, "role");
  const invitedBy = str(r.payload, "invitedBy");
  // Les fonctions proposées (« Scan · Placement »), comme avant le lot (tour 3).
  const staffRoles = Array.isArray(r.payload.staffRoles)
    ? (r.payload.staffRoles as StaffRole[]).filter((x) => x in staffRoleLabels)
    : [];
  return (
    <li className="s-person" data-testid="request-staff-invitation">
      <CrewLogo url={imageUrl} name={name} size={44} />
      <div className="s-person__main">
        <span className="s-label o-t-label">
          {role === "co_organizer" ? "Invitation comme co-organisateur" : "Invitation dans le staff"}
        </span>
        <a className="o-t-title o-never-truncate" href={`/o/${str(r.payload, "structureSlug") ?? ""}`}>
          {name}
        </a>
        {staffRoles.length > 0 && (
          <span className="o-t-caption s-muted">{staffRoles.map((x) => staffRoleLabels[x]).join(" · ")}</span>
        )}
        {invitedBy && <span className="o-t-caption s-muted">Proposé par {invitedBy}</span>}
      </div>
      <Decide
        fields={{ structureId: r.id }}
        accept="staff_accept"
        decline="staff_decline"
        acceptLabel={messagingLabels.accept}
        declineLabel={messagingLabels.decline}
        busy={busy}
      />
    </li>
  );
}

/** Confirmation d'une coupure d'invitations ; se met en vue (la carte peut être loin du haut de la page). */
function InviteNotice({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest" });
  }, []);
  return (
    <p className="s-notice s-notice--ok" role="status" data-testid="invite-muted" ref={ref}>
      {text}
    </p>
  );
}

function EventInvitationCard({ r, notice }: { r: RequestItem; notice: string | null }) {
  const { name, imageUrl } = fromOf(r);
  const event = obj(r.payload, "event");
  const slug = str(event, "slug");
  const peer = r.payload.source === "peer";
  const inviterRows = list(r.payload, "inviters");
  const inviters = inviterRows.map((x) => str(x, "pseudo")).filter((x): x is string => Boolean(x));
  // Le « ⋯ » coupe chacun des inviteurs (tous, 20 au plus, pas seulement les trois du résumé) ; il faut leur identifiant.
  const mutable = list(r.payload, "menuInviters").flatMap((x) => {
    const userId = str(x, "userId");
    const pseudo = str(x, "pseudo");
    return userId && pseudo ? [{ userId, pseudo }] : [];
  });
  const total = typeof r.payload.invitersCount === "number" ? r.payload.invitersCount : inviters.length;
  const who = inviters.length ? inviters : [name];
  const more = Math.max(0, total - who.length);
  const heading = peer
    ? `${who.join(" et ")}${more > 0 ? ` et ${more} autre${more > 1 ? "s" : ""}` : ""} ${total > 1 ? "t'invitent" : "t'invite"}`
    : invitationLabels.invitedBy(name);
  const vehicle = str(r.payload, "vehicleLabel");
  const message = str(r.payload, "message");
  const lockAt = str(r.payload, "lockAt");
  const startsAt = str(event, "startsAt");
  const city = str(event, "city");
  return (
    <li
      className={peer && mutable.length > 0 ? "s-person ri-req-card" : "s-person"}
      data-testid={peer ? "request-event-invitation-peer" : "request-event-invitation"}
    >
      {r.from.type === "person" ? (
        <PersonAvatar url={imageUrl} pseudo={name} size={44} />
      ) : (
        <CrewLogo url={imageUrl} name={name} size={44} />
      )}
      <div className="s-person__main s-fit">
        <span className="s-label o-t-label">{heading}</span>
        <a
          href={slug ? `/e/${slug}` : "/app/sorties"}
          className="o-t-title s-req-title"
          style={{ "--em": widestWordEm(str(event, "title") ?? "") } as CSSProperties}
        >
          {str(event, "title")}
        </a>
        <span className="o-t-caption s-muted">
          {startsAt ? formatDateTime(startsAt) : ""}
          {city ? ` · ${city}` : ""}
        </span>
        {vehicle && <span className="o-never-truncate">{invitationLabels.invitedVehicle(vehicle)}</span>}
        {message && <span className="o-t-caption s-muted">{message}</span>}
        {list(r.payload, "notes").map((n) => (
          <span key={str(n, "pseudo")} className="o-t-caption s-muted">
            {`${str(n, "pseudo")} : « ${str(n, "note")} »`}
          </span>
        ))}
        {lockAt && <span className="o-t-caption s-muted">{invitationLabels.validUntil(formatDateTime(lockAt))}</span>}
        {notice && <InviteNotice key={notice} text={notice} />}
      </div>
      <div className="s-row">
        {peer ? null : (
          <Button variant="secondary" icon="entry" href="/app/sorties">
            {invitationLabels.answer}
          </Button>
        )}
        {slug && (
          <Button variant="secondary" icon="explore" href={`/e/${slug}`}>
            {peer ? eventInviteLabels.seeEvent : invitationLabels.openEvent}
          </Button>
        )}
        {peer && <InviteMenu inviters={mutable} testId="request-invite-more" eventId={r.id} />}
      </div>
    </li>
  );
}

function PlateTransferCard({ r, busy }: { r: RequestItem; busy: boolean }) {
  const { name, imageUrl } = fromOf(r);
  const vehicle = str(r.payload, "vehicleLabel");
  const answerBy = str(r.payload, "answerBy");
  return (
    <li className="s-person" data-testid="request-plate-transfer">
      <PersonAvatar url={imageUrl} pseudo={name} size={44} />
      <div className="s-person__main">
        <span className="s-label o-t-label">
          {plateTransferLabels.requestTitle}
          {vehicle ? ` · ${vehicle}` : ""}
        </span>
        {answerBy && <span className="o-t-caption s-muted">Réponse attendue avant le {formatDateTime(answerBy)}.</span>}
        <p className="o-t-caption s-muted">
          {`${name} a saisi la plaque de ${vehicle ?? "ton véhicule"} pour son véhicule. Si tu l'as vendu, confirme : ton véhicule passe « Vendu » et la plaque change de main. Sinon, l'équipe Orasso tranchera.`}
        </p>
      </div>
      <Decide
        fields={{ transferId: r.id }}
        accept="transfer-accept"
        decline="transfer-decline"
        acceptLabel={plateTransferLabels.accept}
        declineLabel={plateTransferLabels.decline}
        busy={busy}
      />
    </li>
  );
}

/** Lot R7m1 (maquette R7.20 `pq_dem`) : un pro propose un partenariat : son texte, la voiture concernée, Accepter / Refuser. */
function PartnershipCard({ r, busy }: { r: RequestItem; busy: boolean }) {
  const { name, imageUrl } = fromOf(r);
  const message = str(r.payload, "message");
  const vehicle = str(obj(r.payload, "vehicle"), "label");
  const pro = obj(r.payload, "pro");
  const slug = str(pro, "slug");
  const activities = Array.isArray(pro?.activities) ? (pro.activities as string[]) : [];
  const detail = [
    "Pro vérifié",
    activities
      .map((a) => (a in proActivityLabels ? proActivityLabels[a as keyof typeof proActivityLabels] : a))
      .join(", "),
    str(pro, "city"),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="s-person ptn-request" data-testid="request-partnership">
      <PersonAvatar url={imageUrl} pseudo={name} size={44} />
      <div className="s-person__main">
        {slug ? (
          <a className="s-person__name o-t-title" href={`/p/${slug}`}>
            {partnershipLabels.requestTitle(name)}
          </a>
        ) : (
          <span className="s-label o-t-label">{partnershipLabels.requestTitle(name)}</span>
        )}
        <span className="o-t-caption s-muted">{detail}</span>
        {message && <p className="ptn-quote">{`« ${message} »`}</p>}
        {vehicle && (
          <p className="ptn-car" data-testid="request-partnership-vehicle">
            <b>{partnershipLabels.requestForVehicle(vehicle)}</b>
            <small>{partnershipLabels.requestForVehicleHint(name)}</small>
          </p>
        )}
        <p className="o-t-caption s-muted">{partnershipLabels.requestNote}</p>
      </div>
      <Decide
        fields={{ partnershipId: r.id }}
        accept="partnership-accept"
        decline="partnership-decline"
        acceptLabel={partnershipLabels.accept}
        declineLabel={partnershipLabels.decline}
        busy={busy}
      />
    </li>
  );
}

/** Lot R8o (maquette R8.13 `p-collab`, vue « dem ») : « Kenji_66 te propose de publier avec lui », la légende, la vignette, Accepter / Refuser. */
function CoAuthorCard({ r, busy }: { r: RequestItem; busy: boolean }) {
  const { name, imageUrl } = fromOf(r);
  const author = str(obj(r.payload, "author"), "name") ?? name;
  const forName = str(r.payload, "forName");
  const caption = str(r.payload, "caption");
  const photo = str(r.payload, "photoUrl");
  return (
    <li className="co-request" data-testid="request-coauthor">
      <div className="co-request__head">
        <PersonAvatar url={imageUrl} pseudo={name} size={44} />
        <div className="co-request__text">
          <b className="o-t-title">{coauthorLabels.requestTitle(author, forName)}</b>
          {caption && (
            <span className="o-t-caption s-muted" data-testid="request-coauthor-caption">
              {caption}
            </span>
          )}
        </div>
        {photo && (
          <span className="co-request__thumb">
            <img src={photo} alt="" loading="lazy" />
          </span>
        )}
      </div>
      <Decide
        fields={{ postId: r.id, author }}
        accept="coauthor-accept"
        decline="coauthor-decline"
        acceptLabel={coauthorLabels.accept}
        declineLabel={coauthorLabels.decline}
        busy={busy}
      />
    </li>
  );
}

function Card({ r, busy, notice }: { r: RequestItem; busy: boolean; notice: string | null }) {
  switch (r.kind) {
    case "follow":
      return <FollowCard r={r} busy={busy} />;
    case "crew":
      return <CrewCard r={r} busy={busy} />;
    case "crew_invitation":
      return <CrewInvitationCard r={r} busy={busy} />;
    case "staff":
      return <StaffCard r={r} busy={busy} />;
    case "event_invitation":
      return <EventInvitationCard r={r} notice={notice} />;
    case "plate_transfer":
      return <PlateTransferCard r={r} busy={busy} />;
    case "partnership":
      return <PartnershipCard r={r} busy={busy} />;
    case "coauthor":
      return <CoAuthorCard r={r} busy={busy} />;
    default:
      // Une sorte sans carte sur le site (jamais d'écran cassé pour une sorte que cette version ne connaît pas).
      return null;
  }
}

export default function Demandes({ loaderData, actionData }: Route.ComponentProps) {
  const { items, nextCursor, after, activityRequests, messageRequests, atLeast } = loaderData;
  const busy = useNavigation().state !== "idle";
  // Deux sortes de retours d'action : le suivi (`followError`, `followNotice`) et les autres demandes (`formError`).
  const done = actionData as
    | (Partial<FollowActionData> & { formError?: string | null; coauthorNotice?: string })
    | undefined;
  const invite = actionData as InviteNoticeData | undefined;
  const message = {
    error: done?.formError ?? done?.followError ?? null,
    notice: done?.followNotice ?? done?.coauthorNotice ?? null,
  };
  return (
    <div className="s-narrow s-stack" data-testid="demandes">
      <h1 className="s-title">{messagingLabels.requests}</h1>
      <p className="o-t-caption s-muted" data-testid="requests-count">
        {activityRequests === null
          ? ""
          : activityRequests > 0
            ? `${requestCountText(activityRequests, atLeast)} en attente de ta réponse`
            : "Rien n'attend ta réponse"}
      </p>
      <div>
        <Button variant="secondary" icon="back" href="/app/activite" data-testid="requests-back">
          Retour à l'Activité
        </Button>
      </div>
      {message.error && (
        <p className="s-error" role="alert">
          {message.error}
        </p>
      )}
      {/* Tour 2 : la confirmation d'une coupure s'affiche dans la carte d'où elle part ; si la carte a disparu (dernier
          inviteur coupé), elle reste ici, en tête de liste. */}
      {invite?.inviteNotice && !items.some((r) => r.kind === "event_invitation" && r.id === invite.inviteFor) && (
        <InviteNotice key={invite.inviteNotice} text={invite.inviteNotice} />
      )}
      {message.notice && (
        <p className="s-notice s-notice--ok" role="status" data-testid="request-notice">
          {message.notice}
        </p>
      )}
      {messageRequests > 0 && !after ? (
        <a
          className="act-requests"
          href="/app/messages"
          data-testid="requests-messages-row"
          aria-label={`${messagingLabels.messageRequests}, ${requestCountSpoken(messageRequests, atLeast)}`}
        >
          <span className="act-requests__text">
            <strong>{`${messagingLabels.messageRequests} · ${requestCountText(messageRequests, atLeast)}`}</strong>
          </span>
          <Icon name="next" size={20} />
        </a>
      ) : null}
      {items.length === 0 && <p className="s-notice">{messagingLabels.noRequests}</p>}
      {items.length > 0 && (
        <ul className="s-people" data-testid="request-list">
          {items.map((r) => (
            <Card
              key={`${r.kind}:${r.id}:${r.kind === "crew" ? String(r.payload.requesterId ?? "") : ""}`}
              r={r}
              busy={busy}
              notice={
                r.kind === "event_invitation" && invite?.inviteFor === r.id ? (invite.inviteNotice ?? null) : null
              }
            />
          ))}
        </ul>
      )}
      {(nextCursor || after) && (
        <div className="s-row" data-testid="request-pages">
          {after && (
            <Button variant="secondary" icon="back" href="/app/activite/demandes">
              {networkLabels.firstPage}
            </Button>
          )}
          {nextCursor && (
            <Button
              variant="secondary"
              icon="down"
              href={`/app/activite/demandes?${new URLSearchParams({ apres: nextCursor }).toString()}`}
              data-testid="request-more"
            >
              {networkLabels.next}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
