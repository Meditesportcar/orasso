import { upgradeWebSocket } from "@hono/node-server";
import { WS_MAX_FRAME_BYTES, WS_SUBSCRIBES_PER_MINUTE } from "@orasso/shared";
import { Hono } from "hono";
import type { WSContext } from "hono/ws";

import { auth } from "./auth";
import { env } from "./env";
import { type RealtimeSocket, realtime } from "./lib/realtime";
import { profilesRepo } from "./modules/profiles/repo";
import { readSessionOrNull } from "./modules/security/session-life";

const HEARTBEAT_MS = 30_000;
/** Sous-protocole qui transporte le jeton de session (appli dans un navigateur : pas d'en-tête possible). */
const BEARER_PROTOCOL = "orasso.bearer.";

/** Origines dont un navigateur peut ouvrir le WebSocket avec le cookie de session (pas de détournement inter-site). */
function trustedOrigins(): Set<string> {
  const list = [new URL(env.PUBLIC_URL).origin];
  if (env.NODE_ENV !== "production") {
    list.push(`http://localhost:${env.API_PORT}`);
    for (const o of env.CORS_ORIGINS?.split(",") ?? []) if (o.trim()) list.push(o.trim());
  }
  return new Set(list);
}

/**
 * Identifiants de session de la poignée de main (lot 18, ARCHITECTURE-SUITE § 3.4), dans cet ordre :
 * en-tête `Authorization: Bearer` (appli native), sous-protocole `orasso.bearer.<jeton en hexadécimal>` (appli dans un
 * navigateur), cookie de session (site) — le cookie seulement depuis une origine de confiance. `null` : anonyme.
 */
export function wsCredentials(headers: Headers): Headers | null {
  const authorization = headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) return new Headers({ authorization });
  const protocols = (headers.get("sec-websocket-protocol") ?? "").split(",").map((p) => p.trim());
  const carried = protocols.find((p) => p.startsWith(BEARER_PROTOCOL));
  if (carried) {
    const hex = carried.slice(BEARER_PROTOCOL.length);
    if (!/^(?:[0-9a-f]{2}){8,512}$/i.test(hex)) return null;
    return new Headers({ authorization: `Bearer ${Buffer.from(hex, "hex").toString("utf8")}` });
  }
  const cookie = headers.get("cookie");
  if (!cookie) return null;
  const origin = headers.get("origin");
  if (origin && !trustedOrigins().has(origin)) return null;
  return new Headers({ cookie });
}

type ResolvedSession = { userId: string; secondFactor: string | null };

/** Session valide et compte non supprimé, sinon `null`. */
export async function resolveWsSession(credentials: Headers | null): Promise<ResolvedSession | null> {
  if (!credentials) return null;
  const session = await readSessionOrNull(() => auth.api.getSession({ headers: credentials }));
  if (!session) return null;
  const profile = await profilesRepo.byUserId(session.user.id);
  if (!profile || profile.deletedAt) return null;
  return {
    userId: session.user.id,
    secondFactor: (session.session as { secondFactor?: string | null }).secondFactor ?? null,
  };
}

/** Résultat d'une revérification : garder (avec la preuve de second facteur), fermer (session absente), réessayer. */
export type SessionCheck = { action: "keep"; secondFactor: string | null } | { action: "close" } | { action: "retry" };

/**
 * Revérifie la session d'une connexion ouverte. Une erreur passagère (base indisponible) ne ferme rien : seule une
 * session réellement absente (ou d'une autre personne) ferme la connexion en 4401 (relecture du lot 18).
 */
export async function checkWsSession(
  credentials: Headers | null,
  userId: string,
  resolve: (c: Headers | null) => Promise<ResolvedSession | null> = resolveWsSession,
): Promise<SessionCheck> {
  let current: ResolvedSession | null;
  try {
    current = await resolve(credentials);
  } catch {
    return { action: "retry" };
  }
  if (!current || current.userId !== userId) return { action: "close" };
  return { action: "keep", secondFactor: current.secondFactor };
}

/** Connexions ouvertes au plus par personne : au-delà, la plus ancienne est fermée (4008). */
export const MAX_WS_PER_USER = 5;
const openConnections = new Map<string, (() => void)[]>();

/** Enregistre une connexion ; ferme la plus ancienne de la personne au-delà du plafond. Rend la fonction de retrait. */
export function trackConnection(userId: string, close: () => void): () => void {
  const list = openConnections.get(userId) ?? [];
  list.push(close);
  openConnections.set(userId, list);
  while (list.length > MAX_WS_PER_USER) list.shift()?.();
  return () => {
    const current = openConnections.get(userId);
    if (!current) return;
    const i = current.indexOf(close);
    if (i >= 0) current.splice(i, 1);
    if (current.length === 0) openConnections.delete(userId);
  };
}

/**
 * Temps réel (/api/ws). Le client envoie `{"type":"subscribe","channel":"conversation:<id>"}` ; le droit est vérifié à
 * chaque abonnement, puis toutes les 30 s avec la session elle-même (session supprimée, compte supprimé, droit perdu :
 * connexion fermée ou abonnement retiré). Le canal `user:<id>` est ouvert d'office. Rien d'autre n'est accepté du
 * client (les messages s'envoient par HTTP) : messages de 2 Ko au plus, 60 abonnements par minute, 5 connexions par
 * personne.
 */
export const ws = new Hono().get(
  "/",
  upgradeWebSocket(async (c) => {
    const credentials = wsCredentials(c.req.raw.headers);
    // Base indisponible à la poignée de main : fermeture 1011, le client se reconnecte (jamais 4401 à tort).
    const initial = await resolveWsSession(credentials).catch(() => "error" as const);
    const unavailable = initial === "error";
    const userId = initial && initial !== "error" ? initial.userId : null;
    let untrack: (() => void) | null = null;
    let socket: RealtimeSocket | null = null;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let windowStart = Date.now();
    let subscribes = 0;

    const revalidate = async (ws: WSContext) => {
      if (!socket || !userId) return;
      const check = await checkWsSession(credentials, userId);
      if (check.action === "close") {
        ws.close(4401, "unauthenticated");
        return;
      }
      if (check.action === "retry") return;
      socket.secondFactor = check.secondFactor;
      for (const channel of realtime.channelsOf(socket)) {
        if (channel === `user:${userId}`) continue;
        // Erreur passagère : l'abonnement est gardé jusqu'à la prochaine revérification.
        const ok = await realtime
          .canSubscribe(userId, channel, { secondFactor: check.secondFactor, revalidation: true })
          .catch(() => true);
        if (!ok) {
          realtime.unsubscribe(channel, socket);
          ws.send(JSON.stringify({ type: "revoked", channel }));
        }
      }
    };

    return {
      onOpen(_event, ws: WSContext) {
        if (unavailable) {
          ws.close(1011, "unavailable");
          return;
        }
        if (!userId || !initial || unavailable) {
          ws.close(4401, "unauthenticated");
          return;
        }
        socket = { send: (data) => ws.send(data), userId, secondFactor: (initial as ResolvedSession).secondFactor };
        untrack = trackConnection(userId, () => ws.close(4008, "too_many_connections"));
        realtime.subscribe(`user:${userId}`, socket);
        heartbeat = setInterval(() => {
          ws.send(JSON.stringify({ type: "ping" }));
          void revalidate(ws);
        }, HEARTBEAT_MS);
      },
      async onMessage(event, ws) {
        if (!userId || !socket || typeof event.data !== "string") return;
        if (event.data.length > WS_MAX_FRAME_BYTES) {
          ws.close(1009, "too_large");
          return;
        }
        let msg: { type?: string; channel?: string };
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        if (msg.type === "subscribe" && typeof msg.channel === "string" && msg.channel.length <= 200) {
          if (Date.now() - windowStart > 60_000) {
            windowStart = Date.now();
            subscribes = 0;
          }
          subscribes += 1;
          if (subscribes > WS_SUBSCRIBES_PER_MINUTE) {
            ws.close(4429, "rate_limited");
            return;
          }
          const ok = await realtime
            .canSubscribe(userId, msg.channel, { secondFactor: socket.secondFactor ?? null })
            .catch(() => false);
          if (ok) realtime.subscribe(msg.channel, socket);
          ws.send(JSON.stringify({ type: ok ? "subscribed" : "forbidden", channel: msg.channel }));
        } else if (msg.type === "unsubscribe" && typeof msg.channel === "string") {
          if (msg.channel !== `user:${userId}`) realtime.unsubscribe(msg.channel, socket);
        } else if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
        }
      },
      onClose() {
        clearInterval(heartbeat);
        untrack?.();
        if (socket) realtime.unsubscribeAll(socket);
      },
    };
  }),
);
