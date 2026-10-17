// Stockage local du mode staff (ARCHITECTURE.md § 4.2), base SQLite `orasso-staff.db` : événements synchronisés,
// liste d'accès, clés de confiance, file des actions à envoyer, pointages locaux. Écrit contre une petite interface
// (`SqlDb`, sous-ensemble d'expo-sqlite) : expo-sqlite dans l'appli, `node:sqlite` dans les tests.
import type { AccessListEntry, TicketListEntry } from "@orasso/shared";

import type { LocalCheckin, LocalTicketUse, PendingAction, StaffEventMeta } from "./model";
import type { TrustedKey } from "./trust";

type Param = string | number | null;

/** Le sous-ensemble d'`SQLiteDatabase` (expo-sqlite) utilisé ici. */
export interface SqlDb {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params: Param[]): Promise<unknown>;
  getAllAsync<T>(sql: string, params: Param[]): Promise<T[]>;
}

const SCHEMA = `
create table if not exists staff_events (
  event_id text primary key not null,
  user_id text not null,
  meta_json text not null,
  synced_at text not null,
  ends_at text not null
);
create table if not exists access_entries (
  event_id text not null,
  pass_id text not null,
  application_id text not null,
  entry_json text not null,
  primary key (event_id, pass_id)
);
create table if not exists revoked_keys (
  kid integer not null,
  public_key text not null,
  primary key (kid, public_key)
);
create table if not exists signing_keys (
  kid integer primary key not null,
  public_key text not null,
  retired_at text
);
create table if not exists pending_actions (
  id text primary key not null,
  event_id text not null,
  event_title text not null,
  user_id text not null,
  kind text not null,
  payload_json text not null,
  created_at text not null,
  attempts integer not null default 0,
  last_error text,
  next_attempt_at text not null,
  sent_at text,
  result_json text
);
create index if not exists pending_actions_unsent on pending_actions (sent_at, next_attempt_at);
create table if not exists local_checkins (
  event_id text not null,
  pass_id text not null,
  application_id text,
  checked_in_at text not null,
  method text not null,
  action_id text not null,
  primary key (event_id, pass_id)
);
create table if not exists ticket_entries (
  event_id text not null,
  ticket_id text not null,
  entry_json text not null,
  primary key (event_id, ticket_id)
);
create table if not exists local_ticket_uses (
  event_id text not null,
  ticket_id text not null,
  used_at text not null,
  action_id text not null,
  primary key (event_id, ticket_id)
);
`;

type ActionRow = {
  id: string;
  event_id: string;
  event_title: string;
  user_id: string;
  kind: string;
  payload_json: string;
  created_at: string;
  attempts: number;
  last_error: string | null;
  next_attempt_at: string;
  sent_at: string | null;
  result_json: string | null;
};

const toAction = (r: ActionRow): PendingAction => ({
  id: r.id,
  eventId: r.event_id,
  eventTitle: r.event_title,
  userId: r.user_id,
  kind: r.kind as PendingAction["kind"],
  payload: JSON.parse(r.payload_json) as Record<string, unknown>,
  createdAt: r.created_at,
  attempts: r.attempts,
  lastError: r.last_error,
  nextAttemptAt: r.next_attempt_at,
  sentAt: r.sent_at,
  result: r.result_json ? (JSON.parse(r.result_json) as Record<string, unknown>) : null,
});

/**
 * Les écritures passent une à une (file de promesses) : une transaction n'est jamais entrelacée avec une autre
 * requête de l'appli (expo-sqlite ne l'interdit pas avec `BEGIN` sur une connexion partagée).
 */
export class StaffStore {
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly db: SqlDb) {}

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this.chain.then(work, work);
    this.chain = next.catch(() => undefined);
    return next;
  }

  private tx<T>(work: () => Promise<T>): Promise<T> {
    return this.serial(async () => {
      await this.db.execAsync("begin");
      try {
        const result = await work();
        await this.db.execAsync("commit");
        return result;
      } catch (error) {
        await this.db.execAsync("rollback").catch(() => undefined);
        throw error;
      }
    });
  }

  init(): Promise<void> {
    return this.serial(() => this.db.execAsync(SCHEMA));
  }

  // --- Événements et liste ---

  async metas(): Promise<StaffEventMeta[]> {
    const rows = await this.serial(() =>
      this.db.getAllAsync<{ meta_json: string }>("select meta_json from staff_events order by ends_at", []),
    );
    return rows.map((r) => JSON.parse(r.meta_json) as StaffEventMeta);
  }

  async meta(eventId: string): Promise<StaffEventMeta | null> {
    const rows = await this.serial(() =>
      this.db.getAllAsync<{ meta_json: string }>("select meta_json from staff_events where event_id = ?", [eventId]),
    );
    return rows[0] ? (JSON.parse(rows[0].meta_json) as StaffEventMeta) : null;
  }

  async entries(eventId: string): Promise<AccessListEntry[]> {
    const rows = await this.serial(() =>
      this.db.getAllAsync<{ entry_json: string }>("select entry_json from access_entries where event_id = ?", [
        eventId,
      ]),
    );
    return rows.map((r) => JSON.parse(r.entry_json) as AccessListEntry);
  }

  async localCheckins(eventId: string): Promise<LocalCheckin[]> {
    const rows = await this.serial(() =>
      this.db.getAllAsync<{
        pass_id: string;
        application_id: string | null;
        checked_in_at: string;
        method: string;
        action_id: string;
      }>("select pass_id, application_id, checked_in_at, method, action_id from local_checkins where event_id = ?", [
        eventId,
      ]),
    );
    return rows.map((r) => ({
      passId: r.pass_id,
      applicationId: r.application_id,
      checkedInAt: r.checked_in_at,
      method: r.method as LocalCheckin["method"],
      actionId: r.action_id,
    }));
  }

  /** Billets du public de l'événement (rôle boutique, lot 24). */
  async tickets(eventId: string): Promise<TicketListEntry[]> {
    const rows = await this.serial(() =>
      this.db.getAllAsync<{ entry_json: string }>("select entry_json from ticket_entries where event_id = ?", [
        eventId,
      ]),
    );
    return rows.map((r) => JSON.parse(r.entry_json) as TicketListEntry);
  }

  /** Billets acceptés sur cet appareil, pas encore confirmés par le serveur. */
  async ticketUses(eventId: string): Promise<LocalTicketUse[]> {
    const rows = await this.serial(() =>
      this.db.getAllAsync<{ ticket_id: string; used_at: string; action_id: string }>(
        "select ticket_id, used_at, action_id from local_ticket_uses where event_id = ?",
        [eventId],
      ),
    );
    return rows.map((r) => ({ ticketId: r.ticket_id, usedAt: r.used_at, actionId: r.action_id }));
  }

  /**
   * Enregistre une synchro vérifiée et fusionnée : `full` remplace toute la liste de l'événement, sinon les entrées
   * reçues sont écrasées par `passId`. Une liste d'un autre compte est remplacée entièrement. Billets du public
   * (lot 24) : `tickets.replace` remplace tous ceux de l'événement (liste complète, ou boutique coupée), sinon les
   * billets reçus sont écrasés par identifiant.
   */
  saveSync(
    meta: StaffEventMeta,
    entries: readonly AccessListEntry[],
    full: boolean,
    tickets: { list: readonly TicketListEntry[]; replace: boolean } = { list: [], replace: full },
  ): Promise<void> {
    return this.tx(async () => {
      if (full) await this.db.runAsync("delete from access_entries where event_id = ?", [meta.eventId]);
      if (tickets.replace) await this.db.runAsync("delete from ticket_entries where event_id = ?", [meta.eventId]);
      for (let i = 0; i < tickets.list.length; i += 100) {
        const chunk = tickets.list.slice(i, i + 100);
        await this.db.runAsync(
          `insert into ticket_entries (event_id, ticket_id, entry_json) values ${chunk.map(() => "(?, ?, ?)").join(", ")}
           on conflict (event_id, ticket_id) do update set entry_json = excluded.entry_json`,
          chunk.flatMap((t) => [meta.eventId, t.ticketId, JSON.stringify(t)]),
        );
      }
      await this.db.runAsync(
        `insert into staff_events (event_id, user_id, meta_json, synced_at, ends_at) values (?, ?, ?, ?, ?)
         on conflict (event_id) do update set user_id = excluded.user_id, meta_json = excluded.meta_json,
           synced_at = excluded.synced_at, ends_at = excluded.ends_at`,
        [meta.eventId, meta.userId, JSON.stringify(meta), meta.syncedAt, meta.endsAt],
      );
      // Insertions groupées (100 par requête) : une synchro complète tient la base le moins longtemps possible, les
      // lectures du scan qui attendent derrière elle repartent vite.
      for (let i = 0; i < entries.length; i += 100) {
        const chunk = entries.slice(i, i + 100);
        await this.db.runAsync(
          `insert into access_entries (event_id, pass_id, application_id, entry_json) values ${chunk.map(() => "(?, ?, ?, ?)").join(", ")}
           on conflict (event_id, pass_id) do update set application_id = excluded.application_id,
             entry_json = excluded.entry_json`,
          chunk.flatMap((e) => [meta.eventId, e.passId, e.applicationId, JSON.stringify(e)]),
        );
      }
    });
  }

  // --- Clés de confiance ---

  async trustedKeys(): Promise<TrustedKey[]> {
    const rows = await this.serial(() =>
      this.db.getAllAsync<{ kid: number; public_key: string; retired_at: string | null }>(
        "select kid, public_key, retired_at from signing_keys order by kid",
        [],
      ),
    );
    return rows.map((r) => ({ kid: r.kid, publicKey: r.public_key, retiredAt: r.retired_at }));
  }

  /** Remplace les clés de confiance (une clé que l'API ne sert plus, révoquée, disparaît). */
  setTrustedKeys(keys: readonly TrustedKey[]): Promise<void> {
    return this.tx(async () => {
      await this.db.runAsync("delete from signing_keys", []);
      for (const k of keys) {
        await this.db.runAsync("insert into signing_keys (kid, public_key, retired_at) values (?, ?, ?)", [
          k.kid,
          k.publicKey,
          k.retiredAt,
        ]);
      }
    });
  }

  /** Clés épinglées que `/api/keys` a cessé de servir : révoquées pour de bon (gardées après une déconnexion). */
  async revokedKeys(): Promise<{ kid: number; publicKey: string }[]> {
    const rows = await this.serial(() =>
      this.db.getAllAsync<{ kid: number; public_key: string }>("select kid, public_key from revoked_keys", []),
    );
    return rows.map((r) => ({ kid: r.kid, publicKey: r.public_key }));
  }

  addRevokedKeys(keys: readonly { kid: number; publicKey: string }[]): Promise<void> {
    return this.tx(async () => {
      for (const k of keys) {
        await this.db.runAsync("insert into revoked_keys (kid, public_key) values (?, ?) on conflict do nothing", [
          k.kid,
          k.publicKey,
        ]);
      }
    });
  }

  // --- File des actions ---

  /** Ajoute une action (et le pointage ou l'usage de billet local qu'elle produit) d'un seul geste. */
  addAction(action: PendingAction, checkin?: LocalCheckin | null, use?: LocalTicketUse | null): Promise<void> {
    return this.tx(async () => {
      await this.db.runAsync(
        `insert into pending_actions (id, event_id, event_title, user_id, kind, payload_json, created_at, attempts,
           last_error, next_attempt_at, sent_at, result_json) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          action.id,
          action.eventId,
          action.eventTitle,
          action.userId,
          action.kind,
          JSON.stringify(action.payload),
          action.createdAt,
          action.attempts,
          action.lastError,
          action.nextAttemptAt,
          action.sentAt,
          action.result ? JSON.stringify(action.result) : null,
        ],
      );
      if (checkin) await this.putCheckin(action.eventId, checkin);
      if (use) {
        await this.db.runAsync(
          `insert into local_ticket_uses (event_id, ticket_id, used_at, action_id) values (?, ?, ?, ?)
           on conflict (event_id, ticket_id) do nothing`,
          [action.eventId, use.ticketId, use.usedAt, use.actionId],
        );
      }
    });
  }

  private putCheckin(eventId: string, c: LocalCheckin) {
    return this.db.runAsync(
      `insert into local_checkins (event_id, pass_id, application_id, checked_in_at, method, action_id)
       values (?, ?, ?, ?, ?, ?) on conflict (event_id, pass_id) do nothing`,
      [eventId, c.passId, c.applicationId, c.checkedInAt, c.method, c.actionId],
    );
  }

  /** Actions d'un compte (toutes ou seulement celles d'un événement), non envoyées d'abord. */
  async actions(userId: string, opts: { eventId?: string; unsentOnly?: boolean } = {}): Promise<PendingAction[]> {
    const where = ["user_id = ?"];
    const params: Param[] = [userId];
    if (opts.eventId) {
      where.push("event_id = ?");
      params.push(opts.eventId);
    }
    if (opts.unsentOnly) where.push("sent_at is null");
    const rows = await this.serial(() =>
      this.db.getAllAsync<ActionRow>(
        `select * from pending_actions where ${where.join(" and ")} order by created_at, id`,
        params,
      ),
    );
    return rows.map(toAction);
  }

  /** Réponse du serveur reçue : l'action est envoyée ; le pointage local suit la décision du serveur. */
  markSent(
    eventId: string,
    done: readonly {
      id: string;
      result: Record<string, unknown>;
      checkin?: { passId: string; checkedInAt: string | null; actionId: string | null } | null;
      /** Billet du public (lot 24) : heure d'usage retenue par le serveur, ou `null` pour retirer l'usage local. */
      use?: { ticketId: string; usedAt: string | null; actionId: string } | null;
    }[],
    sentAt: Date,
  ): Promise<void> {
    return this.tx(async () => {
      for (const d of done) {
        await this.db.runAsync(
          "update pending_actions set sent_at = ?, result_json = ?, last_error = null where id = ?",
          [sentAt.toISOString(), JSON.stringify(d.result), d.id],
        );
        const u = d.use;
        if (u) {
          if (u.usedAt) {
            await this.db.runAsync("update local_ticket_uses set used_at = ? where event_id = ? and ticket_id = ?", [
              u.usedAt,
              eventId,
              u.ticketId,
            ]);
          } else {
            await this.db.runAsync(
              "delete from local_ticket_uses where event_id = ? and ticket_id = ? and action_id = ?",
              [eventId, u.ticketId, u.actionId],
            );
          }
        }
        const c = d.checkin;
        if (!c) continue;
        if (c.checkedInAt) {
          await this.db.runAsync("update local_checkins set checked_in_at = ? where event_id = ? and pass_id = ?", [
            c.checkedInAt,
            eventId,
            c.passId,
          ]);
        } else if (c.actionId) {
          await this.db.runAsync("delete from local_checkins where event_id = ? and pass_id = ? and action_id = ?", [
            eventId,
            c.passId,
            c.actionId,
          ]);
        }
      }
    });
  }

  /**
   * Refus définitif (lot refusé par l'API : 403, 404, 409, 423, élément illisible) : les actions sortent de la file
   * avec l'erreur (visible au rapport) et les pointages locaux qu'elles avaient créés disparaissent.
   */
  markRejected(
    eventId: string,
    ids: readonly string[],
    error: { error: string; status: number },
    at: Date,
  ): Promise<void> {
    return this.tx(async () => {
      for (const id of ids) {
        await this.db.runAsync(
          "update pending_actions set sent_at = ?, result_json = ?, last_error = null where id = ?",
          [at.toISOString(), JSON.stringify(error), id],
        );
        await this.db.runAsync("delete from local_checkins where event_id = ? and action_id = ?", [eventId, id]);
        await this.db.runAsync("delete from local_ticket_uses where event_id = ? and action_id = ?", [eventId, id]);
      }
    });
  }

  /** Échec d'envoi : l'action reste dans la file, jamais perdue, avec l'erreur et l'heure du prochain essai. */
  markFailed(ids: readonly string[], error: string, nextAttemptAt: (attempts: number) => Date): Promise<void> {
    return this.tx(async () => {
      for (const id of ids) {
        const rows = await this.db.getAllAsync<{ attempts: number }>(
          "select attempts from pending_actions where id = ?",
          [id],
        );
        const attempts = (rows[0]?.attempts ?? 0) + 1;
        await this.db.runAsync(
          "update pending_actions set attempts = ?, last_error = ?, next_attempt_at = ? where id = ?",
          [attempts, error.slice(0, 300), nextAttemptAt(attempts).toISOString(), id],
        );
      }
    });
  }

  /**
   * Alerte partie (ou refusée pour de bon) : la position qu'elle portait est effacée du téléphone. Elle n'a servi
   * qu'à situer l'alerte ; elle n'est jamais gardée au-delà (lot 24).
   */
  scrubPosition(id: string): Promise<void> {
    return this.serial(async () => {
      const rows = await this.db.getAllAsync<{ payload_json: string }>(
        "select payload_json from pending_actions where id = ?",
        [id],
      );
      if (!rows[0]) return;
      const payload = JSON.parse(rows[0].payload_json) as Record<string, unknown>;
      if (!("lat" in payload) && !("lng" in payload)) return;
      payload.lat = undefined;
      payload.lng = undefined;
      await this.db.runAsync("update pending_actions set payload_json = ? where id = ?", [JSON.stringify(payload), id]);
    });
  }

  /** Retour du réseau, « Envoyer maintenant » : les actions en attente repartent sans attendre leur délai. */
  retryNow(userId: string, now: Date): Promise<void> {
    return this.serial(async () => {
      await this.db.runAsync("update pending_actions set next_attempt_at = ? where user_id = ? and sent_at is null", [
        now.toISOString(),
        userId,
      ]);
    });
  }

  // --- Purge ---

  /**
   * Fermeture à J+1 (et déconnexion) : la liste, les coordonnées du super staff, les pointages locaux et l'historique
   * envoyé disparaissent ; seules les actions pas encore envoyées restent, pour partir au retour du réseau.
   */
  purgeEvent(eventId: string): Promise<void> {
    return this.tx(async () => {
      await this.db.runAsync("delete from access_entries where event_id = ?", [eventId]);
      await this.db.runAsync("delete from local_checkins where event_id = ?", [eventId]);
      await this.db.runAsync("delete from ticket_entries where event_id = ?", [eventId]);
      await this.db.runAsync("delete from local_ticket_uses where event_id = ?", [eventId]);
      await this.db.runAsync("delete from staff_events where event_id = ?", [eventId]);
      await this.db.runAsync("delete from pending_actions where event_id = ? and sent_at is not null", [eventId]);
    });
  }

  /** Déconnexion : tout ce qui concerne les événements et les clés ; les actions non envoyées restent. */
  purgeAll(): Promise<void> {
    return this.tx(async () => {
      await this.db.runAsync("delete from access_entries", []);
      await this.db.runAsync("delete from local_checkins", []);
      await this.db.runAsync("delete from ticket_entries", []);
      await this.db.runAsync("delete from local_ticket_uses", []);
      await this.db.runAsync("delete from staff_events", []);
      await this.db.runAsync("delete from signing_keys", []);
      await this.db.runAsync("delete from pending_actions where sent_at is not null", []);
    });
  }
}
