// Aperçu des e-mails (lot 56, développement seulement) : `GET /dev/mail`. Hors développement, la route répond 404 comme
// si elle n'existait pas. Le site l'affiche sur `/_mail`.
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";

import { env } from "../../env";
import { notFound } from "../../lib/errors";
import type { AppEnv } from "../../lib/session";
import { mailSamples } from "./samples";

const developmentOnly = createMiddleware<AppEnv>(async (_c, next) => {
  if (env.NODE_ENV !== "development") throw notFound("Route inconnue");
  await next();
});

export const devMailRoutes = new Hono<AppEnv>().use("/dev/mail", developmentOnly).get("/dev/mail", (c) =>
  c.json({
    items: mailSamples().map((s) => ({ id: s.id, label: s.label, subject: s.content.subject, html: s.content.html })),
  }),
);
