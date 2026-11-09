// Partenariats pro ↔ passionné (lot R7m1, ARCHITECTURE-R7 § 2.10). Côté pro : proposer, lister, mettre fin. Côté
// passionné : mes partenaires, accepter, refuser, mettre fin. La demande reçue arrive par `GET /me/requests`.
import { partnershipProposeSchema } from "@orasso/shared";
import { Hono } from "hono";
import { z } from "zod";

import { type AppEnv, requireUser } from "../../lib/session";
import { body, query, uuidParam } from "../../lib/validate";
import { partnershipsService } from "./service";

const endQuery = z.object({ expect: z.enum(["pending", "active"]).optional() });

export const partnershipsRoutes = new Hono<AppEnv>()
  .post("/pros/:id/partnerships", async (c) => {
    const v = await requireUser(c);
    return c.json(
      await partnershipsService.propose(v, uuidParam(c, "id"), await body(c, partnershipProposeSchema)),
      201,
    );
  })
  .get("/pros/:id/partnerships", async (c) => {
    c.header("cache-control", "no-store");
    return c.json(await partnershipsService.ofPro(await requireUser(c), uuidParam(c, "id")));
  })
  // `?expect=pending` : « retirer la proposition » ; `?expect=active` : « mettre fin ». Si la ligne a changé entre-temps
  // (la personne vient d'accepter), 409 : un retrait ne termine jamais un partenariat devenu actif.
  .post("/pros/:id/partnerships/:pid/end", async (c) => {
    const v = await requireUser(c);
    const { expect } = query(c, endQuery);
    return c.json(await partnershipsService.endByPro(v, uuidParam(c, "id"), uuidParam(c, "pid"), expect));
  })
  .get("/me/partnerships", async (c) => {
    c.header("cache-control", "no-store");
    return c.json(await partnershipsService.mine(await requireUser(c)));
  })
  .post("/me/partnerships/:id/accept", async (c) =>
    c.json(await partnershipsService.accept(await requireUser(c), uuidParam(c, "id"))),
  )
  .post("/me/partnerships/:id/decline", async (c) =>
    c.json(await partnershipsService.decline(await requireUser(c), uuidParam(c, "id"))),
  )
  .post("/me/partnerships/:id/end", async (c) =>
    c.json(await partnershipsService.endByUser(await requireUser(c), uuidParam(c, "id"))),
  );
