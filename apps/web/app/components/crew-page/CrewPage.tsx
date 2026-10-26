// Page du crew sur le site (lot R5c2, maquettes R5.7 à R5.9, même logique que l'appli) : les morceaux de la page.
// Le fil vit dans `../crew-feed/` (lot R5c1) : `CrewFeedSlot` en garde la place jusqu'à la fusion.
import { Button, Icon, type IconName } from "@orasso/design-system/web";
import {
  CREW_REQUEST_MESSAGE_MAX,
  type CrewEventView,
  type CrewFace,
  type CrewGarageVehicle,
  type CrewOutingView,
  type CrewPendingView,
  type CrewVitrineMember,
  crewLabels,
  gradeLabels,
  crewPageLabels as L,
  wallTime,
} from "@orasso/shared";
import { useEffect, useId, useRef, useState } from "react";
import { Form, useFetcher } from "react-router";

import { formatTime } from "../../lib/format";
import { withRetour } from "../../lib/retour";
import { PersonAvatar } from "../People";
import "../../styles/crews.css";
import "../../styles/crew-page.css";
import "../../styles/moderation.css";

/** Réponse des actions de crew du site (`crewAction`). */
type CrewActionResultLike = { crewError: string | null; crewOk?: string | null };

const DAYS = ["DIM", "LUN", "MAR", "MER", "JEU", "VEN", "SAM"];
const MONTHS = ["JANV", "FÉVR", "MARS", "AVR", "MAI", "JUIN", "JUIL", "AOÛT", "SEPT", "OCT", "NOV", "DÉC"];

/** `.evc-date.mini` : jour, chiffre, mois (heure de Paris). */
export function MiniDate({ iso }: { iso: string }) {
  const w = wallTime(new Date(iso));
  const weekday = new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay();
  return (
    <span className="crw-date" aria-hidden="true">
      <small>{DAYS[weekday]}</small>
      <b>{w.day}</b>
      <small>{MONTHS[w.month - 1]}</small>
    </span>
  );
}

/** Le titre de section ne rétrécit jamais ; l'aide passe à la ligne s'il le faut. */
export function CrewSecHead({ title, hint, icon }: { title: string; hint?: string; icon?: IconName }) {
  return (
    <div className="crw-sech">
      <h2 className="s-h2">{title}</h2>
      {hint ? (
        <span className="o-t-caption s-muted crw-sech__hint">
          {icon ? <Icon name={icon} size={14} /> : null}
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export function AvatarStack({ faces, size = 26 }: { faces: readonly CrewFace[]; size?: number }) {
  if (!faces.length) return null;
  return (
    <span className="crw-stack" aria-hidden="true">
      {faces.slice(0, 4).map((f) => (
        <PersonAvatar key={f.pseudo} url={f.avatarUrl} pseudo={f.pseudo} size={size} />
      ))}
    </span>
  );
}

/** Emplacement de l'onglet Fil : remplacé à la fusion par le `CrewFeed` du lot R5c1. */
export function CrewFeedSlot(_props: { crewId: string; leader: boolean }) {
  return (
    <p className="crw-slot o-t-body s-muted" data-testid="crew-feed-slot">
      {L.feedSlot}
    </p>
  );
}

/** Itinéraires vers le point de rendez-vous : Google Maps et Waze (coordonnées, sinon l'adresse). */
export function mapsHref(o: Pick<CrewOutingView, "lat" | "lng" | "place">): string {
  const target = o.lat !== null && o.lng !== null ? `${o.lat},${o.lng}` : o.place;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(target)}`;
}
export function wazeHref(o: Pick<CrewOutingView, "lat" | "lng" | "place">): string {
  return o.lat !== null && o.lng !== null
    ? `https://waze.com/ul?ll=${o.lat},${o.lng}&navigate=yes`
    : `https://waze.com/ul?q=${encodeURIComponent(o.place)}&navigate=yes`;
}

/** `.r5out` : une sortie du crew ; la réponse part par un formulaire (trois boutons). */
export function OutingCard({ crewId, slug, outing }: { crewId: string; slug: string; outing: CrewOutingView }) {
  const answers = [
    ["yes", L.rsvpYes],
    ["maybe", L.rsvpMaybe],
    ["no", L.rsvpNo],
  ] as const;
  return (
    <article className="crw-out" data-testid="crew-outing">
      <div className="crw-out__head">
        <MiniDate iso={outing.startsAt} />
        <div className="crw-grow">
          <h3 className="crw-out__title">{outing.title}</h3>
          <p className="o-t-caption s-muted">{L.outingRdv(formatTime(outing.startsAt), outing.place)}</p>
          {outing.program ? <p className="o-t-caption s-muted s-prewrap">{outing.program}</p> : null}
          <p className="o-t-caption s-muted">{L.outingBy(outing.authorPseudo)}</p>
        </div>
      </div>
      <div className="crw-who">
        <AvatarStack faces={outing.going} />
        <span className="o-t-caption" data-testid="outing-count">
          {L.rsvpCount(outing.yes, outing.maybe)}
        </span>
      </div>
      <Form method="post" preventScrollReset className="crw-seg crw-seg--acc" aria-label={L.rsvpA11y}>
        <input type="hidden" name="intent" value="outing_rsvp" />
        <input type="hidden" name="crewId" value={crewId} />
        <input type="hidden" name="outingId" value={outing.id} />
        {answers.map(([value, label]) => (
          <button
            key={value}
            type="submit"
            name="answer"
            value={value}
            className="crw-seg__btn o-t-body-strong"
            aria-pressed={outing.mine === value}
            data-testid={`outing-rsvp-${value}`}
          >
            {label}
          </button>
        ))}
      </Form>
      <div className="crw-out__acts">
        <Button variant="secondary" icon="nav" href={mapsHref(outing)} aria-label={L.mapsA11y(outing.place)}>
          {L.maps}
        </Button>
        <Button variant="secondary" icon="nav" href={wazeHref(outing)} aria-label={L.wazeA11y(outing.place)}>
          {L.waze}
        </Button>
        {outing.canManage ? (
          <span className="crw-out__manage">
            <Button
              variant="secondary"
              icon="edit"
              href={`/c/${slug}/sortie?sortie=${outing.id}`}
              aria-label={L.editOutingA11y(outing.title)}
              data-testid="outing-edit"
            />
            <Form
              method="post"
              preventScrollReset
              onSubmit={(e) => {
                if (!window.confirm(L.cancelOutingConfirm(outing.title))) e.preventDefault();
              }}
            >
              <input type="hidden" name="intent" value="outing_cancel" />
              <input type="hidden" name="crewId" value={crewId} />
              <input type="hidden" name="outingId" value={outing.id} />
              <Button
                type="submit"
                variant="secondary"
                icon="close"
                aria-label={L.cancelOuting}
                data-testid="outing-cancel"
              />
            </Form>
          </span>
        ) : null}
      </div>
    </article>
  );
}

/** Un événement Orasso où va le crew. */
export function CrewEventRow({ event, href }: { event: CrewEventView; href: string }) {
  const retained = event.going.length > 0;
  return (
    <a className="crw-ev" href={href} data-testid="crew-event">
      <MiniDate iso={event.startsAt} />
      <span className="crw-grow">
        <b className="o-t-body-strong">{event.title}</b>
        <span className="o-t-caption s-muted crw-block">
          {retained
            ? L.crewEventGoing(event.city, event.going.length)
            : L.crewEventRegistered(event.city, event.registered)}
        </span>
        {retained ? (
          <span className="crw-who">
            <AvatarStack faces={event.going} size={20} />
            <span className="o-t-caption s-muted">{event.going.map((g) => g.pseudo).join(", ")}</span>
          </span>
        ) : null}
      </span>
      <span className={`crw-tag${retained ? " crw-tag--acc" : ""}`}>{retained ? L.tagRetained : L.tagRegistered}</span>
    </a>
  );
}

/** `.r5sq` : un véhicule du garage du crew, en carré ; le nom jamais coupé. */
export function GarageTile({ vehicle }: { vehicle: CrewGarageVehicle }) {
  const icon: IconName =
    vehicle.vehicleType === "moto" ? "moto" : vehicle.vehicleType === "truck" ? "truck" : "vehicle";
  return (
    <a className="crw-sq" href={`/v/${vehicle.id}`} data-testid="crew-garage-vehicle">
      <span className="crw-sq__photo">
        {vehicle.photoUrl ? <img src={vehicle.photoUrl} alt="" loading="lazy" /> : <Icon name={icon} size={40} />}
      </span>
      <b className="crw-sq__name o-never-truncate">{vehicle.label}</b>
      <span className="o-t-caption s-muted">
        {vehicle.isMain ? `${vehicle.ownerPseudo} · ${L.mainVehicle}` : vehicle.ownerPseudo}
      </span>
    </a>
  );
}

/** Un membre (rond, pseudo, véhicule ou grade, « Chef »). */
export function MemberRow({
  pseudo,
  avatarUrl,
  caption,
  leader,
  back,
  children,
}: {
  pseudo: string;
  avatarUrl: string | null;
  caption: string;
  leader: boolean;
  back: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="crw-prow" data-testid="crew-member">
      <PersonAvatar url={avatarUrl} pseudo={pseudo} size={42} />
      <span className="crw-grow">
        <a className="o-t-body-strong crw-block" href={withRetour(`/u/${encodeURIComponent(pseudo)}`, back)}>
          {pseudo}
        </a>
        <span className="o-t-caption s-muted">{caption}</span>
      </span>
      {children ?? (leader ? <span className="crw-tag crw-tag--acc">{L.roleLeader}</span> : null)}
    </li>
  );
}

export const vitrineCaption = (m: CrewVitrineMember) => `Grade ${gradeLabels[m.grade]}`;

/** `.r5req` : une demande reçue (chef seul), avec son message. */
export function RequestCard({ crewId, request, back }: { crewId: string; request: CrewPendingView; back: string }) {
  const p = request.person;
  const hidden = (intent: string) => (
    <>
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="crewId" value={crewId} />
      <input type="hidden" name="userId" value={p.userId} />
    </>
  );
  return (
    <li className="crw-req" data-testid="crew-pending-request">
      <div className="crw-req__head">
        <PersonAvatar url={p.avatarUrl} pseudo={p.pseudo} size={42} />
        <span className="crw-grow">
          <a className="o-t-body-strong crw-block" href={withRetour(`/u/${encodeURIComponent(p.pseudo)}`, back)}>
            {p.pseudo}
          </a>
          <span className="o-t-caption s-muted">
            {[`Grade ${gradeLabels[p.grade]}`, request.vehicleLabel].filter(Boolean).join(" · ")}
          </span>
        </span>
        <Form method="post" preventScrollReset>
          {hidden("crew_request_accept")}
          <Button type="submit" variant="secondary" icon="check" data-testid="crew-request-accept">
            {crewLabels.accept}
          </Button>
        </Form>
        <Form method="post" preventScrollReset>
          {hidden("crew_request_decline")}
          <Button type="submit" variant="secondary" icon="close" aria-label={crewLabels.decline} />
        </Form>
      </div>
      <p className={`crw-quote${request.message ? "" : " s-muted"}`}>
        {request.message ? `« ${request.message} »` : L.requestNoMessage}
      </p>
    </li>
  );
}

export function InfoBox({
  icon,
  title,
  caption,
  accent,
  testId,
}: {
  icon: IconName;
  title: string;
  caption?: string;
  accent?: boolean;
  testId?: string;
}) {
  return (
    <div className={`crw-box${accent ? " crw-box--acc" : ""}`} data-testid={testId}>
      <Icon name={icon} size={20} />
      <span>
        <b className="o-t-body-strong crw-block">{title}</b>
        {caption ? <span className="o-t-caption s-muted">{caption}</span> : null}
      </span>
    </div>
  );
}

export function FriendsBox({ friends }: { friends: readonly CrewVitrineMember[] }) {
  if (!friends.length) return null;
  return (
    <div className="crw-friends" data-testid="crew-friends">
      <AvatarStack faces={friends} size={28} />
      <span>
        <b className="o-t-body-strong crw-block">{L.friendsIn(friends.length)}</b>
        <span className="o-t-caption s-muted">{L.friendsNames(friends.map((f) => f.pseudo))}</span>
      </span>
    </div>
  );
}

/**
 * Lot R5c2 (R5.8) : « Demander à rejoindre » ouvre toujours la même fenêtre (fiche du crew, « Rejoindre un crew »,
 * Explorer) : un mot pour le chef (300 caractères, facultatif), une phrase d'exemple, « Envoyer la demande ». La demande
 * part à l'action de la page (intention `crew_request`), qui relit ses données : la ligne passe à « Demande envoyée ».
 */
export function CrewRequestDialog({
  crew,
  leaderPseudo,
  wide,
  primary,
  testId = "crew-request",
  label,
}: {
  crew: { id: string; name: string };
  leaderPseudo: string | null;
  wide?: boolean;
  primary?: boolean;
  testId?: string;
  /** Libellé du bouton (« Rejoindre » dans une liste) ; « Demander à rejoindre » par défaut. */
  label?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const fieldId = useId();
  const fetcher = useFetcher<CrewActionResultLike>();
  const [message, setMessage] = useState("");
  const done = fetcher.state === "idle" && fetcher.data && !fetcher.data.crewError;
  useEffect(() => {
    if (done) ref.current?.close();
  }, [done]);
  return (
    <>
      <Button
        type="button"
        variant={primary ? "primary" : "secondary"}
        icon={primary ? "crew" : "add"}
        fullWidth={wide}
        onClick={() => {
          setMessage("");
          ref.current?.showModal();
        }}
        data-testid={testId}
      >
        {label ?? L.requestJoin}
      </Button>
      <dialog ref={ref} className="mod-dialog" aria-labelledby={titleId} data-testid="crew-request-dialog">
        <div className="s-stack">
          <div className="mod-dialog__head">
            <h2 id={titleId} className="s-h2 mod-dialog__title">
              {L.sheetTitle(crew.name)}
            </h2>
            <Button variant="close" label={L.sheetClose} onClick={() => ref.current?.close()} />
          </div>
          <fetcher.Form method="post" className="s-form">
            <input type="hidden" name="intent" value="crew_request" />
            <input type="hidden" name="crewId" value={crew.id} />
            <label className="s-label o-t-label" htmlFor={fieldId}>
              {L.sheetLabel(leaderPseudo)}
            </label>
            <textarea
              id={fieldId}
              name="message"
              className="s-textarea"
              rows={4}
              maxLength={CREW_REQUEST_MESSAGE_MAX}
              placeholder={L.sheetPlaceholder}
              value={message}
              onChange={(e) => setMessage(e.currentTarget.value)}
              data-testid="crew-request-message"
            />
            <span className="o-t-caption s-muted crw-counter">
              {L.counter(message.length, CREW_REQUEST_MESSAGE_MAX)}
            </span>
            <p className="o-t-caption s-muted">{L.sheetHint}</p>
            {fetcher.data?.crewError ? (
              <p className="s-error" role="alert">
                {fetcher.data.crewError}
              </p>
            ) : null}
            <Button
              type="submit"
              icon="send"
              loading={fetcher.state !== "idle"}
              fullWidth
              data-testid="crew-request-send"
            >
              {L.sheetSend}
            </Button>
          </fetcher.Form>
        </div>
      </dialog>
    </>
  );
}
