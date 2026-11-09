import { Icon } from "@orasso/design-system/web";
import { navLabels } from "@orasso/shared";
import { Form } from "react-router";

// Bandeau « où sont passées les choses » (lot R7a1, D38 ; tour 2 : texte et place de la maquette R7.1), comme celui de
// l'appli : sous le bonjour de l'Accueil, une seule fois après la mise à jour (le visiteur n'a pas de garage : sa variante
// n'en parle pas). Le ✕ est un formulaire (il marche sans JavaScript) : l'adresse `/app/bandeau` écrit le cookie
// `whatsnew_r7` du compte, puis revient à l'Accueil.
export function WhatsNewBanner({ variant }: { variant: "exhibitor" | "visitor" }) {
  return (
    <Form
      method="post"
      action="/app/bandeau"
      className="s-notice s-row s-row--between s-whatsnew"
      data-testid="whatsnew-banner"
    >
      <div className="s-stack--tight s-whatsnew__text">
        <strong className="o-t-label">{navLabels.whatsNew.title}</strong>
        <span className="o-t-caption">{navLabels.whatsNew[variant]}</span>
      </div>
      <button
        type="submit"
        className="s-whatsnew__close"
        aria-label={navLabels.whatsNew.dismiss}
        data-testid="whatsnew-dismiss"
      >
        <Icon name="close" size={20} />
      </button>
    </Form>
  );
}
