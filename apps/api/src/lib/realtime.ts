// Temps réel : canaux en mémoire d'un seul processus API (V1). Si plusieurs instances un jour :
// LISTEN/NOTIFY PostgreSQL derrière cette même interface (ARCHITECTURE.md § 5.4).

/** Une connexion WebSocket : la personne authentifiée à la poignée de main et la preuve de second facteur de sa session. */
export type RealtimeSocket = { send(data: string): void; userId?: string; secondFactor?: string | null };

/** Contexte d'un abonnement : la session qui a ouvert la connexion. */
export type ChannelContext = {
  secondFactor: string | null;
  /** Revérification périodique (30 s) d'un abonnement déjà accordé : rien à tracer de nouveau. */
  revalidation?: boolean;
};

/** Droit d'abonnement à un canal (`event:{id}:triage`…), fourni par les modules métier. */
export type ChannelAuthorizer = (userId: string, channel: string, ctx: ChannelContext) => Promise<boolean>;
let authorizer: ChannelAuthorizer = async () => false;
/** Droits par préfixe de canal (`conversation:` : messagerie, lot 18), essayés avant l'autorisation générale. */
const prefixAuthorizers = new Map<string, ChannelAuthorizer>();

const channels = new Map<string, Set<RealtimeSocket>>();

export const realtime = {
  setAuthorizer(fn: ChannelAuthorizer) {
    authorizer = fn;
  },
  /** Un module déclare les droits de ses canaux (`prefix` se termine par `:`). */
  registerAuthorizer(prefix: string, fn: ChannelAuthorizer) {
    prefixAuthorizers.set(prefix, fn);
  },
  async canSubscribe(userId: string, channel: string, ctx: ChannelContext = { secondFactor: null }): Promise<boolean> {
    if (channel === `user:${userId}`) return true;
    for (const [prefix, fn] of prefixAuthorizers) if (channel.startsWith(prefix)) return fn(userId, channel, ctx);
    return authorizer(userId, channel, ctx);
  },
  subscribe(channel: string, socket: RealtimeSocket) {
    let set = channels.get(channel);
    if (!set) {
      set = new Set();
      channels.set(channel, set);
    }
    set.add(socket);
  },
  unsubscribe(channel: string, socket: RealtimeSocket) {
    const set = channels.get(channel);
    if (!set) return;
    set.delete(socket);
    if (set.size === 0) channels.delete(channel);
  },
  unsubscribeAll(socket: RealtimeSocket) {
    for (const [channel, set] of channels) {
      set.delete(socket);
      if (set.size === 0) channels.delete(channel);
    }
  },
  /** Canaux auxquels cette connexion est abonnée (revérification périodique des droits). */
  channelsOf(socket: RealtimeSocket): string[] {
    const out: string[] = [];
    for (const [channel, set] of channels) if (set.has(socket)) out.push(channel);
    return out;
  },
  publish(channel: string, type: string, payload: unknown) {
    this.publishTo(channel, type, payload, () => true);
  },
  /**
   * Diffusion filtrée : seules les connexions acceptées par `allow` reçoivent le message (messagerie : les droits sont
   * revérifiés à chaque message, pas seulement à l'abonnement).
   */
  publishTo(channel: string, type: string, payload: unknown, allow: (socket: RealtimeSocket) => boolean) {
    const set = channels.get(channel);
    if (!set) return;
    const message = JSON.stringify({ channel, type, payload });
    for (const socket of set) {
      if (!allow(socket)) continue;
      try {
        socket.send(message);
      } catch {
        set.delete(socket);
      }
    }
  },
  /**
   * Lot R6a : retire tout de suite les connexions choisies d'un canal (droit perdu : membre retiré, crew dissous) et le
   * leur dit (`revoked`), sans attendre la revérification périodique.
   */
  revoke(channel: string, match: (socket: RealtimeSocket) => boolean = () => true) {
    const set = channels.get(channel);
    if (!set) return;
    const message = JSON.stringify({ type: "revoked", channel });
    for (const socket of [...set]) {
      if (!match(socket)) continue;
      set.delete(socket);
      try {
        socket.send(message);
      } catch {
        // Connexion déjà fermée : rien à prévenir.
      }
    }
    if (set.size === 0) channels.delete(channel);
  },
  /**
   * Lot R6a, tour 2 : retire tout de suite une personne de tous les canaux d'une famille (`crew:` : compte suspendu ou
   * supprimé), sur toutes ses connexions, avec `revoked`.
   */
  revokeUser(prefix: string, userId: string) {
    for (const channel of [...channels.keys()]) {
      if (channel.startsWith(prefix)) this.revoke(channel, (socket) => socket.userId === userId);
    }
  },
  subscriberCount(channel: string): number {
    return channels.get(channel)?.size ?? 0;
  },
};
