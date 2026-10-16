import { Button } from "@orasso/design-system/web";
import { data } from "react-router";

import { api, withCookies } from "../lib/api.server";
import type { Route } from "./+types/verification-email";

// Lien de vérification de l'e-mail (lot 15, S1 : non bloquante). L'API confirme l'adresse et ouvre une session
// (connexion automatique) ; le parrainage éventuel est crédité à ce moment-là.
export function meta() {
  return [{ title: "Adresse confirmée · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!token) return data({ ok: false });
  const res = await api(request, `/auth/verify-email?token=${encodeURIComponent(token)}`);
  if (!res.ok) return data({ ok: false });
  return data({ ok: true }, { headers: withCookies(res.headers) });
}

export default function VerificationEmail({ loaderData }: Route.ComponentProps) {
  return (
    <div className="s-narrow s-stack">
      {loaderData.ok ? (
        <>
          <h1 className="s-title">Adresse confirmée</h1>
          <p className="s-notice s-notice--ok" data-testid="email-verified" role="status">
            Merci : ton adresse e-mail est confirmée.
          </p>
          <Button href="/app" icon="home">
            Aller sur mon compte
          </Button>
        </>
      ) : (
        <>
          <h1 className="s-title">Lien expiré</h1>
          <p className="s-notice s-notice--alert">
            Ce lien n'est plus valable. Connecte-toi : tu pourras demander un nouvel e-mail depuis ton compte.
          </p>
          <Button href="/app/moi" icon="profile">
            Mon compte
          </Button>
        </>
      )}
    </div>
  );
}
