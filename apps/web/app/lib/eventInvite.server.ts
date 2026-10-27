// Lot R6c (maquettes R6.3 à R6.6) : ce que le site fait côté serveur pour « inviter du monde » à un événement.
// - couper les invitations d'une personne (« ⋯ » du bandeau de la fiche et de la notification) ;
// - la carte « Invite du monde à venir » d'après la candidature (R6.5) : ses visages, et sa fermeture définitive, gardée
//   dans un cookie par compte et par événement (haché, comme le choix de l'Explorer : jamais d'identifiant en clair).
import { createHash } from "node:crypto";
import { type EventPublic, eventInviteLabels, type InviteCandidatesPage } from "@orasso/shared";
import { data } from "react-router";

import { api } from "./api.server";
import { nowMs } from "./clock";

export const INVITE_CARD_COOKIE = "orasso-invite-card";
const MAX_AGE = 180 * 24 * 3600;
/** Cartes fermées gardées (les plus récentes) : le cookie reste petit. */
const MAX_KEPT = 30;
const TOKEN = /^[0-9a-f]{12}$/;

export type InviteNoticeData = { inviteNotice?: string; inviteError?: string };

/** Identifiant opaque d'une carte fermée : un haché du compte et de l'événement. */
export function inviteCardToken(userId: string, eventId: string): string {
  return createHash("sha256").update(`orasso-invite-card:${userId}:${eventId}`).digest("hex").slice(0, 12);
}

function readTokens(request: Request): string[] {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === INVITE_CARD_COOKIE)
      return rest
        .join("=")
        .split(".")
        .filter((t) => TOKEN.test(t));
  }
  return [];
}

function secure(request: Request) {
  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  return proto === "https" ? "; Secure" : "";
}

export function isInviteCardClosed(request: Request, userId: string, eventId: string): boolean {
  return readTokens(request).includes(inviteCardToken(userId, eventId));
}

/** `Set-Cookie` qui ajoute cette carte aux cartes fermées. */
export function closeInviteCardCookie(request: Request, userId: string, eventId: string): string {
  const token = inviteCardToken(userId, eventId);
  const kept = [...readTokens(request).filter((t) => t !== token), token].slice(-MAX_KEPT);
  return `${INVITE_CARD_COOKIE}=${kept.join(".")}; Max-Age=${MAX_AGE}; Path=/; HttpOnly; SameSite=Lax${secure(request)}`;
}

/** L'événement se partage : publié, pas sur invitation de l'organisateur, ni annulé, ni fini. */
export function isShareable(event: Pick<EventPublic, "status" | "admission" | "endsAt">): boolean {
  return (
    event.status === "published" && event.admission !== "invite_only" && new Date(event.endsAt).getTime() > nowMs()
  );
}

/** « Ne plus recevoir d'invitations de X » : `POST /me/invitation-mutes`. */
export async function muteInviterAction(request: Request, form: FormData) {
  const userId = String(form.get("userId") ?? "").trim();
  const pseudo = String(form.get("pseudo") ?? "").trim();
  if (!userId) return data<InviteNoticeData>({ inviteError: "Personne inconnue." }, { status: 400 });
  const res = await api(request, "/me/invitation-mutes", { method: "POST", json: { userId } });
  if (!res.ok) return data<InviteNoticeData>({ inviteError: res.error.message }, { status: res.status });
  return data<InviteNoticeData>({ inviteNotice: eventInviteLabels.muted(pseudo || "cette personne") });
}

export type AfterInviteCard = {
  eventId: string;
  slug: string;
  faces: { userId: string; pseudo: string; avatarUrl: string | null }[];
};

/**
 * La carte « Invite du monde à venir » (R6.5) : jamais si l'événement ne se partage pas, si elle a été fermée, ou si
 * personne n'est invitable. Trois visages : les personnes invitables de mon crew d'abord. Jamais bloquante.
 */
export async function afterInviteCard(request: Request, userId: string, slug: string): Promise<AfterInviteCard | null> {
  const found = await api<EventPublic>(request, `/events/by-slug/${encodeURIComponent(slug)}`);
  if (!found.ok || !isShareable(found.data)) return null;
  const event = found.data;
  if (isInviteCardClosed(request, userId, event.id)) return null;
  const page = await api<InviteCandidatesPage>(request, `/events/${event.id}/peer-invitations/candidates`);
  if (!page.ok) return null;
  const available = page.data.people.filter((p) => p.state === "available");
  const faces = [...available.filter((p) => p.crewIds.length > 0), ...available.filter((p) => p.crewIds.length === 0)]
    .slice(0, 3)
    .map((p) => ({ userId: p.userId, pseudo: p.pseudo, avatarUrl: p.avatarUrl }));
  return faces.length > 0 ? { eventId: event.id, slug: event.slug, faces } : null;
}
