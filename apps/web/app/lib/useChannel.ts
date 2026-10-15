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
          handler.current({ channel, type: message.type, payload: message.payload });
        }
      };
      socket.onclose = () => {
        setConnected(false);
        if (closed) return;
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
