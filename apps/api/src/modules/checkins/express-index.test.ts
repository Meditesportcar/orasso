// Invitation express (petit lot API, P21) : la recherche de la dernière trace d'e-mail utilise l'index partiel
// `email_outbox_express_invite_idx` (plan de la requête réelle, paramètres compris).
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { resetDb } from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { lastMailTraceQuery } from "./express";

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDb();
});

describe("trace d'e-mail d'une invitation express", () => {
  it("le plan de la requête réelle cite `email_outbox_express_invite_idx`", async () => {
    await db.execute(sql`insert into email_outbox ("to", subject, template, payload, status, transport)
      select 'a@b.fr', 's', case when g % 5 = 0 then 'express_invite' else 'other' end,
        jsonb_build_object('inviteId', g::text), 'sent', 'journal'
      from generate_series(1, 4000) g`);
    await db.execute(sql`analyze email_outbox`);
    const query = lastMailTraceQuery(db, randomUUID()).toSQL();
    const client = await pool.connect();
    try {
      await client.query("begin");
      // Quelques milliers de lignes : le planificateur préférerait lire toute la table ; on lui interdit pour voir si l'index est utilisable.
      await client.query("set local enable_seqscan = off");
      const plan = await client.query(`explain (format json) ${query.sql}`, query.params as unknown[]);
      expect(JSON.stringify(plan.rows[0])).toContain("email_outbox_express_invite_idx");
    } finally {
      await client.query("rollback");
      client.release();
    }
  });
});
