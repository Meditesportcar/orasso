// Réglages › Confidentialité du site (lot R5c1, tour 2) : « Retirer mes publications des crews que j'ai quittés », en
// bloc, confirmation dans la page. Posé dans le formulaire des réglages : ses boutons ne l'envoient jamais.
import { Button } from "@orasso/design-system/web";
import { crewFeedLabels } from "@orasso/shared";
import { useState } from "react";

import { apiFetch } from "../../lib/api.client";

export function LeftCrewsSection() {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function withdraw() {
    setBusy(true);
    setError(null);
    const res = await apiFetch<{ posts: number; comments: number }>("/me/crew-content/left-crews", {
      method: "DELETE",
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setDone(crewFeedLabels.leftCrewsDone(res.data.posts, res.data.comments));
    setAsking(false);
  }

  return (
    <div className="s-stack" data-testid="left-crews">
      <p className="s-label o-t-label">{crewFeedLabels.leftCrewsTitle}</p>
      <p className="o-t-caption s-muted">{crewFeedLabels.leftCrewsHint}</p>
      {asking ? (
        <div className="s-card s-stack" data-testid="left-crews-confirm">
          <p>{crewFeedLabels.leftCrewsConfirm}</p>
          <div className="s-row">
            <Button
              type="button"
              variant="secondary"
              icon="trash"
              loading={busy}
              onClick={() => void withdraw()}
              data-testid="left-crews-yes"
            >
              {crewFeedLabels.leftCrewsConfirmAction}
            </Button>
            <Button type="button" variant="secondary" icon="close" disabled={busy} onClick={() => setAsking(false)}>
              {crewFeedLabels.cancel}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="secondary"
          icon="trash"
          onClick={() => {
            setDone(null);
            setAsking(true);
          }}
          data-testid="left-crews-open"
        >
          {crewFeedLabels.leftCrewsAction}
        </Button>
      )}
      {done && (
        <p className="s-notice s-notice--ok" role="status">
          {done}
        </p>
      )}
      {error && (
        <p className="s-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
