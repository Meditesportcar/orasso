// Android App Links (lot 36) : `/.well-known/assetlinks.json` déclare que l'appli Orasso (`fr.orasso.app`) peut ouvrir
// les liens de ce site (vérification de l'e-mail, pages d'événement) ; Android le lit à l'installation (`autoVerify` des
// `intentFilters` de `apps/mobile/app.json`). L'empreinte est celle du certificat de signature EAS de l'appli, lue dans
// l'APK de référence (bloc de signature v2, SHA-256) ; ce n'est pas un secret. `ANDROID_CERT_SHA256` (empreintes
// séparées par des virgules) la remplace sans redéployer le code, par exemple pour ajouter la clé de Google Play.
// Le fichier doit être servi en HTTPS, sans redirection ni mot de passe (nginx : `location /.well-known/`).
import type { Route } from "./+types/assetlinks";

/** Certificat de signature EAS de `fr.orasso.app` (APK de référence `f9d6b6b`, 18/10/2026). */
export const ANDROID_CERT_SHA256 =
  "65:05:62:39:49:EE:3D:0A:E9:B0:E9:36:83:54:2F:7B:9D:FC:A4:4B:43:CC:C2:FD:0A:36:D6:6D:B4:FA:FD:EA";

export function loader(_: Route.LoaderArgs) {
  const fingerprints = (process.env.ANDROID_CERT_SHA256 || ANDROID_CERT_SHA256)
    .split(",")
    .map((f) => f.trim().toUpperCase())
    .filter(Boolean);
  const body = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: "fr.orasso.app", sha256_cert_fingerprints: fingerprints },
    },
  ];
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" },
  });
}
