// Lot 32 : modération de démonstration, par les vrais services. Modératrice « Moderatrice_66 » ; trois comptes anciens
// (Kenji, Léa, Nina) signalent le même pilote → suspension automatique de 7 jours et alerte prioritaire à l'équipe ; le
// pilote conteste (sanction contestée à décider dans /admin/sanctions) ; un quatrième signalement attend dans la file.
// Idempotent : rien si la modératrice existe déjà.
import { eq, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import type { AuthUser, Viewer } from "../../src/lib/session";
import { moderationService } from "../../src/modules/moderation/service";
import { createAccount, DAY, now } from "./helpers";

const byPseudo = (pseudo: string) =>
  db.query.profiles.findFirst({ where: sql`lower(${t.profiles.pseudo}) = ${pseudo.toLowerCase()}` });

async function viewer(pseudo: string): Promise<Viewer | null> {
  const profile = await byPseudo(pseudo);
  if (!profile) return null;
  const [u] = await db.select().from(t.user).where(eq(t.user.id, profile.userId));
  return u ? { user: u as AuthUser, profile, session: { secondFactor: null } } : null;
}

export async function seedModeration(hash: string) {
  if (await byPseudo("Moderatrice_66")) {
    console.log("Modération : « Moderatrice_66 » déjà présente.");
    return;
  }
  const reporters = await Promise.all(["Kenji_66", "Lea_11", "Nina_34"].map(viewer));
  const target = (await viewer("Pilote_012")) ?? (await viewer("Pilote_002"));
  const fourth = await viewer("Marc_66");
  const other = await viewer("Pilote_003");
  if (reporters.some((r) => !r) || !target || !fourth || !other) {
    console.log("Modération : comptes de démonstration absents, rien ajouté.");
    return;
  }
  await createAccount(
    hash,
    { pseudo: "Moderatrice_66", email: "moderatrice@orasso.local", firstName: "Inès", departments: ["66"] },
    { platformRole: "moderator" },
  );
  // S39 : seuls les comptes de plus de 7 jours comptent ; les comptes de démonstration viennent d'être créés.
  for (const r of reporters) {
    await db
      .update(t.user)
      .set({ createdAt: new Date(now.getTime() - 60 * DAY) })
      .where(eq(t.user.id, (r as Viewer).user.id));
  }
  const reasons = ["harassment", "harassment", "insult"] as const;
  let auto = false;
  for (const [i, r] of reporters.entries()) {
    const fresh = await viewer((r as Viewer).profile.pseudo);
    const res = await moderationService.create(fresh as Viewer, {
      targetType: "profile",
      targetId: target.user.id,
      reason: reasons[i] ?? "insult",
      details: i === 0 ? "Messages insultants après mon refus de lui prêter ma voiture." : null,
      screenshotKey: null,
    });
    auto ||= res.autoSuspended;
  }
  const [sanction] = await db.select().from(t.sanctions).where(eq(t.sanctions.userId, target.user.id)).limit(1);
  if (sanction) {
    await moderationService.contest(
      target,
      sanction.id,
      "Je ne connais pas ces personnes, c'est un malentendu après la sortie de dimanche.",
    );
  }
  await moderationService.create(fourth, {
    targetType: "profile",
    targetId: other.user.id,
    reason: "spam",
    details: "Il envoie la même publicité à tout le monde.",
    screenshotKey: null,
  });
  console.log(
    `Modération : Moderatrice_66, 4 signalements, ${target.profile.pseudo} ${auto ? "suspendu 7 jours (automatique) et contestation en attente" : "signalé"}.`,
  );
}
