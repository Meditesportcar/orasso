// Routes du garage ajoutées au lot 31 : transferts de plaque (ancien propriétaire, équipe Orasso) et demandes de
// certification (équipe Orasso). Les routes du véhicule lui-même restent dans `routes.ts`.
import { adminDecisionSchema, certificationStatuses, mainVehicleSchema } from "@orasso/shared";
import { Hono } from "hono";
import { z } from "zod";

import { type AppEnv, requireUser } from "../../lib/session";
import { body, query, uuidParam } from "../../lib/validate";
import { certificationService } from "./certification";
import { mainVehicleService } from "./main";
import { plateTransferService } from "./plate-transfer";

const adminCertificationsQuery = z.object({ status: z.enum(certificationStatuses).optional() });

export const garageRoutes = new Hono<AppEnv>()
  // Lot R4c : « Mettre en avant » un véhicule (le véhicule principal).
  .put("/me/main-vehicle", async (c) => {
    const v = await requireUser(c);
    const { vehicleId } = await body(c, mainVehicleSchema);
    return c.json(await mainVehicleService.set(v, vehicleId));
  })
  // Demandes reçues (je suis l'ancien propriétaire) et envoyées.
  .get("/me/plate-transfers", async (c) => c.json(await plateTransferService.listMine(await requireUser(c))))
  .post("/plate-transfers/:id/accept", async (c) => {
    await plateTransferService.accept(await requireUser(c), uuidParam(c, "id"));
    return c.json({ ok: true });
  })
  .post("/plate-transfers/:id/decline", async (c) => {
    await plateTransferService.decline(await requireUser(c), uuidParam(c, "id"));
    return c.json({ ok: true });
  })
  // Équipe Orasso (super admin, 2FA).
  .get("/admin/plate-transfers", async (c) => c.json(await plateTransferService.adminList(await requireUser(c))))
  .post("/admin/plate-transfers/:id/decide", async (c) => {
    const v = await requireUser(c);
    await plateTransferService.adminDecide(v, uuidParam(c, "id"), await body(c, adminDecisionSchema));
    return c.json({ ok: true });
  })
  .get("/admin/certification-requests", async (c) => {
    const v = await requireUser(c);
    return c.json(await certificationService.adminList(v, query(c, adminCertificationsQuery).status));
  })
  .post("/admin/certification-requests/:id/decide", async (c) => {
    const v = await requireUser(c);
    await certificationService.adminDecide(v, uuidParam(c, "id"), await body(c, adminDecisionSchema));
    return c.json({ ok: true });
  });
