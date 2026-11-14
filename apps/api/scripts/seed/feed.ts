// Seed du Fil (lot R7e1, décision D38) : le compte officiel « Orasso » (profil public, avatar = le monogramme) et ses
// publications de départ — 12 en 4:5 étalées sur 10 jours, 3 en 1:1, 1 en paysage —, 2 publications de Kenji_66 et une
// d'un compte privé du seed (Marc_66, que seuls ses abonnés acceptés voient : cas de test de la vie privée). Les photos sont
// celles du seed regardées une à une, « aucune plaque lisible » (`NO_PLATE_REVIEWED` de `photos.ts`) : la décision de
// plaque est donc vraie (`no_plate_confirmed`). Le texte « contenu produit par Orasso pour les débuts » est ce seed,
// pas une règle de l'API. Idempotent : rien si le compte Orasso a déjà des publications. Une base de développement semée
// au premier tour garde des photos sous l'ancienne clé publique `feed/<postId>/<hex>.webp` : le seed les range sous
// `private/feed/…` (même nom, la ligne suit) et efface l'ancien fichier, que `/api/files` ne sert plus.
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type FeedAspect, feedLabels, OFFICIAL_PSEUDO } from "@orasso/shared";
import { hashPassword } from "better-auth/crypto";
import { and, eq, gt, isNull, like, lt, or, sql } from "drizzle-orm";
import sharp from "sharp";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { repoRoot } from "../../src/env";
import { storage } from "../../src/lib/storage";
import { feedPhotoKey } from "../../src/modules/feed/posts";
import { createAccount, DAY, HOUR } from "./helpers";
import { reviewedNoPlateCar } from "./photos";
import { isSeedAccount, isSeedEvent, type SeedPost, seedPostId } from "./seed-scope";

const SIZE: Record<FeedAspect, { width: number; height: number }> = {
  portrait_4_5: { width: 1080, height: 1350 },
  square: { width: 1080, height: 1080 },
  landscape: { width: 1350, height: 1080 },
};

const AVATAR_KEY = "seed/avatar-orasso.webp";

/** Le monogramme du kit d'identité ; à défaut (image du serveur sans le dossier `identite/`), un O moutarde sur fond sombre. */
async function monogram(): Promise<Buffer> {
  const file = join(repoRoot, "identite", "monogramme", "orasso-monogramme-fond-sombre-1024px.png");
  const source = await readFile(file).catch(() => null);
  const input =
    source ??
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#17191C"/><circle cx="256" cy="256" r="150" fill="none" stroke="#E5A823" stroke-width="64"/></svg>`,
    );
  return sharp(input).resize(256, 256, { fit: "cover" }).webp({ quality: 85 }).toBuffer();
}

const byPseudo = (pseudo: string) =>
  db.query.profiles.findFirst({
    where: and(sql`lower(${t.profiles.pseudo}) = ${pseudo.toLowerCase()}`, isSeedAccount(t.profiles.userId)),
  });

type Planned = {
  author: string;
  aspect: FeedAspect;
  hoursAgo: number;
  department: string;
  caption: string;
};

const ORASSO = OFFICIAL_PSEUDO;

/** 12 en 4:5 (10 jours), 3 en 1:1, 1 en paysage pour Orasso ; puis Kenji (2) et Marc, compte privé (1). */
const PLAN: Planned[] = [
  {
    author: ORASSO,
    aspect: "portrait_4_5",
    hoursAgo: 2,
    department: "66",
    caption: "Bienvenue sur Orasso : le Fil, c'est ici.",
  },
  { author: ORASSO, aspect: "portrait_4_5", hoursAgo: 20, department: "66", caption: "Un dimanche comme on les aime." },
  {
    author: ORASSO,
    aspect: "portrait_4_5",
    hoursAgo: 14,
    department: "66",
    caption: "Le matin, avant l'ouverture des portes.",
  },
  {
    author: ORASSO,
    aspect: "square",
    hoursAgo: 26,
    department: "34",
    caption: "Un rassemblement, ce sont d'abord des gens.",
  },
  {
    author: ORASSO,
    aspect: "portrait_4_5",
    hoursAgo: 38,
    department: "66",
    caption: "Lumière du soir sur le plateau.",
  },
  {
    author: ORASSO,
    aspect: "portrait_4_5",
    hoursAgo: 52,
    department: "11",
    caption: "Chaque voiture a son histoire. Raconte la tienne.",
  },
  {
    author: ORASSO,
    aspect: "landscape",
    hoursAgo: 66,
    department: "66",
    caption: "Toute la rangée, d'un seul regard.",
  },
  {
    author: ORASSO,
    aspect: "portrait_4_5",
    hoursAgo: 80,
    department: "66",
    caption: "Les détails qui font la différence.",
  },
  { author: ORASSO, aspect: "portrait_4_5", hoursAgo: 96, department: "31", caption: "Le plateau se remplit." },
  {
    author: ORASSO,
    aspect: "portrait_4_5",
    hoursAgo: 125,
    department: "34",
    caption: "Entre deux démarrages, on discute mécanique.",
  },
  {
    author: ORASSO,
    aspect: "square",
    hoursAgo: 118,
    department: "66",
    caption: "Plaques toujours floutées : on pense à votre vie privée.",
  },
  {
    author: ORASSO,
    aspect: "portrait_4_5",
    hoursAgo: 140,
    department: "34",
    caption: "Un premier rassemblement ? Voici comment ça se passe.",
  },
  {
    author: ORASSO,
    aspect: "portrait_4_5",
    hoursAgo: 165,
    department: "66",
    caption: "Merci à toutes celles et ceux qui organisent.",
  },
  {
    author: ORASSO,
    aspect: "square",
    hoursAgo: 190,
    department: "66",
    caption: "Et vous, quelle est votre prochaine sortie ?",
  },
  {
    author: ORASSO,
    aspect: "portrait_4_5",
    hoursAgo: 220,
    department: "66",
    caption: "Les débuts d'Orasso, entre passionnés.",
  },
  {
    author: ORASSO,
    aspect: "portrait_4_5",
    hoursAgo: 235,
    department: "66",
    caption: "On se retrouve sur le terrain.",
  },
  {
    author: "Kenji_66",
    aspect: "portrait_4_5",
    hoursAgo: 6,
    department: "66",
    caption: "Retour de la sortie du Roussillon Drift.",
  },
  { author: "Kenji_66", aspect: "square", hoursAgo: 70, department: "66", caption: "Sur le plateau ce week-end." },
  {
    author: "Marc_66",
    aspect: "portrait_4_5",
    hoursAgo: 10,
    department: "66",
    caption: "Compte privé : visible de mes abonnés seulement.",
  },
];

/** Photos du Fil sous l'ancienne clé publique `feed/…` : rangées sous `private/feed/…` (même nom). Rend le nombre migré. */
export async function migrateLegacyFeedKeys(): Promise<number> {
  const rows = await db
    .select({ id: t.feedPostPhotos.id, key: t.feedPostPhotos.storageKey })
    .from(t.feedPostPhotos)
    .where(like(t.feedPostPhotos.storageKey, "feed/%"));
  let moved = 0;
  for (const row of rows) {
    const next = `private/${row.key}`;
    const data = await storage.get(row.key);
    // Le fichier absent (disque vidé) : la ligne passe quand même sous la nouvelle clé, la route répondra 404 comme pour
    // n'importe quelle photo perdue.
    if (data) await storage.put(next, data);
    await db.update(t.feedPostPhotos).set({ storageKey: next }).where(eq(t.feedPostPhotos.id, row.id));
    await storage.remove(row.key);
    moved += 1;
  }
  if (moved) console.log(`Fil : ${moved} photo(s) rangée(s) sous private/feed/ (ancienne clé publique).`);
  return moved;
}

export async function seedFeed() {
  await seedOrassoFeed();
  await seedPublications();
  await seedCoauthors();
}

/** Publications du plan que ce seed pose (compte Orasso, Kenji_66, Marc_66), avec leur identifiant fixe : les autres scripts ne visent que celles-là. */
export const SEED_PLAN_POSTS: SeedPost[] = PLAN.map((p) => ({
  id: seedPostId(`plan:${p.author}:${p.caption}`),
  author: p.author,
  caption: p.caption,
}));

/** Les trois publications de Roues Libres 66 (Sarah_66) rattachées au Lydia : identifiants fixes, dans l'ordre de `seedPublications`. */
export const LYDIA_ORGA_POSTS: SeedPost[] = [
  {
    id: seedPostId(`lydia:Sarah_66:${"Le plateau JDM prend forme au pied du Lydia : passez nous voir."}`),
    author: "Sarah_66",
    caption: "Le plateau JDM prend forme au pied du Lydia : passez nous voir.",
  },
  {
    id: seedPostId(`lydia:Sarah_66:${"Le plan du plateau est en ligne : rangée JDM à gauche, youngtimers au fond."}`),
    author: "Sarah_66",
    caption: "Le plan du plateau est en ligne : rangée JDM à gauche, youngtimers au fond.",
  },
  {
    id: seedPostId(`lydia:Sarah_66:${"L'ouverture du plateau passe à 9 h 30 demain matin au lieu de 9 h."}`),
    author: "Sarah_66",
    caption: "L'ouverture du plateau passe à 9 h 30 demain matin au lieu de 9 h.",
  },
];

async function seedOrassoFeed() {
  await migrateLegacyFeedKeys();
  // Le compte officiel : jamais de connexion possible (mot de passe aléatoire, e-mail non distribuable).
  let orasso = await byPseudo(ORASSO);
  // Le statut officiel ne se rattache jamais à un compte ordinaire qui porterait déjà ce nom : on s'arrête, sans rien changer.
  if (orasso && !orasso.official) {
    throw new Error(
      `Seed du Fil : un compte ordinaire nommé « ${ORASSO} » existe déjà (${orasso.userId}). Le statut officiel ne lui est pas rattaché : renomme ou supprime ce compte, puis relance le seed.`,
    );
  }
  if (!orasso) {
    // Un compte réel (hors graine) porte déjà ce pseudo : l'unicité du pseudo ferait échouer la création à moitié (utilisateur sans
    // profil). La graine ne le voit pas, ne le touche pas, n'écrit rien à son nom et saute le compte officiel.
    const taken = await db.query.profiles.findFirst({
      where: sql`lower(${t.profiles.pseudo}) = ${ORASSO.toLowerCase()}`,
      columns: { userId: true },
    });
    if (taken) {
      console.log(
        `Fil : le pseudo « ${ORASSO} » est pris par un compte réel, compte officiel et publications d'Orasso sautés.`,
      );
      return;
    }
    const person = await createAccount(
      await hashPassword(randomBytes(24).toString("hex")),
      { pseudo: ORASSO, email: "orasso@orasso.local", departments: ["66"] },
      { official: true },
    );
    const avatar = await monogram();
    await storage.put(AVATAR_KEY, avatar);
    await db
      .update(t.profiles)
      .set({ bio: feedLabels.officialBio, avatarKey: AVATAR_KEY, visibility: "public" })
      .where(eq(t.profiles.userId, person.id));
    orasso = await byPseudo(ORASSO);
  }
  if (!orasso) return;
  const existing = await db.query.feedPosts.findFirst({ where: eq(t.feedPosts.authorId, orasso.userId) });
  if (existing) {
    console.log("Fil : publications d'Orasso déjà présentes.");
    return;
  }

  const at = Date.now();
  let made = 0;
  for (const [index, plan] of PLAN.entries()) {
    const author = plan.author === ORASSO ? orasso : await byPseudo(plan.author);
    if (!author) continue;
    const photo = await reviewedNoPlateCar(index);
    if (!photo) {
      console.log("Fil : photos du seed absentes, rien ajouté.");
      return;
    }
    const size = SIZE[plan.aspect];
    const out = await sharp(photo.data)
      .resize(size.width, size.height, { fit: "cover", position: "attention" })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    const postId = SEED_PLAN_POSTS[index]?.id ?? randomUUID();
    const key = feedPhotoKey(postId, randomBytes(16).toString("hex"));
    await storage.put(key, out.data);
    const createdAt = new Date(at - plan.hoursAgo * HOUR);
    await db.insert(t.feedPosts).values({
      id: postId,
      authorId: author.userId,
      caption: plan.caption,
      aspect: plan.aspect,
      department: plan.department,
      createdAt,
      updatedAt: createdAt,
    });
    await db.insert(t.feedPostPhotos).values({
      postId,
      storageKey: key,
      width: out.info.width,
      height: out.info.height,
      position: 0,
      plateBlurred: false,
      // Photo du seed regardée : aucune plaque lisible (décision vraie, pas un contournement).
      noPlateConfirmed: true,
    });
    made += 1;
  }
  console.log(`Fil : ${made} publications ajoutées (compte Orasso, Kenji_66, Marc_66 en privé).`);
}

// --- Publications au nom d'une page, pour un événement (vague R8, lot R8a1) -----------------------------------------------
// Roues Libres 66 « pour le Rassemblement du Lydia » (une avec photo, une sans photo donc avec l'affiche, une « Info
// importante » motif Horaires déjà envoyée : **aucune notification réelle**) ; La Brasa (prestataire retenu, candidature
// créée si elle manque) « présent au » ; Kenji_66 « était au » un événement fini depuis moins de 30 jours où sa présence est
// validée (la présence est posée si aucun événement récent n'en a déjà une). Rejouable : rien si la structure a déjà ses
// publications rattachées.
const LYDIA_SLUG = "rassemblement-du-lydia";

export async function storeFeedPhoto(postId: string, index: number, position = 0): Promise<boolean> {
  const photo = await reviewedNoPlateCar(index);
  if (!photo) return false;
  const out = await sharp(photo.data)
    .resize(1080, 1350, { fit: "cover", position: "attention" })
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true });
  const key = feedPhotoKey(postId, randomBytes(16).toString("hex"));
  await storage.put(key, out.data);
  await db.insert(t.feedPostPhotos).values({
    postId,
    storageKey: key,
    width: out.info.width,
    height: out.info.height,
    position,
    plateBlurred: false,
    // Photo du seed regardée : aucune plaque lisible (décision vraie, pas un contournement).
    noPlateConfirmed: true,
  });
  return true;
}

/**
 * Une publication de la graine rattachée à un événement, indépendamment idempotente (lot R9-fix, tour 5) :
 *  - identifiant fixe, SANS l'identifiant de l'édition : il survit au renouvellement du Lydia ;
 *  - rattachée à l'événement courant si elle existe déjà non supprimée (la suppression de l'ancienne édition vide `event_id`) ;
 *  - créée seulement si aucune ligne n'a cet identifiant (supprimée comprise : jamais recréée) ET si l'auteur n'a pas déjà, sur
 *    cet événement, une publication de même légende (ancienne base : pas de doublon, l'ancienne ligne n'est pas touchée) ;
 *  - `onConflictDoNothing` ; la photo n'est posée que si la ligne vient d'être insérée (sinon la ligne est retirée).
 */
export async function ensureSeedPost(
  id: string,
  values: typeof t.feedPosts.$inferInsert & { eventId: string; caption: string; authorId: string },
  photoIndex: number | null,
): Promise<boolean> {
  await db
    .update(t.feedPosts)
    .set({ eventId: values.eventId })
    .where(
      and(
        eq(t.feedPosts.id, id),
        isNull(t.feedPosts.deletedAt),
        sql`${t.feedPosts.eventId} is distinct from ${values.eventId}`,
      ),
    );
  const existing = await db.query.feedPosts.findFirst({
    where: or(
      eq(t.feedPosts.id, id),
      and(
        eq(t.feedPosts.authorId, values.authorId),
        eq(t.feedPosts.caption, values.caption),
        eq(t.feedPosts.eventId, values.eventId),
      ),
    ),
  });
  if (existing) return false;
  const inserted = await db
    .insert(t.feedPosts)
    .values({ ...values, id })
    .onConflictDoNothing()
    .returning({ id: t.feedPosts.id });
  if (inserted.length === 0) return false;
  if (photoIndex !== null && !(await storeFeedPhoto(id, photoIndex))) {
    await db.delete(t.feedPosts).where(eq(t.feedPosts.id, id));
    console.log(`Publications rattachées : photos du seed absentes, « ${values.caption.slice(0, 30)}… » non ajoutée.`);
    return false;
  }
  return true;
}

/** Un compte de la graine, actif (ni supprimé, ni banni, ni suspendu). */
const activeSeedProfile = async (pseudo: string) => {
  const p = await byPseudo(pseudo);
  if (!p || p.deletedAt || p.bannedAt) return null;
  return p.suspendedUntil && p.suspendedUntil > new Date() ? null : p;
};

export const BRASA_POST_CAPTION = "Les grillades sont prêtes : bocatas et brochettes, juste à côté de la rangée JDM.";
export const KENJI_PRESENT_CAPTION = "Belle journée sur le plateau, merci aux organisateurs.";

export async function seedPublications() {
  const lydia = await db.query.events.findFirst({ where: eq(t.events.slug, LYDIA_SLUG) });
  const structure = await db.query.structures.findFirst({ where: eq(t.structures.slug, "roues-libres-66") });
  if (!lydia || !structure) {
    console.log("Publications rattachées : Lydia ou Roues Libres 66 absents, rien ajouté.");
    return;
  }
  // Plus de sortie anticipée « déjà présentes » : chaque publication se suffit à elle-même (voir `ensureSeedPost`).
  const at = Date.now();
  const sarah = await activeSeedProfile("Sarah_66");
  let made = 0;
  if (!sarah) {
    console.log("Publications rattachées : Sarah_66 absente ou suspendue, publications de Roues Libres 66 sautées.");
  } else {
    const orga = async (
      post: SeedPost | undefined,
      hoursAgo: number,
      photoIndex: number | null,
      extra: Partial<typeof t.feedPosts.$inferInsert> = {},
    ) => {
      if (!post) return;
      const createdAt = new Date(at - hoursAgo * HOUR);
      const done = await ensureSeedPost(
        post.id,
        {
          ...extra,
          authorId: sarah.userId,
          persona: "organizer",
          structureId: structure.id,
          eventId: lydia.id,
          eventRole: "organizer",
          caption: post.caption,
          department: "66",
          createdAt,
          updatedAt: createdAt,
        },
        photoIndex,
      );
      if (done) made++;
    };
    // Avec une photo, puis sans (l'affiche de l'événement fait le visuel : une référence, jamais une copie), puis « Info
    // importante » déjà envoyée (motif Horaires ; aucune notification réelle n'est écrite).
    await orga(LYDIA_ORGA_POSTS[0], 3, 3);
    await orga(LYDIA_ORGA_POSTS[1], 8, null);
    await orga(LYDIA_ORGA_POSTS[2], 26, null, {
      importantReason: "schedule",
      importantSentAt: new Date(at - 26 * HOUR),
    });
  }

  // La Brasa, prestataire retenu au Lydia : candidature retenue ET publication sur le Lydia courant (la candidature part avec
  // l'ancien événement par cascade). Seulement si la page et son titulaire sont de la graine et actifs.
  const sofia = await activeSeedProfile("Sofia_66");
  const brasa = sofia
    ? await db.query.providerProfiles.findFirst({
        where: and(eq(t.providerProfiles.userId, sofia.userId), isNull(t.providerProfiles.deletedAt)),
      })
    : null;
  if (sofia && brasa) {
    const kept = await db.query.applications.findFirst({
      where: and(
        eq(t.applications.eventId, lydia.id),
        eq(t.applications.userId, brasa.userId),
        eq(t.applications.kind, "provider"),
      ),
    });
    if (!kept) {
      await db.insert(t.applications).values({
        eventId: lydia.id,
        userId: brasa.userId,
        kind: "provider",
        providerProfileId: brasa.id,
        status: "accepted",
        rulesAcceptedAt: new Date(at),
        followStructure: false,
        decidedAt: new Date(at),
      });
    }
    const createdAt = new Date(at - 5 * HOUR);
    const added = await ensureSeedPost(
      seedPostId(`lydia:Sofia_66:${BRASA_POST_CAPTION}`),
      {
        authorId: brasa.userId,
        persona: "provider",
        providerId: brasa.id,
        eventId: lydia.id,
        eventRole: "on_site",
        caption: BRASA_POST_CAPTION,
        department: "66",
        createdAt,
        updatedAt: createdAt,
      },
      5,
    );
    if (added) made++;
  }

  // Kenji_66 « était au » un événement fini depuis moins de 30 jours, présence validée.
  const kenji = await activeSeedProfile("Kenji_66");
  if (kenji) {
    const recent = await db
      .select()
      .from(t.events)
      .where(
        and(
          eq(t.events.status, "published"),
          sql`${t.events.admission} <> 'invite_only'`,
          // Seulement un événement de la graine : jamais une présence fabriquée sur un événement réel.
          isSeedEvent("events"),
          lt(t.events.endsAt, new Date(at)),
          gt(t.events.endsAt, new Date(at - 30 * DAY)),
        ),
      )
      .orderBy(sql`${t.events.endsAt} desc`);
    const proven = new Set(
      (
        await db
          .select({ id: t.eventPresences.eventId })
          .from(t.eventPresences)
          .where(eq(t.eventPresences.userId, kenji.userId))
      ).map((r) => r.id),
    );
    const finished = recent.find((e) => proven.has(e.id)) ?? recent[0];
    if (finished) {
      const createdAt = new Date(at - 9 * HOUR);
      // Identifiant fixe dérivé du slug de l'événement de la graine : la publication ne se déplace pas d'un événement à l'autre avec le
      // temps, et aucun doublon auteur + légende sur un autre événement (ancienne base).
      const presentId = seedPostId(`present:Kenji_66:${finished.slug}:${KENJI_PRESENT_CAPTION}`);
      const elsewhere = await db.query.feedPosts.findFirst({
        where: and(eq(t.feedPosts.authorId, kenji.userId), eq(t.feedPosts.caption, KENJI_PRESENT_CAPTION)),
      });
      let added = false;
      if (!(elsewhere && elsewhere.id !== presentId)) {
        // Aucune présence sans publication : la présence n'est écrite qu'après le contrôle ci-dessus.
        if (!proven.has(finished.id)) {
          await db
            .insert(t.eventPresences)
            .values({
              eventId: finished.id,
              userId: kenji.userId,
              validatedAt: new Date(finished.endsAt.getTime() - HOUR),
            })
            .onConflictDoNothing();
        }
        added = await ensureSeedPost(
          presentId,
          {
            authorId: kenji.userId,
            persona: "fan",
            eventId: finished.id,
            eventRole: "attendee",
            caption: KENJI_PRESENT_CAPTION,
            department: "66",
            createdAt,
            updatedAt: createdAt,
          },
          7,
        );
      }
      if (added) made++;
    } else {
      console.log("Publications rattachées : aucun événement fini depuis moins de 30 jours pour Kenji_66.");
    }
  }
  console.log(
    `Publications rattachées : ${made} ajoutée(s) (Roues Libres 66, La Brasa, Kenji_66), les autres déjà présentes.`,
  );
}

// --- Collaboration : publications co-signées (vague R8, lot R8o) -------------------------------------------------------------
// Une publication de Kenji_66 co-signée et acceptée par Garage du Port (pro partenaire de Kenji : « Collaboration
// commerciale ») ; une invitation en attente adressée à Damien_66 ; une autre adressée à MéditeSportCar, la structure qu'il
// gère. Tant qu'elles attendent, rien ne les montre ailleurs que chez Kenji_66. Rejouable : rien si une ligne de
// co-auteur existe déjà.
export async function seedCoauthors() {
  const [already] = await db.select({ id: t.feedPostCoauthors.postId }).from(t.feedPostCoauthors).limit(1);
  if (already) {
    console.log("Collaboration : publications co-signées déjà présentes.");
    return;
  }
  const kenji = await byPseudo("Kenji_66");
  const damien = await byPseudo("Damien_66");
  const garage = await db.query.proProfiles.findFirst({ where: eq(t.proProfiles.slug, "garage-du-port") });
  const msc = await db.query.structures.findFirst({ where: eq(t.structures.slug, "meditesportcar") });
  if (!kenji || !damien || !garage || !msc) {
    console.log("Collaboration : Kenji_66, Damien_66, Garage du Port ou MéditeSportCar absents, rien ajouté.");
    return;
  }
  const at = Date.now();
  const plan = [
    {
      hoursAgo: 4,
      caption: "Révision terminée chez Garage du Port : merci à toute l'équipe.",
      photo: 9,
      coKind: "pro" as const,
      coId: garage.id,
      status: "accepted" as const,
      responder: garage.ownerUserId,
      commercial: garage.id,
    },
    {
      hoursAgo: 7,
      caption: "On s'est retrouvés au port avec Damien : la sortie du matin.",
      photo: 10,
      coKind: "user" as const,
      coId: damien.userId,
      status: "pending" as const,
      responder: null,
      commercial: null,
    },
    {
      hoursAgo: 11,
      caption: "Le plateau de samedi, avec toute l'équipe de MéditeSportCar.",
      photo: 11,
      coKind: "structure" as const,
      coId: msc.id,
      status: "pending" as const,
      responder: null,
      commercial: null,
    },
  ];
  let added = 0;
  for (const p of plan) {
    const id = randomUUID();
    const createdAt = new Date(at - p.hoursAgo * HOUR);
    await db.insert(t.feedPosts).values({
      id,
      authorId: kenji.userId,
      caption: p.caption,
      department: "66",
      createdAt,
      updatedAt: createdAt,
      commercialPartnerId: p.commercial,
    });
    if (!(await storeFeedPhoto(id, p.photo))) {
      await db.delete(t.feedPosts).where(eq(t.feedPosts.id, id));
      console.log("Collaboration : photos du seed absentes, rien ajouté.");
      return;
    }
    await db.insert(t.feedPostCoauthors).values({
      postId: id,
      coauthorKind: p.coKind,
      coauthorId: p.coId,
      status: p.status,
      invitedBy: kenji.userId,
      invitedAt: createdAt,
      respondedBy: p.responder,
      respondedAt: p.responder ? new Date(createdAt.getTime() + HOUR) : null,
    });
    added += 1;
  }
  console.log(`Collaboration : ${added} publications de Kenji_66 (une acceptée par Garage du Port, deux en attente).`);
}
