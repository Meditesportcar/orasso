// B2a, tour 2 (site et appli) : la clé d'envoi d'une story (`uploadKey`) fait l'identité de sa publication côté API (`storyIdFor`) : la même clé retrouve la
// story déjà créée, une autre clé en crée une seconde. Tant qu'une tentative antérieure est restée sans réponse certaine (délai, réseau
// perdu, 5xx), elle peut encore aboutir : la clé est donc gardée, MÊME après un refus net (4xx) d'une reprise. Elle n'est renouvelée que
// quand aucune tentative n'est incertaine, ou sur un nouveau choix de fichier (`forgetSendKey`).
export type SendAttemptOutcome = { ok: boolean; status: number };

export type SendUncertainty = { uncertain: boolean };

export const newSendUncertainty = (): SendUncertainty => ({ uncertain: false });

/** Une tentative s'est terminée : succès → plus d'incertitude ; sans réponse certaine → incertaine ; un refus net ne la lève pas. */
export function settleSendAttempt(state: SendUncertainty, res: SendAttemptOutcome): void {
  if (res.ok) state.uncertain = false;
  else if (res.status === 0 || res.status >= 500) state.uncertain = true;
}

/** Un refus net (4xx) de cette tentative, alors qu'aucune tentative antérieure n'est incertaine : la clé peut être renouvelée. */
export const mayRenewSendKey = (state: SendUncertainty, res: SendAttemptOutcome): boolean =>
  !res.ok && res.status >= 400 && res.status < 500 && !state.uncertain;

/** Nouveau fichier : l'ancienne clé est abandonnée avec son incertitude (une autre publication, une autre clé). */
export function forgetSendKey(state: SendUncertainty): void {
  state.uncertain = false;
}
