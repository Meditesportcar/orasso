import type { Config } from "@react-router/dev/config";

export default {
  // Rendu serveur (référencement, aperçus de liens).
  ssr: true,
  // Derrière nginx, le serveur reçoit les requêtes en http alors que le navigateur envoie `Origin: https://…` :
  // la protection anti-CSRF des actions de React Router refusait alors tout formulaire (connexion comprise) en 400.
  // Les domaines d'Orasso sont donc déclarés ; toute autre origine reste refusée.
  allowedActionOrigins: ["dev.orasso.fr", "orasso.fr", "www.orasso.fr"],
} satisfies Config;
