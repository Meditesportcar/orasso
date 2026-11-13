import type { PublishStore } from "@orasso/shared";

// Petit lot site (tour 4) : l'événement affiché avec un envoi incertain est rangé sous le MÊME préfixe que le corps incertain
// (`orasso:fil:publish-uncertain:`, `uncertainKey` de `@orasso/shared`) : `purgeUncertain` (déconnexion) les efface ensemble.
const HELD_PREFIX = "orasso:fil:publish-uncertain:held-event:";
const heldKey = (account: string) => `${HELD_PREFIX}${account}`;

export function saveHeldEvent<T extends { id: string }>(
  store: PublishStore | null,
  account: string,
  event: T | null,
): void {
  try {
    if (event) store?.setItem(heldKey(account), JSON.stringify(event));
    else store?.removeItem(heldKey(account));
  } catch {
    // Stockage refusé : l'événement gardé ne survit pas à un rechargement.
  }
}

/** L'événement gardé de ce compte, s'il correspond au corps gardé (`eventId`). */
export function loadHeldEvent<T extends { id: string }>(
  store: PublishStore | null,
  account: string,
  eventId: string | null,
): T | null {
  try {
    const raw = store?.getItem(heldKey(account));
    const parsed = raw ? (JSON.parse(raw) as T | null) : null;
    return parsed && eventId && parsed.id === eventId ? parsed : null;
  } catch {
    return null;
  }
}
