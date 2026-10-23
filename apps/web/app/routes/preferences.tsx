import { Button, CheckboxField } from "@orasso/design-system/web";
import {
  type Category,
  clampPreferenceRadius,
  eventFormatLabels,
  eventFormats,
  preferencesLabels as L,
  newEventsCaption,
  PREFERENCE_RADIUS,
  type Preferences,
  preferenceNewEventsLabel,
  travelTimeLabel,
} from "@orasso/shared";
import { useState } from "react";
import { data, Form, redirect, useNavigation } from "react-router";

import { DepartmentsField } from "../components/ArriveeFields";
import { FicheBar, ficheHandle } from "../components/FicheBar";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import { parsePreferencesForm, radiusInitialValue } from "../lib/preferences";
import type { Route } from "./+types/preferences";

// « Tes préférences » sur le site (lot M6, comme l'appli, la seule page de ce qu'on veut voir) : ton coin
// (départements), la distance habituelle (ou « Partout en France »), les types d'événements, les centres d'intérêt, un
// seul interrupteur « Me prévenir des nouveaux événements dans mon coin ». Un formulaire posté : marche sans JavaScript.
// Lot M7 : mode B (en-tête de fiche, ✕ vers Mon compte, d'où l'on vient).
export const handle = ficheHandle;

export function meta() {
  return [{ title: `${L.title} · Orasso` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireMe(request);
  const [preferences, categories] = await Promise.all([
    apiOrThrow<Preferences>(request, "/me/preferences"),
    apiOrThrow<Category[]>(request, "/vehicle-reference/categories"),
  ]);
  return { preferences, categories, saved: new URL(request.url).searchParams.get("fait") === "1" };
}

export async function action({ request }: Route.ActionArgs) {
  const parsed = parsePreferencesForm(await request.formData());
  if (!parsed.ok) return data({ error: parsed.error }, { status: 400 });
  const res = await api(request, "/me/preferences", { method: "PATCH", json: parsed.update });
  if (!res.ok) return data({ error: res.error.message }, { status: res.status });
  return redirect("/app/preferences?fait=1");
}

export default function PreferencesPage({ loaderData, actionData }: Route.ComponentProps) {
  const { preferences, categories, saved } = loaderData;
  const busy = useNavigation().state !== "idle";
  // La distance n'est renvoyée que si elle change (`radiusInitial`, voir `parsePreferencesForm`) ; « Partout en
  // France » grise le curseur (sans JavaScript, il reste réglable et la case décide).
  const [radius, setRadius] = useState(clampPreferenceRadius(preferences.radiusKm));
  const [everywhere, setEverywhere] = useState(preferences.radiusKm === null);
  return (
    <>
      <FicheBar title={L.title} facts={L.editFacts} back="/app/moi" />
      <div className="s-narrow s-stack" data-testid="preferences">
        {preferences.departments.length === 0 ? (
          <p className="s-notice" data-testid="preferences-no-coin">
            {L.noCoinAlerts}
          </p>
        ) : null}
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
            <legend className="s-label o-t-label">{L.departments}</legend>
            <DepartmentsField initial={preferences.departments} />
          </fieldset>

          <div className="o-field">
            <label htmlFor="pref-radius-range" className="o-field__label o-t-label">
              {L.distance}
            </label>
            <span className="pref-radius" data-testid="pref-radius">
              {everywhere ? (
                <b className="o-t-number-narrow pref-radius__km">{L.everywhereShort}</b>
              ) : (
                <>
                  <b className="o-t-number-narrow pref-radius__km">{`${radius}`}</b>
                  <span className="o-t-body"> km</span>
                  <span className="o-t-caption s-muted pref-radius__time">{travelTimeLabel(radius)}</span>
                </>
              )}
            </span>
            <input type="hidden" name="radiusInitial" value={radiusInitialValue(preferences.radiusKm)} />
            <input
              id="pref-radius-range"
              type="range"
              className="s-range"
              name="radiusKm"
              min={PREFERENCE_RADIUS.min}
              max={PREFERENCE_RADIUS.max}
              step={PREFERENCE_RADIUS.step}
              value={radius}
              disabled={everywhere}
              onChange={(e) => setRadius(Number(e.currentTarget.value))}
            />
            <CheckboxField
              name="everywhere"
              data-testid="pref-everywhere"
              label={L.everywhere}
              defaultChecked={preferences.radiusKm === null}
              onChange={(e) => setEverywhere(e.currentTarget.checked)}
            />
          </div>

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

          <fieldset className="s-fieldset">
            <legend className="s-label o-t-label">{L.interests}</legend>
            <div className="s-checklist" data-testid="pref-interests">
              {categories.map((c) => (
                <CheckboxField
                  key={c.id}
                  name="interest"
                  value={c.id}
                  label={c.label}
                  defaultChecked={preferences.interests.includes(c.id)}
                />
              ))}
            </div>
          </fieldset>

          <fieldset className="s-fieldset">
            <legend className="s-label o-t-label">{L.notify}</legend>
            <CheckboxField
              name="notify_newEvents"
              data-testid="pref-notify-newEvents"
              defaultChecked={preferences.newEvents}
              label={
                <>
                  <strong>{preferenceNewEventsLabel.title}</strong>
                  <span className="o-t-caption s-muted pref-caption">
                    {newEventsCaption(everywhere ? null : radius)}
                  </span>
                </>
              }
            />
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
    </>
  );
}
