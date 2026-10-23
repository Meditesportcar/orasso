// Création d'une structure : n'importe quel utilisateur connecté peut en créer une et en devient propriétaire
// (docs/01, bloc 1). La vérification (SIRET ou RNA, justificatif) se fait ensuite dans l'espace de la structure.
import { Button, SelectField, TextField } from "@orasso/design-system/web";
import {
  departmentSchema,
  type StructureCreate,
  type StructureKind,
  type StructureOrganizer,
  structureKindLabels,
  structureKinds,
} from "@orasso/shared";
import { data, Form, redirect, useNavigation } from "react-router";
import { FicheBar, ficheHandle } from "../components/FicheBar";
import { FileField, TextAreaField } from "../components/Fields";
import { api, requireMe } from "../lib/api.server";
import type { Route } from "./+types/structure-nouvelle";

// Lot M7 : fiche ou parcours, mode B (en-tête de fiche, sans bande ni barre d'onglets).
export const handle = ficheHandle;

export function meta() {
  return [{ title: "Créer ma structure · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireMe(request);
  return null;
}

// « Collectivité » viendra plus tard (docs/01) : le type existe en base mais n'est pas proposé.
const KINDS: readonly StructureKind[] = structureKinds.filter((k) => k !== "collectivity");

type Errors = Partial<Record<"kind" | "name" | "departments" | "website" | "logo" | "form" | "social", string>>;

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const text = (name: string) => String(form.get(name) ?? "").trim();
  const errors: Errors = {};
  const kind = text("kind") as StructureKind;
  if (!KINDS.includes(kind)) errors.kind = "Choisis un type de structure.";
  if (text("name").length < 2) errors.name = "Le nom compte au moins 2 caractères.";
  const departments = text("departments")
    .split(/[\s,;]+/)
    .filter(Boolean);
  if (departments.some((d) => !departmentSchema.safeParse(d).success)) {
    errors.departments = "Codes de département séparés par des virgules (ex. 66, 11).";
  }
  const url = (name: string) => {
    const v = text(name);
    if (!v) return null;
    return /^https?:\/\//i.test(v) ? v : `https://${v}`;
  };
  const website = url("website");
  const socials = {
    instagram: url("instagram"),
    facebook: url("facebook"),
    tiktok: url("tiktok"),
    youtube: url("youtube"),
  };
  for (const v of [website, ...Object.values(socials)]) {
    if (v && !URL.canParse(v)) errors.social = "Une adresse web n'est pas valide.";
  }
  const values = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));
  if (Object.keys(errors).length) return data({ errors, values }, { status: 400 });

  const body: Partial<StructureCreate> = {
    kind,
    name: text("name"),
    description: text("description") || null,
    addressLine: text("addressLine") || null,
    postalCode: text("postalCode") || null,
    city: text("city") || null,
    departments,
    website,
    socials: Object.fromEntries(Object.entries(socials).filter(([, v]) => v)),
  };
  const created = await api<StructureOrganizer>(request, "/structures", { method: "POST", json: body });
  if (!created.ok) {
    const message = created.error.details?.fields
      ? Object.values(created.error.details.fields as Record<string, string>).join(" ")
      : created.error.message;
    return data({ errors: { form: message } satisfies Errors, values }, { status: created.status });
  }
  const logo = form.get("logo");
  let query = "?creee=1";
  if (logo instanceof File && logo.size > 0) {
    const upload = new FormData();
    upload.set("logo", logo);
    // Le logo se règle sous la double authentification de l'organisateur : en cas d'échec, il s'ajoute ensuite.
    const sent = await api(request, `/structures/${created.data.id}/logo`, { method: "POST", body: upload });
    if (!sent.ok) query += "&logo=refuse";
  }
  return redirect(`/orga/${created.data.slug}/structure${query}`);
}

export default function StructureNouvelle({ actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  const errors: Errors = actionData?.errors ?? {};
  const v = (actionData?.values ?? {}) as Record<string, string>;
  return (
    <div className="s-narrow s-stack">
      <FicheBar title="Créer ma structure" facts="Organisateur" back="/app/moi" />
      <p className="s-lead">
        Association, club, circuit ou entreprise : tu en deviens le propriétaire. Tu pourras préparer tes événements
        tout de suite ; la publication demande la vérification de la structure (étape suivante).
      </p>
      <Form method="post" encType="multipart/form-data" className="s-form" data-testid="structure-form">
        <SelectField
          label="Type"
          name="kind"
          defaultValue={v.kind ?? "association"}
          options={KINDS.map((k) => ({ value: k, label: structureKindLabels[k] }))}
          error={errors.kind}
        />
        <TextField label="Nom" name="name" defaultValue={v.name} error={errors.name} required />
        <TextAreaField
          label="Description"
          name="description"
          defaultValue={v.description}
          help="Ce que fait la structure, ses événements : affiché sur sa page publique."
        />
        <TextField label="Adresse" name="addressLine" autoComplete="street-address" defaultValue={v.addressLine} />
        <div className="s-two">
          <TextField label="Code postal" name="postalCode" autoComplete="postal-code" defaultValue={v.postalCode} />
          <TextField label="Ville" name="city" autoComplete="address-level2" defaultValue={v.city} />
        </div>
        <TextField
          label="Départements couverts"
          name="departments"
          defaultValue={v.departments}
          placeholder="66, 11"
          help="Les départements où tu organises : codes séparés par des virgules."
          error={errors.departments}
        />
        <TextField label="Site web" name="website" inputMode="url" defaultValue={v.website} placeholder="https://" />
        <div className="s-two">
          <TextField label="Instagram" name="instagram" inputMode="url" defaultValue={v.instagram} />
          <TextField label="Facebook" name="facebook" inputMode="url" defaultValue={v.facebook} />
          <TextField label="TikTok" name="tiktok" inputMode="url" defaultValue={v.tiktok} />
          <TextField label="YouTube" name="youtube" inputMode="url" defaultValue={v.youtube} />
        </div>
        {errors.social && (
          <p className="s-error" role="alert">
            {errors.social}
          </p>
        )}
        <FileField label="Logo" name="logo" accept="image/*" help="Carré de préférence ; JPEG, PNG ou WebP." />
        {errors.form && (
          <p className="s-error" role="alert">
            {errors.form}
          </p>
        )}
        <Button type="submit" icon="add" loading={busy} fullWidth>
          Créer la structure
        </Button>
      </Form>
    </div>
  );
}
