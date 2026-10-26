import { Button, Chip, Icon, type IconName, Plate, TextField } from "@orasso/design-system/web";
import {
  applicationStatusLabels,
  archiveStatusChoices,
  type CategoryOption,
  categoryFamilyLabels,
  certificationConditions,
  certificationLine,
  certificationLineLabels,
  certificationLostLabels,
  certificationMissingLabels,
  certificationStatusLabels,
  cleanVehicleVersion,
  countryLabel,
  type OutgoingPlateTransferView,
  type PlateTransferView,
  plateTransferLabels,
  shareSheetLabels,
  styleLabels,
  VEHICLE_ENGINE_MAX,
  VEHICLE_VERSION_MAX,
  type VehicleDetail,
  type VehicleHistoryItem,
  vehicleAddLabels,
  vehicleStatusLabels,
  vehicleStyleGroups,
  vehicleTypeLabels,
  vehicleWizardLabels,
} from "@orasso/shared";
import { data, Form, redirect, useNavigation } from "react-router";

import { TextAreaField } from "../components/Fields";
import { PhotoWithPlate, PlateFrame, plateDecisionError } from "../components/PlateFrame";
import { ShareCard } from "../components/ShareButtons";
import { StyleProposal } from "../components/StylePicker";
import { api, apiOrThrow } from "../lib/api.server";
import { formatDateTime, formatDay } from "../lib/format";
import { plateFields } from "../lib/vehicle-add";
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
  const query = new URLSearchParams({
    makeId: vehicle.makeId,
    modelId: vehicle.modelId,
    vehicleType: vehicle.vehicleType,
  });
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

type EditFields = {
  year: number | null;
  version: string | null;
  engine: string | null;
  powerHp: number | null;
  weightKg: number | null;
  color: string | null;
  description: string | null;
  preparation: string | null;
  categoryIds: string[];
};

/** Les champs qui diffèrent de la fiche enregistrée (lot M1, tour 2). */
function changedFields(v: VehicleDetail, next: EditFields): Partial<EditFields> {
  const body: Partial<EditFields> = {};
  const same = (a: string | number | null | undefined, b: string | number | null) => (a ?? null) === b;
  if (!same(v.year, next.year)) body.year = next.year;
  if (!same(v.version, next.version)) body.version = next.version;
  if (!same(v.engine?.trim() || null, next.engine)) body.engine = next.engine;
  if (!same(v.powerHp, next.powerHp)) body.powerHp = next.powerHp;
  if (!same(v.weightKg, next.weightKg)) body.weightKg = next.weightKg;
  if (!same(v.color?.trim() || null, next.color)) body.color = next.color;
  if (!same(v.description?.trim() || null, next.description)) body.description = next.description;
  if (!same(v.preparation?.trim() || null, next.preparation)) body.preparation = next.preparation;
  const before = v.categories.map((c) => c.id);
  if (before.length !== next.categoryIds.length || !before.every((id) => next.categoryIds.includes(id))) {
    body.categoryIds = next.categoryIds;
  }
  return body;
}

/** Libellés des champs de « Modifier la fiche », pour dire lequel bloque. */
const FIELD_LABELS: Record<string, string> = {
  year: "Année",
  version: vehicleAddLabels.versionFact,
  engine: "Moteur",
  powerHp: "Puissance",
  weightKg: "Poids",
  color: "Couleur",
  description: "Description",
  preparation: "Préparation",
  categoryIds: "Catégories",
};

/** « Poids : … » quand l'API dit quel champ est refusé, sinon son message. */
function fieldError(error: { message: string; details?: Record<string, unknown> }): string {
  const fields = (error.details?.fields ?? {}) as Record<string, string>;
  const first = Object.keys(fields)[0];
  if (!first) return error.message;
  const label = FIELD_LABELS[first.split(".")[0] ?? ""] ?? first;
  return `${label} : ${fields[first]}`;
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
    // Lot M1, tour 2 : seuls les champs modifiés partent, comme dans l'appli : une fiche ancienne qui dépasse les
    // bornes d'aujourd'hui (poids, puissance, motorisation) reste modifiable pour le reste, sa couleur par exemple.
    const current = await api<VehicleDetail>(request, base);
    if (!current.ok) return fail(current);
    const body = changedFields(current.data, {
      year: numberOrNull(form.get("year")),
      // Lot R4e : la version, nettoyée comme dans l'appli et l'API.
      version: cleanVehicleVersion(text("version")),
      engine: text("engine") || null,
      powerHp: numberOrNull(form.get("powerHp")),
      weightKg: numberOrNull(form.get("weightKg")),
      color: text("color") || null,
      description: text("description") || null,
      preparation: text("preparation") || null,
      categoryIds: form.getAll("categoryIds").map(String),
    });
    if (Object.keys(body).length === 0) return data({ error: null, done: "update" });
    const res = await api(request, base, { method: "PATCH", json: body });
    if (res.ok) return data({ error: null, done: "update" });
    return data({ error: fieldError(res.error), done: null }, { status: res.status });
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
    plateFields(form, upload);
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
  // Lot R5a : familles des styles du type, puis les origines de la marque (« Pays »).
  // Lot R5a, tour 2 : tout ce qui est déjà sur la fiche reste affiché, coché et décochable : en pause (origine comprise,
  // sous « Pays »), ou refusé pour le type ou la marque (« 4x4 » d'un camion) ; enregistrer autre chose ne le retire pas.
  const editGroups = vehicleStyleGroups(categories, v.categories, { keepRefused: true, origins: true });
  const missing = new Set(cert.missing);
  const line = certificationLine(cert, v.photos.length);
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
          {/* Lot R4a : nom tapé, en attente de la liste Orasso (le propriétaire seul le voit). */}
          {(v.proposedMake || v.proposedModel) && <Chip>{vehicleWizardLabels.toBeListed}</Chip>}
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
        <Form method="post" encType="multipart/form-data" className="s-form" id="ajouter-photo">
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
          {/* Lot R4e : la version (« GTI »), après le modèle et la génération. */}
          {v.version && (
            <>
              <dt>{vehicleAddLabels.versionFact}</dt>
              <dd>{v.version}</dd>
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
        {/* Lot M5 : la ligne d'état (ce qui manque en premier) ; un ancien véhicule ne peut pas être certifié. */}
        <p className="o-t-body" data-testid="certification-line">
          <strong>{certificationLineLabels.headline(line)}</strong> ·{" "}
          {certificationLineLabels.detail(line, { photoCount: v.photos.length, missing: cert.missing })}
        </p>
        {line.kind === "impossible" ? null : cert.certified ? (
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
          <TextField
            label={vehicleAddLabels.version}
            name="version"
            maxLength={VEHICLE_VERSION_MAX}
            help={vehicleAddLabels.versionHelp}
            defaultValue={v.version ?? ""}
          />
          <TextField label="Moteur" name="engine" maxLength={VEHICLE_ENGINE_MAX} defaultValue={v.engine ?? ""} />
          <div className="s-two">
            <TextField label="Puissance (ch)" name="powerHp" inputMode="numeric" defaultValue={v.powerHp ?? ""} />
            <TextField label="Poids (kg)" name="weightKg" inputMode="numeric" defaultValue={v.weightKg ?? ""} />
          </div>
          <TextAreaField label="Préparation" name="preparation" rows={3} defaultValue={v.preparation ?? ""} />
          <TextAreaField label="Description" name="description" rows={4} defaultValue={v.description ?? ""} />
          {/* Lot R5a : les styles du type, rangés par famille ; ceux d'un autre type ou d'autres marques et les origines
              d'autres pays ne sont plus listés ; un style de la fiche mis en pause reste affiché « en pause ». */}
          <div className="s-stack" data-testid="vehicle-edit-categories">
            <span className="o-field__label o-t-label">Catégories</span>
            {editGroups.map((g) => (
              <fieldset key={g.family} className="g-cats" data-testid={`edit-family-${g.family}`}>
                <legend className="o-t-caption">{categoryFamilyLabels[g.family]}</legend>
                {g.rows.map((c) => (
                  <div key={c.id} className={c.eligible || chosen.has(c.id) ? "g-cat" : "g-cat is-off"}>
                    <label>
                      <input
                        type="checkbox"
                        name="categoryIds"
                        value={c.id}
                        defaultChecked={chosen.has(c.id)}
                        disabled={!c.eligible && !chosen.has(c.id)}
                      />
                      <Icon name={(c.icon ?? "star") as IconName} size={16} />
                      {c.paused ? `${c.label} · ${styleLabels.paused}` : c.label}
                    </label>
                    {(!c.eligible || c.kept) && c.reason ? <span className="o-t-meta">{c.reason}</span> : null}
                  </div>
                ))}
              </fieldset>
            ))}
          </div>
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
        {/* Lot R5a : « Il manque un style ? Propose-le », pour ce véhicule (posé dessus s'il est retenu). */}
        <StyleProposal vehicleType={v.vehicleType} vehicleId={v.id} vehicleName={v.makeName} />
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
