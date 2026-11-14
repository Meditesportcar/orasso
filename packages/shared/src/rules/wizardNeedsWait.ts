/**
 * Assistant d'événement du site : un clic donné pendant le chargement des missions (R9-assistant, décision de Damien du
 * 14/11/2026, option B) n'est plus refusé en silence : il est mis en attente, puis exécuté à l'arrivée des missions.
 * Jamais d'avancée ni d'enregistrement sans les missions ; une panne de lecture annule le clic en attente.
 * Logique pure, sans rendu : testée seule (`wizardNeedsWait.test.ts`).
 */

/** Ce que le clic demandait : « Continuer », « Publier », « Brouillon », « Aperçu », « Enregistrer les modifications ». */
export type WaitedAction = "next" | "publish" | "draft" | "preview" | "save";

export type NeedsState = "loading" | "ok" | "failed";

/**
 * Que faire d'un clic :
 * - `run` : rien ne manque, on exécute ;
 * - `wait` : missions en chargement, on met le clic en attente ;
 * - `ignore` : un clic est déjà en attente (ou prêt à partir), le second ne double rien ;
 * - `refuse` : lecture des missions en échec, rien ne s'enregistre (message + « Recharger les missions »).
 * `needed` : l'action a besoin des missions (une création au temps 1 n'en a pas besoin).
 */
export function decideClick(
  needsState: NeedsState,
  queued: WaitedAction | null,
  needed: boolean,
): "run" | "wait" | "ignore" | "refuse" {
  if (queued !== null) return "ignore";
  if (!needed || needsState === "ok") return "run";
  return needsState === "loading" ? "wait" : "refuse";
}

/** Sort du clic en attente quand l'état des missions change : il attend, part (`run`), ou est annulé par la panne (`fail`). */
export function settleWait(waiting: WaitedAction | null, needsState: NeedsState): "none" | "keep" | "run" | "fail" {
  if (waiting === null) return "none";
  if (needsState === "loading") return "keep";
  return needsState === "ok" ? "run" : "fail";
}

/**
 * Tour 2 : un clic en attente est lié à ce que la personne voyait en cliquant : l'étape, la saisie (`epoch` : change quand
 * une saisie gardée est restaurée, effacée ou recommencée) et le compte. Tout changement de l'un d'eux, ou une sortie
 * (fenêtre « Quitter l'assistant ? »), annule l'attente (`waiting` et `due`) : la personne reclique si elle le veut.
 */
export type WaitTicket = { action: WaitedAction; step: number; epoch: number; account: string | null };

export type WaitContext = { step: number; epoch: number; account: string | null; leaving: boolean };

export const newTicket = (action: WaitedAction, ctx: WaitContext): WaitTicket => ({
  action,
  step: ctx.step,
  epoch: ctx.epoch,
  account: ctx.account,
});

/** Le billet est périmé : sortie en cours, ou étape, saisie ou compte différents de ceux vus au clic. */
export const waitIsStale = (ticket: WaitTicket, ctx: WaitContext): boolean =>
  ctx.leaving || ticket.step !== ctx.step || ticket.epoch !== ctx.epoch || ticket.account !== ctx.account;

/** Le compte vu par l'assistant après une annonce de session d'une AUTRE fenêtre : tout autre identifiant (ou aucun) le change. */
export const accountAfterAnnouncement = (
  current: string | null,
  announced: string | null,
  fromThisWindow: boolean,
): string | null => (fromThisWindow ? current : announced);
