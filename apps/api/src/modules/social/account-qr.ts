// QR de compte et lien de profil (ARCHITECTURE-SUITE § 2.1 ; lot R6b : ils servent à suivre la personne, ou à lui
// demander si son compte est privé, au lieu d'une demande d'ami).
import { createHmac } from "node:crypto";
import {
  decodeAccountQrPayload,
  type FollowResult,
  type HmacSha1,
  matchAccountQrCounter,
  socialLabels,
} from "@orasso/shared";
import { eq, lt } from "drizzle-orm";

import { db } from "../../db/client";
import { accountQrUses, profiles } from "../../db/schema";
import { now } from "../../lib/deps";
import { AppError, notFound, validation } from "../../lib/errors";
import { rateAssertBelow, rateLimit, rateRecord } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { followsService } from "./follows";

const hmacSha1: HmacSha1 = (key, message) => new Uint8Array(createHmac("sha1", key).update(message).digest());
/** Anti-rejeu : un code de QR de compte présenté une fois est refusé ensuite (traces purgées après 3 minutes). */
const QR_USE_RETENTION_MS = 3 * 60_000;

export type AccountFollowResult = FollowResult & { pseudo: string };

export const accountQrFollow = {
  /** Lien de profil `/ami/:token` : le jeton d'invitation du profil de l'autre. */
  async byInvite(viewer: Viewer, token: string): Promise<AccountFollowResult> {
    const target = await db.query.profiles.findFirst({ where: eq(profiles.inviteToken, token) });
    if (!target || target.deletedAt) throw notFound("Ce lien n'existe pas ou plus");
    const r = await followsService.followProfile(viewer, target);
    return { ...r, pseudo: target.pseudo };
  },

  /**
   * QR de compte lu par la caméra (`OA1…`) : code valide (fenêtre ±1 minute) et jamais présenté, puis suivre. Les codes
   * refusés sont comptés par lecteur : au-delà de 10 en 10 minutes, il est bloqué.
   */
  async byQr(viewer: Viewer, payload: string): Promise<AccountFollowResult> {
    rateLimit("friendQr", viewer.user.id);
    rateAssertBelow("friendQrFailure", viewer.user.id);
    const refuse = (reason: "malformed" | "unknown" | "expired" | "replayed"): never => {
      rateRecord("friendQrFailure", viewer.user.id);
      throw new AppError(
        400,
        "validation_error",
        reason === "malformed" || reason === "unknown"
          ? socialLabels.scanFriendNotAccount
          : socialLabels.scanFriendExpired,
        { reason },
      );
    };
    const decoded = decodeAccountQrPayload(payload);
    if (!decoded) return refuse("malformed");
    const target = await db.query.profiles.findFirst({
      where: eq(profiles.accountQrShortId, Buffer.from(decoded.shortId)),
    });
    if (!target || target.deletedAt || target.bannedAt || (target.suspendedUntil && target.suspendedUntil > now()))
      return refuse("unknown");
    const t = now();
    const counter = matchAccountQrCounter(target.accountQrSecret, decoded.code, t, hmacSha1);
    if (counter === null) return refuse("expired");
    await db.delete(accountQrUses).where(lt(accountQrUses.usedAt, new Date(t.getTime() - QR_USE_RETENTION_MS)));
    // Sa propre carte : rien n'est consommé.
    if (target.userId === viewer.user.id) throw validation(socialLabels.selfRequest);
    const [use] = await db
      .insert(accountQrUses)
      .values({ userId: target.userId, counter, usedAt: t })
      .onConflictDoNothing()
      .returning();
    if (!use) return refuse("replayed");
    const r = await followsService.followProfile(viewer, target);
    return { ...r, pseudo: target.pseudo };
  },
};
