import { Button, Chip, Plate, StatusBadge } from "@orasso/design-system/web";
import {
  type AccessPass,
  type AnnouncementView,
  type ArrivalSlot,
  afterEventLabels,
  applicationStatusLabels,
  type ContestStatus,
  communicationLabels,
  contestStatusLabels,
  crewLabels,
  type EventPublic,
  type EventWeather,
  eventFormatLabels,
  gradeLabels,
  invitationLabels,
  type MyApplication,
  type MyPoints,
  type MyReview,
  type MyTicket,
  POINTS_PENDING_LABEL,
  REVIEW_MAX_RATING,
  type ReceivedInvitation,
  refusalReasonLabels,
  type VehicleFull,
} from "@orasso/shared";
import { useEffect, useRef, useState } from "react";
import { data, Form, useNavigate, useNavigation, useRevalidator } from "react-router";
import { Countdown } from "../components/Countdown";
import { CrewConfirm } from "../components/Crews";
import { dayLabel, hourOf } from "../components/EventDays";
import { ReceivedInvitationCard } from "../components/Invitations";
import { Qr } from "../components/Qr";
import { RotatingQr } from "../components/RotatingQr";
import { Stars } from "../components/Stars";
import { Weather } from "../components/Weather";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import { nowMs } from "../lib/clock";
import { crewAction, isCrewIntent } from "../lib/crews.server";
import { formatDateTime, formatWhen } from "../lib/format";
import { invitationAction, isInvitationIntent, myActiveVehicles } from "../lib/invitations.server";
import { badgeFor } from "../lib/status";
import { useChannel } from "../lib/useChannel";
import type { Route } from "./+types/acces";
import "../styles/after-event.css";

export function meta() {
  return [{ title: "Accès · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  // Lien d'avis d'un remerciement (lot 27, `/app/acces?avis=<candidature>`) : le carnet de route, sur cette candidature.
  const avis = url.searchParams.get("avis");
  const past = url.searchParams.get("vue") === "passes" || Boolean(avis);
  const applications = await apiOrThrow<MyApplication[]>(
    request,
    `/me/applications?scope=${past ? "past" : "upcoming"}`,
  );
  const passes: Record<string, AccessPass> = {};
  await Promise.all(
    applications
      .filter((a) => !past && a.status === "accepted")
      .map(async (a) => {
        const res = await api<AccessPass>(request, `/applications/${a.id}/pass`);
        if (res.ok && res.data.payload) passes[a.id] = res.data;
      }),
  );
  // Météo sur la carte à J−1 (lot 28) : événements retenus qui commencent dans 48 h au plus (cache de l'API, jamais bloquant).
  const weather: Record<string, EventWeather> = {};
  await Promise.all(
    applications
      .filter(
        (a) =>
          !past &&
          a.status === "accepted" &&
          new Date(a.event.startsAt).getTime() - nowMs() <= 48 * 3_600_000 &&
          new Date(a.event.endsAt).getTime() > nowMs(),
      )
      .map(async (a) => {
        const res = await api<EventWeather | null>(
          request,
          `/events/by-slug/${encodeURIComponent(a.event.slug)}/weather`,
        );
        if (res.ok && res.data) weather[a.id] = res.data;
      }),
  );
  // Venue en crew à confirmer (lot 19) : le règlement de l'événement s'affiche dans la carte.
  const rules: Record<string, string | null> = {};
  // Lot 47 : créneau d'arrivée des exposants, pour la case « J'ai vu » de la confirmation.
  const arrivalSlots: Record<string, ArrivalSlot | null> = {};
  await Promise.all(
    applications
      .filter((a) => !past && a.status === "awaiting_member")
      .map(async (a) => {
        const res = await api<EventPublic>(request, `/events/by-slug/${encodeURIComponent(a.event.slug)}`);
        rules[a.id] = res.ok ? res.data.rulesText : null;
        arrivalSlots[a.id] = res.ok ? (res.data.arrivals?.exhibitors ?? null) : null;
      }),
  );
  // Consignes et dernière annonce de l'organisateur sur la carte d'un retenu (lot 20) : jamais bloquant.
  const notes: Record<string, { instructions: AnnouncementView | null; announcement: AnnouncementView | null }> = {};
  await Promise.all(
    applications
      .filter((a) => !past && a.status === "accepted")
      .map(async (a) => {
        const res = await api<{ items: AnnouncementView[] }>(
          request,
          `/events/by-slug/${encodeURIComponent(a.event.slug)}/announcements`,
        );
        if (!res.ok) return;
        const byDate = [...res.data.items].sort((x, y) => y.publishedAt.localeCompare(x.publishedAt));
        notes[a.id] = {
          instructions: byDate.find((i) => i.kind === "instructions") ?? null,
          announcement: byDate.find((i) => i.kind === "announcement") ?? null,
        };
      }),
  );
  const points = past ? await apiOrThrow<MyPoints>(request, "/me/points") : null;
  const me = await requireMe(request);
  const tickets = await api<MyTicket[]>(request, "/me/tickets");
  // Invitations nominatives reçues (lot 25, docs/02 « Accès ») : accepter avec un véhicule ou refuser.
  const invitationsRes = past ? null : await api<ReceivedInvitation[]>(request, "/me/event-invitations");
  const invitations = invitationsRes?.ok ? invitationsRes.data : [];
  const vehicles: VehicleFull[] = invitations.some((i) => !i.vehicle) ? await myActiveVehicles(request) : [];
  return {
    avis: avis ? { id: avis, found: applications.some((a) => a.id === avis) } : null,
    invitations,
    vehicles,
    past,
    applications,
    passes,
    // Relecture du lot 48 : heure du serveur au rendu, pour recaler l'horloge du navigateur (code tournant).
    serverTime: new Date().toISOString(),
    weather,
    rules,
    arrivalSlots,
    notes,
    points,
    userId: me.user.id,
    ticketCount: tickets.ok ? tickets.data.filter((t) => t.status === "valid").length : 0,
    sent: url.searchParams.get("candidature") === "envoyee",
  };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  // Invitation nominative : accepter ou refuser (lot 25).
  if (isInvitationIntent(intent)) {
    const res = await invitationAction(request, form);
    return data({ error: res.error, ok: res.ok }, { status: res.status });
  }
  // Confirmer ma venue en crew / Je ne viens pas (lot 19).
  if (isCrewIntent(intent)) {
    const res = await crewAction(request, form);
    return data({ error: res.data.crewError, ok: res.data.crewOk ?? null }, { status: res.init?.status ?? 200 });
  }
  const id = String(form.get("applicationId") ?? "");
  if (!id) return data({ error: "Candidature inconnue." }, { status: 400 });
  let res: Awaited<ReturnType<typeof api>>;
  if (intent === "withdraw") res = await api(request, `/applications/${id}/withdraw`, { method: "POST", json: {} });
  else if (intent === "accept")
    res = await api(request, `/applications/${id}/offer/accept`, { method: "POST", json: {} });
  else if (intent === "decline")
    res = await api(request, `/applications/${id}/offer/decline`, { method: "POST", json: {} });
  else if (intent === "contest") {
    const message = String(form.get("message") ?? "").trim();
    if (!message)
      return data(
        { error: "Explique en une phrase pourquoi tu contestes." },
        { status: 400, statusText: "Message requis" },
      );
    res = await api(request, `/applications/${id}/malus-contest`, { method: "POST", json: { message } });
  } else if (intent === "review") {
    const rating = Number(form.get("rating") ?? 0);
    const comment = String(form.get("comment") ?? "").trim();
    if (!rating) return data({ error: "Choisis une note de 1 à 3 étoiles." }, { status: 400 });
    if (!comment) return data({ error: "Un commentaire est obligatoire avec la note." }, { status: 400 });
    res = await api(request, `/applications/${id}/review`, { method: "POST", json: { rating, comment } });
  } else return data({ error: "Action inconnue." }, { status: 400 });
  if (!res.ok) return data({ error: res.error.message }, { status: res.status });
  return data({ error: null });
}

function ApplicationCard({
  app,
  pass,
  serverTime,
  weather,
  rulesText,
  arrivalSlot,
  notes,
  past,
  focused = false,
}: {
  app: MyApplication;
  pass?: AccessPass;
  serverTime: string;
  weather?: EventWeather;
  rulesText?: string | null;
  arrivalSlot?: ArrivalSlot | null;
  notes?: { instructions: AnnouncementView | null; announcement: AnnouncementView | null };
  past: boolean;
  /** Ouverte par un lien d'avis : amenée à l'écran (lot 27). */
  focused?: boolean;
}) {
  const busy = useNavigation().state !== "idle";
  const card = useRef<HTMLElement>(null);
  useEffect(() => {
    if (focused) card.current?.scrollIntoView({ block: "start" });
  }, [focused]);
  const badge = badgeFor(app);
  const confirmWithdraw = (e: React.FormEvent<HTMLFormElement>) => {
    const message =
      new Date(app.withdrawDeadline).getTime() > nowMs()
        ? "Te désister ? Sans pénalité jusqu'au verrouillage."
        : "Te désister maintenant ? Après le verrouillage, un malus sera appliqué à J+2.";
    if (!window.confirm(message)) e.preventDefault();
  };
  const active = ["pending", "accepted", "waitlisted", "offered"].includes(app.status);
  return (
    <article
      ref={card}
      id={focused ? "avis" : undefined}
      className="s-card acc"
      data-testid="application"
      data-status={app.status}
      data-focused={focused ? "true" : undefined}
    >
      <div className="acc__head">
        <div className="s-stack s-stack--tight">
          <div className="s-label o-t-label">{eventFormatLabels[app.event.format]}</div>
          <h2 className="s-h2">
            <a href={`/e/${app.event.slug}`}>{app.event.title}</a>
          </h2>
          <div className="o-t-meta s-muted">
            {formatWhen(app.event.startsAt, app.event.endsAt)}
            {app.event.city ? ` · ${app.event.city}` : ""}
          </div>
          {app.vehicle && <div className="o-never-truncate">{app.vehicle.label}</div>}
          {/* Lot 26 : le jour choisi (événement sur plusieurs jours) ; le QR est valable ce jour-là. */}
          {app.day && (
            <div className="o-t-label" data-testid="application-day">
              {dayLabel(app.day.date)} · {hourOf(app.day.startsAt)}–{hourOf(app.day.endsAt)}
            </div>
          )}
          {app.crew && (
            <a href={`/c/${app.crew.slug}`} className="o-t-caption" data-testid="application-crew">
              {crewLabels.crew} « {app.crew.name} »
            </a>
          )}
        </div>
        {badge ? (
          <StatusBadge status={badge.status} rank={badge.rank} />
        ) : (
          <Chip>{applicationStatusLabels[app.status]}</Chip>
        )}
      </div>

      {weather && (
        <div className="acc__wx" data-testid="application-weather">
          <Weather weather={weather} compact />
        </div>
      )}

      {notes?.instructions && (
        <div className="s-stack s-stack--tight" data-testid="application-instructions">
          <div className="s-label o-t-label">{communicationLabels.instructions}</div>
          <p className="s-prewrap">{notes.instructions.body}</p>
        </div>
      )}
      {notes?.announcement && (
        <div className="s-stack s-stack--tight" data-testid="application-announcement">
          <div className="s-label o-t-label">
            {communicationLabels.lastAnnouncement} · {formatDateTime(notes.announcement.publishedAt)}
          </div>
          <p className="s-prewrap">{notes.announcement.body}</p>
          <a className="o-t-caption" href={`/e/${app.event.slug}#fil`}>
            {communicationLabels.feed}
          </a>
        </div>
      )}

      {past && app.checkedInAt && (
        <p className="o-t-caption s-muted">Entrée enregistrée le {formatDateTime(app.checkedInAt)}.</p>
      )}

      {/* Le QR ne sert qu'avant et pendant l'événement : pas dans le carnet de route (lot 12). */}
      {!past && app.status === "accepted" && pass?.payload && (
        <>
          <div className="acc__qr" data-testid="pass-qr">
            {/* Relecture du lot 48 : le code tournant ; l'ancien QR statique seulement pour un pass sans secret. */}
            {pass.otpSecret ? (
              <RotatingQr
                secret={pass.otpSecret}
                eventNo={pass.eventNo}
                passId={pass.passId}
                serverTime={serverTime}
                label={`QR d'accès : ${app.event.title}`}
              />
            ) : (
              <Qr payload={pass.payload} label={`QR d'inscription : ${app.event.title}`} />
            )}
          </div>
          <p className="o-t-caption s-muted s-center">
            Présente ce QR à l'entrée. {app.zone ? `Zone ${app.zone.code} · ${app.zone.name}.` : ""}
            {app.checkedInAt ? ` Entrée enregistrée à ${formatDateTime(app.checkedInAt)}.` : ""}
          </p>
        </>
      )}

      {!past && app.status === "awaiting_member" && app.crew && (
        <CrewConfirm
          applicationId={app.id}
          crew={app.crew}
          vehicleLabel={app.vehicle?.label ?? null}
          rulesText={rulesText ?? null}
          arrivalSlot={arrivalSlot ?? null}
          busy={busy}
        />
      )}

      {app.status === "offered" && app.offerExpiresAt && (
        <div className="s-notice s-notice--ok">
          <strong>Une place s'est libérée.</strong> Tu as <Countdown until={app.offerExpiresAt} /> pour l'accepter.
          <Form method="post" className="acc__actions">
            <input type="hidden" name="applicationId" value={app.id} />
            <Button type="submit" name="intent" value="accept" icon="check" loading={busy}>
              Accepter la place
            </Button>
            <Button type="submit" name="intent" value="decline" variant="secondary" icon="close" loading={busy}>
              Refuser
            </Button>
          </Form>
        </div>
      )}

      {app.status === "refused" && (
        <p className="s-muted">
          {app.refusalReasons?.length
            ? `Motifs : ${app.refusalReasons.map((r) => refusalReasonLabels[r]).join(", ")}.`
            : "Ta candidature n'a pas été retenue."}
          {app.refusalNote ? ` ${app.refusalNote}` : ""}
        </p>
      )}

      {past && (
        <div className="s-stack s-stack--tight">
          {app.pointsPending && <Chip>{POINTS_PENDING_LABEL}</Chip>}
          {app.points != null && (
            <div data-testid="points">
              <strong>
                {app.points > 0 ? "+" : ""}
                {app.points} pts
              </strong>{" "}
              <span className="s-muted">
                {app.points > 0 ? "présence enregistrée" : app.points < 0 ? "absence sans désistement" : "aucun point"}
              </span>
            </div>
          )}
          {app.malus && <MalusBlock app={app} malus={app.malus} busy={busy} />}
          {app.review && <ReviewBlock app={app} review={app.review} busy={busy} />}
        </div>
      )}

      {!past && active && (
        <Form method="post" onSubmit={confirmWithdraw}>
          <input type="hidden" name="applicationId" value={app.id} />
          <Button type="submit" name="intent" value="withdraw" variant="secondary" icon="undo" loading={busy}>
            Me désister
          </Button>
          <p className="o-t-caption s-muted">
            {new Date(app.withdrawDeadline).getTime() > nowMs()
              ? `Sans pénalité jusqu'au ${formatDateTime(app.withdrawDeadline)}.`
              : "Inscriptions verrouillées : un désistement entraîne un malus."}
          </p>
        </Form>
      )}
    </article>
  );
}

function MalusBlock({
  app,
  malus,
  busy,
}: {
  app: MyApplication;
  malus: NonNullable<MyApplication["malus"]>;
  busy: boolean;
}) {
  if (malus.contestStatus) {
    return <Chip>{contestStatusLabels[malus.contestStatus as ContestStatus] ?? malus.contestStatus}</Chip>;
  }
  if (!malus.canContest)
    return (
      <p className="o-t-caption s-muted">Malus : contestation possible jusqu'au {formatDateTime(malus.deadline)}.</p>
    );
  return (
    <Form method="post" className="s-form" data-testid="contest-form">
      <input type="hidden" name="applicationId" value={app.id} />
      <label className="o-t-label" htmlFor={`contest-${app.id}`}>
        Contester ce malus (jusqu'au {formatDateTime(malus.deadline)})
      </label>
      <textarea
        id={`contest-${app.id}`}
        name="message"
        className="s-textarea o-t-body"
        rows={3}
        required
        placeholder="Ex. j'étais bien sur place, mon QR n'a pas été lu."
      />
      <Button type="submit" name="intent" value="contest" variant="secondary" icon="incident" loading={busy}>
        Contester le malus
      </Button>
    </Form>
  );
}

/** Avis après l'événement : participant pointé, une semaine après la fin (docs/01, prototype « Ton avis »). */
function ReviewBlock({ app, review, busy }: { app: MyApplication; review: MyReview; busy: boolean }) {
  const [rating, setRating] = useState(0);
  if (review.given) {
    return (
      <div className="s-stack s-stack--tight" data-testid="review-given">
        <div className="s-row">
          <Chip>Avis donné</Chip>
          <Stars rating={review.given.rating} />
        </div>
        <p className="s-muted s-prewrap">{review.given.comment}</p>
        {review.given.reply && (
          <p className="s-reply s-prewrap">
            <span className="s-label o-t-label">Réponse de l'équipe organisatrice</span> {review.given.reply}
          </p>
        )}
      </div>
    );
  }
  if (!review.canReview) {
    return (
      <p className="o-t-caption s-muted">
        Avis : la semaine pour le laisser s'est terminée le {formatDateTime(review.deadline)}.
      </p>
    );
  }
  return (
    <Form method="post" className="s-form" data-testid="review-form">
      <input type="hidden" name="applicationId" value={app.id} />
      <input type="hidden" name="rating" value={rating || ""} />
      <div className="s-label o-t-label">Ton avis · {app.event.title}</div>
      <p className="o-t-caption s-muted">
        Affiché avec ton pseudo sur la page de l'événement ; l'équipe organisatrice a un droit de réponse. Jusqu'au{" "}
        {formatDateTime(review.deadline)}.
      </p>
      <fieldset className="s-row s-fieldset">
        <legend className="o-visually-hidden">Note de l'événement</legend>
        {Array.from({ length: REVIEW_MAX_RATING }, (_, i) => i + 1).map((n) => (
          <Chip
            key={n}
            selected={n <= rating}
            onClick={() => setRating(n)}
            aria-label={`${n} étoile${n > 1 ? "s" : ""} sur ${REVIEW_MAX_RATING}`}
          >
            ★
          </Chip>
        ))}
      </fieldset>
      <label className="o-visually-hidden" htmlFor={`review-${app.id}`}>
        Ton commentaire
      </label>
      <textarea
        id={`review-${app.id}`}
        name="comment"
        className="s-textarea o-t-body"
        rows={3}
        required
        maxLength={1000}
        placeholder="Un mot sur l'organisation, l'accueil, l'ambiance"
      />
      <Button
        type="submit"
        name="intent"
        value="review"
        variant="secondary"
        icon="chat"
        loading={busy}
        disabled={!rating}
      >
        Envoyer mon avis
      </Button>
    </Form>
  );
}

export default function Acces({ loaderData, actionData }: Route.ComponentProps) {
  const {
    avis,
    past,
    applications,
    passes,
    serverTime,
    weather,
    rules,
    arrivalSlots,
    notes,
    points,
    sent,
    userId,
    ticketCount,
    invitations,
    vehicles,
  } = loaderData;
  const busy = useNavigation().state !== "idle";
  const okMessage = actionData && "ok" in actionData ? actionData.ok : null;
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  // Une décision de l'organisateur, une offre ou un pass émis : la page se met à jour sans rechargement.
  const live = useChannel(`user:${userId}`, (message) => {
    if (
      message.type === "application.changed" ||
      message.type === "notification" ||
      message.type === "invitation.received"
    ) {
      revalidator.revalidate();
    }
  });
  return (
    // `data-live` : canal temps réel ouvert (les recettes attendent qu'il le soit avant une offre en direct, lot 34).
    <div className="s-stack" data-testid="acces" data-live={live.connected ? "on" : "off"}>
      <h1 className="s-title">Accès</h1>
      <div className="s-tabs" role="tablist">
        <Chip selected={!past} onClick={() => navigate("/app/acces")}>
          À venir
        </Chip>
        <Chip selected={past} onClick={() => navigate("/app/acces?vue=passes")}>
          Passés · carnet de route
        </Chip>
      </div>

      {sent && <p className="s-notice s-notice--ok">Candidature envoyée. L'organisateur te répond ici.</p>}
      {avis && !avis.found && (
        <p className="s-notice s-notice--alert" role="alert" data-testid="avis-invalid">
          {afterEventLabels.reviewLinkInvalid}
        </p>
      )}
      {!past && ticketCount > 0 && (
        <p className="s-notice" data-testid="tickets-link">
          Tu as {ticketCount} billet{ticketCount > 1 ? "s" : ""} de visiteur.{" "}
          <a href="/app/billets">Voir mes billets</a>
        </p>
      )}
      {actionData?.error && (
        <p className="s-error" role="alert">
          {actionData.error}
        </p>
      )}
      {okMessage && (
        <p className="s-notice s-notice--ok" role="status" data-testid="acces-ok">
          {okMessage}
        </p>
      )}

      {!past && invitations.length > 0 && (
        <section className="s-stack" aria-labelledby="invitations-title" data-testid="received-invitations">
          <h2 id="invitations-title" className="s-h2">
            {invitationLabels.received}
          </h2>
          <div className="inv-list">
            {invitations.map((inv) => (
              <ReceivedInvitationCard key={inv.id} inv={inv} vehicles={vehicles} busy={busy} primary={false} />
            ))}
          </div>
        </section>
      )}

      {past && points && (
        <Plate as="section" className="s-stack s-stack--tight" aria-label="Mes points">
          <div className="s-label o-t-label">{points.season.name}</div>
          <div className="o-t-number" data-testid="season-points">
            {points.pointsSeason} pts
          </div>
          <div>
            Grade <strong>{gradeLabels[points.grade]}</strong>
            {points.next ? ` · prochain : ${gradeLabels[points.next.grade]} à ${points.next.threshold} pts` : ""}
          </div>
        </Plate>
      )}

      {applications.length === 0 ? (
        <p className="s-notice">
          {past
            ? "Aucun événement passé pour l'instant."
            : "Aucune candidature à venir. Trouve un événement et candidate avec un véhicule."}
        </p>
      ) : (
        applications.map((app) => (
          <ApplicationCard
            key={app.id}
            app={app}
            pass={passes[app.id]}
            serverTime={serverTime}
            weather={weather[app.id]}
            rulesText={rules[app.id]}
            arrivalSlot={arrivalSlots[app.id]}
            notes={notes[app.id]}
            past={past}
            focused={avis?.id === app.id}
          />
        ))
      )}
    </div>
  );
}
