import { useEffect, useRef } from "react";
import { useRevalidator } from "react-router";

import { type ChannelMessage, useChannel } from "./useChannel";

/**
 * Recharge les données de la page quand un message utile arrive sur un canal temps réel (relecture du lot 57) :
 * au plus une fois toutes les `intervalMs` (10 s par défaut), et aussi après une reconnexion du canal (les messages
 * envoyés pendant la coupure sont perdus). `onMessage` voit tous les messages du canal (compteur en direct, etc.).
 */
export function useLiveRevalidate(
  channel: string | null,
  wanted: (message: ChannelMessage) => boolean,
  options: { intervalMs?: number; onMessage?: (message: ChannelMessage) => void } = {},
): { connected: boolean } {
  const { intervalMs = 10_000, onMessage } = options;
  const revalidator = useRevalidator();
  const last = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revalidate = useRef(revalidator.revalidate);
  revalidate.current = revalidator.revalidate;
  useEffect(() => () => clearTimeout(timer.current ?? undefined), []);

  const refreshSoon = useRef(() => {});
  refreshSoon.current = () => {
    if (timer.current) return;
    const wait = Math.max(0, last.current + intervalMs - Date.now());
    timer.current = setTimeout(() => {
      timer.current = null;
      last.current = Date.now();
      void revalidate.current();
    }, wait);
  };

  const { connected } = useChannel(channel, (message) => {
    onMessage?.(message);
    if (wanted(message)) refreshSoon.current();
  });

  // Reconnexion : le canal était ouvert, il s'est coupé, il revient.
  const wasConnected = useRef(false);
  const dropped = useRef(false);
  useEffect(() => {
    if (connected) {
      if (dropped.current) {
        dropped.current = false;
        refreshSoon.current();
      }
      wasConnected.current = true;
    } else if (wasConnected.current) {
      dropped.current = true;
    }
  }, [connected]);

  return { connected };
}
