import { PgBoss } from "pg-boss";

import { env } from "./env";
import { deps, type JobName } from "./lib/deps";
import { AppError } from "./lib/errors";
import { applicationsService } from "./modules/applications/service";
import { eventJobs } from "./modules/events/jobs";
import { notificationsService } from "./modules/notifications/service";

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
  }
  deps.jobs = {
    async send(name, data, startAfter) {
      await boss.send(name, data, startAfter ? { startAfter } : {});
    },
  };
  return boss;
}
