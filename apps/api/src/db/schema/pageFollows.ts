// Abonnements d'une casquette (lot R9a, ARCHITECTURE-R8 § 1.7, migration `persona-follows`). Sert à deux choses :
// (a) tout abonnement dont le **suiveur est une page** (structure, fiche pro, prestataire, média) ;
// (b) une **personne** qui suit un prestataire ou un média.
// Les trois tables existantes (`user_follows`, `structure_follows`, `pro_follows`) ne changent pas : une personne qui suit
// une personne, une structure ou un pro y reste (la base l'impose par `page_follows_user_target_check` : jamais deux
// vérités). `follower_id` et `target_id` sont des identifiants de compte (genre `user`) ou de page (UUID en minuscules) ;
// aucune clé étrangère (les lignes d'une page ou d'un compte disparu sont ignorées à la lecture et nettoyées à la
// suppression du compte).
import { authorKinds } from "@orasso/shared";
import { sql } from "drizzle-orm";
import { check, index, pgEnum, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

import { tstz } from "./common";

export const pageFollowKindEnum = pgEnum("page_follow_kind", authorKinds);

export const pageFollows = pgTable(
  "page_follows",
  {
    followerKind: pageFollowKindEnum("follower_kind").notNull(),
    followerId: text("follower_id").notNull(),
    targetKind: pageFollowKindEnum("target_kind").notNull(),
    targetId: text("target_id").notNull(),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({
      name: "page_follows_pkey",
      columns: [t.followerKind, t.followerId, t.targetKind, t.targetId],
    }),
    index("page_follows_target_idx").on(t.targetKind, t.targetId),
    check(
      "page_follows_not_self_check",
      sql`not (${t.followerKind} = ${t.targetKind} and ${t.followerId} = ${t.targetId})`,
    ),
    // Une personne qui suit une personne, une structure ou un pro reste dans les trois tables d'origine.
    check(
      "page_follows_user_target_check",
      sql`${t.followerKind} <> 'user' or ${t.targetKind} in ('provider', 'media')`,
    ),
  ],
);
