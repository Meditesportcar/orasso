import { Form } from "react-router";

// Rappel de la double authentification obligatoire (organisateurs, administration). La session doit la prouver
// (lot 15) : TOTP activé, ou connexion par clé d'accès — une clé enregistrée ne suffit pas après un mot de passe.
export function TwoFactorNotice({
  hint,
  space,
}: {
  hint: "setup" | "passkey_sign_in" | null;
  space: "l'espace organisateur" | "l'administration";
}) {
  if (!hint) return null;
  if (hint === "passkey_sign_in") {
    return (
      <Form method="post" action="/deconnexion" className="s-notice s-notice--alert" data-testid="two-factor-notice">
        <input type="hidden" name="retour" value="/connexion" />
        La double authentification est obligatoire pour {space}. Tu t'es connecté par mot de passe :{" "}
        <button type="submit" className="s-linkbutton">
          reconnecte-toi avec ta clé d'accès
        </button>
        , ou active l'application d'authentification sur <a href="/app/securite">Sécurité</a>.
      </Form>
    );
  }
  return (
    <p className="s-notice s-notice--alert" data-testid="two-factor-notice">
      La double authentification est obligatoire pour {space}. <a href="/app/securite">Active-la maintenant</a> :
      application d'authentification, ou clé d'accès puis connexion avec cette clé.
    </p>
  );
}
