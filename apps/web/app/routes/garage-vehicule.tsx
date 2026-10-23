import { Button, Chip, Icon, Plate, TextField } from "@orasso/design-system/web";
import {
  applicationStatusLabels,
  archiveStatusChoices,
  type CategoryOption,
  certificationConditions,
  certificationLostLabels,
  certificationMissingLabels,
  certificationStatusLabels,
  countryLabel,
  type OutgoingPlateTransferView,
  type PlateTransferView,
  plateTransferLabels,
  shareSheetLabels,
  type VehicleDetail,
  type VehicleHistoryItem,
  vehicleStatusLabels,
  vehicleTypeLabels,
  vehicleWizardLabels,
} from "@orasso/shared";
import { data, Form, redirect, useNavigation } from "react-router";

import { TextAreaField } from "../components/Fields";
import { PhotoWithPlate, PlateFrame, plateDecisionError } from "../components/PlateFrame";
import { ShareCard } from "../components/ShareButtons";
import { api, apiOrThrow } from "../lib/api.server";
import { formatDateTime, formatDay } from "../lib/format";
import type { Route } from "./+types/garage-vehicule";
import "../styles/garage.css";
import { FicheBar, ficheHandle } from "../components/FicheBar";

// Lot M7 : fiche ou parcours, mode B (en-tête de fiche, sans bande ni barre d'onglets).
export const handle = ficheHandle;

export function meta() {
  return [{ title: "Véhicule · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const id = params.id;
  const vehicle = await apiOrThrow<VehicleDetail>(request, `/me/vehicles/${encodeURIComponent(id)}`);
  const query = new URLSearchParams({ makeId: vehicle.makeId, vehicleType: vehicle.vehicleType });
  if (vehicle.year) query.set("year", String(vehicle.year));
  const [history, categories, transfers] = await Promise.all([
    apiOrThrow<VehicleHistoryItem[]>(request, `/me/vehicles/${encodeURIComponent(id)}/history`),
    apiOrThrow<CategoryOption[]>(request, `/vehicle-reference/categories?${query}`),
    vehicle.plateTransfer
      ? api<{ incoming: PlateTransferView[]; outgoing: OutgoingPlateTransferView[] }>(request, "/me/plate-transfers")
      : Promise.resolve(null),
  ]);
  const outgoing = transfers?.ok ? transfers.data.outgoing.find((t) => t.id === vehicle.plateTransfer?.id) : undefined;
  return { vehicle, history, categories, answerBy: outgoing?.answerBy ?? null };
}

const numberOrNull = (v: FormDataEntryValue | null) => {
  const text = String(v ?? "").trim();
  return text ? Number(text) : null;
};

export async function action({ request, params }: Route.ActionArgs) {
  const base = `/me/vehicles/${encodeURIComponent(params.id)}`;
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const text = (name: string) => String(form.get(name) ?? "").trim();
  const fail = (res: { status: number; error: { message: string } }) =>
    data({ error: res.error.message, done: null }, { status: res.status });

  if (intent === "update") {
    const res = await api(request, base, {
      method: "PATCH",
      json: {
        year: numberOrNull(form.get("year")),
        engine: text("engine") || null,
        powerHp: numberOrNull(form.get("powerHp")),
        weightKg: numberOrNull(form.get("weightKg")),
        color: text("color") || null,
        description: text("description") || null,
        preparation: text("preparation") || null,
        categoryIds: form.getAll("categoryIds").map(String),
      },
    });
    return res.ok ? data({ error: null, done: "update" }) : fail(res);
  }
  if (intent === "archive" || intent === "restore") {
    const status = intent === "restore" ? "active" : text("status");
    if (!status) return data({ error: "Choisis Vendu, Souvenir ou Accidenté.", done: null }, { status: 400 });
    const res = await api(request, base, {
      method: "PATCH",
      json: { status, statusNote: text("statusNote") || null },
    });
    return res.ok ? data({ error: null, done: intent }) : fail(res);
  }
  if (intent === "photo-add") {
    const photo = form.get("photo");
    if (!(photo instanceof File) || photo.size === 0) {
      return data({ error: "Choisis une photo.", done: null }, { status: 400 });
    }
    // Relecture du lot 51 : la photo part avec son cadre de plaque (flouté par l'API), ou « aucune plaque visible ».
    const decision = plateDecisionError(form);
    if (decision) return data({ error: decision, done: null }, { status: 400 });
    const upload = new FormData();
    upload.set("photo", photo);
    if (text("plateRects")) upload.set("plateRects", text("plateRects"));
    const res = await api(request, `${base}/photos`, { method: "POST", body: upload });
    return res.ok ? data({ error: null, done: "photo" }) : fail(res);
  }
  // Lot 51 : floutage à la main d'une photo déjà en ligne (définitif, l'API refuse un cadre hors de l'image).
  if (intent === "photo-blur") {
    let rects: unknown;
    try {
      rects = JSON.parse(text("plateRects") || "[]");
    } catch {
      rects = [];
    }
    if (!Array.isArray(rects) || rects.length === 0) {
      return data({ error: "Place le cadre sur la plaque.", done: null }, { status: 400 });
    }
    const res = await api(request, `${base}/photos/${encodeURIComponent(text("photoId"))}/blur`, {
      method: "POST",
      json: { rects },
    });
    return res.ok ? data({ error: null, done: "photo" }) : fail(res);
  }
  if (intent === "photo-remove") {
    const res = await api(request, `${base}/photos/${encodeURIComponent(text("photoId"))}`, { method: "DELETE" });
    return res.ok ? data({ error: null, done: "photo" }) : fail(res);
  }
  if (intent === "certify") {
    const res = await api(request, `${base}/certification-request`, {
      method: "POST",
      json: { message: text("message") || null },
    });
    return res.ok ? data({ error: null, done: "certify" }) : fail(res);
  }
  if (intent === "delete") {
    const res = await api(request, base, { method: "DELETE" });
    if (!res.ok) return fail(res);
    return redirect("/app/garage");
  }
  return data({ error: "Action inconnue.", done: null }, { status: 400 });
}

export default function VehiclePage({ loaderData, actionData }: Route.ComponentProps) {
  const { vehicle: v, history, categories, answerBy } = loaderData;
  const busy = useNavigation().state !== "idle";
  const cert = v.certification;
  const archived = v.status !== "active";
  const chosen = new Set(v.categories.map((c) => c.id));
  const missing = new Set(cert.missing);
  const country = countryLabel(v.country);

  return (
    <div className="s-stack" data-testid="vehicle-page">
      <FicheBar heading={false} title="Mon véhicule" back="/app/garage" />
      <div className="g-hero">
        <h1 className="s-title g-name o-never-truncate" data-testid="vehicle-name">
          {v.label}
        </h1>
        <div className="g-status">
          {v.certified && <Chip variant="verified">Certifié</Chip>}
          {archived && <Chip>{vehicleStatusLabels[v.status]}</Chip>}
          {v.plateTransfer && <Chip variant="accent">{plateTransferLabels.pending}</Chip>}
          {v.categories.map((c) => (
            <Chip key={c.id}>{c.label}</Chip>
          ))}
        </div>
      </div>

      {actionData?.error && (
        <p className="s-error" role="alert">
          {actionData.error}
        </p>
      )}
      {actionData?.done && !actionData.error && <p className="s-notice s-notice--ok">Enregistré.</p>}

      {v.plateTransfer && (
        <Plate className="s-stack s-stack--tight" data-testid="plate-pending">
          <div className="o-t-label">{plateTransferLabels.pending}</div>
          <p>
            Cette plaque est déjà enregistrée sur le véhicule d'un autre membre. Il a été prévenu : s'il confirme, la
            plaque est à toi.{" "}
            {v.plateTransfer.status === "arbitrated"
              ? "L'équipe Orasso va trancher."
              : answerBy
                ? `Sans réponse avant le ${formatDateTime(answerBy)}, l'équipe Orasso tranchera.`
                : plateTransferLabels.waitingOwner}{" "}
            En attendant, tu ne peux pas candidater avec ce véhicule.
          </p>
        </Plate>
      )}

      {v.photos.length > 0 ? (
        <ul className="g-photos" aria-label="Photos">
          {v.photos.map((p, i) => (
            <li key={p.id}>
              <a href={p.url} target="_blank" rel="noreferrer" aria-label={`Photo ${i + 1} en plein écran`}>
                <img src={p.url} alt={`${v.label}, vue ${i + 1}`} />
              </a>
              <Form method="post">
                <input type="hidden" name="photoId" value={p.id} />
                <Button
                  type="submit"
                  name="intent"
                  value="photo-remove"
                  variant="secondary"
                  icon="close"
                  loading={busy}
                >
                  Retirer
                </Button>
              </Form>
              {p.plateBlurred ? (
                <span className="g-photo-blurred" data-testid="photo-plate-blurred">
                  <Chip variant="accent">{vehicleWizardLabels.plateBlurred}</Chip>
                </span>
              ) : null}
              {/* Relecture : une photo déjà floutée peut recevoir un autre cadre (l'API l'accepte). */}
              {
                <details className="g-blur" data-testid={p.plateBlurred ? "photo-blur-more" : "photo-blur"}>
                  <summary className="o-t-label">
                    {p.plateBlurred ? vehicleWizardLabels.blurMore : vehicleWizardLabels.blurAction}
                  </summary>
                  <Form method="post" className="s-stack s-stack--tight">
                    <input type="hidden" name="photoId" value={p.id} />
                    <PlateFrame
                      src={p.url}
                      alt={`${v.label}, vue ${i + 1}`}
                      testId={p.plateBlurred ? "site-plate-editor-more" : "site-plate-editor"}
                    />
                    <Button
                      type="submit"
                      name="intent"
                      value="photo-blur"
                      variant="secondary"
                      icon="check"
                      loading={busy}
                    >
                      {vehicleWizardLabels.blurConfirm}
                    </Button>
                  </Form>
                </details>
              }
            </li>
          ))}
        </ul>
      ) : (
        <p className="s-notice">Aucune photo : ajoute-en au moins une pour candidater.</p>
      )}
      {v.photos.length < 8 && (
        <Form method="post" encType="multipart/form-data" className="s-form">
          <PhotoWithPlate label="Ajouter une photo" required testId="add-plate-frame" />
          <Button type="submit" name="intent" value="photo-add" variant="secondary" icon="add" loading={busy}>
            Envoyer la photo
          </Button>
        </Form>
      )}

      <section className="s-stack s-stack--tight" aria-labelledby="fiche">
        <h2 id="fiche" className="s-h2">
          Fiche
        </h2>
        <dl className="g-facts" data-testid="vehicle-facts">
          <dt>Type</dt>
          <dd>{vehicleTypeLabels[v.vehicleType]}</dd>
          <dt>Marque</dt>
          <dd>
            {v.makeName}
            {country ? ` · ${country}` : ""}
          </dd>
          <dt>Modèle</dt>
          <dd>{v.modelName}</dd>
          {v.generationName && (
            <>
              <dt>Génération</dt>
              <dd>{v.generationName}</dd>
            </>
          )}
          {v.year && (
            <>
              <dt>Année</dt>
              <dd>{v.year}</dd>
            </>
          )}
          {v.engine && (
            <>
              <dt>Moteur</dt>
              <dd>{v.engine}</dd>
            </>
          )}
          {v.powerHp && (
            <>
              <dt>Puissance</dt>
              <dd>{v.powerHp} ch</dd>
            </>
          )}
          {v.weightKg && (
            <>
              <dt>Poids</dt>
              <dd>{v.weightKg} kg</dd>
            </>
          )}
          {v.color && (
            <>
              <dt>Couleur</dt>
              <dd>{v.color}</dd>
            </>
          )}
          <dt>Plaque</dt>
          <dd>{v.unregistered ? "Non immatriculé" : (v.plate ?? "—")}</dd>
        </dl>
        {v.preparation && (
          <>
            <h3 className="s-label o-t-label">Préparation</h3>
            <p className="s-prewrap">{v.preparation}</p>
          </>
        )}
        {v.description && (
          <>
            <h3 className="s-label o-t-label">Description</h3>
            <p className="s-prewrap">{v.description}</p>
          </>
        )}
      </section>

      <section className="s-stack s-stack--tight" aria-labelledby="certification" data-testid="certification">
        <h2 id="certification" className="s-h2">
          Certification
        </h2>
        {cert.certified ? (
          <p>
            <Chip variant="verified">Certifié</Chip> depuis le {cert.certifiedAt ? formatDay(cert.certifiedAt) : ""}.
            Elle se perd si la fiche technique est modifiée, ou après six mois sans événement.
          </p>
        ) : (
          <>
            {cert.lostReason && (
              <p className="s-notice s-notice--alert">
                Certification perdue : {certificationLostLabels[cert.lostReason].toLowerCase()}.
              </p>
            )}
            {cert.request?.status === "pending" && (
              <p className="s-notice">{certificationStatusLabels.pending}. L'équipe Orasso valide à la main.</p>
            )}
            {cert.request?.status === "refused" && (
              <p className="s-notice s-notice--alert">
                {certificationStatusLabels.refused}
                {cert.request.note ? ` : ${cert.request.note}` : "."}
              </p>
            )}
            <ul className="g-conditions">
              {certificationConditions.map((c) => (
                <li key={c.key} className={missing.has(c.key) ? "is-missing" : undefined}>
                  <Icon name={missing.has(c.key) ? "close" : "check"} size={18} />
                  {c.label}
                </li>
              ))}
            </ul>
            {cert.missing.some((m) => m === "plate" || m === "pending") && (
              <p className="o-t-meta">
                {cert.missing
                  .filter((m) => m === "plate" || m === "pending")
                  .map((m) => certificationMissingLabels[m])
                  .join(" · ")}
              </p>
            )}
            {cert.eligible && (
              <Form method="post" className="s-form">
                <TextAreaField label="Message pour l'équipe (facultatif)" name="message" rows={2} maxLength={500} />
                <Button type="submit" name="intent" value="certify" variant="primary" icon="check" loading={busy}>
                  Demander la certification
                </Button>
              </Form>
            )}
          </>
        )}
      </section>

      <section className="s-stack s-stack--tight" aria-labelledby="partage">
        <h2 id="partage" className="s-h2">
          {shareSheetLabels.title}
        </h2>
        {/* Lot 57 : carte à partager (trois styles, aperçu de la story, téléchargement), comme l'appli. */}
        <ShareCard vehicleId={v.id} version={v.shareVersion} />
      </section>

      <section className="s-stack s-stack--tight" aria-labelledby="historique">
        <h2 id="historique" className="s-h2">
          Historique
        </h2>
        {history.length === 0 ? (
          <p className="s-muted">Ce véhicule n'a pas encore participé à un événement.</p>
        ) : (
          <ul className="g-history" data-testid="vehicle-history">
            {history.map((h) => (
              <li key={h.applicationId}>
                <a href={`/e/${h.eventSlug}`}>{h.eventTitle}</a>
                <span className="o-t-meta">
                  {formatDay(h.startsAt)} ·{" "}
                  {h.attended
                    ? "Présent"
                    : (applicationStatusLabels[h.status as keyof typeof applicationStatusLabels] ?? h.status)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="g-sheet">
        <summary>Modifier la fiche</summary>
        <Form method="post" className="s-form" data-testid="vehicle-edit">
          <div className="s-two">
            <TextField label="Année" name="year" inputMode="numeric" maxLength={4} defaultValue={v.year ?? ""} />
            <TextField label="Couleur" name="color" defaultValue={v.color ?? ""} />
          </div>
          <TextField label="Moteur" name="engine" defaultValue={v.engine ?? ""} />
          <div className="s-two">
            <TextField label="Puissance (ch)" name="powerHp" inputMode="numeric" defaultValue={v.powerHp ?? ""} />
            <TextField label="Poids (kg)" name="weightKg" inputMode="numeric" defaultValue={v.weightKg ?? ""} />
          </div>
          <TextAreaField label="Préparation" name="preparation" rows={3} defaultValue={v.preparation ?? ""} />
          <TextAreaField label="Description" name="description" rows={4} defaultValue={v.description ?? ""} />
          <fieldset className="g-cats">
            <legend className="o-field__label o-t-label">Catégories</legend>
            {categories.map((c) => (
              <div key={c.id} className={c.eligible || chosen.has(c.id) ? "g-cat" : "g-cat is-off"}>
                <label>
                  <input
                    type="checkbox"
                    name="categoryIds"
                    value={c.id}
                    defaultChecked={chosen.has(c.id)}
                    disabled={!c.eligible && !chosen.has(c.id)}
                  />
                  {c.label}
                </label>
                {!c.eligible && <span className="o-t-meta">{c.reason}</span>}
              </div>
            ))}
          </fieldset>
          {v.certified && (
            <p className="s-notice">
              Modifier les champs techniques (moteur, puissance, poids, année), les catégories ou les photos fait perdre
              la certification ; la description et la préparation, non.
            </p>
          )}
          <Button type="submit" name="intent" value="update" variant="secondary" icon="check" loading={busy}>
            Enregistrer
          </Button>
        </Form>
      </details>

      {archived ? (
        <Form method="post" className="s-row">
          <Button type="submit" name="intent" value="restore" variant="secondary" icon="undo" loading={busy}>
            Remettre dans le garage actif
          </Button>
        </Form>
      ) : (
        <details className="g-sheet" data-testid="archive-sheet">
          <summary>Archiver : vendu, souvenir, accidenté</summary>
          <Form method="post" className="s-form">
            <fieldset className="g-choices">
              <legend className="o-field__label o-t-label">Statut</legend>
              {archiveStatusChoices.map((c) => (
                <label key={c.status} className="g-choice">
                  <input type="radio" name="status" value={c.status} required />
                  <span>
                    <strong>{c.label}</strong>
                    <br />
                    <span className="o-t-meta">{c.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <TextField label="Motif (facultatif)" name="statusNote" maxLength={300} />
            <Button type="submit" name="intent" value="archive" variant="secondary" icon="entry" loading={busy}>
              Archiver ce véhicule
            </Button>
          </Form>
        </details>
      )}

      <Form
        method="post"
        onSubmit={(e) => {
          if (!window.confirm("Supprimer ce véhicule ? Impossible s'il a déjà participé à un événement.")) {
            e.preventDefault();
          }
        }}
      >
        <Button type="submit" name="intent" value="delete" variant="secondary" icon="close" loading={busy}>
          Supprimer le véhicule
        </Button>
      </Form>
    </div>
  );
}
