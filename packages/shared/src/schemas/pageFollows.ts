// Abonnements d'une casquette (lot R9a, ARCHITECTURE-R8 § 1.7 et § 2.9) : l'acteur d'une lecture ou d'une écriture
// sociale, et la forme des réponses. Le contrat : l'en-tête `X-Orasso-Actor: <clé d'auteur>` (absent, vide ou `u:<moi>` =
// moi), vérifié par l'API (`lib/actor.ts`) ; les routes `PUT|DELETE /me/page-follows/:targetKey`.

/** Nom de l'en-tête de l'acteur (en minuscules : c'est la forme que lit l'API et que déclare CORS). */
export const ACTOR_HEADER = "x-orasso-actor";

/** Réponse de `PUT|DELETE /me/page-follows/:targetKey` : l'état après l'écriture et le nombre d'abonnés de la cible. */
export type PageFollowResult = { following: boolean; followersCount: number };

/** L'état d'abonnement d'une page vue d'un membre : abonnés (personnes et pages) et « je suis » pour l'acteur. */
export type PageFollowState = { followersCount: number; isFollowing: boolean };
