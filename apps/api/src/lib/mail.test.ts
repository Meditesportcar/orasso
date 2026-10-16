// Corps envoyé à l'API Brevo (lot 15) : expéditeur du sous-domaine dédié, réponses vers contact@orasso.fr. Aucun appel
// réseau : `fetch` est simulé.
import { afterEach, describe, expect, it } from "vitest";

import { brevoPayload, deliverBrevo, parseMailbox, renderMail, setBrevoFetch } from "./mail";

const content = renderMail("Ton mot de passe a été changé", ["Bonjour,"]);

afterEach(() => setBrevoFetch((...args) => fetch(...args)));

describe("envoi par Brevo", () => {
  it("lit « Nom <adresse> » et « adresse »", () => {
    expect(parseMailbox("Orasso <ne-pas-repondre@mail.orasso.fr>")).toEqual({
      name: "Orasso",
      email: "ne-pas-repondre@mail.orasso.fr",
    });
    expect(parseMailbox("contact@orasso.fr")).toEqual({ email: "contact@orasso.fr" });
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
    const body = JSON.parse(String(calls[0]?.init.body));
    expect(body.to).toEqual([{ email: "jean@exemple.fr" }]);
    expect(body.subject).toBe("Ton mot de passe a été changé");
    expect(body.sender.email).toBeTruthy();
  });
});
