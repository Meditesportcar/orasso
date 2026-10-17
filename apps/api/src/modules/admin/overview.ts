// Accueil de l'administration (lot 33, ARCHITECTURE-SUITE § 16) : toutes les files et leurs compteurs, en une requête.
import type { AdminOverview } from "@orasso/shared";
import { sql } from "drizzle-orm";

import { db } from "../../db/client";
import { requirePlatformRole } from "../../lib/access";
import { now } from "../../lib/deps";
import type { Viewer } from "../../lib/session";

/** Badges à renouveler : échéance dans les 30 jours (rappels du lot 27). */
const BADGE_WINDOW_MS = 30 * 86_400_000;

export const overviewService = {
  /** `GET /admin/overview` (super admin). */
  async overview(v: Viewer): Promise<AdminOverview> {
    await requirePlatformRole(v, "super_admin");
    const t = now();
    const soon = new Date(t.getTime() + BADGE_WINDOW_MS);
    const res = await db.execute<Record<keyof AdminOverview, number>>(sql`
      select
        (select count(*) from structures where deleted_at is null and verification = 'pending')::int
          as "structuresPending",
        (select count(*) from structures where deleted_at is null and verification = 'verified'
          and badge_expires_at is not null and badge_expires_at <= ${soon.toISOString()})::int as "badgesExpiring",
        (select count(*) from pro_profiles where deleted_at is null and published_at is not null
          and verified_at is null)::int as "prosToVerify",
        (select count(*) from reports where status = 'pending')::int as "reportsPending",
        (select count(*) from certification_requests where status = 'pending')::int as "certificationsPending",
        (select count(*) from plate_transfer_requests where status = 'arbitrated')::int as "plateTransfersArbitrated",
        (select count(*) from vehicles v
          join vehicle_makes mk on mk.id = v.make_id
          join vehicle_models md on md.id = v.model_id
          left join vehicle_generations g on g.id = v.generation_id
          where v.status = 'active' and (mk.is_other or md.is_other or coalesce(g.is_other, false)))::int
          as "otherVehicles",
        (select count(*) from malus_contests where status = 'escalated')::int as "malusContestsEscalated",
        (select count(*) from sanctions where contest_status = 'pending')::int as "sanctionsContested",
        (select count(*) from assistance_requests where status = 'open')::int as "assistanceOpen",
        (select count(*) from newsletters where status in ('scheduled', 'sending'))::int as "newslettersScheduled"
    `);
    const row = res.rows[0];
    if (!row) throw new Error("Compteurs indisponibles");
    return row;
  },
};
