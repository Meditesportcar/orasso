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
import { eq, like, sql } from "drizzle-orm";
import sharp from "sharp";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { repoRoot } from "../../src/env";
import { storage } from "../../src/lib/storage";
import { feedPhotoKey } from "../../src/modules/feed/posts";
import { createAccount, HOUR } from "./helpers";
import { reviewedNoPlateCar } from "./photos";

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
  db.query.profiles.findFirst({ where: sql`lower(${t.profiles.pseudo}) = ${pseudo.toLowerCase()}` });

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
    const postId = randomUUID();
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
