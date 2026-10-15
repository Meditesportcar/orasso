import { upgradeWebSocket } from "@hono/node-server";
import { Hono } from "hono";
import type { WSContext } from "hono/ws";

import { auth } from "./auth";
import { type RealtimeSocket, realtime } from "./lib/realtime";

const HEARTBEAT_MS = 30_000;

/**
 * Temps réel (/api/ws), authentifié par le cookie de session. Le client envoie
 * `{"type":"subscribe","channel":"event:<id>:triage"}` ; le droit est vérifié à chaque abonnement.
 * Le canal `user:<id>` est ouvert d'office.
 */
export const ws = new Hono().get(
  "/",
  upgradeWebSocket(async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    const userId = session?.user.id ?? null;
    let socket: RealtimeSocket | null = null;
    let heartbeat: ReturnType<typeof setInterval> | undefined;

    return {
      onOpen(_event, ws: WSContext) {
        if (!userId) {
          ws.close(4401, "unauthenticated");
          return;
        }
        socket = { send: (data) => ws.send(data) };
        realtime.subscribe(`user:${userId}`, socket);
        heartbeat = setInterval(() => ws.send(JSON.stringify({ type: "ping" })), HEARTBEAT_MS);
      },
      async onMessage(event, ws) {
        if (!userId || !socket || typeof event.data !== "string") return;
        let msg: { type?: string; channel?: string };
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        if (msg.type === "subscribe" && typeof msg.channel === "string") {
          const ok = await realtime.canSubscribe(userId, msg.channel);
          if (ok) realtime.subscribe(msg.channel, socket);
          ws.send(JSON.stringify({ type: ok ? "subscribed" : "forbidden", channel: msg.channel }));
        } else if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
        }
      },
      onClose() {
        clearInterval(heartbeat);
        if (socket) realtime.unsubscribeAll(socket);
      },
    };
  }),
);
