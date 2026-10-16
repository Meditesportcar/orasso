import { Button, Chip, Plate, VehicleCard } from "@orasso/design-system/web";
import { gradeLabels, type OtherVehicle, type PeopleSearchPage, socialLabels } from "@orasso/shared";
import { useNavigation } from "react-router";

import { FriendAction, PersonAvatar, PersonRow } from "../components/People";
import { ReportDialog } from "../components/ReportDialog";
import { api, apiOrThrow } from "../lib/api.server";
import { friendAction } from "../lib/friends.server";
import type { Route } from "./+types/vehicule";

// Véhicule d'un autre (lot 17, ARCHITECTURE-SUITE § 2.5) : la fiche selon le compte de son propriétaire (complète si
// public ou ami, marque et modèle sinon, jamais la plaque) et « Autres propriétaires près de chez moi ».
export function meta() {
  return [{ title: "Véhicule · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const vehicle = await apiOrThrow<OtherVehicle>(request, `/vehicles/${params.id}`);
  const nearby = await api<PeopleSearchPage & { sector: string[] }>(request, `/vehicles/${params.id}/owners-nearby`);
  return { vehicle, nearby: nearby.ok ? nearby.data : null };
}

export async function action({ request }: Route.ActionArgs) {
  return friendAction(request, await request.formData());
}

export default function Vehicule({ loaderData, actionData }: Route.ComponentProps) {
  const { vehicle: v, nearby } = loaderData;
  const busy = useNavigation().state !== "idle";
  const full = "photos" in v ? v : null;
  return (
    <div className="s-narrow s-stack" data-testid="vehicule" data-detailed={v.detailed}>
      {full?.photos[0] ? (
        <VehicleCard
          first
          name={v.label}
          certified={full.certified}
          photo={<img src={full.photos[0].url} alt="" />}
          photoCount={full.photos.length || undefined}
          year={full.year ?? undefined}
          power={full.powerHp ? `${full.powerHp} ch` : undefined}
          categories={full.categories.map((c) => ({ label: c.label }))}
        />
      ) : (
        <Plate as="article" className="s-vrow">
          <h1 className="o-t-poster-m o-never-truncate">{v.label}</h1>
          {full && (
            <span className="o-t-meta">
              {[full.year, full.powerHp ? `${full.powerHp} ch` : null].filter(Boolean).join(" · ")}
            </span>
          )}
        </Plate>
      )}
      {/* Signaler la photo principale (lot 32) ; les autres photos ont leur lien sous la galerie. */}
      {full?.photos[0] && <ReportDialog look="link" targetType="photo" targetId={full.photos[0].id} />}
      <a className="s-row" href={`/u/${encodeURIComponent(v.owner.pseudo)}`} data-testid="vehicule-owner">
        <PersonAvatar url={v.owner.avatarUrl} pseudo={v.owner.pseudo} />
        <span className="o-t-title">{v.owner.pseudo}</span>
        <Chip>{gradeLabels[v.owner.grade]}</Chip>
      </a>
      <div className="s-row">
        <ReportDialog targetType="vehicle" targetId={v.id} />
      </div>
      {!v.detailed && <p className="s-notice">{socialLabels.privateNotice}</p>}
      {full && (
        <dl className="s-recap">
          {full.generationName && (
            <>
              <dt>Génération</dt>
              <dd>{full.generationName}</dd>
            </>
          )}
          {full.engine && (
            <>
              <dt>Moteur</dt>
              <dd>{full.engine}</dd>
            </>
          )}
          {full.weightKg && (
            <>
              <dt>Poids</dt>
              <dd>{full.weightKg} kg</dd>
            </>
          )}
          {full.color && (
            <>
              <dt>Couleur</dt>
              <dd>{full.color}</dd>
            </>
          )}
        </dl>
      )}
      {full?.description && <p className="s-prewrap">{full.description}</p>}
      {full?.preparation && (
        <>
          <h2 className="s-h2">Préparation</h2>
          <p className="s-prewrap">{full.preparation}</p>
        </>
      )}
      {full && full.photos.length > 1 && (
        <div className="s-vehicles">
          {full.photos.slice(1).map((p) => (
            <figure key={p.id} className="s-stack s-stack--tight">
              <img className="s-gallery__img" src={p.url} alt="" loading="lazy" />
              <ReportDialog look="link" targetType="photo" targetId={p.id} />
            </figure>
          ))}
        </div>
      )}

      <section className="s-section" aria-labelledby="proprietaires-titre" data-testid="owners-nearby">
        <h2 id="proprietaires-titre" className="s-h2">
          {socialLabels.ownersNearby}
        </h2>
        <p className="o-t-caption s-muted">{socialLabels.ownersNearbyHint}</p>
        {actionData?.friendError && (
          <p className="s-error" role="alert">
            {actionData.friendError}
          </p>
        )}
        {!nearby ? null : nearby.sector.length === 0 ? (
          <p className="s-notice">
            {socialLabels.ownersNearbyNoSector}{" "}
            <Button variant="secondary" icon="place" href="/app/moi">
              Mon secteur
            </Button>
          </p>
        ) : nearby.items.length === 0 ? (
          <p className="s-muted">{socialLabels.ownersNearbyEmpty}</p>
        ) : (
          <ul className="s-people">
            {nearby.items.map((person) => (
              <PersonRow
                key={person.userId}
                person={person}
                action={
                  <FriendAction
                    state={person.friendship}
                    pseudo={person.pseudo}
                    userId={person.userId}
                    requestId={person.friendshipId}
                    busy={busy}
                  />
                }
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
