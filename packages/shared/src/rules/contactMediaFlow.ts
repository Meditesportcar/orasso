import { createOperationGate } from "./albumTagView";

// « Contacter <média> » depuis « Tes photos » (lot R9i, tour 2) : l'enchaînement appeler l'API, puis ouvrir la conversation ou dire l'erreur,
// une seule fois pour l'appli et le site (testé sans écran). Une opération à la fois ; l'écran qui part (démontage, perte de focus, autre
// compte) la périme : sa réponse tardive n'ouvre rien, ne dit rien, et ne touche plus au bouton (qui a déjà été rendu).

export type ContactMediaResult = { ok: true; conversationId: string } | { ok: false; message: string };

/** Dit quand l'appel lui-même échoue sans réponse (délai dépassé, coupure) ; l'écran peut rappeler tout de suite. */
export const CONTACT_MEDIA_FALLBACK_MESSAGE = "Connexion impossible. Réessaie.";

export type ContactMediaHooks = {
  setBusy: (busy: boolean) => void;
  onError: (message: string | null) => void;
  navigate: (conversationId: string) => void;
};

export function createContactMediaFlow() {
  const gate = createOperationGate();
  let running = false;
  return {
    /** Lance l'appel ; sans effet si un appel est déjà en route. Rend `true` si l'appel a abouti à une navigation ou à une erreur dite. */
    async open(call: () => Promise<ContactMediaResult>, hooks: ContactMediaHooks): Promise<boolean> {
      if (running) return false;
      running = true;
      const live = gate.start();
      hooks.setBusy(true);
      hooks.onError(null);
      let result: ContactMediaResult;
      try {
        result = await call();
      } catch {
        result = { ok: false, message: CONTACT_MEDIA_FALLBACK_MESSAGE };
      }
      // Périmée : le bouton a déjà été libéré par `cancel()` (et une autre opération a pu partir depuis) ; rien ne se dit, rien ne s'ouvre.
      if (!live()) return false;
      running = false;
      hooks.setBusy(false);
      if (result.ok) hooks.navigate(result.conversationId);
      else hooks.onError(result.message);
      return true;
    },
    /** Démontage, perte de focus ou changement de compte : la réponse en route est jetée, le bouton redevient libre. */
    cancel(setBusy?: (busy: boolean) => void) {
      gate.invalidate();
      running = false;
      setBusy?.(false);
    },
  };
}
