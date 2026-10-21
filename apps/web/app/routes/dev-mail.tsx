// Aperçu des e-mails (lot 56) : `/_mail`, développement seulement (404 en production, comme `/_ds`). Chaque type d'envoi
// est rendu par l'API (`GET /dev/mail`) avec le gabarit commun ; rien n'est envoyé.
import { api } from "../lib/api.server";
import type { Route } from "./+types/dev-mail";

type Sample = { id: string; label: string; subject: string; html: string };

export async function loader({ request }: Route.LoaderArgs) {
  if (process.env.NODE_ENV === "production") throw new Response("Introuvable", { status: 404 });
  const res = await api<{ items: Sample[] }>(request, "/dev/mail");
  if (!res.ok) throw new Response("Aperçu indisponible", { status: res.status });
  return { items: res.data.items };
}

export function meta() {
  return [{ title: "Aperçu des e-mails · Orasso" }, { name: "robots", content: "noindex" }];
}

export default function DevMail({ loaderData }: Route.ComponentProps) {
  return (
    <div className="s-main s-stack" data-testid="mail-preview">
      <h1 className="s-title">E-mails</h1>
      {loaderData.items.map((item) => (
        <section key={item.id} className="s-stack s-stack--tight" data-testid="mail-sample">
          <h2 className="s-h2">{item.label}</h2>
          <p className="o-t-caption">{item.subject}</p>
          <iframe title={item.label} srcDoc={item.html} className="dev-mail__frame" sandbox="" />
        </section>
      ))}
    </div>
  );
}
