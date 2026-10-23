import { Button, Chip, Icon, Plate, TextField, VehicleCard } from "@orasso/design-system/web";
import {
  type AccountQrSecret,
  certificationLine,
  certificationLineLabels,
  crewLabels,
  gradeLabels,
  homeLabels,
  type MyCrew,
  type PlateTransferView,
  plateTransferLabels,
  proActivityLabels,
  type VehicleDetail,
  type VehicleFull,
  type VehiclePro,
  type VehiclePros,
  type VehicleStatus,
  vehicleProsLabels,
  vehicleStatusLabels,
} from "@orasso/shared";
import { useEffect, useRef, useState } from "react";
import { data, Form, useNavigation } from "react-router";

import { AccountQr } from "../components/AccountQr";
import { CrewLogo } from "../components/Crews";
import { apiFetch } from "../lib/api.client";
import { api, apiOrThrow } from "../lib/api.server";
import { formatDateTime } from "../lib/format";
import type { Route } from "./+types/garage";
import "../styles/garage.css";
import "../styles/home.css";

export function meta() {
  return [{ title: "Garage · Orasso" }, { name: "robots", content: "noindex" }];
}

const ARCHIVED: Exclude<VehicleStatus, "active">[] = ["sold", "keepsake", "wrecked"];

// La page porte le secret du QR de compte : ni le navigateur ni un relais ne la gardent.
// On part des en-têtes du parent (`root.tsx` : X-Frame-Options, frame-ancestors, Referrer-Policy du lot 12), sinon ils
// seraient perdus pour cette page.
export const headers: Route.HeadersFunction = ({ parentHeaders }) => {
  const h = new Headers(parentHeaders);
  h.set("cache-control", "private, no-store");
  return h;
};

export async function loader({ request }: Route.LoaderArgs) {
  const [vehicles, transfers, crews, qrSecret] = await Promise.all([
    apiOrThrow<VehicleFull[]>(request, "/me/vehicles"),
    api<{ incoming: PlateTransferView[]; outgoing: unknown[] }>(request, "/me/plate-transfers"),
    // En-tête : mes crews (lot 19, docs/02 « Garage »).
    api<MyCrew[]>(request, "/me/crews"),
    // QR de compte (lot 30) : le secret sert au calcul du code dans le navigateur ; la page n'est jamais mise en cache.
    api<AccountQrSecret>(request, "/me/account-qr-secret"),
  ]);
  const photoRefused = new URL(request.url).searchParams.get("photo") === "refusee";
  const active = vehicles.filter((v) => v.status === "active");
  // Lot M5 (parité de la maquette 7.1) : la ligne de certification de chaque véhicule actif et « Pour ta … » du premier
  // (pros partenaires, sponsorisé lié au véhicule : compté par l'API quand elle le renvoie, la page l'affiche toujours).
  const [details, pros] = await Promise.all([
    Promise.all(active.map((v) => api<VehicleDetail>(request, `/me/vehicles/${v.id}`))),
    active[0] ? api<VehiclePros>(request, `/me/vehicles/${active[0].id}/pros`) : Promise.resolve(null),
  ]);
  const certs: Record<string, { cert: VehicleDetail["certification"]; photos: number }> = {};
  for (const d of details) if (d.ok) certs[d.data.id] = { cert: d.data.certification, photos: d.data.photos.length };
  return {
    vehicles: active,
    certs,
    pros: pros?.ok ? pros.data : null,
    archived: vehicles.filter((v) => v.status !== "active"),
    incoming: transfers.ok ? transfers.data.incoming : [],
    crews: crews.ok ? crews.data : [],
    qrSecret: qrSecret.ok ? qrSecret.data : null,
    photoRefused,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "photo");
  if (intent === "transfer-accept" || intent === "transfer-decline") {
    const id = String(form.get("transferId") ?? "");
    const res = await api(request, `/plate-transfers/${encodeURIComponent(id)}/${intent.slice(9)}`, {
      method: "POST",
    });
    if (!res.ok) return data({ error: res.error.message }, { status: res.status });
    return data({ error: null });
  }
  const vehicleId = String(form.get("vehicleId") ?? "");
  const photo = form.get("photo");
  if (!vehicleId || !(photo instanceof File) || photo.size === 0) {
    return data({ error: "Choisis une photo." }, { status: 400 });
  }
  const upload = new FormData();
  upload.set("photo", photo);
  const res = await api(request, `/me/vehicles/${vehicleId}/photos`, { method: "POST", body: upload });
  if (!res.ok) return data({ error: res.error.message }, { status: res.status });
  return data({ error: null });
}

export default function Garage({ loaderData, actionData }: Route.ComponentProps) {
  const { vehicles, archived, incoming, crews, photoRefused, qrSecret, certs, pros } = loaderData;
  const busy = useNavigation().state !== "idle";
  return (
    <div className="s-stack">
      <div className="s-row s-row--between">
        <h1 className="s-title">Garage</h1>
        <Button variant="primary" icon="add" href="/app/garage/nouveau">
          Ajouter un véhicule
        </Button>
      </div>
      <div className="s-row s-row--tight" data-testid="garage-crews">
        <span className="s-label o-t-label">{crewLabels.crews}</span>
        {crews.map((c) => (
          <a key={c.id} href={`/c/${c.slug}`} title={c.name} aria-label={c.name}>
            <CrewLogo url={c.logoUrl} name={c.name} size={36} />
          </a>
        ))}
        <a href="/app/crews" className="o-t-caption">
          {crews.length ? crewLabels.myCrews : crewLabels.createCrew}
        </a>
      </div>
      {qrSecret && <AccountQr secret={qrSecret} />}
      {photoRefused && (
        <p className="s-notice s-notice--alert">
          Le véhicule est ajouté, mais la photo n'a pas été acceptée. Ajoutes-en une depuis sa fiche.
        </p>
      )}
      {actionData?.error && (
        <p className="s-error" role="alert">
          {actionData.error}
        </p>
      )}

      {incoming.map((t) => (
        <Plate key={t.id} className="g-transfer" data-testid="plate-transfer-request">
          <div className="o-t-label">{plateTransferLabels.requestTitle}</div>
          <p>
            <strong>{t.requesterPseudo}</strong> a saisi la plaque de{" "}
            <strong className="o-never-truncate">{t.holderVehicleLabel}</strong>
            {t.plate ? ` (${t.plate})` : ""} pour son véhicule
            {t.requesterVehicleLabel ? ` ${t.requesterVehicleLabel}` : ""}. Si tu l'as vendu, confirme : ton véhicule
            passe « Vendu » et la plaque change de main. Sinon, l'équipe Orasso tranchera.
          </p>
          <p className="o-t-meta">Réponse attendue avant le {formatDateTime(t.answerBy)}.</p>
          <Form method="post" className="s-row">
            <input type="hidden" name="transferId" value={t.id} />
            <Button type="submit" name="intent" value="transfer-accept" variant="secondary" icon="check" loading={busy}>
              {plateTransferLabels.accept}
            </Button>
            <Button
              type="submit"
              name="intent"
              value="transfer-decline"
              variant="secondary"
              icon="close"
              loading={busy}
            >
              {plateTransferLabels.decline}
            </Button>
          </Form>
        </Plate>
      ))}

      {vehicles.length === 0 && (
        <p className="s-notice">Ton garage est vide. Ajoute un véhicule pour pouvoir candidater.</p>
      )}
      <div className="s-grid">
        {vehicles.map((v) => (
          <div key={v.id} className="s-stack s-stack--tight">
            <a className="g-card-link" href={`/app/garage/${v.id}`} aria-label={v.label}>
              <VehicleCard
                photo={v.photos[0] ? <img src={v.photos[0].url} alt="" /> : undefined}
                first
                certified={v.certified}
                photoCount={v.photos.length || undefined}
                name={v.label}
                year={v.year ?? undefined}
                power={v.powerHp ? `${v.powerHp} ch` : undefined}
                categories={v.categories.map((c) => ({ label: c.label }))}
                facts={
                  v.plateTransfer
                    ? plateTransferLabels.pending
                    : v.unregistered
                      ? "Non immatriculé"
                      : `Plaque ${v.plate ?? "—"}`
                }
              />
            </a>
            <CertLine vehicleId={v.id} state={certs[v.id]} />
            {v.photos.length === 0 && (
              <Form method="post" encType="multipart/form-data" className="s-form">
                <input type="hidden" name="vehicleId" value={v.id} />
                <TextField
                  label="Ajouter une photo"
                  name="photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  required
                />
                <Button type="submit" variant="secondary" icon="add" loading={busy}>
                  Envoyer la photo
                </Button>
              </Form>
            )}
          </div>
        ))}
      </div>

      {pros && vehicles[0] && (pros.sponsored || pros.pros.length > 0 || pros.needsPlace) && (
        <VehicleProsBlock key={pros.vehicleId} pros={pros} modelName={vehicles[0].modelName} />
      )}

      {archived.length > 0 && (
        <details className="g-archived" data-testid="garage-archived">
          <summary>Archivés · {archived.length}</summary>
          {ARCHIVED.map((status) => {
            const rows = archived.filter((v) => v.status === status);
            if (!rows.length) return null;
            return (
              <div key={status} className="g-archived__group">
                <Chip>{vehicleStatusLabels[status]}</Chip>
                {rows.map((v) => (
                  <a key={v.id} className="g-archived__row" href={`/app/garage/${v.id}`}>
                    <span className="g-archived__name o-never-truncate">
                      {v.label}
                      {v.year ? ` · ${v.year}` : ""}
                    </span>
                    {v.statusNote && <span className="o-t-meta">{v.statusNote}</span>}
                  </a>
                ))}
              </div>
            );
          })}
        </details>
      )}
    </div>
  );
}

/** Ligne d'état de la certification (lot M5) : ce qui manque en premier ; le détail est sur la page du véhicule. */
function CertLine({
  vehicleId,
  state,
}: {
  vehicleId: string;
  state: { cert: VehicleDetail["certification"]; photos: number } | undefined;
}) {
  if (!state) return null;
  const { cert, photos } = state;
  const line = certificationLine(cert, photos);
  const body = (
    <>
      <Icon name={line.kind === "impossible" ? "lock" : "shield"} size={18} />
      <span className="g-certline__text">
        <strong>{certificationLineLabels.headline(line)}</strong>
        <span className="o-t-caption">
          {certificationLineLabels.detail(line, { photoCount: photos, missing: cert.missing })}
        </span>
      </span>
    </>
  );
  // Ancien véhicule : la ligne le dit, sans lien vers une demande.
  return line.kind === "impossible" ? (
    <div className="g-certline" data-testid="certification-line">
      {body}
    </div>
  ) : (
    <a className="g-certline" href={`/app/garage/${vehicleId}#certification`} data-testid="certification-line">
      {body}
      <Icon name="next" size={16} />
    </a>
  );
}

const discountText = (d: VehiclePro["discount"]) =>
  d ? `−${d.percent} %${d.from ? ` dès ${gradeLabels[d.from]}` : ""}` : null;

/** « Pour ta … » (lot M5, maquette 7.1) : le sponsorisé lié au véhicule en tête, puis les pros partenaires proches. */
/**
 * Compte l'affichage du sponsorisé à sa première apparition à l'écran (lot M5, tour 2 : la page du Garage ne le compte
 * plus au chargement) ; plafond atteint ou emplacement arrêté, il disparaît. Sans JavaScript : rien n'est compté.
 */
function useSponsoredImpression(id: string | null) {
  const ref = useRef<HTMLLIElement>(null);
  const [refused, setRefused] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!id || !el || typeof IntersectionObserver === "undefined") return;
    let done = false;
    const io = new IntersectionObserver(
      (entries) => {
        if (done || !entries.some((e) => e.isIntersecting)) return;
        done = true;
        io.disconnect();
        void apiFetch(`/sponsored/${id}/impression`, { method: "POST" }).then((r) => {
          if (!r.ok && (r.status === 409 || r.status === 404)) setRefused(true);
        });
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [id]);
  return { ref, refused };
}

function VehicleProsBlock({ pros, modelName }: { pros: VehiclePros; modelName: string }) {
  const seen = useSponsoredImpression(pros.sponsored?.id ?? null);
  const s = seen.refused ? null : pros.sponsored;
  const lineOf = (p: VehiclePro) =>
    [
      p.activities
        .slice(0, 2)
        .map((a) => proActivityLabels[a])
        .join(", "),
      p.city,
      typeof p.distanceKm === "number" ? `${Math.round(p.distanceKm)} km` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  return (
    <section className="s-section s-stack s-stack--tight" aria-labelledby="pros-titre" data-testid="garage-pros">
      <div className="s-row s-row--between">
        <h2 id="pros-titre" className="s-h2">
          Pour ta {modelName}
        </h2>
        <span className="o-t-meta">{vehicleProsLabels.partners}</span>
      </div>
      {pros.needsPlace && (
        <p className="s-muted" data-testid="garage-pros-needs-place">
          {vehicleProsLabels.needsPlace} <a href="/app/moi#secteur-titre">{vehicleProsLabels.needsPlaceLink}</a>
        </p>
      )}
      <ul className="g-pros">
        {s && (
          <li ref={seen.ref}>
            <a
              className="g-pro g-pro--sponsored"
              href={s.linkUrl}
              target="_blank"
              rel="noopener noreferrer sponsored"
              onClick={() => void apiFetch(`/sponsored/${s.id}/click`, { method: "POST" })}
              data-testid="garage-pros-sponsored"
            >
              <span className="g-pro__text">
                <span className="o-t-label">{homeLabels.sponsored}</span>
                <strong>{s.pro.name}</strong>
                <span className="o-t-caption">{[s.title, s.city].filter(Boolean).join(" · ")}</span>
              </span>
              {discountText(s.discount) && <span className="g-pro__rm">{discountText(s.discount)}</span>}
            </a>
          </li>
        )}
        {pros.pros.map((p) => (
          <li key={p.slug}>
            <a className="g-pro" href={`/p/${p.slug}`} data-testid="garage-pros-item">
              <span className="g-pro__text">
                <strong>{p.name}</strong>
                <span className="o-t-caption">{lineOf(p)}</span>
              </span>
              {discountText(p.discount) && <span className="g-pro__rm">{discountText(p.discount)}</span>}
            </a>
          </li>
        ))}
      </ul>
      <p className="o-t-caption s-muted">{vehicleProsLabels.qrHint}</p>
    </section>
  );
}
