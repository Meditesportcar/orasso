import { Button } from "@orasso/design-system/web";
import { unsubscribeTexts } from "@orasso/shared";
import { data, Form } from "react-router";

import { api } from "../lib/api.server";
import type { Route } from "./+types/desinscription";

// Désinscription de la newsletter (lot 33) : lien signé de l'e-mail, sans connexion. Ouvrir la page ne change rien (les
// aperçus de liens des messageries l'ouvrent aussi) ; le bouton désinscrit. Le POST direct de l'en-tête
// `List-Unsubscribe-Post` (désinscription en un clic des messageries) passe par la même action.
export function meta() {
  return [{ title: "Newsletter · Orasso" }, { name: "robots", content: "noindex, nofollow" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const res = await api<{ valid: boolean; subscribed: boolean }>(
    request,
    `/desinscription/${encodeURIComponent(params.token)}`,
  );
  return data(res.ok ? res.data : { valid: false, subscribed: false });
}

export async function action({ request, params }: Route.ActionArgs) {
  const res = await api(request, `/desinscription/${encodeURIComponent(params.token)}`, { method: "POST" });
  return data({ done: res.ok }, { status: res.ok ? 200 : 404 });
}

export default function Unsubscribe({ loaderData, actionData }: Route.ComponentProps) {
  const done = actionData?.done || (loaderData.valid && !loaderData.subscribed);
  return (
    <div className="s-narrow s-stack">
      <h1 className="s-title">{unsubscribeTexts.title}</h1>
      {!loaderData.valid || actionData?.done === false ? (
        <p className="s-notice s-notice--alert" data-testid="unsubscribe-invalid">
          {unsubscribeTexts.invalid}
        </p>
      ) : done ? (
        <p className="s-notice s-notice--ok" role="status" data-testid="unsubscribe-done">
          {unsubscribeTexts.done}
        </p>
      ) : (
        <Form method="post" className="s-stack">
          <p>{unsubscribeTexts.ask}</p>
          <Button type="submit" icon="close">
            {unsubscribeTexts.confirm}
          </Button>
        </Form>
      )}
    </div>
  );
}
