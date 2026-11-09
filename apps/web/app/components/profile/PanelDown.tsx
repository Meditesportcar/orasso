import { Button } from "@orasso/design-system/web";
import { profileTabsLabels as L } from "@orasso/shared";

// Lot R7b1, tour 2 : le panneau (Garage ou Sorties) dont la lecture a échoué : un message et « Réessayer ». Le reste de
// Mon compte (réglages, suppression du compte) reste affiché.
export function PanelDown({ message, href }: { message: string; href: string }) {
  return (
    <div className="s-stack" data-testid="profil-panel-down">
      <p className="s-error" role="alert">
        {message}
      </p>
      <Button variant="secondary" icon="undo" href={href}>
        {L.retry}
      </Button>
    </div>
  );
}
