// Espace prestataire (lot 21, docs/02 « casquette Prestataire ») : mon profil et mes photos, les événements ouverts à
// mon type, mes candidatures par statut. Le QR de stand du jour J est dans l'appli (ici : « à venir »).
import {
  Button,
  CheckboxField,
  Chip,
  ChipRow,
  Icon,
  Plate,
  SelectField,
  StatusBadge,
  TextField,
} from "@orasso/design-system/web";
import {
  departmentSchema,
  type OpenEventForProvider,
  PROVIDER_MAX_PHOTOS,
  type ProviderApplicationView,
  type ProviderProfileView,
  providerSelectableTypes,
  vendorTypeLabels,
} from "@orasso/shared";
import { data, Form, useNavigation } from "react-router";

import { FileField, TextAreaField } from "../components/Fields";
import { api, requireMe } from "../lib/api.server";
import { formatWhen } from "../lib/format";
import { useVendorTypes } from "../lib/lists";
import { badgeFor } from "../lib/status";
import "../styles/providers.css";
import type { Route } from "./+types/prestataire";

export function meta() {
  return [{ title: "Prestataire · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const me = await requireMe(request);
  const highlight = new URL(request.url).searchParams.get("evenement");
  const profile = await api<{ profile: ProviderProfileView | null }>(request, "/me/provider-profile");
  const [upcoming, past, open] = await Promise.all([
    api<ProviderApplicationView[]>(request, "/me/provider-applications?scope=upcoming"),
    api<ProviderApplicationView[]>(request, "/me/provider-applications?scope=past"),
    api<OpenEventForProvider[]>(request, "/events/open-to-providers"),
  ]);
  return {
    profile: profile.ok ? profile.data.profile : null,
    isPro: Boolean(me.pro),
    upcoming: upcoming.ok ? upcoming.data : [],
    past: past.ok ? past.data : [],
    open: open.ok ? open.data : [],
    highlight,
  };
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const link = (value: string): string | null =>
  value ? (/^https?:\/\//i.test(value) ? value : `https://${value}`) : null;

export async function action({ request }: Route.ActionArgs) {
  await requireMe(request);
  const form = await request.formData();
  const intent = text(form, "intent");

  if (intent === "save") {
    const zone = text(form, "departments")
      .split(/[\s,;]+/)
      .filter(Boolean);
    if (zone.some((d) => !departmentSchema.safeParse(d).success)) {
      return data(
        { error: "Zone d'intervention : codes de département séparés par des virgules (ex. 66, 11)." },
        { status: 400 },
      );
    }
    const body = {
      type: text(form, "type") || "stand",
      customType: text(form, "customType") || null,
      name: text(form, "name"),
      description: text(form, "description") || null,
      phone: text(form, "phone") || null,
      email: text(form, "email") || null,
      website: link(text(form, "website")),
      instagram: text(form, "instagram") || null,
      portfolioUrl: link(text(form, "portfolioUrl")),
      departments: zone,
    };
    const res = await api(request, "/me/provider-profile", { method: "PUT", json: body });
    if (!res.ok) return data({ error: res.error.message }, { status: res.status });
    return data({ ok: "Profil enregistré." });
  }
  if (intent === "from-pro") {
    const res = await api(request, "/me/provider-profile/from-pro", { method: "POST" });
    if (!res.ok) return data({ error: res.error.message }, { status: res.status });
    return data({ ok: "Stand créé à partir de ta fiche pro." });
  }
  if (intent === "add-photo") {
    const photo = form.get("photo");
    if (!(photo instanceof File) || photo.size === 0) return data({ error: "Choisis une photo." }, { status: 400 });
    const upload = new FormData();
    upload.set("photo", photo);
    const res = await api(request, "/me/provider-profile/photos", { method: "POST", body: upload });
    if (!res.ok) return data({ error: res.error.message }, { status: res.status });
    return data({ ok: "Photo ajoutée." });
  }
  if (intent === "remove-photo") {
    const res = await api(request, `/me/provider-profile/photos/${encodeURIComponent(text(form, "photoId"))}`, {
      method: "DELETE",
    });
    if (!res.ok) return data({ error: res.error.message }, { status: res.status });
    return data({ ok: "Photo retirée." });
  }
  if (intent === "apply") {
    if (form.get("rulesAccepted") !== "on")
      return data({ error: "Accepte le règlement pour candidater." }, { status: 400 });
    const res = await api(request, `/events/${encodeURIComponent(text(form, "eventId"))}/provider-applications`, {
      method: "POST",
      json: { rulesAccepted: true, message: text(form, "message") || null },
    });
    if (!res.ok) return data({ error: res.error.message }, { status: res.status });
    return data({ ok: "Candidature envoyée : l'équipe organisatrice te répondra." });
  }
  if (intent === "withdraw") {
    const res = await api(request, `/applications/${encodeURIComponent(text(form, "applicationId"))}/withdraw`, {
      method: "POST",
    });
    if (!res.ok) return data({ error: res.error.message }, { status: res.status });
    return data({ ok: "Candidature retirée." });
  }
  return data({ error: "Action inconnue." }, { status: 400 });
}

const STATUS_ORDER = ["accepted", "pending", "waitlisted", "offered", "refused", "withdrawn", "expired", "cancelled"];

function ApplicationRow({ app }: { app: ProviderApplicationView }) {
  const badge = badgeFor(app);
  return (
    <li className="s-card s-stack s-stack--tight" data-testid="provider-application" data-status={app.status}>
      <div className="s-row s-row--between">
        <a href={`/e/${app.event.slug}`} className="o-never-truncate">
          <strong>{app.event.title}</strong>
        </a>
        {badge ? <StatusBadge status={badge.status} rank={badge.rank} /> : <Chip>{app.status}</Chip>}
      </div>
      <p className="o-t-caption s-muted">{formatWhen(app.event.startsAt, app.event.endsAt)}</p>
      {app.accreditedMedia && (
        <ChipRow>
          <Chip variant="accent">Média officiel</Chip>
        </ChipRow>
      )}
      {app.status === "refused" && app.refusalNote && <p className="s-muted">{app.refusalNote}</p>}
      {app.status === "accepted" && (
        <p className="o-t-caption s-row" data-testid="stand-qr-soon">
          <Icon name="qr" size={20} /> Ton QR de stand s'affiche dans l'appli Orasso le jour de l'événement.
        </p>
      )}
      {app.canWithdraw && (
        <Form method="post">
          <input type="hidden" name="intent" value="withdraw" />
          <input type="hidden" name="applicationId" value={app.id} />
          <Button type="submit" variant="secondary" icon="undo">
            Me désister
          </Button>
        </Form>
      )}
    </li>
  );
}

export default function Prestataire({ loaderData, actionData }: Route.ComponentProps) {
  const { profile, isPro, upcoming, past, open, highlight } = loaderData;
  const busy = useNavigation().state !== "idle";
  const apps = [...upcoming].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
  const feedback = actionData as { ok?: string; error?: string } | undefined;
  // Lot 33 : types proposés par l'administration ; le type déjà choisi reste dans la liste.
  const offeredTypes = useVendorTypes();
  const selectableTypes = providerSelectableTypes.filter((t) => offeredTypes.includes(t) || t === profile?.type);

  return (
    <div className="s-narrow s-stack" data-testid="provider-space">
      <div className="s-head">
        <div className="o-t-label s-label">Casquette Prestataire</div>
        <h1 className="s-title">Prestataire</h1>
        <p className="s-lead">
          Food truck, barbier, tatoueur, photographe, animation… Crée ton profil puis candidate aux événements qui
          accueillent ton activité. Tu n'as besoin ni de SIRET ni de fiche pro.
        </p>
      </div>
      {feedback?.ok && (
        <p className="s-notice s-notice--ok" role="status" data-testid="provider-feedback">
          {feedback.ok}
        </p>
      )}
      {feedback?.error && (
        <p className="s-error" role="alert" data-testid="provider-error">
          {feedback.error}
        </p>
      )}

      <Plate as="section" aria-label="Mon profil">
        <Form method="post" className="s-form" data-testid="provider-profile-form">
          <input type="hidden" name="intent" value="save" />
          <h2 className="s-h2">Mon profil</h2>
          {profile?.type === "stand" ? (
            <p className="s-muted" data-testid="stand-note">
              Stand lié à ta fiche pro : {vendorTypeLabels.stand}.
            </p>
          ) : (
            <>
              <SelectField
                label="Mon activité"
                name="type"
                defaultValue={profile?.type ?? "food_truck"}
                options={selectableTypes.map((t) => ({ value: t, label: vendorTypeLabels[t] }))}
              />
              <TextField
                label="Précise ton activité (si « Autres »)"
                name="customType"
                defaultValue={profile?.customType ?? ""}
                maxLength={40}
              />
            </>
          )}
          <TextField label="Nom affiché" name="name" defaultValue={profile?.name ?? ""} required maxLength={60} />
          <TextAreaField
            label="Présentation"
            name="description"
            defaultValue={profile?.description ?? ""}
            maxLength={800}
          />
          <div className="s-two">
            <TextField label="Téléphone" name="phone" defaultValue={profile?.phone ?? ""} inputMode="tel" />
            <TextField label="E-mail" name="email" type="email" defaultValue={profile?.email ?? ""} />
          </div>
          <div className="s-two">
            <TextField
              label="Instagram"
              name="instagram"
              defaultValue={profile?.instagram ?? ""}
              help="@pseudo ou adresse du compte. Montré sur la fiche de l'événement pour les photographes."
            />
            <TextField label="Portfolio" name="portfolioUrl" defaultValue={profile?.portfolioUrl ?? ""} />
          </div>
          <TextField label="Site web" name="website" defaultValue={profile?.website ?? ""} />
          <TextField
            label="Zone d'intervention"
            name="departments"
            defaultValue={profile?.departments.join(", ") ?? ""}
            help="Départements où tu te déplaces (ex. 66, 11)."
          />
          {profile?.issue && (
            <p className="s-notice" data-testid="provider-issue">
              Pour candidater : {profile.issue}
            </p>
          )}
          <div>
            <Button type="submit" icon="check" loading={busy}>
              {profile ? "Enregistrer" : "Créer mon profil"}
            </Button>
          </div>
        </Form>
        {!profile && isPro && (
          <Form method="post" className="s-form">
            <input type="hidden" name="intent" value="from-pro" />
            <Button type="submit" variant="secondary" icon="add">
              Créer le stand de ma fiche pro
            </Button>
          </Form>
        )}
      </Plate>

      {profile && (
        <Plate as="section" aria-label="Mes photos">
          <h2 className="s-h2">
            Mes photos · {profile.photos.length}/{PROVIDER_MAX_PHOTOS}
          </h2>
          {profile.photos.length > 0 && (
            <ul className="s-photos s-photos--edit" data-testid="provider-photos">
              {profile.photos.map((p) => (
                <li key={p.id}>
                  <img src={p.url} alt="" />
                  <Form method="post">
                    <input type="hidden" name="intent" value="remove-photo" />
                    <input type="hidden" name="photoId" value={p.id} />
                    <Button type="submit" variant="secondary" icon="close">
                      Retirer
                    </Button>
                  </Form>
                </li>
              ))}
            </ul>
          )}
          {profile.photos.length < PROVIDER_MAX_PHOTOS && (
            <Form method="post" encType="multipart/form-data" className="s-form">
              <input type="hidden" name="intent" value="add-photo" />
              <FileField label="Ajouter une photo" name="photo" accept="image/*" />
              <div>
                <Button type="submit" variant="secondary" icon="add" loading={busy}>
                  Envoyer
                </Button>
              </div>
            </Form>
          )}
        </Plate>
      )}

      {profile && (
        <section className="s-stack" aria-label="Événements ouverts">
          <h2 className="s-h2">Événements ouverts à mon activité</h2>
          {open.length === 0 && <p className="s-muted">Aucun événement n'attend ton type d'activité pour le moment.</p>}
          <ul className="s-stack s-list-plain">
            {open.map((e) => (
              <li
                key={e.id}
                className={`s-card s-stack s-stack--tight${highlight === e.slug ? " is-highlight" : ""}`}
                data-testid="open-event"
                data-slug={e.slug}
              >
                <div className="s-row s-row--between">
                  <a href={`/e/${e.slug}`} className="o-never-truncate">
                    <strong>{e.title}</strong>
                  </a>
                  <span className="o-t-caption s-muted">{e.structureName}</span>
                </div>
                <p className="o-t-caption s-muted">
                  {formatWhen(e.startsAt, e.endsAt)}
                  {e.city ? ` · ${e.city}` : ""}
                </p>
                {e.myApplication && e.myApplication.status !== "withdrawn" && e.myApplication.status !== "refused" ? (
                  <p className="o-t-caption">Candidature en cours.</p>
                ) : (
                  <Form method="post" className="s-form">
                    <input type="hidden" name="intent" value="apply" />
                    <input type="hidden" name="eventId" value={e.id} />
                    <TextField label="Un mot pour l'équipe organisatrice (facultatif)" name="message" maxLength={300} />
                    <CheckboxField name="rulesAccepted" label="J'ai lu et j'accepte le règlement de l'événement" />
                    <div>
                      <Button type="submit" variant="secondary" icon="next" disabled={Boolean(profile.issue)}>
                        Candidater
                      </Button>
                    </div>
                  </Form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="s-stack" aria-label="Mes candidatures">
        <h2 className="s-h2">Mes candidatures</h2>
        {apps.length === 0 && <p className="s-muted">Aucune candidature à venir.</p>}
        <ul className="s-stack s-list-plain" data-testid="provider-applications">
          {apps.map((a) => (
            <ApplicationRow key={a.id} app={a} />
          ))}
        </ul>
        {past.length > 0 && (
          <details>
            <summary className="o-t-label">Passées · {past.length}</summary>
            <ul className="s-stack s-list-plain">
              {past.map((a) => (
                <ApplicationRow key={a.id} app={a} />
              ))}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}
