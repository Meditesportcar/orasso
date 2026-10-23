/**
 * Fonctions de recette (injection d'un scan sans caméra, maintien du scan) : actives en développement (Metro) et dans
 * la version web compilée pour les recettes (`scripts/appli-compilee.mjs` pose `EXPO_PUBLIC_RECETTE=1`). Aucun profil EAS
 * ne pose cette variable : l'APK reste sans ces fonctions.
 */
export const RECETTE: boolean = __DEV__ || process.env.EXPO_PUBLIC_RECETTE === "1";
