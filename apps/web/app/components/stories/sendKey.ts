// B2a, tour 2 : la clé d'envoi d'une story (`uploadKey`) fait l'identité de sa publication côté API (`storyIdFor`) : la même clé retrouve la
// story déjà créée, une autre clé en crée une seconde. Tant qu'une tentative antérieure est restée sans réponse certaine (délai, réseau
// perdu, 5xx), elle peut encore aboutir : la clé est donc gardée, MÊME après un refus net (4xx) d'une reprise. Elle n'est renouvelée que
// quand aucune tentative n'est incertaine, ou sur un nouveau choix de fichier (`forget`).
export type SendOutcome = { ok: boolean; status: number };

export type SendUncertainty = { uncertain: boolean };

export const newUncertainty = (): SendUncertainty => ({ uncertain: false });

/** Une tentative s'est terminée : succès → plus d'incertitude ; sans réponse certaine → incertaine ; un refus net ne la lève pas. */
export function settleAttempt(state: SendUncertainty, res: SendOutcome): void {
  if (res.ok) state.uncertain = false;
  else if (res.status === 0 || res.status >= 500) state.uncertain = true;
}

/** Un refus net (4xx) de cette tentative, alors qu'aucune tentative antérieure n'est incertaine : la clé peut être renouvelée. */
export const mayRenewKey = (state: SendUncertainty, res: SendOutcome): boolean =>
  !res.ok && res.status >= 400 && res.status < 500 && !state.uncertain;

/** Nouveau fichier : l'ancienne clé est abandonnée avec son incertitude (une autre publication, une autre clé). */
export function forget(state: SendUncertainty): void {
  state.uncertain = false;
}
