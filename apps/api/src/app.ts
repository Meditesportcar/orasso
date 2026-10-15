import { sql } from "drizzle-orm";
import { Hono } from "hono";

import { auth } from "./auth";
import { db } from "./db/client";
import { ws } from "./ws";

export const app = new Hono().basePath("/api");

app.get("/health", async (c) => {
  try {
    await db.execute(sql`select 1`);
    return c.json({ status: "ok", database: "ok" });
  } catch {
    return c.json({ status: "error", database: "unreachable" }, 503);
  }
});

app.on(["GET", "POST"], "/auth/*", (c) => auth.handler(c.req.raw));

app.route("/ws", ws);

export type App = typeof app;
