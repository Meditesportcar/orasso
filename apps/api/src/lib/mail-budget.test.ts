// Budget d'e-mails du jour (relecture du lot 20) : 300 envois Brevo par jour (heure de Paris), les 50 derniers réservés
// au compte et à la sécurité ; au-delà, `skipped_quota`. Le transport « journal » et les adresses réservées n'y sont
// pas soumis. Aucun appel réseau : `fetch` est simulé.
import { and, eq, gte } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { useClock } from "../../test/helpers";
import { db, pool } from "../db/client";
import { emailOutbox } from "../db/schema";
import { isProtectedTemplate, mail, renderMail, setBrevoFetch, startOfBusinessDay, withinMailBudget } from "./mail";

const content = renderMail("Objet", ["Bonjour,"]);
// Un jour à part (aucune autre ligne de la base de test ce jour-là) : 14:00 à Paris.
const DAY = new Date("2031-01-15T13:00:00Z");
let calls = 0;

beforeEach(async () => {
  useClock(DAY);
  calls = 0;
  setBrevoFetch(async () => {
    calls += 1;
    return new Response("{}", { status: 201 });
  });
  await db.delete(emailOutbox).where(gte(emailOutbox.createdAt, startOfBusinessDay(DAY)));
});
afterEach(() => setBrevoFetch((...args) => fetch(...args)));
afterAll(async () => {
  await db.delete(emailOutbox).where(gte(emailOutbox.createdAt, startOfBusinessDay(DAY)));
  await pool.end();
});

/** `n` envois Brevo déjà faits aujourd'hui (lignes insérées directement). */
async function alreadySent(n: number) {
  await db.insert(emailOutbox).values(
    Array.from({ length: n }, (_, i) => ({
      to: `deja-${i}@gmail.com`,
      subject: "x",
      template: "event_reminder_week",
      transport: "brevo" as const,
      status: "sent" as const,
      createdAt: new Date(DAY.getTime() - 60_000),
    })),
  );
}

describe("budget d'e-mails du jour", () => {
  it("règle : 250 pour les autres gabarits, 300 pour le compte et la sécurité", () => {
    expect(isProtectedTemplate("password_reset")).toBe(true);
    expect(isProtectedTemplate("email_verification")).toBe(true);
    expect(isProtectedTemplate("security_new_login")).toBe(true);
    expect(isProtectedTemplate("account_deleted")).toBe(true);
    expect(isProtectedTemplate("event_cancelled")).toBe(false);
    expect(withinMailBudget("event_cancelled", 249, 300)).toBe(true);
    expect(withinMailBudget("event_cancelled", 250, 300)).toBe(false);
    expect(withinMailBudget("password_reset", 299, 300)).toBe(true);
    expect(withinMailBudget("password_reset", 300, 300)).toBe(false);
  });

  it("au-delà de 250, une annulation n'est pas envoyée ; la réinitialisation l'est jusqu'à 300", async () => {
    await alreadySent(250);
    await mail.send("event_cancelled", "kenji@gmail.com", content, {}, "brevo");
    const [skipped] = await db.select().from(emailOutbox).where(eq(emailOutbox.to, "kenji@gmail.com"));
    expect(skipped).toMatchObject({ status: "skipped_quota", transport: "brevo" });
    expect(calls).toBe(0);
    await mail.send("password_reset", "lea@gmail.com", content, {}, "brevo");
    const [reset] = await db.select().from(emailOutbox).where(eq(emailOutbox.to, "lea@gmail.com"));
    expect(reset?.status).toBe("sent");
    expect(calls).toBe(1);
    // Les e-mails non envoyés ne comptent pas dans le budget.
    await alreadySent(48);
    await mail.send("security_new_login", "nina@gmail.com", content, {}, "brevo");
    expect((await db.select().from(emailOutbox).where(eq(emailOutbox.to, "nina@gmail.com")))[0]?.status).toBe("sent");
    await mail.send("security_new_login", "marc@gmail.com", content, {}, "brevo");
    expect((await db.select().from(emailOutbox).where(eq(emailOutbox.to, "marc@gmail.com")))[0]?.status).toBe(
      "skipped_quota",
    );
  });

  it("le lendemain (minuit à Paris), le budget repart ; journal et adresses réservées hors budget", async () => {
    await alreadySent(300);
    await mail.send("event_cancelled", "demo@orasso.local", content, {}, "brevo");
    await mail.send("event_cancelled", "dev@gmail.com", content, {}, "journal");
    const rows = await db
      .select()
      .from(emailOutbox)
      .where(and(gte(emailOutbox.createdAt, startOfBusinessDay(DAY)), eq(emailOutbox.template, "event_cancelled")));
    expect(rows.map((r) => [r.transport, r.status]).sort()).toEqual([
      ["journal", "sent"],
      ["journal", "sent"],
    ]);
    useClock(new Date("2031-01-15T23:30:00Z")); // 00:30 le 16 à Paris
    await mail.send("event_cancelled", "lendemain@gmail.com", content, {}, "brevo");
    expect((await db.select().from(emailOutbox).where(eq(emailOutbox.to, "lendemain@gmail.com")))[0]?.status).toBe(
      "sent",
    );
    await db.delete(emailOutbox).where(eq(emailOutbox.to, "lendemain@gmail.com"));
  });
});
