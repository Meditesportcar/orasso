// Administration (lot 33) : réglages de la plateforme. Interrupteurs (inscriptions, sponsorisés, prestataires,
// billetterie), points et grades (avertissement : modifie les futurs calculs), listes proposées (motifs de refus, types de
// prestataires, activités des pros), modèles de messages d'Orasso. Chaque enregistrement est validé par son schéma
// partagé côté API et écrit au journal (`settings.update`).
import { Button, CheckboxField, SelectField, TextField } from "@orasso/design-system/web";
import {
  type AdminSettingEntry,
  type AdminSettingKey,
  adminListCodes,
  adminSettingGroups,
  adminSettingLabels,
  adminTexts,
  type Grade,
  gradeLabels,
  grades,
  type PlatformSettingKey,
  type PlatformSettings,
  platformSettingKeys,
  platformSettingLabels,
  proActivityLabels,
  refusalReasonLabels,
  type TemplateView,
  templateKindLabels,
  templateKinds,
  vendorTypeLabels,
} from "@orasso/shared";
import { data, Form, redirect, useNavigation } from "react-router";

import { TextAreaField } from "../../components/Fields";
import { requireSuperAdmin } from "../../lib/admin.server";
import { api, apiOrThrow } from "../../lib/api.server";
import { formatDateTime } from "../../lib/format";
import type { Route } from "./+types/reglages";

export function meta() {
  return [{ title: "Réglages · Administration · Orasso" }, { name: "robots", content: "noindex, nofollow" }];
}

type Settings = PlatformSettings & { entries: AdminSettingEntry[] };
type ListKey = keyof typeof adminListCodes;

const codeLabel: Record<ListKey, Record<string, string>> = {
  "lists.refusal_reasons": refusalReasonLabels,
  "lists.vendor_types": vendorTypeLabels,
  "lists.pro_activities": proActivityLabels,
};

export async function loader({ request }: Route.LoaderArgs) {
  await requireSuperAdmin(request);
  const [settings, templates] = await Promise.all([
    apiOrThrow<Settings>(request, "/admin/settings"),
    apiOrThrow<TemplateView[]>(request, "/admin/message-templates"),
  ]);
  return { settings, templates, done: new URL(request.url).searchParams.get("fait") };
}

async function put(request: Request, key: string, value: unknown) {
  return api(request, `/admin/settings/${encodeURIComponent(key)}`, { method: "PUT", json: { value } });
}

export async function action({ request }: Route.ActionArgs) {
  await requireSuperAdmin(request);
  const form = await request.formData();
  const text = (name: string) => String(form.get(name) ?? "").trim();
  const intent = text("intent");
  const fail = (section: string, res: { status: number; error: { message: string } }) =>
    data({ section, error: res.error.message }, { status: res.status });

  if (intent === "switch") {
    const res = await put(request, text("key"), text("value") === "true");
    return res.ok ? redirect("/admin/reglages?fait=1") : fail(text("key"), res);
  }
  if (intent === "points") {
    for (const key of ["points.participation", "points.staff", "points.referral", "points.malus"]) {
      const res = await put(request, key, Number(text(key)));
      if (!res.ok) return fail("points", res);
    }
    const thresholds = Object.fromEntries(grades.map((g) => [g, Number(text(`grade.${g}`))]));
    const res = await put(request, "grades.thresholds", thresholds);
    return res.ok ? redirect("/admin/reglages?fait=1") : fail("points", res);
  }
  if (intent === "list") {
    const key = text("key") as ListKey;
    const codes = (adminListCodes[key] ?? []) as readonly string[];
    const chosen = codes
      .filter((c) => form.get(`on.${c}`) === "on")
      .map((c) => ({ c, order: Number(text(`order.${c}`)) || 99 }))
      .sort((a, b) => a.order - b.order)
      .map((x) => x.c);
    const res = await put(request, key, chosen);
    return res.ok ? redirect("/admin/reglages?fait=1") : fail(key, res);
  }
  if (intent === "template-create" || intent === "template-update") {
    const json = { kind: text("kind"), name: text("name"), subject: text("subject") || null, body: text("body") };
    const res =
      intent === "template-create"
        ? await api(request, "/admin/message-templates", { method: "POST", json })
        : await api(request, `/admin/message-templates/${encodeURIComponent(text("id"))}`, { method: "PATCH", json });
    return res.ok ? redirect("/admin/reglages?fait=1") : fail("templates", res);
  }
  if (intent === "template-delete") {
    const res = await api(request, `/admin/message-templates/${encodeURIComponent(text("id"))}`, { method: "DELETE" });
    return res.ok ? redirect("/admin/reglages?fait=1") : fail("templates", res);
  }
  return data({ section: "", error: "Action inconnue." }, { status: 400 });
}

export default function AdminSettings({ loaderData, actionData }: Route.ComponentProps) {
  const { settings, templates, done } = loaderData;
  const busy = useNavigation().state !== "idle";
  const entry = (key: AdminSettingKey) => settings.entries.find((e) => e.key === key);
  const error = (section: string) =>
    actionData && actionData.section === section ? (
      <p className="s-error" role="alert">
        {actionData.error}
      </p>
    ) : null;
  const thresholds = (entry("grades.thresholds")?.value ?? {}) as Record<Grade, number>;
  return (
    <>
      <div className="orga__head">
        <div>
          <div className="s-label o-t-label">Administration</div>
          <h1 className="s-title">{adminTexts.settingsTitle}</h1>
        </div>
      </div>
      {done && (
        <p className="s-notice s-notice--ok" role="status" data-testid="settings-done">
          {adminTexts.saved}
        </p>
      )}

      <section className="orga__panel s-stack" aria-labelledby="switches" data-testid="admin-switches">
        <h2 id="switches" className="s-h2">
          {adminTexts.switchesTitle}
        </h2>
        {adminSettingGroups.switches.map((key) => {
          const on = entry(key)?.value === true;
          return (
            <Form key={key} method="post" className="adm-setting" data-testid={`setting-${key}`}>
              <input type="hidden" name="intent" value="switch" />
              <input type="hidden" name="key" value={key} />
              <span>
                {adminSettingLabels[key]} · <strong>{on ? adminTexts.on : adminTexts.off}</strong>
              </span>
              <Button
                type="submit"
                name="value"
                value={on ? "false" : "true"}
                variant="secondary"
                icon={on ? "close" : "check"}
                loading={busy}
              >
                {on ? "Désactiver" : "Activer"}
              </Button>
              {error(key)}
            </Form>
          );
        })}
        <h3 className="s-h3">{adminTexts.ticketingTitle}</h3>
        <p className="s-muted">
          Les billets gratuits sont réels ; les billets payants restent en mode présentation (Stripe en mode test, aucun
          encaissement réel). Stripe :{" "}
          {settings.stripe.configured
            ? "clés de test renseignées"
            : "clés non renseignées (billetterie payante « bientôt »)"}
          .
        </p>
        <div data-testid="admin-settings" className="s-stack">
          {platformSettingKeys.map((key: PlatformSettingKey) => {
            const on = settings[key];
            const locked = key === "ticketing.presentation_mode" && settings.presentationForced;
            return (
              <Form key={key} method="post" className="adm-setting" data-testid={`setting-${key}`}>
                <input type="hidden" name="intent" value="switch" />
                <input type="hidden" name="key" value={key} />
                <span>
                  {platformSettingLabels[key]} · <strong>{on ? adminTexts.on : adminTexts.off}</strong>
                  {locked ? " (imposé jusqu'au 21 juin 2027)" : ""}
                </span>
                <Button
                  type="submit"
                  name="value"
                  value={on ? "false" : "true"}
                  variant="secondary"
                  icon={on ? "close" : "check"}
                  disabled={locked && on}
                  loading={busy}
                >
                  {on ? "Désactiver" : "Activer"}
                </Button>
                {error(key)}
              </Form>
            );
          })}
        </div>
      </section>

      <Form method="post" className="orga__panel s-stack" aria-labelledby="points" data-testid="admin-points">
        <input type="hidden" name="intent" value="points" />
        <h2 id="points" className="s-h2">
          {adminTexts.pointsTitle}
        </h2>
        <p className="s-notice">{adminTexts.pointsWarning}</p>
        <div className="adm-grid">
          {(["points.participation", "points.staff", "points.referral", "points.malus"] as const).map((key) => (
            <TextField
              key={key}
              label={adminSettingLabels[key]}
              name={key}
              type="number"
              defaultValue={String(entry(key)?.value ?? "")}
              required
            />
          ))}
        </div>
        <h3 className="s-h3">{adminSettingLabels["grades.thresholds"]}</h3>
        <div className="adm-grid">
          {grades.map((g) => (
            <TextField
              key={g}
              label={`${gradeLabels[g]} (points)`}
              name={`grade.${g}`}
              type="number"
              defaultValue={String(thresholds[g] ?? "")}
              readOnly={g === "rodage"}
              required
            />
          ))}
        </div>
        {error("points")}
        <div className="s-row">
          <Button type="submit" variant="secondary" icon="check" loading={busy}>
            Enregistrer le barème
          </Button>
        </div>
        {entry("points.malus")?.updatedAt && (
          <p className="o-t-caption">
            Dernière modification : {formatDateTime(entry("points.malus")?.updatedAt ?? "")}
          </p>
        )}
      </Form>

      <section className="orga__panel s-stack" aria-labelledby="lists">
        <h2 id="lists" className="s-h2">
          {adminTexts.listsTitle}
        </h2>
        <p className="s-muted">{adminTexts.listsHint}</p>
        <div className="adm-grid">
          {adminSettingGroups.lists.map((key) => {
            const listKey = key as ListKey;
            const current = (entry(key)?.value ?? []) as string[];
            return (
              <Form key={key} method="post" className="s-stack" data-testid={`list-${key}`}>
                <input type="hidden" name="intent" value="list" />
                <input type="hidden" name="key" value={key} />
                <h3 className="s-h3">{adminSettingLabels[key]}</h3>
                <div className="adm-codes">
                  {adminListCodes[listKey].map((code) => {
                    const at = current.indexOf(code);
                    return (
                      <div key={code} className="adm-codes__row">
                        <CheckboxField
                          name={`on.${code}`}
                          label={codeLabel[listKey][code] ?? code}
                          defaultChecked={at >= 0}
                        />
                        <TextField
                          label="Ordre"
                          name={`order.${code}`}
                          type="number"
                          min={1}
                          defaultValue={String(at >= 0 ? at + 1 : adminListCodes[listKey].length)}
                        />
                      </div>
                    );
                  })}
                </div>
                {error(key)}
                <div className="s-row">
                  <Button type="submit" variant="secondary" icon="check" loading={busy}>
                    Enregistrer la liste
                  </Button>
                </div>
              </Form>
            );
          })}
        </div>
      </section>

      <section className="orga__panel s-stack" aria-labelledby="templates" data-testid="admin-templates">
        <h2 id="templates" className="s-h2">
          {adminTexts.templatesTitle}
        </h2>
        {error("templates")}
        {templates.map((t) => (
          <Form key={t.id} method="post" className="s-stack">
            <input type="hidden" name="id" value={t.id} />
            <input type="hidden" name="kind" value={t.kind} />
            <TextField label={`Nom · ${templateKindLabels[t.kind]}`} name="name" defaultValue={t.name} required />
            <TextField label="Objet" name="subject" defaultValue={t.subject ?? ""} />
            <TextAreaField label="Texte" name="body" defaultValue={t.body} rows={3} required />
            <div className="s-row">
              <Button
                type="submit"
                name="intent"
                value="template-update"
                variant="secondary"
                icon="check"
                loading={busy}
              >
                Enregistrer
              </Button>
              <Button
                type="submit"
                name="intent"
                value="template-delete"
                variant="secondary"
                icon="close"
                loading={busy}
              >
                Retirer
              </Button>
            </div>
          </Form>
        ))}
        <Form method="post" className="s-stack">
          <input type="hidden" name="intent" value="template-create" />
          <h3 className="s-h3">Nouveau modèle</h3>
          <SelectField
            label="Sorte"
            name="kind"
            options={templateKinds.map((k) => ({ value: k, label: templateKindLabels[k] }))}
          />
          <TextField label="Nom" name="name" required />
          <TextField label="Objet" name="subject" />
          <TextAreaField label="Texte" name="body" rows={3} required />
          <div className="s-row">
            <Button type="submit" variant="secondary" icon="add" loading={busy}>
              Ajouter le modèle
            </Button>
          </div>
        </Form>
      </section>
    </>
  );
}
