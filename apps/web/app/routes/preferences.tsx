import { Button, CheckboxField } from "@orasso/design-system/web";
import {
  clampPreferenceRadius,
  eventFormatLabels,
  eventFormats,
  preferencesLabels as L,
  newEventsCaption,
  PREFERENCE_RADIUS,
  type Preferences,
  preferenceNotificationLabels,
  preferenceNotifications,
  travelTimeLabel,
} from "@orasso/shared";
import { useState } from "react";
import { data, Form, redirect, useNavigation } from "react-router";

import { DepartmentsField } from "../components/ArriveeFields";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import { parsePreferencesForm } from "../lib/preferences";
import type { Route } from "./+types/preferences";

// « Tes préférences » sur le site (lot M6, comme l'appli) : types d'événements, distance autour de soi, départements,
// les trois interrupteurs « Te prévenir ». Un formulaire posté : marche sans JavaScript.
export function meta() {
  return [{ title: `${L.title} · Orasso` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireMe(request);
  const preferences = await apiOrThrow<Preferences>(request, "/me/preferences");
  return { preferences, saved: new URL(request.url).searchParams.get("fait") === "1" };
}

export async function action({ request }: Route.ActionArgs) {
  const parsed = parsePreferencesForm(await request.formData());
  if (!parsed.ok) return data({ error: parsed.error }, { status: 400 });
  const res = await api(request, "/me/preferences", { method: "PATCH", json: parsed.update });
  if (!res.ok) return data({ error: res.error.message }, { status: res.status });
  return redirect("/app/preferences?fait=1");
}

export default function PreferencesPage({ loaderData, actionData }: Route.ComponentProps) {
  const { preferences, saved } = loaderData;
  const busy = useNavigation().state !== "idle";
  // La vraie distance du compte (jusqu'à 300 km) : le curseur s'arrête à 200 mais l'écran dit la vérité ; elle n'est
  // renvoyée que si le curseur bouge (`radiusInitial`, voir `parsePreferencesForm`).
  const [radius, setRadius] = useState(preferences.radiusKm);
  return (
    <div className="s-narrow s-stack" data-testid="preferences">
      <h1 className="s-title">{L.title}</h1>
      <p className="o-t-caption s-muted">{L.editFacts}</p>
      {saved ? (
        <p className="s-notice s-notice--ok" role="status" data-testid="preferences-saved">
          {L.saved}
        </p>
      ) : null}
      <Form method="post" className="s-form">
        <section className="s-section s-section--first" aria-labelledby="pref-titre">
          <h2 id="pref-titre" className="s-h2">
            {L.heading}
          </h2>
          <p className="s-muted">{L.lead}</p>
        </section>

        <fieldset className="s-fieldset">
          <legend className="s-label o-t-label">{L.types}</legend>
          <div className="s-checklist" data-testid="pref-formats">
            {eventFormats.map((f) => (
              <CheckboxField
                key={f}
                name="eventFormat"
                value={f}
                label={eventFormatLabels[f]}
                defaultChecked={preferences.eventFormats.includes(f)}
              />
            ))}
          </div>
        </fieldset>

        <label className="o-field">
          <span className="o-field__label o-t-label">{L.distance}</span>
          <span className="pref-radius" data-testid="pref-radius">
            <b className="o-t-number-narrow pref-radius__km">{`${radius}`}</b>
            <span className="o-t-body"> km</span>
            <span className="o-t-caption s-muted pref-radius__time">{travelTimeLabel(radius)}</span>
          </span>
          <input type="hidden" name="radiusInitial" value={preferences.radiusKm} />
          <input
            type="range"
            className="s-range"
            name="radiusKm"
            min={PREFERENCE_RADIUS.min}
            max={PREFERENCE_RADIUS.max}
            step={PREFERENCE_RADIUS.step}
            value={clampPreferenceRadius(radius)}
            onChange={(e) => setRadius(Number(e.currentTarget.value))}
          />
        </label>

        <fieldset className="s-fieldset">
          <legend className="s-label o-t-label">{L.departments}</legend>
          <DepartmentsField initial={preferences.departments} />
        </fieldset>

        <fieldset className="s-fieldset">
          <legend className="s-label o-t-label">{L.notify}</legend>
          <div className="s-stack s-stack--tight">
            {preferenceNotifications.map((k) => {
              const label = preferenceNotificationLabels[k];
              return (
                <CheckboxField
                  key={k}
                  name={`notify_${k}`}
                  data-testid={`pref-notify-${k}`}
                  defaultChecked={preferences.notifications[k]}
                  label={
                    <>
                      <strong>{label.title}</strong>
                      <span className="o-t-caption s-muted pref-caption">
                        {k === "newEvents" ? newEventsCaption(radius) : label.caption}
                      </span>
                    </>
                  }
                />
              );
            })}
          </div>
        </fieldset>

        {actionData?.error ? (
          <p className="s-error" role="alert">
            {actionData.error}
          </p>
        ) : null}
        <Button type="submit" icon="check" loading={busy} data-testid="preferences-submit">
          {L.save}
        </Button>
      </Form>
    </div>
  );
}
