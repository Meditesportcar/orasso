// Espace pro, fiche (`/pro/<slug>`) : publication, vérification du SIRET (badge « pro vérifié » automatique), fiche,
// remises par grade, photos de réalisations, organisateurs partenaires.
import { Button, Chip, Plate, SelectField, TextField } from "@orasso/design-system/web";
import {
  gradeLabels,
  grades,
  type Page,
  PRO_DISCOUNT_MAX_PERCENT,
  PRO_MAX_PHOTOS,
  type ProOwner,
  type StructureCard,
} from "@orasso/shared";
import { data, Form, useNavigation } from "react-router";

import { FileField } from "../components/Fields";
import { ProFicheFields } from "../components/ProFicheFields";
import { api, apiOrThrow, originOf } from "../lib/api.server";
import { formatDay } from "../lib/format";
import { proBodyFrom } from "../lib/proForm.server";
import type { Route } from "./+types/pro-fiche";

export function meta() {
  return [{ title: "Ma fiche pro · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const pro = await apiOrThrow<ProOwner>(request, "/me/pro");
  const structures = await api<Page<StructureCard>>(request, "/structures?limit=100");
  const url = new URL(request.url);
  return {
    pro,
    structures: structures.ok ? structures.data.items : [],
    origin: originOf(request),
    created: url.searchParams.get("creee") === "1",
  };
}

type Section = "publish" | "siret" | "fiche" | "discounts" | "photos" | "partners";
type Result = { section: Section; error?: string; ok?: string };

export async function action({ request }: Route.ActionArgs) {
  const pro = await apiOrThrow<ProOwner>(request, "/me/pro");
  const form = await request.formData();
  const text = (name: string) => String(form.get(name) ?? "").trim();
  const intent = text("intent");
  const fail = (section: Section, error: string, status = 400) => data({ section, error } satisfies Result, { status });
  const ok = (section: Section, message: string) => data({ section, ok: message } satisfies Result);

  if (intent === "publish" || intent === "unpublish") {
    const res = await api(request, `/pros/${pro.id}/published`, {
      method: "PUT",
      json: { published: intent === "publish" },
    });
    if (!res.ok) return fail("publish", res.error.message, res.status);
    return ok("publish", intent === "publish" ? "Fiche publiée dans l'annuaire." : "Fiche repassée en brouillon.");
  }

  if (intent === "siret") {
    const res = await api<ProOwner>(request, `/pros/${pro.id}/siret/check`, {
      method: "POST",
      json: { number: text("number") },
    });
    if (!res.ok) return fail("siret", res.error.message, res.status);
    return ok(
      "siret",
      res.data.verifiedAt ? "SIRET vérifié : ta fiche porte le badge « Pro vérifié »." : "Contrôle effectué.",
    );
  }

  if (intent === "fiche") {
    const parsed = proBodyFrom(form);
    if ("error" in parsed) return fail("fiche", parsed.error);
    const res = await api(request, `/pros/${pro.id}`, { method: "PATCH", json: parsed.body });
    if (!res.ok) return fail("fiche", res.error.message, res.status);
    const logo = form.get("logo");
    if (logo instanceof File && logo.size > 0) {
      const upload = new FormData();
      upload.set("logo", logo);
      const sent = await api(request, `/pros/${pro.id}/logo`, { method: "POST", body: upload });
      if (!sent.ok) return fail("fiche", sent.error.message, sent.status);
    }
    return ok("fiche", "Fiche enregistrée.");
  }

  if (intent === "discounts") {
    const discounts: Record<string, number | null> = {};
    for (const g of grades) {
      const raw = text(`discount_${g}`);
      if (!raw) {
        discounts[g] = null;
        continue;
      }
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0 || n > PRO_DISCOUNT_MAX_PERCENT) {
        return fail("discounts", `Remise de ${gradeLabels[g]} : un nombre entier de 0 à ${PRO_DISCOUNT_MAX_PERCENT}.`);
      }
      discounts[g] = n === 0 ? null : n;
    }
    const res = await api(request, `/pros/${pro.id}/discounts`, { method: "PUT", json: { discounts } });
    if (!res.ok) return fail("discounts", res.error.message, res.status);
    return ok("discounts", "Remises enregistrées.");
  }

  if (intent === "add-photo") {
    const file = form.get("photo");
    if (!(file instanceof File) || file.size === 0) return fail("photos", "Choisis une photo à envoyer.");
    const upload = new FormData();
    upload.set("photo", file);
    const res = await api(request, `/pros/${pro.id}/photos`, { method: "POST", body: upload });
    if (!res.ok) return fail("photos", res.error.message, res.status);
    return ok("photos", "Photo ajoutée.");
  }

  if (intent === "remove-photo") {
    const res = await api(request, `/pros/${pro.id}/photos/${encodeURIComponent(text("photoId"))}`, {
      method: "DELETE",
    });
    if (!res.ok) return fail("photos", res.error.message, res.status);
    return ok("photos", "Photo retirée.");
  }

  if (intent === "partner-request") {
    const res = await api(request, `/pros/${pro.id}/partners`, {
      method: "POST",
      json: { structureSlug: text("structureSlug") },
    });
    if (!res.ok) return fail("partners", res.error.message, res.status);
    return ok("partners", "Demande envoyée : l'équipe organisatrice doit l'accepter.");
  }

  if (intent === "partner-remove") {
    const res = await api(request, `/pros/${pro.id}/partners/${encodeURIComponent(text("structureSlug"))}`, {
      method: "DELETE",
    });
    if (!res.ok) return fail("partners", res.error.message, res.status);
    return ok("partners", "Partenariat retiré.");
  }

  return fail("fiche", "Action inconnue.");
}

export default function ProFiche({ loaderData, actionData }: Route.ComponentProps) {
  const { pro, structures, origin, created } = loaderData;
  const busy = useNavigation().state !== "idle";
  const result = actionData as Result | undefined;
  const check = pro.registryCheck;
  const message = (section: Section) =>
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
  const linked = new Set(pro.partnerLinks.map((l) => l.structureSlug));
  const available = structures.filter((s) => !linked.has(s.slug));

  return (
    <>
      <div className="orga__head">
        <div>
          <div className="s-label o-t-label">Espace pro</div>
          <h1 className="s-title">{pro.name}</h1>
        </div>
        <div className="s-row">
          {pro.verifiedAt && (
            <Chip variant="accent" data-testid="pro-verified-chip">
              Pro vérifié
            </Chip>
          )}
          <Chip variant={pro.published ? "accent" : undefined} data-testid="pro-state">
            {pro.published ? "Publiée" : "Brouillon"}
          </Chip>
        </div>
      </div>
      {created && (
        <p className="s-notice s-notice--ok" role="status">
          Fiche créée en brouillon. Vérifie ton SIRET, règle tes remises et publie-la pour qu'elle apparaisse dans
          l'annuaire.
        </p>
      )}

      <section className="orga__panel s-stack" aria-labelledby="publish-title" data-testid="pro-publish">
        <h2 id="publish-title" className="s-h2">
          Publication
        </h2>
        <p className="s-muted">
          {pro.published ? (
            <>
              Ta fiche est visible dans l'annuaire :{" "}
              <a href={`/p/${pro.slug}`}>
                {origin}/p/{pro.slug}
              </a>
              .
            </>
          ) : (
            (pro.publishBlockedReason ?? "Ta fiche est en brouillon : elle n'apparaît pas encore dans l'annuaire.")
          )}
        </p>
        <Form method="post">
          <input type="hidden" name="intent" value={pro.published ? "unpublish" : "publish"} />
          <Button
            type="submit"
            icon={pro.published ? "undo" : "check"}
            variant={pro.published ? "secondary" : "primary"}
            disabled={!pro.published && !pro.canPublish}
            loading={busy}
          >
            {pro.published ? "Repasser en brouillon" : "Publier ma fiche"}
          </Button>
        </Form>
        {message("publish")}
      </section>

      <section className="orga__panel s-stack" aria-labelledby="siret-title" data-testid="pro-siret">
        <h2 id="siret-title" className="s-h2">
          Vérification du SIRET
        </h2>
        {pro.verifiedAt ? (
          <p>
            SIRET <strong>{pro.siret}</strong>
            {pro.registryCheck?.name ? ` (${pro.registryCheck.name})` : ""} vérifié le {formatDay(pro.verifiedAt)} : ta
            fiche porte le badge « Pro vérifié ».
          </p>
        ) : (
          <p className="s-muted">
            Ton numéro est contrôlé automatiquement dans le registre public des entreprises : s'il est trouvé et actif,
            le badge « Pro vérifié » apparaît tout de suite, sans validation manuelle.
          </p>
        )}
        <Form method="post" className="s-plate-in">
          <input type="hidden" name="intent" value="siret" />
          <TextField label="SIRET (14 chiffres)" name="number" defaultValue={pro.siret ?? ""} required />
          <Button type="submit" variant="secondary" icon="search" loading={busy}>
            {pro.verifiedAt ? "Recontrôler" : "Contrôler"}
          </Button>
        </Form>
        {message("siret")}
        {check && !pro.verifiedAt && (
          <p className="s-notice" data-testid="siret-result">
            {check.status === "closed"
              ? "Établissement fermé dans le registre."
              : check.status === "not_found"
                ? "Numéro introuvable dans le registre public."
                : check.status === "unavailable"
                  ? "Le registre de l'État ne répond pas : réessaie dans quelques minutes."
                  : "Contrôle effectué."}
          </p>
        )}
      </section>

      <section className="orga__panel s-stack" aria-labelledby="discounts-title" data-testid="pro-discounts-form">
        <h2 id="discounts-title" className="s-h2">
          Remises par grade
        </h2>
        <p className="s-muted">
          Ces remises sont financées par toi. Ton client montre le QR de son compte dans l'appli : tu lis son pseudo,
          son grade et la remise correspondante (de 1 à {PRO_DISCOUNT_MAX_PERCENT} %, croissante avec le grade).
        </p>
        <Form method="post" className="s-form">
          <input type="hidden" name="intent" value="discounts" />
          <div className="s-two">
            {grades.map((g) => (
              <TextField
                key={g}
                label={`${gradeLabels[g]} (%)`}
                name={`discount_${g}`}
                type="number"
                min={0}
                max={PRO_DISCOUNT_MAX_PERCENT}
                inputMode="numeric"
                defaultValue={pro.discounts[g] ?? ""}
                placeholder="Aucune"
              />
            ))}
          </div>
          {message("discounts")}
          <div>
            <Button type="submit" variant="secondary" icon="check" loading={busy}>
              Enregistrer les remises
            </Button>
          </div>
        </Form>
      </section>

      <section className="orga__panel s-stack" aria-labelledby="fiche-title">
        <h2 id="fiche-title" className="s-h2">
          Fiche publique
        </h2>
        <Form method="post" encType="multipart/form-data" className="s-form" data-testid="pro-form">
          <input type="hidden" name="intent" value="fiche" />
          <ProFicheFields pro={pro} />
          <FileField label="Nouveau logo" name="logo" accept="image/*" />
          {message("fiche")}
          <div>
            <Button type="submit" variant="secondary" icon="check" loading={busy}>
              Enregistrer la fiche
            </Button>
          </div>
        </Form>
      </section>

      <section className="orga__panel s-stack" aria-labelledby="photos-title" data-testid="pro-photos-form">
        <h2 id="photos-title" className="s-h2">
          Photos de réalisations
        </h2>
        {pro.photos.length > 0 && (
          <ul className="s-photos s-photos--edit">
            {pro.photos.map((p) => (
              <li key={p.id}>
                <img src={p.url} alt="Réalisation" loading="lazy" />
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
        {pro.photos.length < PRO_MAX_PHOTOS ? (
          <Form method="post" encType="multipart/form-data" className="s-stack">
            <input type="hidden" name="intent" value="add-photo" />
            <FileField
              label={`Ajouter une photo (${pro.photos.length} / ${PRO_MAX_PHOTOS})`}
              name="photo"
              accept="image/*"
              required
            />
            <div>
              <Button type="submit" variant="secondary" icon="add" loading={busy}>
                Ajouter
              </Button>
            </div>
          </Form>
        ) : (
          <p className="s-muted">{PRO_MAX_PHOTOS} photos au maximum.</p>
        )}
        {message("photos")}
      </section>

      <section className="orga__panel s-stack" aria-labelledby="partners-title" data-testid="pro-partners-form">
        <h2 id="partners-title" className="s-h2">
          Organisateurs partenaires
        </h2>
        <p className="s-muted">
          Propose un partenariat à un organisateur vérifié : s'il l'accepte, ta fiche apparaît sur sa page et la sienne
          sur la tienne.
        </p>
        {pro.partnerLinks.length > 0 && (
          <ul className="s-docs">
            {pro.partnerLinks.map((l) => (
              <li key={l.structureSlug} className="s-row s-row--between">
                <span>
                  <strong>{l.structureName}</strong> ·{" "}
                  {l.status === "accepted" ? "Partenaire" : "En attente de réponse"}
                </span>
                <Form method="post">
                  <input type="hidden" name="intent" value="partner-remove" />
                  <input type="hidden" name="structureSlug" value={l.structureSlug} />
                  <Button type="submit" variant="secondary" icon="close">
                    Retirer
                  </Button>
                </Form>
              </li>
            ))}
          </ul>
        )}
        {available.length > 0 && (
          <Form method="post" className="s-plate-in">
            <input type="hidden" name="intent" value="partner-request" />
            <SelectField
              label="Organisateur"
              name="structureSlug"
              options={available.map((s) => ({ value: s.slug, label: s.name }))}
            />
            <Button type="submit" variant="secondary" icon="add" loading={busy}>
              Proposer
            </Button>
          </Form>
        )}
        {message("partners")}
      </section>

      <Plate as="section" kind="note">
        <p className="s-muted">
          {pro.subscription.label}. <a href={`/pro/${pro.slug}/abonnement`}>Voir l'abonnement</a>.
        </p>
      </Plate>
    </>
  );
}
