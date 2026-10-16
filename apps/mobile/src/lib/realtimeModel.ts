// Calculs purs du client temps réel (lot 18), testés sans React Native.

const MIN_DELAY = 1000;
const MAX_DELAY = 30_000;

/** Délai avant la prochaine tentative (1 s, 2 s, 4 s… plafonné à 30 s). */
export function reconnectDelay(attempt: number): number {
  return Math.min(MAX_DELAY, MIN_DELAY * 2 ** Math.max(0, attempt));
}

/** Jeton de session en hexadécimal (caractères autorisés dans un sous-protocole WebSocket). */
export function tokenProtocol(token: string): string {
  let hex = "";
  for (const byte of new TextEncoder().encode(token)) hex += byte.toString(16).padStart(2, "0");
  return `orasso.bearer.${hex}`;
}

/** Adresse WebSocket de l'API (`http` → `ws`, `https` → `wss`). */
export function wsUrlOf(apiBase: string): string {
  return `${apiBase.replace(/\/$/, "").replace(/^http/, "ws")}/api/ws`;
}
