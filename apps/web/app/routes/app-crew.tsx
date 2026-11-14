import { Button, Icon, TextField } from "@orasso/design-system/web";
import {
  type CrewCard,
  type CrewInboxRequest,
  type CrewMemberView,
  type CrewPendingList,
  type CrewView,
  crewLabels,
  crewOutingRsvps,
  crewPageLabels as L,
  type MyCrew,
  navLabels,
  type Page,
  explorerR2Labels as R,
  crewTabLabels as T,
} from "@orasso/shared";
import { useEffect, useState } from "react";
import {
  data,
  redirect,
  type ShouldRevalidateFunctionArgs,
  useLocation,
  useNavigate,
  useRouteLoaderData,
} from "react-router";

import { CrewBadge } from "../components/crew-page/CrewPage";
import { CrewSpaceView, crewTabOf } from "../components/crew-page/CrewSpaceView";
import { CrewRowR2, PeopleEmpty, PeopleSection, PrivacyNote } from "../components/ExplorerPeople";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import { crewLastCookie, crewLastOf, pickCrew } from "../lib/crew-last.server";
import { type CrewActionData, crewAction, isCrewIntent } from "../lib/crews.server";
import { listenSession } from "../lib/sessionChannel";
import {
  AFTER_RELOAD_PARAM,
  isAfterReload,
  isForeign,
  nextAnnounced,
  reloadManually,
  useReloadWhenForeign,
  useSessionConfirmation,
} from "../lib/sessionReload";
import type { Route } from "./+types/app-crew";

// Onglet Crew (lot R7b2, D38, maquette R7.11), comme l'appli : le sélecteur de crew (plusieurs crews ; le dernier ouvert
// revient, cookie par compte), l'image et la description du crew, la Discussion, les onglets Fil · Sorties · Membres · Spots
// (`?crew=<adresse>&onglet=`) ; sans crew, « Rejoindre un crew » ou « Créer un crew ». La page `/c/:slug` n'est plus que la
// vitrine d'un crew vu de dehors. Mode A : bande ORASSO et barre d'onglets. Les formulaires de la page (réponse à une
// sortie, demande acceptée, invitation, départ) arrivent ici.
export function meta() {
  return [{ title: `${navLabels.crewTab.title} · Orasso` }, { name: "robots", content: "noindex" }];
}

/**
 * Retirer `publier` de l'adresse (la fenêtre de publication est ouverte, un F5 ne doit pas la rouvrir : `CrewSpaceView`) est une
 * navigation du routeur : sans ceci, elle relancerait les quatre lectures de la page (mes crews, le crew, ses membres, ses demandes)
 * pour rien, et une panne à cet instant ferait basculer la page sur la limite d'erreur. Rien d'autre ne change : la page ne se relit pas.
 */
export function shouldRevalidate({
  currentUrl,
  nextUrl,
  formMethod,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (formMethod && formMethod.toUpperCase() !== "GET") return defaultShouldRevalidate;
  const without = (url: URL) => {
    const p = new URLSearchParams(url.search);
    p.delete("publier");
    return `${url.pathname}?${p.toString()}`;
  };
  const droppedPublier =
    currentUrl.searchParams.has("publier") &&
    !nextUrl.searchParams.has("publier") &&
    without(currentUrl) === without(nextUrl);
  return droppedPublier ? false : defaultShouldRevalidate;
}

export async function loader({ request }: Route.LoaderArgs) {
  const me = await requireMe(request);
  // Page née d'un rechargement automatique : le chargeur ne lit RIEN de privé (la session a pu changer pendant la lecture : rien de
  // l'ancien compte ne doit rester dans le HTML ni dans les données sérialisées). La page confirme le compte par `/me`
  // (`useSessionConfirmation`), puis navigue sans la marque : le chargeur relit pour le compte courant.
  if (isAfterReload(new URL(request.url))) {
    return { mode: "pending" as const, userId: me.user.id, afterReload: true as const };
  }
  const mine = await api<MyCrew[]>(request, "/me/crews");
  if (!mine.ok)
    return { mode: "error" as const, message: mine.error.message, userId: me.user.id, afterReload: false as const };
  const url = new URL(request.url);
  if (mine.data.length === 0) {
    const asked = await api<CrewInboxRequest[]>(request, "/me/crew-requests");
    // La recherche se montre sur place (comme l'appli) : deux lettres au moins, pas d'annuaire.
    const q = (url.searchParams.get("q") ?? "").trim();
    const searching = q.length >= MIN_QUERY;
    const found = searching
      ? await api<Page<CrewCard>>(request, `/crews/search?${new URLSearchParams({ q, limit: "20" })}`)
      : null;
    return {
      mode: "none" as const,
      userId: me.user.id,
      afterReload: false as const,
      invitations: asked.ok ? asked.data.filter((r) => r.kind === "invitation") : [],
      q,
      searching,
      tooShort: q.length > 0 && !searching,
      crews: found?.ok ? found.data.items : [],
      failed: found && !found.ok ? found.error.message : null,
    };
  }
  // Un crew demandé par le lien qui n'est pas le mien : sa vitrine, jamais un autre de mes crews en silence.
  const wanted = url.searchParams.get("crew");
  if (wanted && !mine.data.some((c) => c.slug === wanted)) throw redirect(`/c/${encodeURIComponent(wanted)}`);
  const current = pickCrew(mine.data, wanted, crewLastOf(request, me.user.id)) as MyCrew;
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
    {
      mode: "crew" as const,
      crews: mine.data,
      crew,
      members,
      pending,
      userId: me.user.id,
      tab,
      afterReload: false as const,
    },
    { headers },
  );
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  // La demande faite depuis les résultats de recherche (sans crew) : l'adresse du crew sert à marquer la ligne « envoyée ».
  if (intent === "crew_request") {
    const res = await crewAction(request, form);
    return data({ ...res.data, crewId: String(form.get("crewId") ?? "") }, { status: res.init?.status ?? 200 });
  }
  if (isCrewIntent(intent)) {
    const res = await crewAction(request, form);
    // Quitter le crew : pas de retour sur la vitrine du crew quitté, mais le crew suivant ou « Pas encore de crew ».
    if (intent === "crew_leave" && !res.data.crewError) throw redirect("/app/crew");
    return res;
  }
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

/** Portée du compteur de rechargements automatiques (`sessionReload.ts`). */
const RELOAD_SCOPE = "crew";

export default function AppCrew({ loaderData, actionData }: Route.ComponentProps) {
  // Les données du Crew (sorties, garage, demandes) sont celles du compte qui les a chargées (`userId`). Si le compte courant est un
  // autre, rien n'en est affiché et la page se recharge en entier (rendu serveur avec le cookie courant : les données sont celles du
  // compte courant, ou la page de connexion). Aucune relecture, aucune réconciliation.
  const layout = useRouteLoaderData("layouts/app") as { userId?: string } | undefined;
  // Le dernier compte annoncé par une AUTRE fenêtre (les annonces de cette fenêtre, dont celle de sa propre mise en page, sont ignorées).
  const [announced, setAnnounced] = useState<string | null | undefined>(undefined);
  useEffect(
    () =>
      listenSession((id, self) => {
        setAnnounced((was) => nextAnnounced(was, id, self));
      }),
    [],
  );
  // `userId` est dans tous les résultats du chargeur (sans crew, les invitations de `/me/crew-requests` sont aussi privées).
  const owner = loaderData.userId;
  // Après un rechargement automatique, la page reste neutre tant que `/me` n'a pas confirmé que la session courante est celle des
  // données : une annonce reçue par l'ANCIEN document (ou une déconnexion) ne parvient jamais à celui-ci. Revérifié au retour de
  // l'onglet, du focus et sur `pageshow`.
  const { confirmed, stalled } = useSessionConfirmation(owner, loaderData.afterReload);
  const foreign = isForeign({ owner, layoutUserId: layout?.userId, announced, confirmed });
  // Page « pending » (née d'un rechargement) dont le compte est confirmé : on navigue sans la marque, ce qui relit le chargeur pour
  // le compte courant et retire la marque de l'adresse.
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const pending = loaderData.mode === "pending";
  useEffect(() => {
    if (!pending || confirmed !== "ok" || foreign) return;
    const params = new URLSearchParams(search);
    params.delete(AFTER_RELOAD_PARAM);
    const rest = params.toString();
    void navigate(`${pathname}${rest ? `?${rest}` : ""}`, { replace: true });
  }, [pending, confirmed, foreign, pathname, search, navigate]);
  // Le rechargement part dans un effet de mise en page (avant l'image qui montre « Mise à jour… »), voir `useReloadWhenForeign`.
  const gaveUp = useReloadWhenForeign(foreign, RELOAD_SCOPE);
  if ((foreign && gaveUp) || confirmed === "failed") {
    // Les rechargements n'ont pas résolu la discordance (ou le compte n'a pas pu être confirmé) : jamais « Mise à jour… » à vie.
    return (
      <div className="s-narrow s-stack" data-testid="crew-refresh-failed">
        <p className="s-error" role="alert">
          {L.refreshFailed}
        </p>
        <Button variant="secondary" icon="undo" onClick={() => reloadManually(RELOAD_SCOPE)}>
          {L.refreshReload}
        </Button>
      </div>
    );
  }
  if (foreign || confirmed === "checking" || loaderData.mode === "pending") {
    return (
      <div className="s-narrow s-stack">
        <p className="s-muted" role="status" data-testid="crew-refreshing">
          {L.refreshing}
        </p>
        {stalled ? (
          // Rechargement lent ou interrompu (page restaurée) : « Mise à jour… » reste, le bouton s'ajoute dessous.
          <Button
            variant="secondary"
            icon="undo"
            onClick={() => reloadManually(RELOAD_SCOPE)}
            data-testid="crew-refresh-slow"
          >
            {L.refreshReload}
          </Button>
        ) : null}
      </div>
    );
  }
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
  if (loaderData.mode === "none") {
    return <NoCrew data={loaderData} sent={sentOf(actionData)} error={errorOf(actionData)} />;
  }
  // Un crew par clé : changer de crew (ou une relecture qui en montre un autre) remet à zéro le fil, les commentaires
  // ouverts et la publication ; rien de l'ancien crew ne reste sous le nom du nouveau.
  return <CrewSpaceView key={loaderData.crew.id} data={loaderData} result={actionData as CrewActionData | undefined} />;
}

/** Comme l'Explorer et l'appli : une recherche à partir de deux lettres. */
const MIN_QUERY = 2;

/** Sans crew : « Pas encore de crew », la recherche (deux lettres au moins, pas d'annuaire), rejoindre, créer. */
function NoCrew({
  data: { invitations, q, searching, tooShort, crews, failed },
  sent,
  error,
}: {
  data: {
    invitations: CrewInboxRequest[];
    q: string;
    searching: boolean;
    tooShort: boolean;
    crews: CrewCard[];
    failed: string | null;
  };
  sent: string | null;
  error: string | null;
}) {
  return (
    <div className="s-narrow s-stack crw-none" data-testid="crew-tab-none">
      <div className="crw-none__intro">
        <span className="crw-none__icon" aria-hidden="true">
          <Icon name="crew" size={30} />
        </span>
        <h1 className="s-title">{T.noCrewTitle}</h1>
        <p className="s-muted">{T.noCrewBody}</p>
      </div>
      {/* Un seul bouton principal : « Rejoindre un crew » mène à l'écran qui rejoint (avec la recherche). « Chercher » (ou
          Entrée) montre les résultats ici, sur place, comme l'appli. */}
      <form method="get" action="/app/crew" className="s-stack">
        <div className="s-row crw-row-end">
          <TextField
            label={T.searchLabel}
            name="q"
            type="search"
            defaultValue={q}
            placeholder={T.searchPlaceholder}
            autoComplete="off"
            data-testid="crew-tab-q"
          />
          <Button type="submit" variant="secondary" icon="search" data-testid="crew-tab-search">
            {crewLabels.search}
          </Button>
        </div>
        <Button
          type="submit"
          variant="primary"
          icon="search"
          fullWidth
          // Sans JavaScript, le bouton cherche sur place comme « Chercher » ; avec, il ouvre l'écran qui rejoint.
          onClick={(e) => {
            const form = (e.currentTarget as HTMLButtonElement).form;
            if (form) form.action = "/app/crews/rejoindre";
          }}
          data-testid="crew-tab-join"
        >
          {T.join}
        </Button>
      </form>
      {error ? (
        <p className="s-error" role="alert">
          {error}
        </p>
      ) : null}
      {failed ? (
        <p className="s-error" role="alert">
          {failed}
        </p>
      ) : null}
      {tooShort ? (
        <p className="o-t-caption s-muted" data-testid="crew-tab-short">
          {R.tooShort}
        </p>
      ) : null}
      {searching && !failed ? (
        <>
          <PeopleSection title={R.crewsGroup(crews.length, false)} hint={R.crewsGroupHint} testId="crew-results">
            {crews.length === 0 ? <PeopleEmpty>{R.noCrews(q)}</PeopleEmpty> : null}
            <ul className="s-people">
              {crews.map((c) => (
                <CrewRowR2 key={c.id} crew={c} mine={false} sent={sent === c.id} />
              ))}
            </ul>
          </PeopleSection>
          <PrivacyNote>{R.privacyResults}</PrivacyNote>
        </>
      ) : null}
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

/** Le crew dont la demande vient de partir (action de la recherche sans crew). */
function sentOf(result: unknown): string | null {
  const r = result as { crewError?: string | null; crewId?: string } | undefined;
  return r && !r.crewError && r.crewId ? r.crewId : null;
}
function errorOf(result: unknown): string | null {
  return (result as { crewError?: string | null } | undefined)?.crewError ?? null;
}
