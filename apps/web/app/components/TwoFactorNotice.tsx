import { Form } from "react-router";

// Rappel de la double authentification obligatoire (organisateurs, administration). La session doit la prouver
// (lot 15) : connexion avec le code de l'application d'authentification, ou par une clé d'accès. Un facteur enregistré
// sur le compte ne suffit pas après une connexion qui ne l'a pas utilisé.
export function TwoFactorNotice({
  hint,
  space,
}: {
  hint: "setup" | "passkey_sign_in" | "totp_sign_in" | null;
  space: "l'espace organisateur" | "l'administration";
}) {
  if (!hint) return null;
  if (hint === "passkey_sign_in" || hint === "totp_sign_in") {
    return (
      <Form method="post" action="/deconnexion" className="s-notice s-notice--alert" data-testid="two-factor-notice">
        <input type="hidden" name="retour" value="/connexion" />
        La double authentification est obligatoire pour {space}, et cette session ne l'a pas prouvée :{" "}
        <button type="submit" className="s-linkbutton">
          {hint === "passkey_sign_in" ? "reconnecte-toi avec ta clé d'accès" : "reconnecte-toi avec ton code"}
        </button>
        .
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
