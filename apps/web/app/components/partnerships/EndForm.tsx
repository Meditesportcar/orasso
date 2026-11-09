// « Mettre fin » (lot R7m1, maquette R7.20 `pq_end`) : une confirmation qui s'ouvre sous le bouton, sans JavaScript. La
// personne concernée est prévenue ; les contenus déjà publiés gardent leur mention. Le formulaire envoie `intent` et `id` à
// l'action de la page.
import { Button, Icon } from "@orasso/design-system/web";
import { partnershipLabels as L } from "@orasso/shared";
import { Form } from "react-router";

import "../../styles/partnerships.css";

export function EndForm({
  intent,
  id,
  name,
  forPro = false,
  busy,
  withdraw = false,
}: {
  intent: string;
  id: string;
  name: string;
  /** Côté pro : la personne est prévenue ; côté passionné : le pro. */
  forPro?: boolean;
  busy: boolean;
  /** Une proposition sans réponse se retire d'un geste, sans confirmation. */
  withdraw?: boolean;
}) {
  if (withdraw) {
    return (
      <Form method="post">
        <input type="hidden" name="intent" value={intent} />
        <input type="hidden" name="id" value={id} />
        <Button type="submit" variant="secondary" icon="close" loading={busy} data-testid="partnership-withdraw">
          {L.withdraw}
        </Button>
      </Form>
    );
  }
  return (
    <details className="ptn-end" data-testid="partnership-end">
      <summary className="o-button o-t-button o-button--secondary">
        <Icon name="close" size={18} />
        <span className="o-button__label">{L.end}</span>
      </summary>
      <Form method="post" className="ptn-end__body">
        <input type="hidden" name="intent" value={intent} />
        <input type="hidden" name="id" value={id} />
        <p className="o-t-title">{L.endTitle}</p>
        <p className="o-t-caption s-muted">{`${name} · ${forPro ? L.endBodyForPro : L.endBody}`}</p>
        <Button type="submit" variant="secondary" icon="close" loading={busy} data-testid="partnership-end-confirm">
          {L.end}
        </Button>
      </Form>
    </details>
  );
}
