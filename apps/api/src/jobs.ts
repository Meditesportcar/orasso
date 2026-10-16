import { PgBoss } from "pg-boss";

import { env } from "./env";
import { deps, type JobName } from "./lib/deps";
import { AppError } from "./lib/errors";
import { applicationsService } from "./modules/applications/service";
import { eventJobs } from "./modules/events/jobs";
import { nearbyService } from "./modules/events/nearby";
import { notificationsService } from "./modules/notifications/service";
import { pointsService } from "./modules/points/service";
import { securityService } from "./modules/security/service";
import { staffService } from "./modules/staff/service";
import { uploadsService } from "./modules/uploads/service";
import { certificationService } from "./modules/vehicles/certification";
import { plateTransferService } from "./modules/vehicles/plate-transfer";

// Tâches planifiées dans PostgreSQL (schéma « pgboss », créé et mis à jour par pg-boss lui-même).
// Les gestionnaires n'ont pas de logique : ils appellent un service, qui revérifie l'état en base.
type Payload = Record<string, string>;

const handlers: Record<JobName, (data: Payload) => Promise<unknown>> = {
  "waitlist.offer-expire": (d) => applicationsService.expireOffer(d.applicationId ?? "", d.offeredAt ?? ""),
  "event.lock": (d) => eventJobs.lock({ eventId: d.eventId ?? "" }),
  "event.preview-open": (d) => eventJobs.previewOpen({ eventId: d.eventId ?? "", at: d.at ?? "" }),
  "event.reminder-week": (d) => eventJobs.reminderWeek({ eventId: d.eventId ?? "", at: d.at ?? "" }),
  "event.reminder-eve": (d) => eventJobs.reminderEve({ eventId: d.eventId ?? "", at: d.at ?? "" }),
  "notifications.deliver": () => notificationsService.deliverDue(),
  "waitlist.sweep": () => applicationsService.expireDueOffers(),
  "staff.remind": () => staffService.remindUnanswered(),
  "event.settle": (d) => pointsService.settleEvent(d.eventId ?? ""),
  "contest.escalate": (d) => pointsService.escalateContest(d.contestId ?? ""),
  "season.rollover": () => pointsService.rolloverSeason(),
  // Secours (chaque heure) : règlements de J+2, escalades et report de saison dont la tâche n'est pas passée.
  "points.sweep": () => pointsService.sweep(),
  // Lot 15 : « événement près de chez toi » (à la publication) et oubli des connexions connues de plus d'un an.
  "event.notify-nearby": (d) => nearbyService.notifyNearby(d.eventId ?? ""),
  "security.purge-known-logins": () => securityService.purgeKnownLogins(),
  // Lot 31 : transferts de plaque sans réponse depuis 7 jours (une demande, ou toutes si la tâche est celle du secours)
  // et certifications perdues après six mois sans événement.
  "plate-transfer.escalate": (d) => plateTransferService.escalate(d.transferId),
  "certification.sweep": () => certificationService.sweep(),
  // Lot 18 : fichiers de `POST /me/uploads` jamais rattachés depuis plus de 24 h (enregistrement et fichier).
  "uploads.purge": () => uploadsService.purgeExpired(),
};

/**
 * Démarre pg-boss, crée les files et branche `deps.jobs` dessus. `work: false` (seed, scripts) : on planifie
 * sans traiter ; c'est l'API qui exécute.
 */
export async function startJobs({ work = true } = {}): Promise<PgBoss> {
  const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: "pgboss" });
  boss.on("error", (error) => console.error("pg-boss :", error));
  await boss.start();
  for (const [name, handler] of Object.entries(handlers)) {
    await boss.createQueue(name);
    if (!work) continue;
    await boss.work<Payload>(name, async (jobs) => {
      for (const job of jobs) {
        try {
          await handler(job.data ?? {});
        } catch (error) {
          // Objet supprimé entre-temps (événement effacé par un seed --reset…) : rien à faire.
          if (error instanceof AppError && error.code === "not_found") continue;
          throw error;
        }
      }
    });
  }
  if (work) {
    // Notifications différées (heures calmes) : livrées chaque minute.
    await boss.schedule("notifications.deliver", "* * * * *", null, { tz: "Europe/Paris" });
    // Offres échues dont la tâche d'expiration n'est pas passée : balayage de secours.
    await boss.schedule("waitlist.sweep", "* * * * *", null, { tz: "Europe/Paris" });
    // Relance quotidienne du staff qui n'a pas dit « je suis là / pas là » (docs/01), arrêtée le jour J.
    await boss.schedule("staff.remind", "0 10 * * *", null, { tz: "Europe/Paris" });
    // Fin de saison : on descend d'un grade et on continue (1er janvier, 00:10).
    await boss.schedule("season.rollover", "10 0 1 1 *", null, { tz: "Europe/Paris" });
    await boss.schedule("points.sweep", "5 * * * *", null, { tz: "Europe/Paris" });
    await boss.schedule("security.purge-known-logins", "20 4 * * 1", null, { tz: "Europe/Paris" });
    await boss.schedule("plate-transfer.escalate", "15 * * * *", null, { tz: "Europe/Paris" });
    await boss.schedule("certification.sweep", "30 5 * * *", null, { tz: "Europe/Paris" });
    await boss.schedule("uploads.purge", "40 4 * * *", null, { tz: "Europe/Paris" });
  }
  deps.jobs = {
    async send(name, data, startAfter) {
      await boss.send(name, data, startAfter ? { startAfter } : {});
    },
  };
  return boss;
}
