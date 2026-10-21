// Récap (lot 57, parité de l'appli du lot 50, prototype DA v2 `s-recap`) : le lendemain de l'événement, les chiffres de
// la soirée, mon classement au prix du public, mes points (prévus à J+1, acquis au règlement de J+2 : la même page se
// met à jour), mon tampon et l'avis à donner. Calculé par l'API à la demande (V8). Cible de la notification
// `event_recap_ready` (`/app/recap/<eventId>`).
import { Button, Plate } from "@orasso/design-system/web";
import { frDuration, frOrdinal, type RecapView, recapScreenTexts, recapTexts } from "@orasso/shared";

import { PassportStamp } from "../components/PassportStamp";
import { ShareButtons } from "../components/ShareButtons";
import { api, originOf, requireMe } from "../lib/api.server";
import { formatDay } from "../lib/format";
import "../styles/passport.css";
import type { Route } from "./+types/recap";

export function meta() {
  return [{ title: `${recapScreenTexts.title} · Orasso` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireMe(request);
  const res = await api<RecapView>(request, `/me/recaps/${encodeURIComponent(params.eventId)}`);
  if (res.ok) return { recap: res.data, notReady: false, origin: originOf(request) };
  // Pas encore prêt (avant J+1 10 h) ou pas pointé sur cet événement : la page le dit, sans erreur.
  if (res.status === 404 || res.status === 403 || res.status === 409) {
    return { recap: null, notReady: true, origin: originOf(request) };
  }
  throw new Response(res.error.message, { status: res.status });
}

export default function Recap({ loaderData }: Route.ComponentProps) {
  const { recap: view, origin } = loaderData;
  if (!view) {
    return (
      <div className="s-narrow s-stack" data-testid="recap">
        <h1 className="s-title">{recapScreenTexts.title}</h1>
        <p className="s-notice" data-testid="recap-not-ready">
          {recapScreenTexts.notReady}
        </p>
        <Button variant="secondary" icon="stamp" href="/app/passeport">
          Mon passeport
        </Button>
      </div>
    );
  }
  const next = view.nextGradeIn ? { grade: view.nextGradeIn.grade, in: view.nextGradeIn.points } : null;
  const rank = view.audienceRank;
  const url = `${origin}/e/${view.event.slug}`;
  return (
    <div className="s-narrow s-stack" data-testid="recap">
      <Plate className="s-stack s-stack--tight" data-testid="recap-hero">
        <div className="o-t-label">{formatDay(view.event.startsAt)}</div>
        <h1 className="s-title o-never-truncate">{recapScreenTexts.was(view.event.title)}</h1>
        {view.myArrival && (
          <p className="o-t-caption" data-testid="recap-arrived">
            {recapTexts.arrived(new Date(view.myArrival))}
          </p>
        )}
      </Plate>

      <div className="recap-figures">
        <div className="s-card recap-figure" data-testid="recap-vehicles">
          <span className="o-t-label">{recapTexts.vehicles}</span>
          <span className="o-t-number">{view.vehiclesCount}</span>
        </div>
        {view.myDuration !== null && (
          <div className="s-card recap-figure" data-testid="recap-evening">
            <span className="o-t-label">{view.event.format === "night" ? recapTexts.myEvening : recapTexts.myDay}</span>
            <span className="o-t-number">{frDuration(view.myDuration)}</span>
          </div>
        )}
        {rank && (
          <div className="s-card recap-figure" data-testid="recap-rank">
            <span className="o-t-label">{recapTexts.audiencePrize}</span>
            <span className="o-t-number">{frOrdinal(rank.rank)}</span>
            <span className="o-t-caption s-muted">sur {rank.of}</span>
          </div>
        )}
        {view.stamp && (
          <div className="s-card recap-figure" data-testid="recap-stamp">
            <span className="o-t-label">Ton tampon</span>
            <PassportStamp stamp={view.stamp} size={96} />
          </div>
        )}
      </div>

      {view.points.total !== 0 && (
        <p className="s-card" data-testid="recap-points">
          {recapTexts.points(
            view.points.total,
            view.points.detail.map((d) => d.label),
            next,
          )}{" "}
          <span className="s-muted">
            {view.points.status === "projected" ? recapTexts.projected : recapTexts.settled}
          </span>
        </p>
      )}
      {view.stamp && (
        <p className="s-card" data-testid="recap-stamp-line">
          {view.stamp.sentence}
        </p>
      )}
      {view.reviewApplicationId && (
        <div className="s-card s-stack s-stack--tight" data-testid="recap-review-line">
          <p>{recapTexts.reviewUntil(new Date(view.reviewDeadline))}</p>
          <div>
            <Button
              variant="secondary"
              icon="grade"
              href={`/app/sorties?avis=${encodeURIComponent(view.reviewApplicationId)}#avis`}
            >
              {recapTexts.review}
            </Button>
          </div>
        </div>
      )}
      <section className="s-stack s-stack--tight" aria-label={recapTexts.share} data-testid="recap-share">
        <h2 className="s-h2">{recapTexts.share}</h2>
        <ShareButtons url={url} title={view.shareText} />
      </section>
    </div>
  );
}
