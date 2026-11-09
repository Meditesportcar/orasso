// « Proposer un partenariat » sur le profil d'un passionné, vu par un pro vérifié (lot R7m1, maquette R7.19) : un bouton
// secondaire (« Suivre » reste le bouton principal) qui ouvre, sans JavaScript, un texte court (200 caractères au plus) et
// le choix d'un véhicule concerné parmi ceux que le profil montre (facultatif). La proposition arrive dans Activité ›
// Demandes de la personne. Aucune somme : Orasso ne touche à aucun paiement entre eux. L'API décide de tout (le bouton
// n'existe que si `partnershipOffer` est servi) ; ici seulement le formulaire et la proposition déjà envoyée.
import { Button, Icon } from "@orasso/design-system/web";
import {
  partnershipLabels as L,
  PARTNERSHIP_MESSAGE_MAX,
  type PartnershipOffer,
  type ProfileVehicle,
} from "@orasso/shared";
import { Form } from "react-router";

import "../../styles/partnerships.css";

export function ProposeForm({
  offer,
  pseudo,
  vehicles,
  busy,
  error,
}: {
  offer: PartnershipOffer;
  pseudo: string;
  vehicles: ProfileVehicle[];
  busy: boolean;
  error?: string | null;
}) {
  if (offer.state === "pending") {
    return (
      <p className="o-t-caption s-muted" data-testid="partnership-pending">
        {L.proposed}
      </p>
    );
  }
  const cars = vehicles.filter((v) => v.detailed);
  return (
    <details className="ptn-propose" open={Boolean(error) || undefined} data-testid="partnership-propose">
      {/* Le résumé prend l'apparence du bouton secondaire (classes du système) : il ouvre le formulaire sans JavaScript. */}
      <summary className="o-button o-t-button o-button--secondary o-button--full">
        <Icon name="briefcase" size={18} />
        <span className="o-button__label">{L.propose}</span>
      </summary>
      <Form method="post" className="ptn-propose__body">
        <input type="hidden" name="intent" value="partnership_propose" />
        <input type="hidden" name="proId" value={offer.proId} />
        <input type="hidden" name="pseudo" value={pseudo} />
        <h2 className="s-h2">{L.sheetTitle}</h2>
        <p className="o-t-caption s-muted">{L.sheetTo(pseudo)}</p>
        <label className="s-label o-t-label" htmlFor="partnership-message">
          {L.messageLabel} · {L.messageHint}
        </label>
        <textarea
          id="partnership-message"
          name="message"
          className="s-textarea"
          rows={3}
          maxLength={PARTNERSHIP_MESSAGE_MAX}
          placeholder={L.messagePlaceholder}
          required
        />
        <fieldset className="ptn-propose__opts">
          <legend className="s-label o-t-label">
            {L.vehicleLabel} · {L.vehicleOptional}
          </legend>
          <label className="ptn-opt">
            <input type="radio" name="vehicleId" value="" defaultChecked />
            <span>
              <b>{L.noVehicle}</b>
              <small>{L.noVehicleHint(pseudo)}</small>
            </span>
          </label>
          {cars.map((v) => (
            <label className="ptn-opt" key={v.id}>
              <input type="radio" name="vehicleId" value={v.id} />
              <span>
                <b>{v.label}</b>
                <small>{L.vehicleHint(offer.proName)}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <ul className="ptn-notes">
          <li>{L.noteRequest(pseudo)}</li>
          <li>{L.noteEnd}</li>
          <li>{L.noteMoney}</li>
        </ul>
        {error && (
          <p className="s-error" role="alert">
            {error}
          </p>
        )}
        {/* Secondaire : le seul bouton principal de la fiche d'un passionné reste « Suivre ». */}
        <Button type="submit" variant="secondary" icon="send" loading={busy} data-testid="partnership-send">
          {L.send}
        </Button>
      </Form>
    </details>
  );
}
