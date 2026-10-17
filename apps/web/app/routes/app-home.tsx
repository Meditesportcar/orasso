import { Button, Counters, Plate, PosterCard } from "@orasso/design-system/web";
import {
  defaultHomeWidgets,
  gradeLabels,
  type HomeData,
  type HomeWidgetId,
  type HomeWidgetsConfig,
  homeLabels,
  homeWidgetIds,
  homeWidgetTitles,
  moveHomeWidget,
  normalizeHomeWidgets,
  toggleHomeWidget,
  visibleHomeWidgets,
} from "@orasso/shared";
import type { ReactNode } from "react";
import { data, Form } from "react-router";

import {
  AgendaBlock,
  GarageBlock,
  NearbyBlock,
  NudgeBlock,
  PendingBlock,
  PlacesBlock,
  SponsoredBlock,
  WeatherBlock,
} from "../components/HomeWidgets";
import { api, requireMe } from "../lib/api.server";
import { formatDay, formatTime } from "../lib/format";
import type { Route } from "./+types/app-home";
import "../styles/home.css";

// Accueil du compte (docs/02, lot 30) : « Prochain accès » en tête, puis les blocs réglables dans l'ordre choisi (mêmes
// que dans l'appli), un emplacement sponsorisé et une seule incitation. Rayon, position et réglages sont dans l'adresse
// de la page ou dans des formulaires : tout marche sans JavaScript, sauf le curseur qui s'envoie au relâchement.
export function meta() {
  return [{ title: "Accueil · Orasso" }, { name: "robots", content: "noindex" }];
}

const num = (v: string | null): number | undefined => {
  if (v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export async function loader({ request }: Route.LoaderArgs) {
  const me = await requireMe(request);
  const url = new URL(request.url);
  const rayon = num(url.searchParams.get("rayon"));
  const lat = num(url.searchParams.get("lat"));
  const lng = num(url.searchParams.get("lng"));
  const params = new URLSearchParams();
  if (rayon !== undefined && rayon >= 10 && rayon <= 300) params.set("radiusKm", String(Math.round(rayon)));
  if (lat !== undefined && lng !== undefined) {
    params.set("lat", String(lat));
    params.set("lng", String(lng));
  }
  const res = await api<HomeData>(request, `/me/home${params.size ? `?${params}` : ""}`);
  return {
    pseudo: me.profile.pseudo,
    grade: me.profile.grade,
    points: me.profile.pointsSeason,
    onDevice: params.has("lat"),
    home: res.ok ? res.data : null,
    failed: !res.ok,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  let current: HomeWidgetsConfig = defaultHomeWidgets;
  try {
    current = normalizeHomeWidgets(JSON.parse(String(form.get("config") ?? "null")));
  } catch {
    // Réglage illisible : on repart de l'ordre par défaut.
  }
  const id = String(form.get("id") ?? "") as HomeWidgetId;
  if (!homeWidgetIds.includes(id)) return data({ error: homeLabels.saveFailed }, { status: 400 });
  const op = String(form.get("op") ?? "");
  const next =
    op === "up"
      ? moveHomeWidget(current, id, -1)
      : op === "down"
        ? moveHomeWidget(current, id, 1)
        : toggleHomeWidget(current, id);
  const res = await api(request, "/me/home/widgets", { method: "PUT", json: next });
  if (!res.ok) return data({ error: res.error.message }, { status: res.status });
  return data({ error: null });
}

export default function AppHome({ loaderData, actionData }: Route.ComponentProps) {
  const { pseudo, grade, points, onDevice, home, failed } = loaderData;
  const widgets = home?.widgets ?? defaultHomeWidgets;
  const next = home?.nextAccess ?? null;
  const nudge = home?.nudge ?? null;
  const nudgeLeads = !next && nudge === "add_vehicle";

  const blocks: Record<string, ReactNode> = home
    ? {
        pending: <PendingBlock items={home.pendingStatuses} />,
        nearby: home.nearby ? <NearbyBlock nearby={home.nearby} onDevice={onDevice} /> : null,
        weather: <WeatherBlock weather={home.weather} />,
        agenda: <AgendaBlock items={home.agenda} />,
        favorite_garage: <GarageBlock garage={home.favoriteGarage} />,
        wash: <PlacesBlock kind="wash" places={home.wash} />,
        fuel: <PlacesBlock kind="fuel" places={home.fuel} />,
      }
    : {};

  return (
    <div className="s-stack">
      <h1 className="s-title">Salut {pseudo}</h1>

      {failed && (
        <p className="s-notice" role="status">
          {homeLabels.loadFailed}
        </p>
      )}

      {next ? (
        <PosterCard
          label={`${homeLabels.nextAccess} · ${formatDay(next.event.startsAt)}`}
          title={next.event.title}
          facts={`${formatTime(next.event.startsAt)}${next.zone ? ` · Zone ${next.zone.code}` : ""}`}
          status={next.status === "accepted" ? "retained" : "pending"}
          action={
            next.status === "accepted"
              ? { label: "Voir mon accès", icon: "qr", next: true, href: "/app/acces" }
              : { label: homeLabels.seeAccess, icon: "wait", next: true, href: "/app/acces" }
          }
          data-testid="next-access"
        />
      ) : nudgeLeads && nudge ? (
        <NudgeBlock kind={nudge} primary />
      ) : (
        <Plate className="hm-block" data-testid="home-lead">
          <strong className="o-t-poster-m">Trouve ton prochain événement</strong>
          <p className="hm-block__muted">
            Rassemblements, expositions, cars & coffee : candidate avec l'un de tes véhicules.
          </p>
          <div>
            <Button variant="primary" icon="explore" href="/app/explorer">
              {homeLabels.explore}
            </Button>
          </div>
        </Plate>
      )}

      <Counters
        variant="plate"
        items={[
          { value: home?.counts.pending ?? 0, label: "En attente" },
          { value: home?.counts.retained ?? 0, label: "Retenues" },
          { value: points, label: `Pts · ${gradeLabels[grade]}` },
        ]}
      />

      {nudge && !nudgeLeads && <NudgeBlock kind={nudge} primary={false} />}

      {home && (
        <div className="hm-grid">
          {visibleHomeWidgets(widgets)
            .filter((id) => id !== "next_access")
            .map((id) => (
              <div key={id}>{blocks[id] ?? null}</div>
            ))}
          {home.sponsored && (
            <div>
              <SponsoredBlock sponsored={home.sponsored} />
            </div>
          )}
        </div>
      )}

      {home && <Reorder widgets={widgets} error={actionData?.error ?? null} />}
    </div>
  );
}

/** Réorganiser (par boutons, sans glisser-déposer) : monter, descendre, masquer ; chaque geste est enregistré. */
function Reorder({ widgets, error }: { widgets: HomeWidgetsConfig; error: string | null }) {
  const config = JSON.stringify(widgets);
  return (
    <details className="hm-reorder" data-testid="reorder">
      <summary className="o-t-button">{homeLabels.reorder}</summary>
      <p className="s-muted">{homeLabels.reorderHint}</p>
      {error && (
        <p className="s-error" role="alert">
          {error}
        </p>
      )}
      <ul className="hm-reorder" style={{ listStyle: "none", padding: 0 }}>
        {widgets.order.map((id, i) => {
          const hidden = widgets.hidden.includes(id);
          const fixed = id === "next_access";
          return (
            <li key={id} className="hm-reorder__item" data-testid={`reorder-${id}`}>
              <strong>
                {homeWidgetTitles[id]}
                {hidden ? ` · ${homeLabels.hiddenTag}` : ""}
              </strong>
              {!fixed && (
                <div className="hm-reorder__actions">
                  <Form method="post">
                    <input type="hidden" name="config" value={config} />
                    <input type="hidden" name="id" value={id} />
                    <input type="hidden" name="op" value="up" />
                    <Button type="submit" variant="plate" icon="up" disabled={i <= 1} data-testid={`up-${id}`}>
                      {homeLabels.moveUp}
                    </Button>
                  </Form>
                  <Form method="post">
                    <input type="hidden" name="config" value={config} />
                    <input type="hidden" name="id" value={id} />
                    <input type="hidden" name="op" value="down" />
                    <Button
                      type="submit"
                      variant="plate"
                      icon="down"
                      disabled={i === widgets.order.length - 1}
                      data-testid={`down-${id}`}
                    >
                      {homeLabels.moveDown}
                    </Button>
                  </Form>
                  <Form method="post">
                    <input type="hidden" name="config" value={config} />
                    <input type="hidden" name="id" value={id} />
                    <input type="hidden" name="op" value="toggle" />
                    <Button type="submit" variant="plate" icon={hidden ? "eye" : "eyeOff"} data-testid={`toggle-${id}`}>
                      {hidden ? homeLabels.show : homeLabels.hide}
                    </Button>
                  </Form>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
