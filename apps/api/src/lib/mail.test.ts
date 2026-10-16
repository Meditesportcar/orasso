// Corps envoyé à l'API Brevo (lot 15) : expéditeur du sous-domaine dédié, réponses vers contact@orasso.fr. Aucun appel
// réseau : `fetch` est simulé.
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { db, pool } from "../db/client";
import { emailOutbox } from "../db/schema";

import { brevoPayload, deliverBrevo, isReservedAddress, mail, parseMailbox, renderMail, setBrevoFetch } from "./mail";

const content = renderMail("Ton mot de passe a été changé", ["Bonjour,"]);

afterEach(() => setBrevoFetch((...args) => fetch(...args)));
afterAll(async () => {
  await pool.end();
});

describe("envoi par Brevo", () => {
  it("lit « Nom <adresse> » et « adresse »", () => {
    expect(parseMailbox("Orasso <ne-pas-repondre@mail.orasso.fr>")).toEqual({
      name: "Orasso",
      email: "ne-pas-repondre@mail.orasso.fr",
    });
    expect(parseMailbox("contact@orasso.fr")).toEqual({ email: "contact@orasso.fr" });
    expect(parseMailbox('"Orasso" <ne-pas-repondre@mail.orasso.fr>')).toEqual({
      name: "Orasso",
      email: "ne-pas-repondre@mail.orasso.fr",
    });
  });

  it("expéditeur et adresse de réponse dans le corps ; pas d'en-tête de réponse sans MAIL_REPLY_TO", () => {
    const withReply = brevoPayload("jean@exemple.fr", content, {
      from: "Orasso <ne-pas-repondre@mail.orasso.fr>",
      replyTo: "contact@orasso.fr",
    });
    expect(withReply).toEqual({
      sender: { name: "Orasso", email: "ne-pas-repondre@mail.orasso.fr" },
      to: [{ email: "jean@exemple.fr" }],
      replyTo: { email: "contact@orasso.fr" },
      subject: "Ton mot de passe a été changé",
      htmlContent: content.html,
      textContent: content.text,
    });
    const named = brevoPayload("jean@exemple.fr", content, {
      from: "Orasso <ne-pas-repondre@mail.orasso.fr>",
      replyTo: "Équipe Orasso <contact@orasso.fr>",
    });
    expect(named.replyTo).toEqual({ name: "Équipe Orasso", email: "contact@orasso.fr" });
    const without = brevoPayload("jean@exemple.fr", content, { from: "contact@orasso.fr", replyTo: undefined });
    expect(without).not.toHaveProperty("replyTo");
  });

  it("appelle l'API Brevo avec ce corps (fetch simulé)", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    setBrevoFetch(async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response("{}", { status: 201 });
    });
    await deliverBrevo("jean@exemple.fr", content);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(calls[0]?.init.method).toBe("POST");
    // Délai maximal : l'appel porte un signal d'abandon (10 s).
    expect(calls[0]?.init.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(String(calls[0]?.init.body));
    expect(body.to).toEqual([{ email: "jean@exemple.fr" }]);
    expect(body.subject).toBe("Ton mot de passe a été changé");
    expect(body.sender.email).toBeTruthy();
  });
});

describe("adresses non routables en transport Brevo", () => {
  it("domaines réservés reconnus", () => {
    for (const a of [
      "damien@orasso.local",
      "x@garage-du-port.example",
      "a@b.test",
      "c@d.invalid",
      "e@example.com",
      "f@mail.example.org",
      "g@localhost",
    ]) {
      expect(isReservedAddress(a), a).toBe(true);
    }
    for (const a of ["x@gmail.com", "contact@orasso.fr", "y@exemple.fr", "z@notexample.com"]) {
      expect(isReservedAddress(a), a).toBe(false);
    }
  });

  it("aucun appel à Brevo pour x@orasso.local (journal, trace en file) ; un appel pour x@gmail.com", async () => {
    const calls: string[] = [];
    setBrevoFetch(async (_url, init) => {
      calls.push(String(init?.body));
      return new Response("{}", { status: 201 });
    });
    const stamp = Date.now();
    const local = `demo-${stamp}@orasso.local`;
    const real = `demo-${stamp}@gmail.com`;
    await mail.send("test", local, content, {}, "brevo");
    expect(calls).toHaveLength(0);
    const row = await db.query.emailOutbox.findFirst({ where: eq(emailOutbox.to, local) });
    expect(row).toMatchObject({ transport: "journal", status: "sent" });
    expect(row?.error).toContain("non routable");
    await mail.send("test", real, content, {}, "brevo");
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0] ?? "{}").to).toEqual([{ email: real }]);
    const sent = await db.query.emailOutbox.findFirst({ where: eq(emailOutbox.to, real) });
    expect(sent).toMatchObject({ transport: "brevo", status: "sent" });
  });
});
