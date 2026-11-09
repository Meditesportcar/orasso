import { Button, Icon, TextField } from "@orasso/design-system/web";
import {
  type CrewInboxRequest,
  type CrewMemberView,
  type CrewPendingList,
  type CrewView,
  crewOutingRsvps,
  crewPageLabels as L,
  type MyCrew,
  navLabels,
  crewTabLabels as T,
} from "@orasso/shared";
import { data } from "react-router";

import { CrewBadge } from "../components/crew-page/CrewPage";
import { CrewSpaceView, crewTabOf } from "../components/crew-page/CrewSpaceView";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import { crewLastCookie, crewLastOf, pickCrew } from "../lib/crew-last.server";
import { type CrewActionData, crewAction, isCrewIntent } from "../lib/crews.server";
import type { Route } from "./+types/app-crew";

// Onglet Crew (lot R7b2, D38, maquette R7.11), comme l'appli : le sélecteur de crew (plusieurs crews ; le dernier ouvert
// revient, cookie par compte), l'image et la description du crew, la Discussion, les onglets Fil · Sorties · Membres · Spots
// (`?crew=<adresse>&onglet=`) ; sans crew, « Rejoindre un crew » ou « Créer un crew ». La page `/c/:slug` n'est plus que la
// vitrine d'un crew vu de dehors. Mode A : bande ORASSO et barre d'onglets. Les formulaires de la page (réponse à une
// sortie, demande acceptée, invitation, départ) arrivent ici.
export function meta() {
  return [{ title: `${navLabels.crewTab.title} · Orasso` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const me = await requireMe(request);
  const mine = await api<MyCrew[]>(request, "/me/crews");
  if (!mine.ok) return { mode: "error" as const, message: mine.error.message };
  if (mine.data.length === 0) {
    const asked = await api<CrewInboxRequest[]>(request, "/me/crew-requests");
    return {
      mode: "none" as const,
      invitations: asked.ok ? asked.data.filter((r) => r.kind === "invitation") : [],
    };
  }
  const url = new URL(request.url);
  const current = pickCrew(mine.data, url.searchParams.get("crew"), crewLastOf(request, me.user.id)) as MyCrew;
  const crew = await apiOrThrow<CrewView>(request, `/crews/by-slug/${encodeURIComponent(current.slug)}`);
  const member = crew.viewerState === "member" || crew.viewerState === "leader";
  const live = !crew.archived;
  const members = member && live ? await apiOrThrow<CrewMemberView[]>(request, `/crews/${crew.id}/members`) : null;
  const pending =
    crew.viewerState === "leader" && live
      ? await apiOrThrow<CrewPendingList>(request, `/crews/${crew.id}/requests`)
      : null;
  const tab = crewTabOf(url.searchParams.get("onglet"));
  // Le crew montré devient « le dernier ouvert » (un cookie de préférence, rangé par compte).
  const headers =
    crewLastOf(request, me.user.id) === current.slug
      ? undefined
      : { "Set-Cookie": crewLastCookie(request, me.user.id, current.slug) };
  return data(
    { mode: "crew" as const, crews: mine.data, crew, members, pending, userId: me.user.id, tab },
    { headers },
  );
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  if (isCrewIntent(intent)) return crewAction(request, form);
  const crewId = encodeURIComponent(String(form.get("crewId") ?? ""));
  const outingId = encodeURIComponent(String(form.get("outingId") ?? ""));
  if (intent === "outing_rsvp") {
    const answer = String(form.get("answer") ?? "");
    if (!(crewOutingRsvps as readonly string[]).includes(answer)) {
      return data<CrewActionData>({ crewError: "Réponse inconnue." }, { status: 400 });
    }
    const res = await api(request, `/crews/${crewId}/outings/${outingId}/rsvp`, { method: "PUT", json: { answer } });
    if (!res.ok) return data<CrewActionData>({ crewError: res.error.message }, { status: res.status });
    return data<CrewActionData>({ crewError: null });
  }
  if (intent === "outing_cancel") {
    const res = await api(request, `/crews/${crewId}/outings/${outingId}`, { method: "DELETE" });
    if (!res.ok) return data<CrewActionData>({ crewError: res.error.message }, { status: res.status });
    return data<CrewActionData>({ crewError: null, crewOk: L.outingCancelled });
  }
  return data<CrewActionData>({ crewError: "Action inconnue." }, { status: 400 });
}

export default function AppCrew({ loaderData, actionData }: Route.ComponentProps) {
  if (loaderData.mode === "error") {
    return (
      <div className="s-narrow s-stack" data-testid="load-error">
        <p className="s-error" role="alert">
          {loaderData.message || T.loadError}
        </p>
        <Button variant="secondary" icon="undo" href="/app/crew">
          Réessayer
        </Button>
      </div>
    );
  }
  if (loaderData.mode === "none") return <NoCrew invitations={loaderData.invitations} />;
  return <CrewSpaceView data={loaderData} result={actionData as CrewActionData | undefined} />;
}

/** Sans crew : « Pas encore de crew », la recherche (deux lettres au moins, pas d'annuaire), rejoindre, créer. */
function NoCrew({ invitations }: { invitations: CrewInboxRequest[] }) {
  return (
    <div className="s-narrow s-stack crw-none" data-testid="crew-tab-none">
      <div className="crw-none__intro">
        <span className="crw-none__icon" aria-hidden="true">
          <Icon name="crew" size={30} />
        </span>
        <h1 className="s-title">{T.noCrewTitle}</h1>
        <p className="s-muted">{T.noCrewBody}</p>
      </div>
      {/* Un seul bouton principal : « Rejoindre un crew » envoie la recherche (au moins deux lettres) à l'écran qui la fait. */}
      <form method="get" action="/app/crews/rejoindre" className="s-stack">
        <TextField
          label={T.searchLabel}
          name="q"
          type="search"
          placeholder={T.searchPlaceholder}
          autoComplete="off"
          data-testid="crew-tab-q"
        />
        <Button type="submit" variant="primary" icon="search" fullWidth data-testid="crew-tab-join">
          {T.join}
        </Button>
      </form>
      {invitations.length > 0 ? (
        <section className="s-stack" data-testid="crew-tab-invitations">
          <h2 className="s-h2">{T.invitationsTitle}</h2>
          <ul className="crw-list">
            {invitations.map((r) => (
              <li key={r.crew.id} className="crw-prow" data-testid="crew-tab-invitation">
                <CrewBadge name={r.crew.name} logoUrl={r.crew.logoUrl} size={40} />
                <span className="crw-grow">
                  <a className="o-t-body-strong crw-block o-never-truncate" href={`/c/${r.crew.slug}`}>
                    {T.invitationFrom(r.crew.name, r.invitedBy ?? null)}
                  </a>
                  <span className="o-t-caption s-muted">{T.invitationHint}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <Button variant="secondary" icon="add" href="/app/crews/nouveau" fullWidth data-testid="crew-tab-create">
        {T.create}
      </Button>
      <p className="o-t-caption s-muted crw-none__note">
        <Icon name="info" size={16} />
        {T.noDirectory}
      </p>
    </div>
  );
}
