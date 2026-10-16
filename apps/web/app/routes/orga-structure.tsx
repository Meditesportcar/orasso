// Fiche de la structure et vérification (docs/01, bloc 1 : SIRET ou RNA contrôlé dans les registres publics, puis
// justificatif validé à la main par l'équipe Orasso → badge « Structure vérifiée »).
import { Button, Chip, Plate, SelectField, TextField } from "@orasso/design-system/web";
import {
  departmentSchema,
  type StructureOrganizer,
  type StructureUpdate,
  type StructureVerificationView,
  structureKindLabels,
  structureVerificationLabels,
  type VerificationDocumentKind,
  verificationDocumentKindLabels,
  verificationDocumentKinds,
} from "@orasso/shared";
import { data, Form, useNavigation } from "react-router";

import { FileField, TextAreaField } from "../components/Fields";
import { ShareButtons } from "../components/ShareButtons";
import { api, apiOrThrow, originOf, requireMe } from "../lib/api.server";
import { formatDay } from "../lib/format";
import type { Route } from "./+types/orga-structure";

export function meta() {
  return [{ title: "Structure · Orasso" }, { name: "robots", content: "noindex" }];
}

async function organizerStructure(request: Request, slug: string) {
  const me = await requireMe(request);
  const membership = me.memberships.find((m) => m.structureSlug === slug && m.status === "active");
  if (!membership || membership.role === "staff") {
    throw new Response("Réservé aux organisateurs de la structure.", { status: 403 });
  }
  return membership.structureId;
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const id = await organizerStructure(request, params.structure);
  const [structure, verification] = await Promise.all([
    apiOrThrow<StructureOrganizer>(request, `/structures/${id}`),
    apiOrThrow<StructureVerificationView>(request, `/structures/${id}/verification`),
  ]);
  const url = new URL(request.url);
  return {
    structure,
    verification,
    origin: originOf(request),
    created: url.searchParams.get("creee") === "1",
    logoRefused: url.searchParams.get("logo") === "refuse",
  };
}

type Result = { section: "fiche" | "check" | "documents" | "submit"; error?: string; ok?: string };

export async function action({ request, params }: Route.ActionArgs) {
  const id = await organizerStructure(request, params.structure);
  const form = await request.formData();
  const text = (name: string) => String(form.get(name) ?? "").trim();
  const intent = text("intent");

  if (intent === "check") {
    const res = await api<StructureVerificationView>(request, `/structures/${id}/verification/check`, {
      method: "POST",
      json: { number: text("number") },
    });
    if (!res.ok) return data({ section: "check", error: res.error.message } satisfies Result, { status: res.status });
    return data({ section: "check", ok: "Contrôle effectué." } satisfies Result);
  }

  if (intent === "add-document") {
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return data({ section: "documents", error: "Choisis un fichier à envoyer." } satisfies Result, { status: 400 });
    }
    const upload = new FormData();
    upload.set("file", file);
    upload.set("kind", text("kind"));
    const res = await api(request, `/structures/${id}/verification/documents`, { method: "POST", body: upload });
    if (!res.ok)
      return data({ section: "documents", error: res.error.message } satisfies Result, { status: res.status });
    return data({ section: "documents", ok: "Justificatif ajouté." } satisfies Result);
  }

  if (intent === "remove-document") {
    const res = await api(
      request,
      `/structures/${id}/verification/documents/${encodeURIComponent(text("documentId"))}`,
      {
        method: "DELETE",
      },
    );
    if (!res.ok)
      return data({ section: "documents", error: res.error.message } satisfies Result, { status: res.status });
    return data({ section: "documents", ok: "Justificatif retiré." } satisfies Result);
  }

  if (intent === "submit") {
    const res = await api(request, `/structures/${id}/verification/submit`, { method: "POST" });
    if (!res.ok) return data({ section: "submit", error: res.error.message } satisfies Result, { status: res.status });
    return data({ section: "submit", ok: "Envoyé à l'équipe Orasso." } satisfies Result);
  }

  if (intent === "fiche") {
    const departments = text("departments")
      .split(/[\s,;]+/)
      .filter(Boolean);
    if (departments.some((d) => !departmentSchema.safeParse(d).success)) {
      return data(
        { section: "fiche", error: "Codes de département séparés par des virgules (ex. 66, 11)." } satisfies Result,
        {
          status: 400,
        },
      );
    }
    const url = (name: string) => {
      const v = text(name);
      if (!v) return null;
      return /^https?:\/\//i.test(v) ? v : `https://${v}`;
    };
    const socials = Object.fromEntries(
      (["instagram", "facebook", "tiktok", "youtube"] as const).map((k) => [k, url(k)]).filter(([, v]) => v),
    );
    const body: StructureUpdate = {
      name: text("name"),
      description: text("description") || null,
      addressLine: text("addressLine") || null,
      postalCode: text("postalCode") || null,
      city: text("city") || null,
      departments,
      website: url("website"),
      socials,
    };
    const res = await api(request, `/structures/${id}`, { method: "PATCH", json: body });
    if (!res.ok) return data({ section: "fiche", error: res.error.message } satisfies Result, { status: res.status });
    const logo = form.get("logo");
    if (logo instanceof File && logo.size > 0) {
      const upload = new FormData();
      upload.set("logo", logo);
      const sent = await api(request, `/structures/${id}/logo`, { method: "POST", body: upload });
      if (!sent.ok)
        return data({ section: "fiche", error: sent.error.message } satisfies Result, { status: sent.status });
    }
    return data({ section: "fiche", ok: "Fiche enregistrée." } satisfies Result);
  }
  return data({ section: "fiche", error: "Action inconnue." } satisfies Result, { status: 400 });
}

export default function OrgaStructure({ loaderData, actionData }: Route.ComponentProps) {
  const { structure, verification, origin, created, logoRefused } = loaderData;
  const busy = useNavigation().state !== "idle";
  const result = actionData as Result | undefined;
  const check = verification.registryCheck;
  const state = verification.verification;
  const message = (section: Result["section"]) =>
    result?.section === section ? (
      result.error ? (
        <p className="s-error" role="alert">
          {result.error}
        </p>
      ) : result.ok ? (
        <p className="s-notice s-notice--ok" role="status">
          {result.ok}
        </p>
      ) : null
    ) : null;

  return (
    <>
      <div className="orga__head">
        <div>
          <div className="s-label o-t-label">Structure</div>
          <h1 className="s-title">{structure.name}</h1>
        </div>
        <Chip variant={state === "verified" ? "accent" : undefined} data-testid="verification-state">
          {structureVerificationLabels[state]}
        </Chip>
      </div>
      {created && (
        <p className="s-notice s-notice--ok" role="status">
          Structure créée. Tu peux préparer des événements dès maintenant ; pour les publier, fais vérifier la structure
          ci-dessous.
        </p>
      )}
      {logoRefused && (
        <p className="s-notice">Le logo n'a pas pu être envoyé : ajoute-le depuis la fiche ci-dessous.</p>
      )}

      <section className="orga__panel s-stack" aria-labelledby="verif-title" data-testid="verification">
        <h2 id="verif-title" className="s-h2">
          Vérification
        </h2>
        {state === "verified" ? (
          <p>
            Ta structure porte le badge « Structure vérifiée »
            {verification.badgeExpiresAt ? `, valable jusqu'au ${formatDay(verification.badgeExpiresAt)}` : ""}. Tu peux
            publier tes événements.
          </p>
        ) : state === "pending" ? (
          <p className="s-notice" data-testid="verification-pending">
            Dossier envoyé : l'équipe Orasso valide ton justificatif à la main. Tu reçois un e-mail dès que c'est fait.
          </p>
        ) : (
          <p className="s-muted">
            La publication d'événements est réservée aux structures vérifiées, en deux étapes : ton numéro est contrôlé
            automatiquement dans les registres publics, puis l'équipe Orasso valide un justificatif.
          </p>
        )}

        {state !== "verified" && (
          <>
            <Plate as="div" className="s-stack">
              <h3 className="s-tile__title">1. Numéro SIRET ou RNA</h3>
              <Form method="post" className="s-plate-in">
                <input type="hidden" name="intent" value="check" />
                <TextField
                  label="SIRET (14 chiffres) ou RNA (W + 9 chiffres)"
                  name="number"
                  defaultValue={verification.siret ?? verification.rna ?? ""}
                  inputMode="text"
                  required
                />
                <Button type="submit" variant="secondary" icon="search" loading={busy}>
                  Contrôler
                </Button>
              </Form>
              {message("check")}
              {check && (
                <div className="s-stack s-stack--tight" data-testid="registry-result">
                  <div>
                    <Chip variant={check.status === "matched" ? "accent" : undefined}>
                      {check.status === "matched"
                        ? "Trouvé et actif"
                        : check.status === "closed"
                          ? "Établissement fermé"
                          : check.status === "not_found"
                            ? "Introuvable"
                            : "Registre indisponible"}
                    </Chip>
                  </div>
                  {check.name && (
                    <p>
                      <strong>{check.name}</strong>
                      {check.address ? ` · ${check.address}` : ""}
                    </p>
                  )}
                  {check.status === "matched" && structure.kind === "association" && !check.isAssociation && (
                    <p className="s-notice">
                      Ce numéro n'est pas celui d'une association : l'équipe Orasso vérifiera le type de ta structure.
                    </p>
                  )}
                  {check.status === "not_found" && (
                    <p className="s-muted">
                      Numéro absent des registres publics (une association déclarée sans SIRET n'y figure pas). Joins
                      alors le récépissé de déclaration, ou la pièce d'identité de ton responsable pour un club non
                      déclaré.
                    </p>
                  )}
                  {check.status === "unavailable" && (
                    <p className="s-muted">Le registre de l'État ne répond pas : réessaie dans quelques minutes.</p>
                  )}
                </div>
              )}
            </Plate>

            <Plate as="div" className="s-stack">
              <h3 className="s-tile__title">2. Justificatif</h3>
              <p className="s-muted">
                Statuts, récépissé de déclaration ou Kbis (PDF, JPEG ou PNG, 10 Mo au plus). Un club sérieux non déclaré
                joint la pièce d'identité de son responsable : elle est supprimée dès la validation.
              </p>
              {verification.documents.length > 0 && (
                <ul className="s-docs" data-testid="documents">
                  {verification.documents.map((d) => (
                    <li key={d.id} className="s-row s-row--between">
                      <span>
                        <strong>{verificationDocumentKindLabels[d.kind]}</strong> · {d.fileName}
                      </span>
                      {state === "unverified" && (
                        <Form method="post">
                          <input type="hidden" name="intent" value="remove-document" />
                          <input type="hidden" name="documentId" value={d.id} />
                          <Button type="submit" variant="secondary" icon="close">
                            Retirer
                          </Button>
                        </Form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {state !== "pending" && (
                <Form method="post" encType="multipart/form-data" className="s-stack">
                  <input type="hidden" name="intent" value="add-document" />
                  <SelectField
                    label="Nature du document"
                    name="kind"
                    defaultValue="statutes"
                    options={verificationDocumentKinds.map((k: VerificationDocumentKind) => ({
                      value: k,
                      label: verificationDocumentKindLabels[k],
                    }))}
                  />
                  <FileField
                    label="Fichier"
                    name="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    required
                  />
                  <div>
                    <Button type="submit" variant="secondary" icon="add" loading={busy}>
                      Ajouter le justificatif
                    </Button>
                  </div>
                </Form>
              )}
              {message("documents")}
            </Plate>

            {state !== "pending" && (
              <Form method="post" className="s-stack">
                <input type="hidden" name="intent" value="submit" />
                {verification.submitBlockedReason && <p className="s-muted">{verification.submitBlockedReason}</p>}
                <div>
                  <Button type="submit" icon="check" disabled={!verification.canSubmit} loading={busy}>
                    Envoyer pour vérification
                  </Button>
                </div>
                {message("submit")}
              </Form>
            )}
          </>
        )}
      </section>

      <section className="orga__panel s-stack" aria-labelledby="fiche-title">
        <h2 id="fiche-title" className="s-h2">
          Fiche publique
        </h2>
        <p className="s-muted">
          Affichée sur{" "}
          <a href={`/o/${structure.slug}`}>
            {origin}/o/{structure.slug}
          </a>{" "}
          · {structureKindLabels[structure.kind]}
        </p>
        <Form method="post" encType="multipart/form-data" className="s-form">
          <input type="hidden" name="intent" value="fiche" />
          <TextField label="Nom" name="name" defaultValue={structure.name} required />
          <TextAreaField label="Description" name="description" defaultValue={structure.description ?? ""} />
          <TextField label="Adresse" name="addressLine" defaultValue={structure.addressLine ?? ""} />
          <div className="s-two">
            <TextField label="Code postal" name="postalCode" defaultValue={structure.postalCode ?? ""} />
            <TextField label="Ville" name="city" defaultValue={structure.city ?? ""} />
          </div>
          <TextField
            label="Départements couverts"
            name="departments"
            defaultValue={structure.departments.join(", ")}
            help="Codes séparés par des virgules."
          />
          <TextField label="Site web" name="website" defaultValue={structure.website ?? ""} />
          <div className="s-two">
            <TextField label="Instagram" name="instagram" defaultValue={structure.socials.instagram ?? ""} />
            <TextField label="Facebook" name="facebook" defaultValue={structure.socials.facebook ?? ""} />
            <TextField label="TikTok" name="tiktok" defaultValue={structure.socials.tiktok ?? ""} />
            <TextField label="YouTube" name="youtube" defaultValue={structure.socials.youtube ?? ""} />
          </div>
          <FileField label="Nouveau logo" name="logo" accept="image/*" />
          {message("fiche")}
          <div>
            <Button type="submit" variant="secondary" icon="check" loading={busy}>
              Enregistrer la fiche
            </Button>
          </div>
        </Form>
      </section>

      <section className="orga__panel s-stack" aria-labelledby="invite-title">
        <h2 id="invite-title" className="s-h2">
          Lien d'invitation
        </h2>
        <p className="s-muted">
          Les passionnés qui créent leur compte par ce lien suivent {structure.name} et sont prévenus de tes prochains
          événements en avant-première.
        </p>
        <ShareButtons
          url={`${origin}/invitation/${structure.inviteToken}`}
          title={`Rejoins ${structure.name} sur Orasso`}
        />
      </section>
    </>
  );
}
