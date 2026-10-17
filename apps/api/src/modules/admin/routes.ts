// Administration (lot 05 : journal ; lot 33 : accueil et files, registres, base véhicules, mode assistance, réglages
// publics, newsletter et désinscription). Toutes les routes `/admin/*` exigent le rôle (`requirePlatformRole`) et la
// double authentification de la session ; les décisions écrivent le journal d'administration avec leur motif.
import {
  adminAssistanceQuery,
  adminAuditQuery,
  adminProsQuery,
  adminProVerifySchema,
  adminReasonSchema,
  adminStructurePatchSchema,
  adminUserSanctionSchema,
  adminUsersQuery,
  assistanceRequestCreateSchema,
  newsletterDraftSchema,
  newsletterScheduleSchema,
  newsletterSendNowSchema,
  templateCreateSchema,
  templateUpdateSchema,
  vehicleGenerationCreateSchema,
  vehicleGenerationUpdateSchema,
  vehicleMakeCreateSchema,
  vehicleMakeUpdateSchema,
  vehicleModelCreateSchema,
  vehicleModelUpdateSchema,
  vehicleReassignSchema,
} from "@orasso/shared";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";

import { validation } from "../../lib/errors";
import { type AppEnv, requireUser } from "../../lib/session";
import { body, query, uuidParam } from "../../lib/validate";
import { assistanceService } from "./assistance";
import { auditService } from "./audit";
import { newsletterService } from "./newsletter";
import { overviewService } from "./overview";
import { registriesService } from "./registries";
import { adminSettingsService } from "./settings";
import { orassoTemplatesService } from "./templates";
import { adminUsersService } from "./users";
import { vehicleReferenceService } from "./vehicle-reference";

/** Identifiant de compte Better Auth (évite une requête sur un identifiant fantaisiste). */
function userParam(c: Context, name = "id"): string {
  const id = c.req.param(name) ?? "";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw validation("Identifiant invalide");
  return id;
}

const roleSchema = z.object({ role: z.enum(["user", "moderator"]), reason: adminReasonSchema.shape.reason });
const searchQuery = z.object({ q: z.string().trim().max(100).optional() });

export const adminRoutes = new Hono<AppEnv>()
  // --- Accueil et journal ---------------------------------------------------------------------------------------------
  .get("/admin/overview", async (c) => c.json(await overviewService.overview(await requireUser(c))))
  .get("/admin/audit", async (c) => c.json(await auditService.list(await requireUser(c), query(c, adminAuditQuery))))

  // --- Registre des utilisateurs --------------------------------------------------------------------------------------
  .get("/admin/users", async (c) =>
    c.json(await adminUsersService.list(await requireUser(c), query(c, adminUsersQuery))),
  )
  .get("/admin/users/:id", async (c) => c.json(await adminUsersService.detail(await requireUser(c), userParam(c))))
  .post("/admin/users/:id/reset-two-factor", async (c) => {
    const v = await requireUser(c);
    const { reason } = await body(c, adminReasonSchema);
    return c.json(await adminUsersService.resetTwoFactor(v, userParam(c), reason));
  })
  .post("/admin/users/:id/anonymize", async (c) => {
    const v = await requireUser(c);
    const { reason } = await body(c, adminReasonSchema);
    return c.json(await adminUsersService.anonymize(v, userParam(c), reason));
  })
  .post("/admin/users/:id/sanction", async (c) => {
    const v = await requireUser(c);
    return c.json(await adminUsersService.sanction(v, userParam(c), await body(c, adminUserSanctionSchema)), 201);
  })
  .post("/admin/users/:id/role", async (c) => {
    const v = await requireUser(c);
    const { role, reason } = await body(c, roleSchema);
    return c.json(await adminUsersService.setRole(v, userParam(c), role, reason));
  })

  // --- Structures et pros ---------------------------------------------------------------------------------------------
  .get("/admin/structure-registry", async (c) =>
    c.json(await registriesService.structures(await requireUser(c), query(c, searchQuery).q)),
  )
  .patch("/admin/structures/:id/quota", async (c) => {
    const v = await requireUser(c);
    const input = await body(c, adminStructurePatchSchema);
    return c.json(
      await registriesService.setFollowerQuota(v, uuidParam(c, "id"), input.followerMessageQuota, input.reason),
    );
  })
  .get("/admin/pros", async (c) => {
    const q = query(c, adminProsQuery);
    return c.json(await registriesService.pros(await requireUser(c), q.filter, q.q));
  })
  .post("/admin/pros/:id/verify", async (c) => {
    const v = await requireUser(c);
    const input = await body(c, adminProVerifySchema);
    return c.json(await registriesService.verifyPro(v, uuidParam(c, "id"), input.verified, input.note));
  })

  // --- Base véhicules et file « Autre » -------------------------------------------------------------------------------
  .get("/admin/vehicle-reference/makes", async (c) => c.json(await vehicleReferenceService.makes(await requireUser(c))))
  .get("/admin/vehicle-reference/makes/:id/models", async (c) =>
    c.json(await vehicleReferenceService.models(await requireUser(c), uuidParam(c, "id"))),
  )
  .get("/admin/vehicle-reference/models/:id/generations", async (c) =>
    c.json(await vehicleReferenceService.generations(await requireUser(c), uuidParam(c, "id"))),
  )
  .get("/admin/vehicle-reference/others", async (c) =>
    c.json(await vehicleReferenceService.others(await requireUser(c))),
  )
  .post("/admin/vehicle-reference/makes", async (c) => {
    const v = await requireUser(c);
    return c.json(await vehicleReferenceService.createMake(v, await body(c, vehicleMakeCreateSchema)), 201);
  })
  .patch("/admin/vehicle-reference/makes/:id", async (c) => {
    const v = await requireUser(c);
    return c.json(
      await vehicleReferenceService.updateMake(v, uuidParam(c, "id"), await body(c, vehicleMakeUpdateSchema)),
    );
  })
  .delete("/admin/vehicle-reference/makes/:id", async (c) => {
    await vehicleReferenceService.deleteMake(await requireUser(c), uuidParam(c, "id"));
    return c.body(null, 204);
  })
  .post("/admin/vehicle-reference/models", async (c) => {
    const v = await requireUser(c);
    return c.json(await vehicleReferenceService.createModel(v, await body(c, vehicleModelCreateSchema)), 201);
  })
  .patch("/admin/vehicle-reference/models/:id", async (c) => {
    const v = await requireUser(c);
    return c.json(
      await vehicleReferenceService.updateModel(v, uuidParam(c, "id"), await body(c, vehicleModelUpdateSchema)),
    );
  })
  .delete("/admin/vehicle-reference/models/:id", async (c) => {
    await vehicleReferenceService.deleteModel(await requireUser(c), uuidParam(c, "id"));
    return c.body(null, 204);
  })
  .post("/admin/vehicle-reference/generations", async (c) => {
    const v = await requireUser(c);
    return c.json(await vehicleReferenceService.createGeneration(v, await body(c, vehicleGenerationCreateSchema)), 201);
  })
  .patch("/admin/vehicle-reference/generations/:id", async (c) => {
    const v = await requireUser(c);
    return c.json(
      await vehicleReferenceService.updateGeneration(
        v,
        uuidParam(c, "id"),
        await body(c, vehicleGenerationUpdateSchema),
      ),
    );
  })
  .delete("/admin/vehicle-reference/generations/:id", async (c) => {
    await vehicleReferenceService.deleteGeneration(await requireUser(c), uuidParam(c, "id"));
    return c.body(null, 204);
  })
  .post("/admin/vehicles/:id/reassign", async (c) => {
    const v = await requireUser(c);
    return c.json(await vehicleReferenceService.reassign(v, uuidParam(c, "id"), await body(c, vehicleReassignSchema)));
  })

  // --- Mode assistance (S41) ------------------------------------------------------------------------------------------
  .post("/structures/:id/assistance-requests", async (c) => {
    const v = await requireUser(c);
    const { message } = await body(c, assistanceRequestCreateSchema);
    return c.json(await assistanceService.create(v, uuidParam(c, "id"), message), 201);
  })
  .get("/structures/:id/assistance", async (c) =>
    c.json(await assistanceService.state(await requireUser(c), uuidParam(c, "id"))),
  )
  .post("/assistance-requests/:id/close", async (c) =>
    c.json(await assistanceService.close(await requireUser(c), uuidParam(c, "id"))),
  )
  .get("/admin/assistance-requests", async (c) =>
    c.json(await assistanceService.adminList(await requireUser(c), query(c, adminAssistanceQuery).status)),
  )
  .post("/admin/assistance-requests/:id/close", async (c) =>
    c.json(await assistanceService.adminClose(await requireUser(c), uuidParam(c, "id"))),
  )

  // --- Modèles de messages d'Orasso -----------------------------------------------------------------------------------
  .get("/admin/message-templates", async (c) => c.json(await orassoTemplatesService.list(await requireUser(c))))
  .post("/admin/message-templates", async (c) => {
    const v = await requireUser(c);
    return c.json(await orassoTemplatesService.create(v, await body(c, templateCreateSchema)), 201);
  })
  .patch("/admin/message-templates/:id", async (c) => {
    const v = await requireUser(c);
    return c.json(await orassoTemplatesService.update(v, uuidParam(c, "id"), await body(c, templateUpdateSchema)));
  })
  .delete("/admin/message-templates/:id", async (c) => {
    await orassoTemplatesService.remove(await requireUser(c), uuidParam(c, "id"));
    return c.body(null, 204);
  })

  // --- Listes et interrupteurs publics --------------------------------------------------------------------------------
  .get("/settings/public", async (c) => {
    c.header("cache-control", "public, max-age=60");
    return c.json(await adminSettingsService.publicSettings());
  })

  // --- Newsletter -----------------------------------------------------------------------------------------------------
  .get("/admin/newsletters", async (c) => c.json(await newsletterService.list(await requireUser(c))))
  .get("/admin/newsletters/audience", async (c) => c.json(await newsletterService.audience(await requireUser(c))))
  .post("/admin/newsletters", async (c) => {
    const v = await requireUser(c);
    return c.json(await newsletterService.create(v, await body(c, newsletterDraftSchema)), 201);
  })
  .get("/admin/newsletters/:id", async (c) =>
    c.json(await newsletterService.get(await requireUser(c), uuidParam(c, "id"))),
  )
  .put("/admin/newsletters/:id", async (c) => {
    const v = await requireUser(c);
    return c.json(await newsletterService.update(v, uuidParam(c, "id"), await body(c, newsletterDraftSchema)));
  })
  .delete("/admin/newsletters/:id", async (c) => {
    await newsletterService.remove(await requireUser(c), uuidParam(c, "id"));
    return c.body(null, 204);
  })
  .post("/admin/newsletters/:id/test", async (c) =>
    c.json(await newsletterService.test(await requireUser(c), uuidParam(c, "id"))),
  )
  .post("/admin/newsletters/:id/schedule", async (c) => {
    const v = await requireUser(c);
    const { at } = await body(c, newsletterScheduleSchema);
    return c.json(await newsletterService.schedule(v, uuidParam(c, "id"), at));
  })
  .post("/admin/newsletters/:id/send-now", async (c) => {
    const v = await requireUser(c);
    const { confirmRecipients } = await body(c, newsletterSendNowSchema);
    return c.json(await newsletterService.sendNow(v, uuidParam(c, "id"), confirmRecipients));
  })
  .post("/admin/newsletters/:id/pause", async (c) =>
    c.json(await newsletterService.pause(await requireUser(c), uuidParam(c, "id"))),
  )
  .post("/admin/newsletters/:id/resume", async (c) =>
    c.json(await newsletterService.resume(await requireUser(c), uuidParam(c, "id"))),
  )
  .post("/admin/newsletters/:id/unschedule", async (c) =>
    c.json(await newsletterService.unschedule(await requireUser(c), uuidParam(c, "id"))),
  )

  // --- Désinscription de la newsletter (public, sans session) ---------------------------------------------------------
  .get("/desinscription/:token", async (c) => {
    c.header("cache-control", "no-store");
    return c.json(await newsletterService.checkUnsubscribe(c.req.param("token")));
  })
  .post("/desinscription/:token", async (c) => c.json(await newsletterService.unsubscribe(c.req.param("token"))));
