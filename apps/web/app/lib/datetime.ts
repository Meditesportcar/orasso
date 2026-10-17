// Champs « date et heure » des formulaires : le navigateur donne « 2026-07-05T18:00 » sans fuseau, l'API attend un
// instant ISO. Les dates sont toujours saisies et affichées à l'heure de Paris (fuseau métier unique en V1). Lot 35b :
// les conversions vivent dans `@orasso/shared` (modèle de l'assistant d'événement, commun au site et à l'appli).
export { fromWallInput as fromInput, toWallInput as toInput } from "@orasso/shared";
