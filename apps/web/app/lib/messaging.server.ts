// Actions de messagerie du site (lot 18), partagées par le profil d'un autre, la page d'une structure et celle d'un
// événement : ouvrir une conversation (ami ou organisateur) ou envoyer une demande de contact.
import type { OpenConversationResult } from "@orasso/shared";
import { data, redirect } from "react-router";

import { api, loginUrl } from "./api.server";

export const MESSAGE_INTENTS = ["message_open", "contact_organizer", "contact_request"] as const;

export function isMessageIntent(intent: string): boolean {
  return (MESSAGE_INTENTS as readonly string[]).includes(intent);
}

/**
 * `message_open` (userId) : conversation existante ou entre amis → redirection ; pas amis → `{contact: true}` (le
 * formulaire de demande de contact s'affiche). `contact_organizer` (structureId) : conversation avec la structure.
 * `contact_request` (pseudo, message) : demande de contact (une seule possible).
 */
export async function messageAction(request: Request, form: FormData) {
  const intent = String(form.get("intent") ?? "");
  if (intent === "message_open") {
    const res = await api<OpenConversationResult>(request, "/conversations/direct", {
      method: "POST",
      json: { userId: String(form.get("userId") ?? "") },
    });
    if (res.status === 401) throw redirect(loginUrl(request));
    if (res.ok) throw redirect(`/app/boite/${res.data.id}`);
    if (res.error.code === "not_friends") return data({ contact: true, messageError: null, contactSent: null });
    return data({ contact: false, messageError: res.error.message, contactSent: null }, { status: res.status });
  }
  if (intent === "contact_organizer") {
    const res = await api<OpenConversationResult>(
      request,
      `/structures/${encodeURIComponent(String(form.get("structureId") ?? ""))}/conversation`,
      { method: "POST" },
    );
    if (res.status === 401) throw redirect(loginUrl(request));
    // Lot M4 : écrit depuis la fiche d'un événement, le premier message part avec son contexte (« À propos de »).
    const body = String(form.get("body") ?? "").trim();
    const aboutEventId = String(form.get("aboutEventId") ?? "");
    if (res.ok && body) {
      const sent = await api(request, `/conversations/${res.data.id}/messages`, {
        method: "POST",
        json: { clientId: crypto.randomUUID(), body, ...(aboutEventId ? { aboutEventId } : {}) },
      });
      if (!sent.ok) {
        return data({ contact: false, messageError: sent.error.message, contactSent: null }, { status: sent.status });
      }
    }
    if (res.ok) throw redirect(`/app/boite/${res.data.id}`);
    return data({ contact: false, messageError: res.error.message, contactSent: null }, { status: res.status });
  }
  if (intent === "contact_request") {
    const pseudo = String(form.get("pseudo") ?? "");
    const res = await api<{ id: string; pseudo: string }>(request, "/contact-requests", {
      method: "POST",
      json: { pseudo, message: String(form.get("message") ?? "") },
    });
    if (res.status === 401) throw redirect(loginUrl(request));
    if (res.ok) return data({ contact: false, messageError: null, contactSent: res.data.pseudo });
    const conversationId = (res.error.details as { conversationId?: string } | undefined)?.conversationId;
    if (res.error.code === "use_direct" && conversationId) throw redirect(`/app/boite/${conversationId}`);
    return data({ contact: true, messageError: res.error.message, contactSent: null }, { status: res.status });
  }
  return data({ contact: false, messageError: "Action inconnue.", contactSent: null }, { status: 400 });
}

export type MessageActionData = { contact: boolean; messageError: string | null; contactSent: string | null };
