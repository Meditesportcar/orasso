// Boîte de la casquette Organisateur (lot 20 ; écrans au lot 22 dans l'appli, « Messages des participants » sur le
// site) : les conversations `organizer` d'une structure et les compteurs. Côté structure = double authentification de
// la session (règle du lot 18), le super admin n'y a pas accès.
import {
  type ConversationPage,
  type ConversationSummary,
  MESSAGE_PREVIEW_MAX,
  messagePreview,
  type OrganizerInboxSummary,
} from "@orasso/shared";
import { and, desc, eq, isNotNull, lt, or, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { conversations } from "../../db/schema";
import { decodeCursor, encodeCursor } from "../../lib/pagination";
import type { Viewer } from "../../lib/session";
import { isMySide, lastMessageOf, resolveAccess, unreadCountOf } from "../messaging/core";
import { unreadConversationCount } from "../messaging/inbox";
import { requireStructureReader } from "./guards";
import { staffChatsService } from "./staff-chats";

export const organizerInboxService = {
  /** `GET /structures/:id/inbox/summary`. */
  async summary(v: Viewer, structureId: string): Promise<OrganizerInboxSummary> {
    await requireStructureReader(v, structureId);
    return {
      participantMessages: await unreadConversationCount(v.user.id, { includeStructure: true, structureId }),
      staffDiscussions: await staffChatsService.unreadFor(v, structureId),
      // Demandes pour devenir staff : lot 24.
      staffRequests: 0,
    };
  },

  /** `GET /structures/:id/conversations` : « Messages des participants », les plus récentes d'abord. */
  async conversations(
    v: Viewer,
    structureId: string,
    q: { limit: number; cursor?: string },
  ): Promise<ConversationPage> {
    await requireStructureReader(v, structureId);
    const c = decodeCursor(q.cursor);
    const rows = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.kind, "organizer"),
          eq(conversations.structureId, structureId),
          isNotNull(conversations.lastMessageAt),
          // Seulement les conversations où la personne a écrit (relecture du lot 20) : un message groupé sans réponse
          // ne remplit pas « Messages des participants ».
          sql`exists (select 1 from messages m where m.conversation_id = ${conversations.id}
            and m.as_structure = false and m.kind <> 'system')`,
          c
            ? or(
                lt(conversations.lastMessageAt, c.createdAt),
                and(eq(conversations.lastMessageAt, c.createdAt), lt(conversations.id, c.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(conversations.lastMessageAt), desc(conversations.id))
      .limit(q.limit + 1);
    const page = rows.slice(0, q.limit);
    const items: ConversationSummary[] = [];
    for (const row of page) {
      const access = await resolveAccess(db, row, v.user.id);
      if (access?.reader.side !== "structure") continue;
      const d = await access.rules.describe(db, row, access.reader);
      const last = await lastMessageOf(db, row.id);
      items.push({
        id: row.id,
        kind: row.kind,
        side: "structure",
        title: d.title,
        subtitle: d.subtitle,
        avatarUrl: d.avatarUrl,
        participants: d.participants.slice(0, 3),
        lastMessage: last
          ? {
              preview: messagePreview(
                { kind: last.kind, body: last.body, deleted: Boolean(last.deletedAt || last.moderatedAt) },
                MESSAGE_PREVIEW_MAX,
              ),
              at: last.createdAt.toISOString(),
              mine: isMySide(last, access.reader),
            }
          : null,
        unreadCount: await unreadCountOf(db, row.id, access.reader),
        closedAt: row.closedAt?.toISOString() ?? null,
      });
    }
    const last = page.at(-1);
    return {
      items,
      nextCursor: rows.length > q.limit && last?.lastMessageAt ? encodeCursor(last.lastMessageAt, last.id) : null,
    };
  },
};
