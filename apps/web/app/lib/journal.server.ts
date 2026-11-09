import type { NotificationFamily } from "@orasso/shared";

import { apiOrThrow } from "./api.server";

// Lecture des notifications du Journal (lot 17, C5 ; lot R7a1 : l'onglet Le Fil la partage ; lot R7c2 : la Boîte et son
// segment « Tout » ont disparu, il ne reste que les notifications). Un module `.server` : l'import de `api.server` ne doit
// jamais rejoindre le code des routes qui l'exportent.
export type JournalItem = {
  id: string;
  type: string;
  family: NotificationFamily;
  title: string;
  body: string;
  data: {
    link?: string;
    screen?: string;
    actor?: { userId: string; pseudo: string; avatarUrl: string | null };
    /** Lot R6c, tour 2 : les auteurs d'une invitation regroupée (la plus récente d'abord). */
    actors?: { userId: string; pseudo: string }[];
  };
  createdAt: string;
  readAt: string | null;
};

export async function loadJournal(request: Request) {
  const cursor = new URL(request.url).searchParams.get("suite");
  return apiOrThrow<{ items: JournalItem[]; nextCursor: string | null }>(
    request,
    `/me/notifications?limit=30${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
  );
}
