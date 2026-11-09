// Erreur de lecture des votes (lot R7l2, tour 2) : sans donnée, le message et « Réessayer » ; avec des données gardées après
// une coupure, la même erreur précédée de l'âge des données (« Données d'il y a 3 min »), pour qu'un classement périmé ne
// passe pas pour le direct.
import { Button } from "@orasso/design-system/web";
import { voteOrgaLabels as L } from "@orasso/shared";

export function OrgaVotesLoadError({
  error,
  staleMinutes,
  onRetry,
  testId,
}: {
  error: string;
  /** Minutes depuis la dernière lecture réussie ; `null` quand il n'y a aucune donnée affichée. */
  staleMinutes: number | null;
  onRetry: () => void;
  testId: string;
}) {
  return (
    <div className="s-stack s-stack--tight" data-testid={`${testId}-error`}>
      <p className="s-error" role="alert">
        {staleMinutes === null ? error : `${L.staleData(staleMinutes)} · ${error}`}
      </p>
      <div className="s-row">
        <Button variant="secondary" icon="undo" onClick={onRetry} data-testid={testId}>
          {L.retry}
        </Button>
      </div>
    </div>
  );
}
