// Espace prestataire (lot 21, docs/02 « casquette Prestataire ») : mon profil et mes photos, les événements ouverts à
// mon type, mes candidatures par statut. Le QR de stand du jour J est dans l'appli (ici : « à venir »).
// Lot 57 (DA v2, parité de l'appli du lot 54 : `s-missions`, `s-pcand`, `s-vitrine`) : les missions autour de moi
// (besoins des organisateurs, proposer ma vitrine sur un besoin), mes candidatures avec l'emplacement, l'heure
// d'installation, l'électricité, les consignes et l'avis de l'organisateur, et ma vitrine complète (métiers, menu avec
// les prix, besoins sur place, rayon) avec sa « Vue organisateur ».
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
  type MissionsResult,
  missionTexts,
  type OpenEventForProvider,
  proV2Labels as P,
  PROVIDER_MAX_PHOTOS,
  type ProviderApplicationView,
  type ProviderProfileView,
  type ProviderReviewsSummary,
  providerPowerLabels,
  providerPowers,
  providerReviewTexts,
  providerSelectableTypes,
  providerSpotTexts,
  vendorTypeLabels,
  vitrineTexts,
} from "@orasso/shared";
import { data, Form, useNavigation } from "react-router";

import { FileField, TextAreaField } from "../components/Fields";
import { ProviderVitrine } from "../components/ProviderVitrine";
import { api, requireMe } from "../lib/api.server";
import { formatTime, formatWhen } from "../lib/format";
import { useVendorTypes } from "../lib/lists";
import { badgeFor } from "../lib/status";
import "../styles/providers.css";
import { FicheBar, ficheHandle } from "../components/FicheBar";
import type { Route } from "./+types/prestataire";

// Lot M7 : fiche ou parcours, mode B (en-tête de fiche, sans bande ni barre d'onglets).
export const handle = ficheHandle;

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
  const mine = profile.ok ? profile.data.profile : null;
  // Lot 57 : missions autour de moi (métier principal, rayon de la vitrine) et avis reçus.
  const radius = Number(new URL(request.url).searchParams.get("rayon") ?? "") || null;
  const [missions, reviews] = mine
    ? await Promise.all([
        api<MissionsResult>(request, `/missions${radius ? `?radiusKm=${radius}` : ""}`),
        api<ProviderReviewsSummary>(request, `/providers/${mine.id}/reviews`),
      ])
    : [null, null];
  return {
    missions: missions?.ok ? missions.data : null,
    reviews: reviews?.ok ? reviews.data : null,
    profile: mine,
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
      // Lot 57 : la vitrine v2 (`s-vitrine`), champs facultatifs.
      ...(form.has("vitrine")
        ? {
            trades: form.getAll("trades").map(String),
            tagline: text(form, "tagline") || null,
            teamSize: Number(text(form, "teamSize")) || null,
            menu: text(form, "menu") || null,
            powerNeed: text(form, "powerNeed") || null,
            frontageM: Number(text(form, "frontageM")) || null,
            waterNeed: form.get("waterNeed") === "on",
            radiusKm: Number(text(form, "radiusKm")) || undefined,
          }
        : {}),
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
      // Lot 57 : candidature sur un besoin précis (mission) ou « sans mission précise ».
      json: { rulesAccepted: true, message: text(form, "message") || null, needId: text(form, "needId") || null },
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
        <ChipRow className="s-chips-wrap">
          <Chip variant="accent">Média officiel</Chip>
        </ChipRow>
      )}
      {app.status === "refused" && app.refusalNote && <p className="s-muted">{app.refusalNote}</p>}
      {/* Lot 57 (`s-pcand`) : la mission, l'emplacement, l'arrivée, l'électricité et les consignes. */}
      <p className="o-t-caption">{app.need ? app.need.tradeLabel : P.withoutMission}</p>
      {app.status === "accepted" && (app.spot || app.installAt || app.power) && (
        <p className="o-t-body-strong" data-testid="provider-spot">
          {[
            app.spot ? providerSpotTexts.spot(app.spot.label) : null,
            app.installAt ? providerSpotTexts.arrival(formatTime(app.installAt)) : null,
            app.power ? missionTexts.powerDetail(app.power) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      {app.status === "accepted" && app.spot?.note && <p className="o-t-caption">{app.spot.note}</p>}
      {app.status === "accepted" && (
        <p className="o-t-caption s-muted">
          {providerSpotTexts.instructions} · {app.instructions ?? P.noInstructions}
        </p>
      )}
      {app.review && (
        <div className="s-stack s-stack--tight" data-testid="provider-review">
          <Chip variant="accent">{providerReviewTexts.ticket(app.review.rating)}</Chip>
          {app.review.comment && (
            <p className="o-t-caption">
              « {app.review.comment} » · {app.review.authorName}
            </p>
          )}
        </div>
      )}
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
  const { profile, isPro, upcoming, past, open, highlight, missions, reviews } = loaderData;
  const busy = useNavigation().state !== "idle";
  const apps = [...upcoming].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
  const feedback = actionData as { ok?: string; error?: string } | undefined;
  // Lot 33 : types proposés par l'administration ; le type déjà choisi reste dans la liste.
  const offeredTypes = useVendorTypes();
  const selectableTypes = providerSelectableTypes.filter((t) => offeredTypes.includes(t) || t === profile?.type);

  return (
    <>
      <FicheBar title="Prestataire" facts="Casquette Prestataire" back="/app/moi" />
      <div className="s-narrow s-stack" data-testid="provider-space">
        <div className="s-head">
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
            {/* Lot 57 : la vitrine v2 (`s-vitrine`, modification), comme l'appli. */}
            <input type="hidden" name="vitrine" value="1" />
            <fieldset className="s-stack s-stack--tight" data-testid="vitrine-trades">
              <legend className="o-t-label">{vitrineTexts.tradesField}</legend>
              <div className="pv-trades">
                {selectableTypes.map((t) => (
                  <CheckboxField
                    key={t}
                    name="trades"
                    value={t}
                    label={vendorTypeLabels[t]}
                    defaultChecked={profile?.trades.includes(t) ?? false}
                  />
                ))}
              </div>
            </fieldset>
            <TextField
              label={vitrineTexts.taglineField}
              name="tagline"
              defaultValue={profile?.tagline ?? ""}
              maxLength={80}
            />
            <div className="s-two">
              <TextField
                label={vitrineTexts.teamField}
                name="teamSize"
                type="number"
                min={1}
                max={50}
                defaultValue={profile?.teamSize ?? ""}
                help={P.teamRange}
              />
              <TextField
                label={vitrineTexts.radiusField}
                name="radiusKm"
                type="number"
                min={5}
                max={500}
                defaultValue={profile?.radiusKm ?? 80}
                help={P.radiusLimits(5, 500)}
              />
            </div>
            <TextAreaField
              label={vitrineTexts.menuField}
              name="menu"
              defaultValue={profile?.menuText ?? ""}
              help={vitrineTexts.menuHelp}
              placeholder={vitrineTexts.menuPlaceholder}
              rows={5}
            />
            <div className="s-two">
              <SelectField
                label={vitrineTexts.powerField}
                name="powerNeed"
                defaultValue={profile?.powerNeed ?? "none"}
                options={providerPowers.map((x) => ({ value: x, label: providerPowerLabels[x] }))}
              />
              <TextField
                label={vitrineTexts.frontageField}
                name="frontageM"
                type="number"
                min={1}
                max={30}
                defaultValue={profile?.frontageM ?? ""}
                help={P.frontageRange}
              />
            </div>
            <CheckboxField
              name="waterNeed"
              label={vitrineTexts.waterField}
              defaultChecked={profile?.waterNeed ?? false}
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

        {profile && missions && (
          <section className="s-stack" aria-labelledby="pr-missions" data-testid="provider-missions">
            <div className="s-row s-row--between">
              <h2 id="pr-missions" className="s-h2">
                {missionTexts.title}
              </h2>
              <nav className="s-row" aria-label={P.radiusLabel}>
                {[40, 80, 150, 300].map((km) => (
                  <a
                    key={km}
                    href={`/app/prestataire?rayon=${km}`}
                    aria-current={missions.radiusKm === km ? "page" : undefined}
                  >
                    <Chip selected={missions.radiusKm === km}>{P.radiusChip(km)}</Chip>
                  </a>
                ))}
              </nav>
            </div>
            <p className="s-muted">
              {missions.from ? P.around(missions.from) : P.aroundUnknown} ·{" "}
              {missionTexts.intro(missions.items.length, vendorTypeLabels[missions.trade])}
            </p>
            {!missions.from && <p className="s-notice">{P.noZone}</p>}
            {missions.items.length === 0 ? (
              <p className="s-notice">
                <strong>{P.emptyTitle}</strong> {P.emptyText}
              </p>
            ) : (
              <ul className="s-stack s-list-plain">
                {missions.items.map((m) => (
                  <li
                    key={m.id}
                    className="s-card s-stack s-stack--tight"
                    data-testid="mission-card"
                    data-slug={m.slug}
                  >
                    <div className="s-row s-row--between">
                      <a href={`/e/${m.slug}`} className="o-never-truncate">
                        <strong>{m.title}</strong>
                      </a>
                      {m.distanceKm !== null && <Chip>{missionTexts.distance(m.distanceKm)}</Chip>}
                    </div>
                    <p className="o-t-caption s-muted">
                      {formatWhen(m.startsAt, m.endsAt)}
                      {m.city ? ` · ${m.city}` : ""} · {m.structureName}
                      {m.expectedVisitors ? ` · ${missionTexts.expectedVisitors(m.expectedVisitors)}` : ""}
                    </p>
                    {m.needs.map((n) => (
                      <div key={n.id} className="s-stack s-stack--tight pv-need" data-testid="mission-need">
                        <div className="o-t-body-strong">
                          {missionTexts.places(n.remaining, n.quantity, n.tradeLabel)}
                          {n.installAt ? ` · ${providerSpotTexts.arrival(formatTime(n.installAt))}` : ""}
                        </div>
                        <ChipRow className="s-chips-wrap">
                          <Chip>{missionTexts.power(n.power)}</Chip>
                          {n.water && <Chip>{missionTexts.water}</Chip>}
                          {n.frontageM ? <Chip>{vitrineTexts.frontage(n.frontageM)}</Chip> : null}
                        </ChipRow>
                        {n.notes && <p className="o-t-caption">{n.notes}</p>}
                      </div>
                    ))}
                    {m.myApplication && m.myApplication.status !== "withdrawn" ? (
                      <p className="o-t-caption" data-testid="mission-applied">
                        {m.myApplication.status === "accepted" ? missionTexts.retained : missionTexts.seeApplication} ·{" "}
                        <a href="#mes-candidatures">{P.candTitle}</a>
                      </p>
                    ) : (
                      <Form method="post" className="s-form" data-testid="mission-propose">
                        <input type="hidden" name="intent" value="apply" />
                        <input type="hidden" name="eventId" value={m.id} />
                        {m.needs.length > 1 ? (
                          <SelectField
                            label={P.proposeNeed}
                            name="needId"
                            options={m.needs.map((n) => ({ value: n.id, label: n.tradeLabel }))}
                          />
                        ) : (
                          <input type="hidden" name="needId" value={m.needs[0]?.id ?? ""} />
                        )}
                        <TextField label={P.proposeMessage} name="message" maxLength={300} />
                        <CheckboxField name="rulesAccepted" label={P.proposeRules} />
                        <div>
                          <Button
                            type="submit"
                            variant="secondary"
                            icon="send"
                            loading={busy}
                            disabled={Boolean(profile.issue)}
                          >
                            {missionTexts.propose(profile.name)}
                          </Button>
                        </div>
                      </Form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {profile && (
          <details className="s-card" data-testid="vitrine-preview">
            <summary className="o-t-label">
              {vitrineTexts.title} · {vitrineTexts.orgView}
            </summary>
            <ProviderVitrine provider={profile} reviews={reviews} />
          </details>
        )}

        {profile && (
          <section className="s-stack" aria-label="Événements ouverts">
            <h2 className="s-h2">Événements ouverts à mon activité</h2>
            {open.length === 0 && (
              <p className="s-muted">Aucun événement n'attend ton type d'activité pour le moment.</p>
            )}
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
                      <TextField
                        label="Un mot pour l'équipe organisatrice (facultatif)"
                        name="message"
                        maxLength={300}
                      />
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

        <section className="s-stack" aria-label="Mes candidatures" id="mes-candidatures">
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
    </>
  );
}
