// Temps réel : abonnement à un canal de l'API (`/api/ws`, authentifié par le cookie), avec reconnexion.
import { useEffect, useRef, useState } from "react";

export type ChannelMessage = { channel: string; type: string; payload: unknown };

/** `connected` passe à vrai une fois l'abonnement confirmé par le serveur. */
export function useChannel(
  channel: string | null,
  onMessage: (message: ChannelMessage) => void,
): { connected: boolean } {
  const handler = useRef(onMessage);
  handler.current = onMessage;
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!channel) return;
    let socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let closed = false;

    const open = () => {
      const scheme = location.protocol === "https:" ? "wss" : "ws";
      socket = new WebSocket(`${scheme}://${location.host}/api/ws`);
      socket.onopen = () => {
        attempt = 0;
        socket?.send(JSON.stringify({ type: "subscribe", channel }));
      };
      socket.onmessage = (event) => {
        let message: { type?: string; channel?: string; payload?: unknown };
        try {
          message = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (message.type === "subscribed" && message.channel === channel) setConnected(true);
        else if (message.channel === channel && typeof message.type === "string") {
          if (message.type === "revoked") {
            // Lot R6a, tour 2 : abonnement retiré par le serveur. Plus connecté (les relectures de secours reprennent),
            // et le canal se rouvre : droit encore là (réacceptée, revérification passagère) → `subscribed` ; sinon
            // `forbidden`, et rien ne repart.
            setConnected(false);
            socket?.send(JSON.stringify({ type: "subscribe", channel }));
          }
          handler.current({ channel, type: message.type, payload: message.payload });
        }
      };
      socket.onclose = (event) => {
        setConnected(false);
        // Session absente (4401) ou trop d'onglets ouverts (4008) : pas de nouvel essai en boucle.
        if (closed || event.code === 4401 || event.code === 4008) return;
        attempt += 1;
        timer = setTimeout(open, Math.min(30_000, 1000 * 2 ** attempt));
      };
    };
    open();
    return () => {
      closed = true;
      clearTimeout(timer);
      socket?.close();
      setConnected(false);
    };
  }, [channel]);

  return { connected };
}
