import { PgBoss } from "pg-boss";

import { env } from "./env";
import { deps, type JobName } from "./lib/deps";
import { AppError } from "./lib/errors";
import { accountService } from "./modules/account/service";
import { assistanceService } from "./modules/admin/assistance";
import { newsletterService } from "./modules/admin/newsletter";
import { adminSettingsService } from "./modules/admin/settings";
import { badgeService } from "./modules/after-event/badge";
import { reportService } from "./modules/after-event/report";
import { applicationsService } from "./modules/applications/service";
import { groupMessagesService } from "./modules/communication/group-messages";
import { staffChatsService } from "./modules/communication/staff-chats";
import { crewRegistrationService } from "./modules/crews/registration";
import { highGradePreview } from "./modules/events/high-grade";
import { eventJobs } from "./modules/events/jobs";
import { nearbyService } from "./modules/events/nearby";
import { fieldService } from "./modules/field/service";
import { sponsoredService } from "./modules/home/sponsored";
import { moderationService } from "./modules/moderation/service";
import { notificationsService } from "./modules/notifications/service";
import { pointsService } from "./modules/points/service";
import { recapService } from "./modules/recap/service";
import { securityService } from "./modules/security/service";
import { staffService } from "./modules/staff/service";
import { uploadsService } from "./modules/uploads/service";
import { certificationService } from "./modules/vehicles/certification";
import { plateTransferService } from "./modules/vehicles/plate-transfer";
import { weatherService } from "./modules/weather/service";

// Tâches planifiées dans PostgreSQL (schéma « pgboss », créé et mis à jour par pg-boss lui-même).
// Les gestionnaires n'ont pas de logique : ils appellent un service, qui revérifie l'état en base.
type Payload = Record<string, string>;

export const handlers: Record<JobName, (data: Payload) => Promise<unknown>> = {
  "waitlist.offer-expire": (d) => applicationsService.expireOffer(d.applicationId ?? "", d.offeredAt ?? ""),
  "event.lock": (d) => eventJobs.lock({ eventId: d.eventId ?? "" }),
  "event.preview-open": (d) => eventJobs.previewOpen({ eventId: d.eventId ?? "", at: d.at ?? "" }),
  "event.high-grade-preview": (d) => highGradePreview.notify({ eventId: d.eventId ?? "", at: d.at ?? "" }),
  "event.reminder-week": (d) => eventJobs.reminderWeek({ eventId: d.eventId ?? "", at: d.at ?? "" }),
  "event.reminder-eve": (d) => eventJobs.reminderEve({ eventId: d.eventId ?? "", at: d.at ?? "", dayId: d.dayId }),
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
  // Lot 28 : prévisions des événements des 7 prochains jours (cron toutes les 3 h), suggestion « Incertain ».
  "weather.refresh": (d) => weatherService.refresh(d.eventId),
  // Lot 31 : transferts de plaque sans réponse depuis 7 jours (une demande, ou toutes si la tâche est celle du secours)
  // et certifications perdues après six mois sans événement.
  "plate-transfer.escalate": (d) => plateTransferService.escalate(d.transferId),
  "certification.sweep": () => certificationService.sweep(),
  // Lot 18 : fichiers de `POST /me/uploads` jamais rattachés depuis plus de 24 h (enregistrement et fichier).
  "uploads.purge": () => uploadsService.purgeExpired(),
  // Lot 19 : venue en crew non confirmée à l'échéance → retirée, chef prévenu ; secours toutes les 5 minutes.
  "crew.confirm-expire": (d) => crewRegistrationService.expire(d.applicationId ?? ""),
  "crew.confirm-sweep": () => crewRegistrationService.sweep(),
  // Lot 20 : un lot (500) d'un message groupé, la tâche se replanifie tant qu'il reste des destinataires ; balayage de
  // secours des envois arrêtés ; fermeture à J+1 et purge à un an des discussions du staff des événements.
  "messaging.group-send": (d) => groupMessagesService.sendBatch(d.groupMessageId ?? ""),
  "messaging.group-sweep": () => groupMessagesService.sweep(),
  "messaging.staff-chats-sweep": () => staffChatsService.sweep(),
  // Lot 24 : position d'une alerte close ou vieille de 24 h effacée ; photos de main courante effacées un an après l'événement.
  "field.sweep": () => fieldService.sweep(),
  // Lot 32 : signalements et captures échus (un an après la décision), sanctions finies depuis un an.
  "moderation.purge": () => moderationService.purge(),
  // Lot 30 : oubli quotidien des affichages sponsorisés de plus de deux jours.
  "home.purge": () => sponsoredService.purgeSeen(),
  // Lot 27 : bilan rafraîchi à J+8 (puis balayage horaire de secours), badges de structure (rappels, suspension).
  "event.report-refresh": (d) => reportService.refresh(d.eventId ?? ""),
  "event.report-sweep": () => reportService.sweep(),
  "structure.badge-sweep": () => badgeService.sweep(),
  // Lot 33 : demandes d'aide ouvertes depuis 7 jours closes (S41) ; un lot de newsletter par passage.
  "assistance.auto-close": () => assistanceService.autoClose(),
  "newsletter.send": () => newsletterService.runDue(),
  "points.regrade": () => adminSettingsService.regrade(),
  // Lot 36 : invitation à installer l'appli (le service revérifie : appli jamais ouverte, e-mail jamais envoyé).
  "account.app-install": (d) => accountService.sendAppInstallReminder(d.userId ?? ""),
  // Lot 49 : « Ton récap est arrivé » aux pointés et billets scannés (le service revérifie l'instant prévu).
  "event.recap": (d) => recapService.notifyReady({ eventId: d.eventId ?? "", at: d.at ?? "" }),
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
    await boss.schedule("weather.refresh", "15 */3 * * *", null, { tz: "Europe/Paris" });
    await boss.schedule("plate-transfer.escalate", "15 * * * *", null, { tz: "Europe/Paris" });
    await boss.schedule("certification.sweep", "30 5 * * *", null, { tz: "Europe/Paris" });
    await boss.schedule("uploads.purge", "40 4 * * *", null, { tz: "Europe/Paris" });
    await boss.schedule("crew.confirm-sweep", "*/5 * * * *", null, { tz: "Europe/Paris" });
    // Lot 20 : messages groupés arrêtés (chaque minute), discussions du staff à fermer ou purger (chaque heure).
    await boss.schedule("messaging.group-sweep", "* * * * *", null, { tz: "Europe/Paris" });
    await boss.schedule("messaging.staff-chats-sweep", "25 * * * *", null, { tz: "Europe/Paris" });
    await boss.schedule("field.sweep", "50 * * * *", null, { tz: "Europe/Paris" });
    await boss.schedule("moderation.purge", "50 4 * * *", null, { tz: "Europe/Paris" });
    await boss.schedule("home.purge", "55 4 * * *", null, { tz: "Europe/Paris" });
    // Lot 27 : badges de structure chaque jour à 09:00 ; bilans à rafraîchir (secours) chaque heure.
    await boss.schedule("structure.badge-sweep", "0 9 * * *", null, { tz: "Europe/Paris" });
    await boss.schedule("event.report-sweep", "35 * * * *", null, { tz: "Europe/Paris" });
    // Lot 33 : clôture des demandes d'aide (chaque heure), newsletter par lots de 200 (chaque minute).
    await boss.schedule("assistance.auto-close", "45 * * * *", null, { tz: "Europe/Paris" });
    await boss.schedule("newsletter.send", "* * * * *", null, { tz: "Europe/Paris" });
  }
  const previous = deps.jobs;
  deps.jobs = {
    async send(name, data, startAfter) {
      await boss.send(name, data, startAfter ? { startAfter } : {});
    },
  };
  // Lot 26 (relecture) : une fois pg-boss arrêté (fin d'un bloc du seed, d'un script), la file précédente revient
  // (en mémoire) : aucun `send` ne part vers un pg-boss arrêté (« Database not opened »).
  const stop = boss.stop.bind(boss);
  boss.stop = async (...args: Parameters<PgBoss["stop"]>) => {
    deps.jobs = previous;
    return stop(...args);
  };
  return boss;
}
