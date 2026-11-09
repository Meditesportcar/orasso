// Page d'un souvenir (lot R7j, maquette R7.10, parité de l'appli) : la photo masquée de ma voiture (sinon l'affiche), « Il y a
// un an, jour pour jour », « Tu étais à … », la date, mon tampon, « Voir le récap » si je l'ai vécu, et la place du bouton
// « En story » (R7f4). 404 de l'API (pas mon tampon, pas encore un an) : « Ce souvenir n'est pas disponible », rien de plus.
// Cible de la notification `memory` (`/app/souvenir/<eventId>`).
import { Button } from "@orasso/design-system/web";
import { type MemoryDetail, memoryLabels, widestWordEm } from "@orasso/shared";
import type { CSSProperties } from "react";

import { PassportStamp } from "../components/PassportStamp";
import { api, requireMe } from "../lib/api.server";
import { formatDay } from "../lib/format";
import "../styles/passport.css";
import "../styles/souvenirs.css";
import { FicheBar, ficheHandle } from "../components/FicheBar";
import type { Route } from "./+types/app-souvenir";

// Lot M7 : fiche ou parcours, mode B (en-tête de fiche, sans bande ni barre d'onglets).
export const handle = ficheHandle;

export function meta() {
  return [{ title: `${memoryLabels.pageTitle} · Orasso` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireMe(request);
  const res = await api<MemoryDetail>(request, `/me/memories/${encodeURIComponent(params.eventId)}`);
  if (res.ok) return { memory: res.data };
  // Identifiant invalide (400), inconnu ou pas le mien (404, 403) : la même page « Ce souvenir n'est pas disponible ».
  if (res.status === 400 || res.status === 404 || res.status === 403) return { memory: null };
  throw new Response(res.error.message, { status: res.status });
}

export default function Souvenir({ loaderData }: Route.ComponentProps) {
  const m = loaderData.memory;
  if (!m) {
    return (
      <>
        <FicheBar title={memoryLabels.pageTitle} back="/app" />
        <div className="s-narrow s-stack" data-testid="memory-page">
          <p className="s-notice" data-testid="memory-unavailable">
            {memoryLabels.unavailable}
          </p>
        </div>
      </>
    );
  }
  const image = m.photoUrl ?? m.posterUrl;
  return (
    <>
      <FicheBar heading={false} title={memoryLabels.pageTitle} back="/app" />
      <div className="s-narrow s-stack" data-testid="memory-page">
        <article className="sv-poster" data-testid="memory-hero">
          <div className="sv-poster__photo">{image ? <img src={image} alt="" /> : null}</div>
          <div className="sv-poster__body">
            {/* « Jour pour jour » seulement le jour anniversaire ; la page ouverte plus tard donne la date. */}
            <span className="o-t-label sv-poster__eyebrow" data-testid="memory-eyebrow">
              {m.anniversary
                ? memoryLabels.eyebrow(m.yearsAgo)
                : memoryLabels.eyebrowOn(m.yearsAgo, formatDay(m.startsAt))}
            </span>
            <h1
              className="o-t-poster-xl o-never-truncate"
              style={{ "--em": widestWordEm(memoryLabels.headline(m.title)) } as CSSProperties}
              data-testid="memory-title"
            >
              {memoryLabels.headline(m.title)}
            </h1>
            <p className="o-t-caption sv-poster__muted" data-testid="memory-date">
              {memoryLabels.dateLine(formatDay(m.startsAt), m.city)}
            </p>
            {m.vehicleLabel ? (
              <p className="o-t-caption sv-poster__muted" data-testid="memory-vehicle">
                {memoryLabels.yourCar(m.vehicleLabel)}
              </p>
            ) : null}
          </div>
        </article>

        <div className="s-card sv-stamp" data-testid="memory-stamp-tile">
          <div className="s-stack s-stack--tight">
            <span className="o-t-label">{memoryLabels.yourStamp}</span>
            <span>{memoryLabels.stampedOn(formatDay(m.stamp.stampedAt))}</span>
          </div>
          <PassportStamp stamp={m.stamp} size={96} />
        </div>

        <div className="sv-actions">
          {m.recapAvailable ? (
            <Button variant="primary" icon="grade" href={`/app/recap/${m.eventId}`} data-testid="memory-recap">
              {memoryLabels.seeRecap}
            </Button>
          ) : null}
          <Button
            variant={m.recapAvailable ? "secondary" : "primary"}
            icon="calendar"
            href={`/e/${m.slug}`}
            data-testid="memory-event"
          >
            {memoryLabels.seeEvent}
          </Button>
        </div>
        {/* Emplacement réservé au bouton « En story » (lot R7f4, partage en story). */}
      </div>
    </>
  );
}
