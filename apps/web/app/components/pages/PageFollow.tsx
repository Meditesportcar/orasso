// « Suivre » / « Suivi » de la page d'un prestataire ou d'un média, sur le site (lot R9h partie 2, T54 ; lot R9b, T6 et T14 de l'appli) : un
// petit bouton principal qui écrit `PUT|DELETE /me/page-follows/<clé>`. Vu depuis l'espace d'une casquette (`?auteur=`), **c'est la page
// qui suit**, jamais la personne : l'acteur part avec l'appel (liste blanche, T49). La réponse de l'écriture est appliquée tout de suite
// (état et nombre d'abonnés) ; une panne se dit, rien n'est défait en silence.
import { Button } from "@orasso/design-system/web";
import { pagesLabels as L, type PageFollowResult } from "@orasso/shared";
import { useState } from "react";

import { apiFetch } from "../../lib/api.client";

export function PageFollow({
  targetKey,
  actor,
  following,
  onDone,
}: {
  /** `v:<id>` ou `m:<id>`. */
  targetKey: string;
  /** La casquette qui regarde (clé d'auteur), ou `null` : la personne. */
  actor: string | null;
  following: boolean;
  onDone: (result: PageFollowResult) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function toggle() {
    setBusy(true);
    setError(null);
    const res = await apiFetch<PageFollowResult>(`/me/page-follows/${encodeURIComponent(targetKey)}`, {
      method: following ? "DELETE" : "PUT",
      actor,
    });
    setBusy(false);
    if (res.ok) onDone(res.data);
    else setError(res.error.message);
  }
  return (
    <>
      <Button
        type="button"
        variant={following ? "secondary" : "primary"}
        icon={following ? "check" : "add"}
        className="fl-line"
        disabled={busy}
        onClick={() => void toggle()}
        data-testid="follow-button"
      >
        {following ? L.following : L.follow}
      </Button>
      {error ? (
        <span className="s-error" role="alert" data-testid="follow-error">
          {error}
        </span>
      ) : null}
    </>
  );
}
