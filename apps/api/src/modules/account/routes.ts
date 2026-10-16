// Routes du compte (lot 15, ARCHITECTURE-SUITE § 1.2).
import { isIP } from "node:net";
import { accountDeleteSchema, accountSettingsSchema, referralSchema } from "@orasso/shared";
import { Hono } from "hono";

import { type AppEnv, requireUser } from "../../lib/session";
import { body } from "../../lib/validate";
import { securityService } from "../security/service";
import { accountService } from "./service";

/** Adresse du client pour le journal d'administration (première de `x-forwarded-for`, posée par nginx). */
function clientIp(header: string | undefined): string | null {
  const ip = header?.split(",")[0]?.trim() ?? "";
  return isIP(ip) ? ip : null;
}

export const accountRoutes = new Hono<AppEnv>()
  // Public (page `/ami/:jeton`) : qui invite ? Pseudo et photo seulement, rien si le lien est inconnu.
  .get("/referral/:token", async (c) => c.json(await accountService.referrer(c.req.param("token"))))
  .post("/me/referral", async (c) => {
    const v = await requireUser(c);
    const { token } = await body(c, referralSchema);
    return c.json(await accountService.applyReferral(v, token));
  })
  .post("/me/email/resend-verification", async (c) => {
    await accountService.resendVerification(await requireUser(c));
    return c.body(null, 204);
  })
  .get("/me/settings", async (c) => c.json(await accountService.settings(await requireUser(c))))
  .patch("/me/settings", async (c) => {
    const v = await requireUser(c);
    return c.json(await accountService.updateSettings(v, await body(c, accountSettingsSchema)));
  })
  .get("/me/sessions", async (c) => {
    const v = await requireUser(c);
    return c.json(await securityService.listSessions(v.user.id, c.get("sessionId")));
  })
  .delete("/me/sessions/:id", async (c) => {
    const v = await requireUser(c);
    await securityService.revokeSession(v.user.id, c.req.param("id"));
    return c.body(null, 204);
  })
  .get("/me/public-preview", async (c) => c.json(await accountService.publicPreview(await requireUser(c))))
  .delete("/me", async (c) => {
    const v = await requireUser(c);
    const input = await body(c, accountDeleteSchema);
    return c.json(await accountService.deleteAccount(v, input, clientIp(c.req.header("x-forwarded-for"))));
  });
