import { Button } from "@orasso/design-system/web";
import { navLabels } from "@orasso/shared";
import { Form } from "react-router";

// Bandeau « où sont passées les choses » (lot R7a1, D38), comme celui de l'appli : en haut de l'Accueil, une seule fois
// après la mise à jour. « Compris » est un formulaire (il marche sans JavaScript) : l'adresse `/app/bandeau` écrit le
// cookie `whatsnew_r7` du compte, puis revient à l'Accueil.
export function WhatsNewBanner() {
  return (
    <Form method="post" action="/app/bandeau" className="s-notice s-row s-row--between" data-testid="whatsnew-banner">
      <span>{navLabels.whatsNew.text}</span>
      <Button type="submit" variant="secondary" icon="check" data-testid="whatsnew-dismiss">
        {navLabels.whatsNew.dismiss}
      </Button>
    </Form>
  );
}
