import { upgradeWebSocket } from "@hono/node-server";
import { Hono } from "hono";

// Temps réel (/api/ws). Squelette : renvoie ce qu'il reçoit. Compteurs du tri et direct du jour J viendront.
export const ws = new Hono().get(
  "/",
  upgradeWebSocket(() => ({
    onMessage(event, socket) {
      socket.send(typeof event.data === "string" ? event.data : "");
    },
  })),
);
