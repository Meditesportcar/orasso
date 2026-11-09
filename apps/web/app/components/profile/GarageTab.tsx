import { Button, Chip, Icon, Plate, VehicleCard } from "@orasso/design-system/web";
import {
  certificationLine,
  certificationLineLabels,
  crewLabels,
  gradeLabels,
  homeLabels,
  mainVehicleLabels as M,
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
import { Form, useNavigation } from "react-router";

import { apiFetch } from "../../lib/api.client";
import { formatDateTime } from "../../lib/format";
import { AccountQr } from "../AccountQr";
import { CrewLogo } from "../Crews";
import type { GarageActionData, GarageData } from "./garage.server";
import "../../styles/garage.css";
import "../../styles/home.css";
import "../../styles/network.css";

// Lot R7b1 (D38) : l'onglet « Garage » du Profil (`/app/moi`), le contenu de l'ancienne page `/app/garage` : mes véhicules (le
// principal en tête), la certification, « Pour ta … », les archivés, mon QR de compte, les demandes de transfert de plaque.
// Les formulaires (« Mettre en avant », accepter ou refuser un transfert) postent sur la page du Profil.

const ARCHIVED: Exclude<VehicleStatus, "active">[] = ["sold", "keepsake", "wrecked"];

export function GarageTab({ data, actionData }: { data: GarageData; actionData: GarageActionData | undefined }) {
  const { vehicles, archived, incoming, crews, photoRefused, qrSecret, certs, pros } = data;
  const busy = useNavigation().state !== "idle";
  return (
    <div className="s-stack">
      <div className="s-row s-row--between">
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
        <a href={crews.length ? "/app/crews" : "/app/crews/nouveau"} className="o-t-caption">
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
      {actionData && "featured" in actionData && typeof actionData.featured === "string" && actionData.featured ? (
        <p className="s-notice g-main-banner" role="status" data-testid="garage-main-banner">
          <Icon name="star" size={18} />
          {M.confirmed(actionData.featured)}
        </p>
      ) : null}

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
        {vehicles.map((v, i) => (
          <div key={v.id} className="s-stack s-stack--tight" data-testid={i === 0 ? "garage-main" : "garage-other"}>
            {/* Lot R4c : le principal (premier de la liste de l'API) porte « ★ Principal », une marque et pas un bouton ;
                chaque véhicule a son menu « ⋯ ». */}
            <div className="g-main-row">
              {i === 0 ? (
                <span className="g-star" data-testid="garage-main-tag">
                  <Icon name="star" size={13} />
                  {M.tag}
                </span>
              ) : (
                <span />
              )}
              <VehicleMenu vehicle={v} main={i === 0} busy={busy} />
            </div>
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
            {/* Lot M1, tour 2 : la photo s'ajoute sur la fiche, qui pose le cadre de plaque (l'API l'exige). */}
            {v.photos.length === 0 && (
              <Button
                variant="secondary"
                icon="add"
                href={`/app/garage/${v.id}#ajouter-photo`}
                data-testid="garage-add-photo"
              >
                Ajouter une photo
              </Button>
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

/** Menu « ⋯ » d'un véhicule (lot R4c) : Mettre en avant, Modifier, Partager son affiche, Retirer du garage. */
function VehicleMenu({ vehicle, main, busy }: { vehicle: VehicleFull; main: boolean; busy: boolean }) {
  return (
    <details className="g-menu" data-testid="garage-menu">
      <summary className="g-menu__dots" aria-label={M.menu(vehicle.label)}>
        <Icon name="more" size={20} />
      </summary>
      <div className="g-menu__sheet" data-testid="garage-menu-sheet">
        {!main && (
          <Form method="post">
            <input type="hidden" name="vehicleId" value={vehicle.id} />
            <input type="hidden" name="label" value={vehicle.label} />
            <button
              type="submit"
              name="intent"
              value="feature"
              className="g-menu__row"
              disabled={busy}
              data-testid="garage-feature"
            >
              <Icon name="star" size={18} />
              <span>
                <strong>{M.feature}</strong>
                <span className="o-t-caption">{M.featureHint}</span>
              </span>
            </button>
          </Form>
        )}
        <a className="g-menu__row" href={`/app/garage/${vehicle.id}`} data-testid="garage-menu-edit">
          <Icon name="edit" size={18} />
          <span>
            <strong>{M.edit}</strong>
            <span className="o-t-caption">{M.editHint}</span>
          </span>
        </a>
        <a className="g-menu__row" href={`/app/garage/${vehicle.id}#partage`} data-testid="garage-menu-share">
          <Icon name="share" size={18} />
          <span>
            <strong>{M.share}</strong>
          </span>
        </a>
        <a className="g-menu__row g-menu__row--out" href={`/app/garage/${vehicle.id}`} data-testid="garage-menu-remove">
          <Icon name="trash" size={18} />
          <span>
            <strong>{M.remove}</strong>
          </span>
        </a>
      </div>
    </details>
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
