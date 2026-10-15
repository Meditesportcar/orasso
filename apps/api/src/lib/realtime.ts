// Temps réel : canaux en mémoire d'un seul processus API (V1). Si plusieurs instances un jour :
// LISTEN/NOTIFY PostgreSQL derrière cette même interface (ARCHITECTURE.md § 5.4).

export type RealtimeSocket = { send(data: string): void };

const channels = new Map<string, Set<RealtimeSocket>>();

/** Droit d'abonnement à un canal (`event:{id}:triage`…), fourni par les modules métier. */
export type ChannelAuthorizer = (userId: string, channel: string) => Promise<boolean>;
let authorizer: ChannelAuthorizer = async () => false;

export const realtime = {
  setAuthorizer(fn: ChannelAuthorizer) {
    authorizer = fn;
  },
  async canSubscribe(userId: string, channel: string): Promise<boolean> {
    if (channel === `user:${userId}`) return true;
    return authorizer(userId, channel);
  },
  subscribe(channel: string, socket: RealtimeSocket) {
    let set = channels.get(channel);
    if (!set) {
      set = new Set();
      channels.set(channel, set);
    }
    set.add(socket);
  },
  unsubscribeAll(socket: RealtimeSocket) {
    for (const [channel, set] of channels) {
      set.delete(socket);
      if (set.size === 0) channels.delete(channel);
    }
  },
  publish(channel: string, type: string, payload: unknown) {
    const set = channels.get(channel);
    if (!set) return;
    const message = JSON.stringify({ channel, type, payload });
    for (const socket of set) {
      try {
        socket.send(message);
      } catch {
        set.delete(socket);
      }
    }
  },
  subscriberCount(channel: string): number {
    return channels.get(channel)?.size ?? 0;
  },
};
