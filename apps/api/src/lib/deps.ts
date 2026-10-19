// Dépendances remplaçables (horloge, file de tâches) : réelles en marche normale, simulées dans les tests.

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export type JobName =
  | "waitlist.offer-expire"
  | "event.lock"
  | "event.preview-open"
  | "event.high-grade-preview"
  | "event.reminder-week"
  | "event.reminder-eve"
  | "notifications.deliver"
  | "waitlist.sweep"
  | "staff.remind"
  | "event.settle"
  | "contest.escalate"
  | "season.rollover"
  | "points.sweep"
  // Lot 15 : compte et sécurité.
  | "event.notify-nearby"
  | "security.purge-known-logins"
  // Lot 28 : météo des événements.
  | "weather.refresh"
  // Lot 31 : garage et certification.
  | "plate-transfer.escalate"
  | "certification.sweep"
  // Lot 18 : fichiers envoyés jamais rattachés.
  | "uploads.purge"
  // Lot 19 : venues en crew à confirmer (72 h, plafonnées au verrouillage), et leur balayage de secours.
  | "crew.confirm-expire"
  | "crew.confirm-sweep"
  // Lot 20 : messages groupés (lot par lot, et balayage de secours), fermeture (J+1) et purge (1 an) des discussions du
  // staff des événements.
  | "messaging.group-send"
  | "messaging.group-sweep"
  | "messaging.staff-chats-sweep"
  // Lot 24 : positions d'alerte et photos de la main courante à effacer (chaque heure).
  | "field.sweep"
  // Lot 32 : conservation des signalements et sanctions (un an), quotidienne.
  | "moderation.purge"
  // Lot 30 : lignes « emplacement déjà montré » de plus de deux jours, quotidienne.
  | "home.purge"
  // Lot 27 : bilan rafraîchi à J+8 (et balayage horaire de secours), rappels et suspension des badges (quotidienne).
  | "event.report-refresh"
  | "event.report-sweep"
  | "structure.badge-sweep"
  // Lot 33 : demandes d'aide closes à 7 jours (chaque heure), envoi de la newsletter par lots (chaque minute).
  | "assistance.auto-close"
  | "newsletter.send"
  // Lot 33 : grades recalculés après un changement des seuils (mise en file à l'écriture du réglage).
  | "points.regrade"
  // Lot 36 : e-mail « Installe l'appli » une heure après la confirmation de l'adresse, si l'appli n'a jamais été ouverte.
  | "account.app-install"
  // Lot 51 : suppression d'une photo de véhicule à reprendre (original non flouté, copie d'un envoi refusé).
  | "storage.remove";

export interface JobQueue {
  /** Planifie une tâche ; les gestionnaires revérifient l'état en base avant d'agir (jamais confiance à la charge seule). */
  send(name: JobName, data: Record<string, unknown>, startAfter?: Date): Promise<void>;
}

/** File qui garde les tâches en mémoire (tests, scripts sans pg-boss). */
export class MemoryJobQueue implements JobQueue {
  readonly jobs: { name: JobName; data: Record<string, unknown>; startAfter?: Date }[] = [];
  async send(name: JobName, data: Record<string, unknown>, startAfter?: Date) {
    this.jobs.push({ name, data, startAfter });
  }
}

export const deps: { clock: Clock; jobs: JobQueue } = {
  clock: systemClock,
  jobs: new MemoryJobQueue(),
};

export const now = () => deps.clock.now();
