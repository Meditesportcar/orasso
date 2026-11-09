// Onglet « Spots » du crew sur le site (lot R7b2, maquette R7.11 `ct_spo`) : les rendez-vous au spot lancés pour le crew.
// FICHIER RÉSERVÉ au lot R7i, qui le remplace (liste des rendez-vous du crew et « Lancer un rendez-vous pour le crew »).
// Ici, seulement l'état vide : « Pas de rendez-vous », le bouton grisé et la ligne qui dit pourquoi.
import { Button, Icon } from "@orasso/design-system/web";
import { crewTabLabels as T } from "@orasso/shared";

export function CrewSpots(_props: { crewId: string; archived?: boolean }) {
  return (
    <section className="crw-col" data-testid="crew-spots">
      <div className="crw-empty">
        <Icon name="place" size={28} />
        <h2 className="s-h2">{T.spotsEmptyTitle}</h2>
        <p className="o-t-caption s-muted">{T.spotsEmptyHint}</p>
      </div>
      <Button variant="secondary" icon="place" disabled fullWidth data-testid="crew-spots-launch">
        {T.spotsLaunch}
      </Button>
      <p className="o-t-caption s-muted" data-testid="crew-spots-soon">
        {T.spotsSoon}
      </p>
    </section>
  );
}
