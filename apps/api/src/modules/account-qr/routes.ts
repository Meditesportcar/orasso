import { accountQrVerifySchema } from "@orasso/shared";
import { Hono } from "hono";

import { type AppEnv, requireUser } from "../../lib/session";
import { body } from "../../lib/validate";
import { accountQrService } from "./service";

export const accountQrRoutes = new Hono<AppEnv>()
  .get("/me/account-qr-secret", async (c) => {
    c.header("cache-control", "no-store");
    return c.json(accountQrService.secret(await requireUser(c)));
  })
  .post("/me/account-qr-secret/rotate", async (c) => {
    c.header("cache-control", "no-store");
    return c.json(await accountQrService.rotate(await requireUser(c)));
  })
  .post("/account-qr/verify", async (c) => {
    const v = await requireUser(c);
    const { payload } = await body(c, accountQrVerifySchema);
    return c.json(await accountQrService.verify(v, payload));
  });
