// Inscription express sur place (docs/01 « Accueil sur place », docs/02 parcours n° 3) : le staff a saisi l'e-mail du
// conducteur, qui ouvre ce lien reçu par e-mail. Un formulaire de deux minutes crée le compte, le véhicule (accepté
// d'office pour l'événement en cours) et affiche le QR d'inscription dans le navigateur.

import { Button, CheckboxField, Icon, Plate, SelectField, TextField } from "@orasso/design-system/web";
import {
  type ExpressInvitePublic,
  expressLabels,
  passwordHint,
  passwordMissing,
  type VehicleFull,
  type VehicleGeneration,
  type VehicleMake,
  type VehicleModel,
} from "@orasso/shared";
import { useEffect, useState } from "react";
import { data, Form, useNavigation } from "react-router";
import { FirstMissing, TermsField } from "../components/Fields";
import { PhotoWithPlate, plateDecisionError } from "../components/PlateFrame";
import { apiFetch } from "../lib/api.client";
import { api, apiOrThrow, cookieFrom, withCookies } from "../lib/api.server";
import { nowMs } from "../lib/clock";
import { formatDateTime } from "../lib/format";
import { plateFields } from "../lib/vehicle-add";
import type { Route } from "./+types/express";

export function meta() {
  return [{ title: "Inscription express · Orasso" }, { name: "robots", content: "noindex, nofollow" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const invite = await apiOrThrow<ExpressInvitePublic>(request, `/express/${encodeURIComponent(params.jeton)}`);
  const makes = await api<VehicleMake[]>(request, "/vehicle-reference/makes");
  return {
    invite,
    makes: makes.ok ? makes.data : [],
    expired: new Date(invite.expiresAt).getTime() <= nowMs(),
  };
}

type Errors = Partial<
  Record<
    | "pseudo"
    | "password"
    | "password2"
    | "firstName"
    | "lastName"
    | "plate"
    | "makeId"
    | "modelId"
    | "photo"
    | "terms"
    | "form",
    string
  >
>;
type Done = { photoSent: boolean };
/** Lot R3d : l'ordre des champs du formulaire, pour la ligne « ce qui manque » sous le bouton. */
const expressFieldOrder = [
  "pseudo",
  "password",
  "password2",
  "firstName",
  "lastName",
  "makeId",
  "modelId",
  "plate",
  "photo",
  "terms",
] as const;

export async function action({ request, params }: Route.ActionArgs) {
  const form = await request.formData();
  const text = (name: string) => String(form.get(name) ?? "").trim();
  const unregistered = form.get("unregistered") === "on";
  const photo = form.get("photo");
  const errors: Errors = {};
  // Lot M1, tour 2 : la photo part avec son cadre de plaque, ou « aucune plaque visible » confirmé (l'API l'exige).
  if (photo instanceof File && photo.size > 0) {
    const issue = plateDecisionError(form);
    if (issue) errors.photo = issue;
  }
  if (!/^[A-Za-z0-9_.]{3,24}$/.test(text("pseudo"))) {
    errors.pseudo = "3 à 24 caractères : lettres, chiffres, « _ » ou « . ».";
  } else {
    const free = await api<{ available: boolean }>(
      request,
      `/pseudo-available?pseudo=${encodeURIComponent(text("pseudo"))}`,
    );
    if (free.ok && !free.data.available) errors.pseudo = "Ce pseudo est déjà pris.";
  }
  const password = String(form.get("password") ?? "");
  // Lot R3d : le message dit combien de caractères manquent (règle partagée avec l'appli).
  const passwordIssue = passwordMissing(password);
  if (passwordIssue) errors.password = passwordIssue;
  const terms = form.get("terms") === "on";
  if (!terms) errors.terms = expressLabels.termsRequired;
  if (password !== String(form.get("password2") ?? "")) errors.password2 = "Les deux mots de passe sont différents.";
  if (!text("firstName")) errors.firstName = "Indique ton prénom.";
  if (!text("lastName")) errors.lastName = "Indique ton nom.";
  if (!unregistered && !text("plate")) errors.plate = "Plaque obligatoire (ou coche « non immatriculé »).";
  if (!text("makeId")) errors.makeId = "Choisis une marque.";
  if (!text("modelId")) errors.modelId = "Choisis un modèle.";
  const values = {
    pseudo: text("pseudo"),
    firstName: text("firstName"),
    lastName: text("lastName"),
    plate: text("plate"),
    unregistered,
    terms,
  };
  if (Object.keys(errors).length) return data({ errors, values }, { status: 400 });

  const res = await api<{ applicationId: string; eventId: string; passPayload: string }>(
    request,
    `/express/${encodeURIComponent(params.jeton)}`,
    {
      method: "POST",
      json: {
        pseudo: values.pseudo,
        password,
        firstName: values.firstName,
        lastName: values.lastName,
        plate: unregistered ? null : values.plate,
        unregistered,
        makeId: text("makeId"),
        modelId: text("modelId"),
        generationId: text("generationId") || null,
        termsAccepted: true,
      },
    },
  );
  if (!res.ok) {
    const field = res.error.code === "plate_taken" ? "plate" : "form";
    return data({ errors: { [field]: res.error.message } satisfies Errors, values }, { status: res.status });
  }

  // La session vient d'être créée : la photo du véhicule part avec ce cookie (échec non bloquant).
  const cookie = cookieFrom(res.headers);
  let photoSent = false;
  if (photo instanceof File && photo.size > 0) {
    const mine = await api<VehicleFull[]>(request, "/me/vehicles", { cookie });
    const vehicle = mine.ok ? mine.data[0] : undefined;
    if (vehicle) {
      const upload = new FormData();
      upload.set("photo", photo);
      plateFields(form, upload);
      photoSent = (await api(request, `/me/vehicles/${vehicle.id}/photos`, { method: "POST", body: upload, cookie }))
        .ok;
    }
  }
  const done: Done = { photoSent };
  return data({ done }, { headers: withCookies(res.headers) });
}

export default function Express({ loaderData, actionData }: Route.ComponentProps) {
  const { invite, makes, expired } = loaderData;
  const busy = useNavigation().state !== "idle";
  const done = actionData && "done" in actionData ? (actionData.done as Done) : null;
  const errors: Errors = (actionData && "errors" in actionData ? actionData.errors : undefined) ?? {};
  const values = actionData && "values" in actionData ? actionData.values : undefined;
  const [makeId, setMakeId] = useState("");
  const [models, setModels] = useState<VehicleModel[]>([]);
  const [modelId, setModelId] = useState("");
  const [generations, setGenerations] = useState<VehicleGeneration[]>([]);
  const [unregistered, setUnregistered] = useState(false);

  useEffect(() => {
    setModelId("");
    setModels([]);
    if (!makeId) return;
    apiFetch<VehicleModel[]>(`/vehicle-reference/makes/${makeId}/models`).then((res) => {
      if (res.ok) setModels(res.data);
    });
  }, [makeId]);

  useEffect(() => {
    setGenerations([]);
    if (!modelId) return;
    apiFetch<VehicleGeneration[]>(`/vehicle-reference/models/${modelId}/generations`).then((res) => {
      if (res.ok) setGenerations(res.data);
    });
  }, [modelId]);

  if (done) {
    return (
      <div className="s-narrow s-stack" data-testid="express-done">
        <div className="o-t-label s-label">Inscription express</div>
        {/* Lot 36 : l'entrée est déjà validée (pointée « express ») : pas de QR à montrer, l'invitation à l'appli. */}
        <h1 className="s-title">{expressLabels.doneTitle}</h1>
        <p className="s-lead" data-testid="express-entry-ok">
          {expressLabels.doneBody(invite.event.title)}
        </p>
        {!done.photoSent && <p className="s-notice">{expressLabels.photoFailed}</p>}
        <Plate as="section" className="s-stack" aria-label={expressLabels.appTitle} data-testid="express-app">
          <h2 className="o-t-label">{expressLabels.appTitle}</h2>
          <p className="o-t-body">{expressLabels.appBody}</p>
          <Button variant="primary" icon="export" href="/appli" fullWidth>
            {expressLabels.appButton}
          </Button>
        </Plate>
      </div>
    );
  }

  if (invite.used) {
    return (
      <div className="s-narrow s-stack">
        <h1 className="s-title">Lien déjà utilisé</h1>
        <p className="s-lead">Ce lien a déjà servi à créer un compte. Connecte-toi pour retrouver ton accès.</p>
        <Button variant="primary" icon="entry" href="/connexion?retour=%2Fapp%2Fsorties" fullWidth>
          Se connecter
        </Button>
      </div>
    );
  }
  if (expired) {
    return (
      <div className="s-narrow s-stack">
        <h1 className="s-title">Lien expiré</h1>
        <p className="s-lead">Ce lien n'est plus valable. Demande-en un nouveau au staff, à l'entrée.</p>
      </div>
    );
  }

  const visibleModels = models;
  return (
    <div className="s-narrow s-stack">
      <div className="o-t-label s-label">Inscription express</div>
      <h1 className="s-title">{invite.event.title}</h1>
      <p className="s-lead">
        {formatDateTime(invite.event.startsAt)}
        {invite.event.city ? ` · ${invite.event.city}` : ""}. Deux minutes : ton compte, ton véhicule, et ton QR d'accès
        s'affiche aussitôt. Ton adresse : <strong>{invite.email}</strong>.
      </p>
      <Form method="post" encType="multipart/form-data" className="s-form" data-testid="express-form">
        <TextField
          label="Pseudo"
          name="pseudo"
          autoComplete="username"
          defaultValue={values?.pseudo}
          help="3 à 24 caractères : lettres, chiffres, « _ » ou « . »"
          error={errors.pseudo}
          tall
          required
        />
        <TextField
          label="Mot de passe"
          name="password"
          type="password"
          autoComplete="new-password"
          revealable
          help={passwordHint}
          error={errors.password}
          tall
          required
        />
        <TextField
          label="Mot de passe, encore une fois"
          name="password2"
          type="password"
          autoComplete="new-password"
          revealable
          error={errors.password2}
          tall
          required
        />
        <div className="s-two">
          <TextField
            label="Prénom"
            name="firstName"
            autoComplete="given-name"
            defaultValue={values?.firstName}
            error={errors.firstName}
            tall
            required
          />
          <TextField
            label="Nom"
            name="lastName"
            autoComplete="family-name"
            defaultValue={values?.lastName}
            error={errors.lastName}
            tall
            required
          />
        </div>
        <Plate as="section" className="s-stack" aria-label="Ton véhicule">
          <h2 className="o-t-label">Ton véhicule</h2>
          <SelectField
            label="Marque"
            name="makeId"
            value={makeId}
            onChange={(e) => setMakeId(e.currentTarget.value)}
            placeholder="Choisis une marque"
            options={makes.map((m) => ({ value: m.id, label: m.name }))}
            error={errors.makeId}
            tall
          />
          <SelectField
            label="Modèle"
            name="modelId"
            value={modelId}
            onChange={(e) => setModelId(e.currentTarget.value)}
            placeholder="Choisis un modèle"
            options={visibleModels.map((m) => ({ value: m.id, label: m.name }))}
            error={errors.modelId}
            tall
          />
          {generations.length > 0 && (
            <SelectField
              label="Génération (facultatif)"
              name="generationId"
              defaultValue=""
              options={[
                { value: "", label: "Je ne sais pas" },
                ...generations.map((g) => ({ value: g.id, label: g.name })),
              ]}
              tall
            />
          )}
          <TextField
            label="Plaque d'immatriculation"
            name="plate"
            autoCapitalize="characters"
            defaultValue={values?.plate}
            help="Visible par l'équipe organisatrice seulement."
            error={errors.plate}
            disabled={unregistered}
            tall
          />
          <CheckboxField
            name="unregistered"
            label="Véhicule non immatriculé"
            checked={unregistered}
            onChange={(e) => setUnregistered(e.currentTarget.checked)}
          />
          {/* Lot M1, tour 2 : cadre de plaque comme à l'ajout (l'API refuse une photo sans décision sur la plaque). */}
          <PhotoWithPlate
            label="Photo du véhicule"
            help="Prends-la sur place avec ton téléphone, puis masque sa plaque."
            error={errors.photo}
            testId="express-plate-frame"
          />
        </Plate>
        {/* Lot 36 : conditions générales, case obligatoire et tracée (`profiles.terms_accepted_at`). */}
        <TermsField error={errors.terms} defaultChecked={values?.terms} />
        {errors.form && (
          <p className="s-error" role="alert">
            {errors.form}
          </p>
        )}
        <Button type="submit" icon="express" loading={busy} fullWidth>
          M'inscrire
        </Button>
        <FirstMissing errors={errors} order={expressFieldOrder} />
      </Form>
      <p className="o-t-caption s-muted">
        <Icon name="qr" size={16} /> Le lien est valable jusqu'au {formatDateTime(invite.expiresAt)}.
      </p>
    </div>
  );
}
