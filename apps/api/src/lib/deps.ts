// Dépendances remplaçables (horloge, file de tâches) : réelles en marche normale, simulées dans les tests.

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export type JobName =
  | "waitlist.offer-expire"
  | "event.lock"
  | "event.preview-open"
  | "event.reminder-week"
  | "event.reminder-eve"
  | "notifications.deliver"
  | "waitlist.sweep";

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
