import { Button, Icon, SelectField } from "@orasso/design-system/web";
import {
  eventDaysLabels,
  eventFormatLabels,
  formatDayDate,
  invitationLabels,
  type ReceivedInvitation,
  type VehicleFull,
} from "@orasso/shared";
import { Form } from "react-router";

import { formatDateTime, formatWhen } from "../lib/format";
import { ArrivalSeen } from "./ArrivalSeen";
import "../styles/invitations.css";

// Invitation nominative reçue (lot 25) : carte de l'événement, message de l'organisateur, véhicule imposé ou à choisir,
// accepter (règlement accepté) ou refuser. Utilisée dans Accès, Boîte > Demandes et la page du lien.

const L = invitationLabels;

/** Véhicules qui peuvent répondre à l'invitation : actifs, type admis, au moins une photo. */
export function eligibleVehicles(inv: ReceivedInvitation, vehicles: VehicleFull[]): VehicleFull[] {
  return vehicles.filter((v) => inv.event.admittedVehicleTypes.includes(v.vehicleType) && v.photos.length > 0);
}

export function ReceivedInvitationCard({
  inv,
  vehicles,
  busy,
  primary = true,
}: {
  inv: ReceivedInvitation;
  vehicles: VehicleFull[];
  busy: boolean;
  /** Bouton « Accepter » en principal (un seul par écran : faux quand la page en a déjà un). */
  primary?: boolean;
}) {
  const choices = eligibleVehicles(inv, vehicles);
  const needsChoice = !inv.vehicle;
  const blocked = needsChoice && choices.length === 0;
  return (
    <article className="inv-card" data-testid="received-invitation">
      <div className="inv-card__head">
        <span className="inv-card__poster" aria-hidden="true">
          {inv.event.posterUrl ? <img src={inv.event.posterUrl} alt="" /> : <Icon name="entry" size={24} />}
        </span>
        <div className="inv-card__text">
          <div className="s-label o-t-label">
            {L.invitedBy(inv.event.structure.name)}
            {inv.event.privateEvent ? ` · ${L.privateBadge}` : ""}
          </div>
          <h3 className="s-h2">
            <a href={`/e/${inv.event.slug}`}>{inv.event.title}</a>
          </h3>
          <div className="o-t-meta s-muted">
            {eventFormatLabels[inv.event.format]} · {formatWhen(inv.event.startsAt, inv.event.endsAt)}
            {inv.event.city ? ` · ${inv.event.city}` : ""}
          </div>
          {inv.vehicle && <div className="o-never-truncate">{L.invitedVehicle(inv.vehicle.label)}</div>}
          <div className="o-t-caption s-muted">{L.validUntil(formatDateTime(inv.event.lockAt))}</div>
        </div>
      </div>
      {inv.message && <p className="inv-card__message s-muted">{inv.message}</p>}
      <details>
        <summary className="o-t-label">{L.readRules}</summary>
        <div className="s-rules">
          {inv.event.rulesText ??
            "L'organisateur n'a pas ajouté de règlement particulier. Respecte les consignes sur place et les autres participants."}
        </div>
      </details>
      {blocked && (
        <p className="s-notice">
          {L.noEligibleVehicle} <a href="/app/garage/nouveau?retour=%2Fapp%2Facces">{L.addVehicle}</a>
        </p>
      )}
      <Form method="post" className="inv-card__actions">
        <input type="hidden" name="invitationId" value={inv.id} />
        {needsChoice && choices.length > 0 && (
          <SelectField
            name="vehicleId"
            label={L.chooseVehicle}
            defaultValue={choices.length === 1 ? choices[0]?.id : ""}
            placeholder="Choisir"
            options={choices.map((v) => ({ value: v.id, label: v.label }))}
          />
        )}
        {/* Lot 26 : événement sur plusieurs jours, le jour choisi par l'invité (selon le mode d'accès). */}
        {inv.event.days.length > 1 && inv.event.dayAccess !== "whole" && (
          <SelectField
            name="eventDayId"
            label={eventDaysLabels.chooseDay}
            defaultValue={inv.event.dayAccess === "both" ? "" : (inv.event.days[0]?.id ?? "")}
            options={[
              ...(inv.event.dayAccess === "both" ? [{ value: "", label: eventDaysLabels.wholeEvent }] : []),
              ...inv.event.days.map((d) => ({ value: d.id, label: formatDayDate(d.date) })),
            ]}
          />
        )}
        <ArrivalSeen slot={inv.event.arrivalExhibitors ?? null} />
        <Button
          type="submit"
          name="intent"
          value="invitation_accept"
          variant={primary ? "primary" : "secondary"}
          icon="check"
          disabled={busy || blocked}
          data-testid="invitation-accept"
        >
          {L.accept}
        </Button>
        <Button
          type="submit"
          name="intent"
          value="invitation_decline"
          variant="secondary"
          icon="close"
          disabled={busy}
          onClick={(e) => {
            if (!window.confirm(L.declineConfirm)) e.preventDefault();
          }}
          data-testid="invitation-decline"
        >
          {L.decline}
        </Button>
      </Form>
      <p className="o-t-caption s-muted">{L.rulesNotice}</p>
    </article>
  );
}
