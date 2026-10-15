import {
  checkinCreateSchema,
  checkinsByPlatesSchema,
  checkinsQuerySchema,
  expressInviteSchema,
  expressSignupSchema,
  scanBatchSchema,
  staffSearchQuerySchema,
} from "@orasso/shared";
import { Hono } from "hono";

import { validation } from "../../lib/errors";
import { rateLimit } from "../../lib/rateLimit";
import { type AppEnv, requireUser } from "../../lib/session";
import { body, query, uuidParam } from "../../lib/validate";
import { expressService } from "./express";
import { checkinsService } from "./service";

const tokenParam = (raw: string | undefined) => {
  if (!raw || !/^[A-Za-z0-9_-]{16,64}$/.test(raw)) throw validation("Lien invalide");
  return raw;
};

export const checkinsRoutes = new Hono<AppEnv>()
  .post("/events/:id/scans", async (c) => {
    const v = await requireUser(c);
    return c.json(await checkinsService.receiveBatch(v, uuidParam(c, "id"), await body(c, scanBatchSchema)));
  })
  .get("/events/:id/checkins", async (c) => {
    const v = await requireUser(c);
    return c.json(await checkinsService.list(v, uuidParam(c, "id"), query(c, checkinsQuerySchema)));
  })
  .post("/events/:id/checkins", async (c) => {
    const v = await requireUser(c);
    const result = await checkinsService.create(v, uuidParam(c, "id"), await body(c, checkinCreateSchema));
    return c.json(result, result.created ? 201 : 200);
  })
  .post("/events/:id/checkins/by-plates", async (c) => {
    const v = await requireUser(c);
    rateLimit("plateCheckins", v.user.id);
    const { plates } = await body(c, checkinsByPlatesSchema);
    return c.json(await checkinsService.byPlates(v, uuidParam(c, "id"), plates));
  })
  .get("/events/:id/search", async (c) => {
    const v = await requireUser(c);
    rateLimit("staffSearch", v.user.id);
    return c.json(await checkinsService.search(v, uuidParam(c, "id"), query(c, staffSearchQuerySchema).q));
  })
  .get("/events/:id/scan-report", async (c) =>
    c.json(await checkinsService.report(await requireUser(c), uuidParam(c, "id"))),
  )
  .get("/events/:id/live", async (c) => c.json(await checkinsService.live(await requireUser(c), uuidParam(c, "id"))))
  .post("/events/:id/express-invites", async (c) => {
    const v = await requireUser(c);
    const { email } = await body(c, expressInviteSchema);
    return c.json(await expressService.invite(v, uuidParam(c, "id"), email), 201);
  })
  .get("/express/:token", async (c) => c.json(await expressService.get(tokenParam(c.req.param("token")))))
  .post("/express/:token", async (c) => {
    const { response, body: result } = await expressService.complete(
      tokenParam(c.req.param("token")),
      await body(c, expressSignupSchema),
    );
    // Session ouverte : cookies de Better Auth transmis tels quels.
    for (const cookie of response.headers.getSetCookie()) c.header("set-cookie", cookie, { append: true });
    return c.json(result, 201);
  });
