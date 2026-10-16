// Administration minimale (lot 13) : la file des structures à vérifier. Réservée au super admin. Les autres files
// (pros, signalements, certifications…) viendront avec leurs chantiers.
import { Button, Chip, Ground, Monogram, Plate, ThemeScope } from "@orasso/design-system/web";
import {
  type AdminStructureRow,
  type PlatformSettingKey,
  type PlatformSettings,
  platformSettingKeys,
  platformSettingLabels,
  structureKindLabels,
  structureVerificationLabels,
  verificationDocumentKindLabels,
} from "@orasso/shared";
import { data, Form, redirect, useNavigation } from "react-router";

import { TextAreaField } from "../components/Fields";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import { formatDateTime } from "../lib/format";
import type { Route } from "./+types/admin";

export function meta() {
  return [{ title: "Administration · Orasso" }, { name: "robots", content: "noindex, nofollow" }];
}

async function requireSuperAdmin(request: Request) {
  const me = await requireMe(request);
  if (me.profile.platformRole !== "super_admin") {
    throw new Response("Réservé à l'administration d'Orasso.", { status: 403 });
  }
  return me;
}

export async function loader({ request }: Route.LoaderArgs) {
  const me = await requireSuperAdmin(request);
  const all = new URL(request.url).searchParams.get("tout") === "1";
  const rows = await apiOrThrow<AdminStructureRow[]>(request, `/admin/structures?status=${all ? "all" : "pending"}`);
  const settings = await apiOrThrow<PlatformSettings>(request, "/admin/settings");
  return { rows, settings, all, pseudo: me.profile.pseudo, twoFactorRequired: me.twoFactorRequired };
}

export async function action({ request }: Route.ActionArgs) {
  await requireSuperAdmin(request);
  const form = await request.formData();
  // Interrupteurs de la billetterie (réglages de la plateforme).
  if (String(form.get("intent")) === "setting") {
    const key = String(form.get("key") ?? "");
    const res = await api(request, `/admin/settings/${encodeURIComponent(key)}`, {
      method: "PUT",
      json: { value: String(form.get("value")) === "true" },
    });
    if (!res.ok) return data({ error: res.error.message, id: key }, { status: res.status });
    return redirect("/admin?fait=reglage");
  }
  const id = String(form.get("structureId") ?? "");
  const verified = String(form.get("intent")) === "verify";
  const note = String(form.get("note") ?? "").trim();
  if (!verified && !note) {
    return data({ error: "Indique le motif du refus : il est envoyé au propriétaire.", id }, { status: 400 });
  }
  const res = await api(request, `/admin/structures/${encodeURIComponent(id)}/verify`, {
    method: "POST",
    json: { verified, note: note || null },
  });
  if (!res.ok) return data({ error: res.error.message, id }, { status: res.status });
  return redirect(`/admin?fait=${verified ? "valide" : "refuse"}`);
}

export default function Admin({ loaderData, actionData }: Route.ComponentProps) {
  const { rows, settings, all, pseudo, twoFactorRequired } = loaderData;
  const busy = useNavigation().state !== "idle";
  return (
    <ThemeScope theme="sable">
      <Ground variant="site" fixed>
        <div className="orga">
          <nav className="orga__side" aria-label="Administration">
            <div className="orga__brand">
              <Monogram size={32} />
            </div>
            <div className="orga__who">
              <span className="o-t-label">Administration</span>
            </div>
            <a className="orga__link is-on" href="/admin" aria-current="page">
              Structures à vérifier
            </a>
            <div className="orga__spacer" />
            <a className="orga__link" href="/app/acces">
              Mon compte · {pseudo}
            </a>
          </nav>
          <main className="orga__content">
            {twoFactorRequired && (
              <p className="s-notice s-notice--alert">
                La double authentification est obligatoire pour l'administration.{" "}
                <a href="/app/securite">Active-la maintenant</a>.
              </p>
            )}
            <section className="orga__panel s-stack" aria-labelledby="settings-title" data-testid="admin-settings">
              <h2 id="settings-title" className="s-h2">
                Réglages · billetterie
              </h2>
              <p className="s-muted">
                Les billets gratuits sont réels ; les billets payants restent en mode présentation (Stripe en mode test,
                aucun encaissement réel). Chaque organisateur ouvre ensuite la billetterie événement par événement.
                Stripe :{" "}
                {settings.stripe.configured
                  ? "clés de test renseignées"
                  : "clés non renseignées (billetterie payante « bientôt »)"}
                .
              </p>
              {platformSettingKeys.map((key: PlatformSettingKey) => {
                const on = settings[key];
                const locked = key === "ticketing.presentation_mode" && settings.presentationForced;
                return (
                  <Form key={key} method="post" className="s-row s-row--between" data-testid={`setting-${key}`}>
                    <input type="hidden" name="intent" value="setting" />
                    <input type="hidden" name="key" value={key} />
                    <span>
                      {platformSettingLabels[key]} · <strong>{on ? "activé" : "désactivé"}</strong>
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
                  </Form>
                );
              })}
              {actionData &&
                "error" in actionData &&
                typeof actionData.id === "string" &&
                actionData.id.startsWith("ticketing.") && (
                  <p className="s-error" role="alert">
                    {actionData.error}
                  </p>
                )}
            </section>

            <div className="orga__head">
              <div>
                <div className="s-label o-t-label">Administration</div>
                <h1 className="s-title">Structures à vérifier</h1>
              </div>
              <div className="s-row">
                <Chip selected={!all} onClick={() => window.location.assign("/admin")}>
                  En cours
                </Chip>
                <Chip selected={all} onClick={() => window.location.assign("/admin?tout=1")}>
                  Toutes
                </Chip>
              </div>
            </div>

            {rows.length === 0 ? (
              <p className="s-notice" data-testid="admin-empty">
                Aucune structure en attente de vérification.
              </p>
            ) : (
              rows.map((s) => {
                const check = s.registryCheck;
                const mismatch = check?.status === "matched" && s.kind === "association" && !check.isAssociation;
                return (
                  <section key={s.id} className="orga__panel s-stack" data-testid="admin-structure" aria-label={s.name}>
                    <div className="s-row s-row--between">
                      <div className="s-stack s-stack--tight">
                        <div className="s-label o-t-label">
                          {structureKindLabels[s.kind]} · créée le {formatDateTime(s.createdAt)}
                        </div>
                        <h2 className="s-h2">{s.name}</h2>
                        <div className="o-t-meta">
                          {[s.city, s.department].filter(Boolean).join(" · ")}
                          {s.owner ? ` · propriétaire ${s.owner.pseudo} (${s.owner.email})` : ""}
                        </div>
                      </div>
                      <Chip variant={s.verification === "verified" ? "accent" : undefined}>
                        {structureVerificationLabels[s.verification]}
                      </Chip>
                    </div>

                    <Plate as="div" className="s-stack s-stack--tight">
                      <div className="o-t-label">Contrôle du registre</div>
                      {check ? (
                        <p data-testid="admin-registry">
                          {check.status === "matched"
                            ? "Trouvé et actif"
                            : check.status === "closed"
                              ? "Établissement fermé"
                              : check.status === "not_found"
                                ? "Introuvable"
                                : "Registre indisponible"}
                          {check.name ? ` · ${check.name}` : ""}
                          {check.address ? ` · ${check.address}` : ""} · {check.source === "siret" ? "SIRET" : "RNA"}{" "}
                          {s.siret ?? s.rna ?? check.query}
                        </p>
                      ) : (
                        <p>Aucun numéro contrôlé (club non déclaré ?).</p>
                      )}
                      {mismatch && <p className="s-notice">Le numéro n'est pas celui d'une association.</p>}
                    </Plate>

                    <Plate as="div" className="s-stack s-stack--tight">
                      <div className="o-t-label">Justificatifs</div>
                      {s.documents.length === 0 ? (
                        <p>Aucun justificatif.</p>
                      ) : (
                        <ul className="s-docs">
                          {s.documents.map((d) => (
                            <li key={d.id}>
                              {verificationDocumentKindLabels[d.kind]} ·{" "}
                              <a href={`/api/admin/verification-documents/${d.id}`} target="_blank" rel="noreferrer">
                                {d.fileName}
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}
                    </Plate>

                    {s.verification === "pending" && (
                      <Form method="post" className="s-stack">
                        <input type="hidden" name="structureId" value={s.id} />
                        <TextAreaField
                          label="Note (obligatoire pour un refus, envoyée au propriétaire)"
                          name="note"
                          rows={2}
                        />
                        {actionData && "error" in actionData && actionData.id === s.id && (
                          <p className="s-error" role="alert">
                            {actionData.error}
                          </p>
                        )}
                        <div className="s-row">
                          <Button
                            type="submit"
                            name="intent"
                            value="verify"
                            variant="secondary"
                            icon="check"
                            loading={busy}
                          >
                            Valider
                          </Button>
                          <Button
                            type="submit"
                            name="intent"
                            value="refuse"
                            variant="secondary"
                            icon="close"
                            loading={busy}
                          >
                            Refuser
                          </Button>
                        </div>
                      </Form>
                    )}
                  </section>
                );
              })
            )}
          </main>
        </div>
      </Ground>
    </ThemeScope>
  );
}
