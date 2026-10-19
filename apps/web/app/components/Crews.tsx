import { Button, CheckboxField, Chip } from "@orasso/design-system/web";
import { type ApplicationCrewInfo, type ArrivalSlot, type CrewCard, crewLabels } from "@orasso/shared";
import { Form } from "react-router";
import { formatDateTime } from "../lib/format";
import { ArrivalSeen } from "./ArrivalSeen";
import "../styles/crews.css";

// Éléments des crews du site (lot 19) : logo, ligne de crew, carte de confirmation de venue.

/** Logo carré d'un crew (initiale sur fond creusé s'il n'en a pas). */
export function CrewLogo({ url, name, size = 48 }: { url: string | null; name: string; size?: number }) {
  return (
    <span className="crw-logo" style={{ width: size, height: size }} aria-hidden="true">
      {url ? <img src={url} alt="" /> : <span>{name.slice(0, 1).toUpperCase()}</span>}
    </span>
  );
}

/** Un crew dans une liste : logo, nom (jamais tronqué), département, nombre de membres. */
export function CrewRow({ crew, extra }: { crew: CrewCard; extra?: React.ReactNode }) {
  return (
    <li className="s-person" data-testid="crew-row">
      <CrewLogo url={crew.logoUrl} name={crew.name} />
      <div className="s-person__main">
        <a className="s-person__name o-t-title o-never-truncate" href={`/c/${crew.slug}`}>
          {crew.name}
        </a>
        <div className="s-row s-row--tight">
          <Chip>{crew.department}</Chip>
          <span className="o-t-caption s-muted">{crewLabels.membersCount(crew.membersCount)}</span>
        </div>
      </div>
      {extra}
    </li>
  );
}

/**
 * Venue en crew à confirmer (onglet Accès) : rien n'est envoyé à l'organisateur sans l'accord du membre. Le règlement
 * se lit sur la page de l'événement ; « Suivre l'organisateur » est cochée d'office, comme à la candidature.
 */
export function CrewConfirm({
  applicationId,
  crew,
  vehicleLabel,
  rulesText,
  arrivalSlot,
  busy,
}: {
  applicationId: string;
  crew: ApplicationCrewInfo;
  vehicleLabel: string | null;
  rulesText: string | null;
  /** Lot 47 : créneau d'arrivée des exposants (case « J'ai vu »). */
  arrivalSlot?: ArrivalSlot | null;
  busy: boolean;
}) {
  return (
    <div className="s-notice crw-confirm" data-testid="crew-confirm">
      <strong>{crewLabels.confirmTitle(crew.name)}</strong>
      <p className="s-prewrap">{crewLabels.confirmBody(crew.leaderPseudo, vehicleLabel)}</p>
      {crew.confirmBefore && (
        <p className="o-t-caption">{crewLabels.confirmBefore(formatDateTime(crew.confirmBefore))}</p>
      )}
      <Form method="post" className="s-form">
        <input type="hidden" name="applicationId" value={applicationId} />
        <details>
          <summary className="o-t-label">Règlement de l'événement</summary>
          <div className="s-rules">
            {rulesText ??
              "L'organisateur n'a pas ajouté de règlement particulier. Respecte les consignes sur place et les autres participants."}
          </div>
        </details>
        <CheckboxField name="rules" required label={crewLabels.confirmRules} />
        <ArrivalSeen slot={arrivalSlot ?? null} />
        <CheckboxField
          name="follow"
          defaultChecked
          label="Suivre l'organisation (nouveaux événements, avant-premières)"
        />
        <Button
          type="submit"
          name="intent"
          value="crew_confirm"
          icon="check"
          loading={busy}
          data-testid="crew-confirm-btn"
        >
          {crewLabels.confirmVenue}
        </Button>
      </Form>
      {/* Formulaire à part : « Je ne viens pas » ne demande pas d'avoir coché le règlement. */}
      <Form method="post">
        <input type="hidden" name="applicationId" value={applicationId} />
        <Button
          type="submit"
          name="intent"
          value="crew_not_coming"
          variant="secondary"
          icon="close"
          loading={busy}
          data-testid="crew-not-coming"
        >
          {crewLabels.notComing}
        </Button>
      </Form>
    </div>
  );
}
