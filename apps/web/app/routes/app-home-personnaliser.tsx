import { Button, Icon } from "@orasso/design-system/web";
import {
  addHomeWidget,
  HOME_FIXED_WIDGET,
  HOME_LINE_WIDGET,
  type HomeWidgetId,
  type HomeWidgetsConfig,
  homeWidgetIds,
  homeWidgetOffered,
  homePersonalizeLabels as L,
  moveVisibleHomeWidget,
  normalizeHomeWidgets,
  toggleHomeWidget,
  visibleHomeWidgets,
} from "@orasso/shared";
import { data, Form, redirect } from "react-router";

import { api, requireMe } from "../lib/api.server";
import type { Route } from "./+types/app-home-personnaliser";
import "../styles/home.css";
import "../styles/home-r7a2.css";

// « Personnaliser » l'Accueil (lot R7a2, maquette R7.5) : les mêmes blocs que dans l'appli, choisis, ordonnés, masqués. Chaque
// geste (Monter, Descendre, Masquer, Ajouter, Remettre par défaut) est un formulaire enregistré tout de suite sur le compte
// (`PUT /me/home/widgets`) : le même réglage sur le site et sur le téléphone, et tout marche sans JavaScript.
export function meta() {
  return [{ title: "Personnaliser l'accueil · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireMe(request);
  const res = await api<{ homeWidgets: unknown }>(request, "/me/settings");
  return { config: normalizeHomeWidgets(res.ok ? res.data.homeWidgets : null), failed: !res.ok };
}

export async function action({ request }: Route.ActionArgs) {
  await requireMe(request);
  const form = await request.formData();
  const op = String(form.get("op") ?? "");
  const id = String(form.get("id") ?? "") as HomeWidgetId;
  // Tour 3 : « Réinitialiser » = les défauts du compte, par l'API (réglage effacé, garage favori gardé s'il existe).
  if (op === "reset") {
    const res = await api(request, "/me/home/widgets", { method: "DELETE" });
    if (!res.ok) return data({ error: res.error.message }, { status: res.status });
    throw redirect("/app/accueil/personnaliser");
  }
  const cur = await api<{ homeWidgets: unknown }>(request, "/me/settings");
  if (!cur.ok) return data({ error: L.saveFailed }, { status: cur.status });
  const config: HomeWidgetsConfig = normalizeHomeWidgets(cur.data.homeWidgets);
  let next: HomeWidgetsConfig;
  if (!homeWidgetIds.includes(id)) return data({ error: L.saveFailed }, { status: 400 });
  else if (op === "up") next = moveVisibleHomeWidget(config, id, -1);
  else if (op === "down") next = moveVisibleHomeWidget(config, id, 1);
  else if (op === "add") next = addHomeWidget(config, id);
  else if (op === "hide") next = toggleHomeWidget(config, id);
  else return data({ error: L.saveFailed }, { status: 400 });
  const res = await api(request, "/me/home/widgets", { method: "PUT", json: next });
  if (!res.ok) return data({ error: res.error.message }, { status: res.status });
  throw redirect("/app/accueil/personnaliser");
}

function Op({
  op,
  id,
  label,
  icon,
  disabled,
}: {
  op: string;
  id?: HomeWidgetId;
  label: string;
  icon: "up" | "down" | "eye" | "add" | "undo";
  disabled?: boolean;
}) {
  return (
    <Form method="post">
      <input type="hidden" name="op" value={op} />
      {id && <input type="hidden" name="id" value={id} />}
      <Button type="submit" variant="plate" icon={icon} disabled={disabled} data-testid={id ? `${op}-${id}` : op}>
        {label}
      </Button>
    </Form>
  );
}

export default function AppHomePersonnaliser({ loaderData, actionData }: Route.ComponentProps) {
  const { config, failed } = loaderData;
  const shown = visibleHomeWidgets(config).filter((id) => homeWidgetOffered(id));
  const hidden = config.hidden.filter((id) => homeWidgetOffered(id));
  const error = actionData?.error ?? null;
  return (
    <div className="s-stack">
      <h1 className="s-title">{L.title}</h1>
      <p className="s-muted">
        {L.subtitle}. {L.hint} {L.hintEye}
      </p>
      {error && (
        <p className="s-error" role="alert">
          {error}
        </p>
      )}
      {/* Tour 3 : réglage non chargé = aucun geste (comme dans l'appli), jamais les valeurs par défaut présentées comme les siennes. */}
      {failed ? (
        <div className="hm-actions" data-testid="personalize-load-failed">
          <p className="s-error" role="alert">
            {L.loadFailed}
          </p>
          <Button variant="plate" icon="undo" href="/app/accueil/personnaliser" data-testid="personalize-retry">
            {L.retry}
          </Button>
        </div>
      ) : (
        <>
          <ul className="hm-perso" data-testid="personalize-list">
            {shown.map((id) => {
              const fixed = id === HOME_FIXED_WIDGET;
              // « Météo de l'événement » est une ligne de la carte : l'œil seul, aucun bloc ne s'échange avec elle.
              const line = id === HOME_LINE_WIDGET;
              return (
                <li key={id} className="hm-perso__item" data-testid={`personalize-row-${id}`}>
                  <span className="hm-perso__text">
                    <strong>{L.widgets[id].title}</strong>
                    <span className="o-t-caption hm-block__muted">{fixed ? L.fixedHint : L.widgets[id].hint}</span>
                  </span>
                  {fixed ? (
                    <Icon name="lock" size={18} />
                  ) : (
                    <span className="hm-reorder__actions">
                      {line ? null : (
                        <>
                          <Op
                            op="up"
                            id={id}
                            label={L.moveUp}
                            icon="up"
                            disabled={moveVisibleHomeWidget(config, id, -1) === config}
                          />
                          <Op
                            op="down"
                            id={id}
                            label={L.moveDown}
                            icon="down"
                            disabled={moveVisibleHomeWidget(config, id, 1) === config}
                          />
                        </>
                      )}
                      <Op op="hide" id={id} label={L.hide} icon="eye" />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <h2 className="o-t-label hm-block__muted">{L.hiddenTitle}</h2>
          <ul className="hm-perso" data-testid="personalize-hidden">
            {hidden.length === 0 && <li className="s-muted">{L.hiddenEmpty}</li>}
            {hidden.map((id) => (
              <li key={id} className="hm-perso__item" data-testid={`personalize-row-${id}`}>
                <span className="hm-perso__text">
                  <strong>{L.widgets[id].title}</strong>
                  <span className="o-t-caption hm-block__muted">{L.widgets[id].hint}</span>
                </span>
                <Op op="add" id={id} label={L.add} icon="add" />
              </li>
            ))}
            <li className="hm-perso__item hm-perso__item--soon" data-testid="personalize-soon" aria-disabled="true">
              <span className="hm-perso__text">
                <strong>{L.soonTitle}</strong>
                <span className="o-t-caption hm-block__muted">{L.soonHint}</span>
              </span>
              <span className="o-t-label">{L.soon}</span>
            </li>
          </ul>
        </>
      )}
      <div className="hm-actions">
        {!failed && <Op op="reset" label={L.reset} icon="undo" />}
        <Button variant="primary" icon="check" href="/app" data-testid="personalize-done">
          {L.save}
        </Button>
      </div>
    </div>
  );
}
