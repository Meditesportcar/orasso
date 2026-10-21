// Temps réel de l'appli (lot 18, ARCHITECTURE-SUITE § 3.4) : premier client WebSocket (`/api/ws`). Une seule connexion
// partagée par tous les écrans, authentifiée par le jeton de session : en-tête `Authorization` à la poignée de main
// sur le téléphone, sous-protocole `orasso.bearer.<jeton en hexadécimal>` dans un navigateur (recette web : pas
// d'en-tête possible). Reconnexion de 1 s à 30 s, ré-abonnement automatique, pause quand l'appli passe en arrière-plan.
import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";

import { apiUrl } from "@/api";

import { getSessionToken } from "./http";
import { reconnectDelay, tokenProtocol, wsUrlOf } from "./realtimeModel";

export type ChannelEvent = { channel: string; type: string; payload: unknown };
type Handler = (event: ChannelEvent) => void;
type SubscribedHandler = () => void;

type NativeWebSocket = new (
  url: string,
  protocols?: string | string[] | null,
  options?: { headers: Record<string, string> },
) => WebSocket;

class RealtimeClient {
  private socket: WebSocket | null = null;
  private token: string | null = null;
  private readonly handlers = new Map<string, Set<Handler>>();
  private readonly subscribedHandlers = new Map<string, Set<SubscribedHandler>>();
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private paused = false;
  private stopped = false;
  private appStateBound = false;

  /** S'abonne à un canal ; renvoie la fonction de désabonnement. */
  subscribe(channel: string, handler: Handler, onSubscribed?: SubscribedHandler): () => void {
    let set = this.handlers.get(channel);
    const first = !set;
    if (!set) {
      set = new Set();
      this.handlers.set(channel, set);
    }
    set.add(handler);
    if (onSubscribed) {
      const subs = this.subscribedHandlers.get(channel) ?? new Set<SubscribedHandler>();
      subs.add(onSubscribed);
      this.subscribedHandlers.set(channel, subs);
    }
    this.stopped = false;
    this.bindAppState();
    if (getSessionToken() !== this.token) this.reconnectNow();
    else if (first && this.socket?.readyState === WebSocket.OPEN) this.sendSubscribe(channel);
    else if (!this.socket && !this.timer) this.connect();
    return () => {
      const current = this.handlers.get(channel);
      if (!current) return;
      current.delete(handler);
      if (onSubscribed) this.subscribedHandlers.get(channel)?.delete(onSubscribed);
      if (current.size === 0) {
        this.handlers.delete(channel);
        this.subscribedHandlers.delete(channel);
        if (this.socket?.readyState === WebSocket.OPEN) {
          this.socket.send(JSON.stringify({ type: "unsubscribe", channel }));
        }
      }
      if (this.handlers.size === 0) this.close();
    };
  }

  /** Déconnexion du compte : plus rien ne tourne. */
  stop() {
    this.stopped = true;
    this.handlers.clear();
    this.subscribedHandlers.clear();
    this.close();
  }

  private bindAppState() {
    if (this.appStateBound) return;
    this.appStateBound = true;
    AppState.addEventListener("change", (state) => {
      if (state === "active") {
        this.paused = false;
        if (!this.socket && this.handlers.size) this.reconnectNow();
      } else if (state === "background") {
        // Pas de connexion ouverte en arrière-plan (batterie) : les push prennent le relais.
        this.paused = true;
        this.close();
      }
    });
  }

  private reconnectNow() {
    this.close();
    this.attempt = 0;
    this.connect();
  }

  private close() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onclose = null;
      socket.close();
    }
  }

  private sendSubscribe(channel: string) {
    this.socket?.send(JSON.stringify({ type: "subscribe", channel }));
  }

  private connect() {
    if (this.stopped || this.paused || this.socket) return;
    const token = getSessionToken();
    this.token = token;
    if (!token) return;
    const url = wsUrlOf(apiUrl(""));
    let socket: WebSocket;
    try {
      socket =
        Platform.OS === "web"
          ? new WebSocket(url, ["orasso.v1", tokenProtocol(token)])
          : new (WebSocket as unknown as NativeWebSocket)(url, ["orasso.v1"], {
              headers: { Authorization: `Bearer ${token}` },
            });
    } catch {
      this.schedule();
      return;
    }
    this.socket = socket;
    socket.onopen = () => {
      this.attempt = 0;
      for (const channel of this.handlers.keys()) if (!channel.startsWith("user:")) this.sendSubscribe(channel);
    };
    socket.onmessage = (event) => {
      let message: { type?: string; channel?: string; payload?: unknown };
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (!message.channel || typeof message.type !== "string") return;
      if (message.type === "subscribed") {
        // Abonnement confirmé (y compris après une reconnexion) : les écrans rechargent ce qu'ils ont pu manquer.
        for (const fn of [...(this.subscribedHandlers.get(message.channel) ?? [])]) fn();
        return;
      }
      if (message.type === "forbidden" || message.type === "revoked") return;
      const set = this.handlers.get(message.channel);
      if (!set) return;
      for (const handler of [...set])
        handler({ channel: message.channel, type: message.type, payload: message.payload });
    };
    socket.onclose = (event) => {
      this.socket = null;
      // Session réellement refusée (4401) ou trop de connexions ouvertes (4008) : inutile d'insister ; une base
      // indisponible (1011) ou une coupure réseau, elles, relancent la reconnexion.
      if (event.code === 4401 || event.code === 4008) return;
      this.schedule();
    };
  }

  private schedule() {
    if (this.stopped || this.paused || this.timer || this.handlers.size === 0) return;
    const delay = reconnectDelay(this.attempt);
    this.attempt += 1;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.connect();
    }, delay);
  }
}

export const realtime = new RealtimeClient();

/**
 * Abonnement d'un écran à un canal (`conversation:{id}`, `user:{id}`) tant qu'il est monté. Le canal `user:{id}` est
 * ouvert d'office par le serveur pour la connexion ; on s'y « abonne » ici seulement pour recevoir ses messages.
 */
export function useChannel(channel: string | null, handler: Handler, onSubscribed?: SubscribedHandler) {
  const ref = useRef(handler);
  ref.current = handler;
  const subscribedRef = useRef(onSubscribed);
  subscribedRef.current = onSubscribed;
  useEffect(() => {
    if (!channel) return;
    return realtime.subscribe(
      channel,
      (event) => ref.current(event),
      () => subscribedRef.current?.(),
    );
  }, [channel]);
}
