// Lecture des stories d'un auteur et service des fichiers (lot R7f1, ARCHITECTURE-R7 § 2.5). Le fichier n'est servi
// qu'après `canSeeStory`, à chaque lecture ; `Cache-Control: private` ; 404 après expiration ou suppression.
import { parseStoryAuthorKey, type StoriesByAuthor, type StoryView, storyDenial } from "@orasso/shared";
import { and, eq, sql } from "drizzle-orm";

import { stories } from "../../db/schema";
import { now } from "../../lib/deps";
import { notFound } from "../../lib/errors";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import {
  audienceStoryOf,
  authorDisplay,
  authorKeyOf,
  liveStory,
  relationOf,
  selectStories,
  setsFor,
  viewerOf,
} from "./common";
import { fileNameOf, serializeStories } from "./serialize";
import { requireVisibleStory } from "./service";

const personal = sql`${stories.persona} not in ('organizer','pro')`;

export const storiesAccess = {
  /** `GET /stories/by-author/:key` : celles que je vois, dans l'ordre. Rien de visible (ou auteur inconnu) : liste vide. */
  async byAuthor(v: Viewer, rawKey: string): Promise<StoriesByAuthor> {
    const key = parseStoryAuthorKey(rawKey);
    if (!key) throw notFound("Auteur introuvable");
    if (key.kind !== "user" && !/^[0-9a-f-]{36}$/i.test(key.id)) return { author: null, stories: [] };
    const at = now();
    const where =
      key.kind === "user"
        ? and(personal, eq(stories.authorId, key.id))
        : key.kind === "structure"
          ? and(eq(stories.persona, "organizer"), eq(stories.structureId, key.id))
          : and(eq(stories.persona, "pro"), eq(stories.proId, key.id));
    const rows = (await selectStories(and(liveStory(at), where))).sort(
      (a, b) => a.story.createdAt.getTime() - b.story.createdAt.getTime(),
    );
    if (!rows.length) return { author: null, stories: [] };
    const sets = await setsFor(v.user.id, rows);
    const viewer = viewerOf(v);
    const visible = rows.filter((r) => storyDenial(viewer, audienceStoryOf(r, at), relationOf(sets, r)) === null);
    const first = visible[0];
    if (!first) return { author: null, stories: [] };
    const display = authorDisplay(first, storage.url);
    const views: StoryView[] = await serializeStories(v, visible);
    return {
      author: {
        key: authorKeyOf(first)?.key ?? rawKey,
        pseudoOrName: display.name,
        avatarUrl: display.avatarUrl,
        persona: first.story.persona,
      },
      stories: views,
    };
  },

  /** `GET /me/stories` : mes stories vivantes, toutes casquettes, pour les gérer. */
  async mine(v: Viewer): Promise<{ stories: StoryView[] }> {
    const rows = (await selectStories(and(liveStory(now()), eq(stories.authorId, v.user.id)))).sort(
      (a, b) => a.story.createdAt.getTime() - b.story.createdAt.getTime(),
    );
    return { stories: await serializeStories(v, rows) };
  },

  /** Fichier d'une story (photo ou vignette de vidéo) après contrôle de l'audience. */
  async file(v: Viewer, id: string, name: string, kind: "media" | "poster"): Promise<{ data: Buffer; type: string }> {
    const row = await requireVisibleStory(v, id);
    const key = kind === "media" ? row.story.storageKey : row.story.posterKey;
    if (!key || name !== fileNameOf(key)) throw notFound("Fichier introuvable");
    const data = await storage.get(key);
    if (!data) throw notFound("Fichier introuvable");
    return { data, type: key.endsWith(".mp4") ? "video/mp4" : "image/webp" };
  },

  /** `GET /stories/:id/thumb` : la vignette (affiche d'une vidéo, sinon la photo) pour la ligne d'une réponse. */
  async thumb(v: Viewer, id: string): Promise<Buffer> {
    const row = await requireVisibleStory(v, id);
    const data = await storage.get(row.story.posterKey ?? row.story.storageKey);
    if (!data) throw notFound("Fichier introuvable");
    return data;
  },
};
