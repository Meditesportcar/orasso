import { Button, TextField } from "@orasso/design-system/web";
import { type CrewCard, crewLabels, type MyCrew, type Page, explorerR2Labels as R } from "@orasso/shared";
import { data, Form, useNavigation } from "react-router";

import { CrewRowR2, PeopleEmpty, PeopleSection, PrivacyNote } from "../components/ExplorerPeople";
import { FicheBar, ficheHandle } from "../components/FicheBar";
import { api, requireMe } from "../lib/api.server";
import { crewAction } from "../lib/crews.server";
import type { Route } from "./+types/crews-rejoindre";

// Rejoindre un crew (lot R3b, retour 16 de Damien ; l'appli : `app/crew/rejoindre.tsx`) : « Rejoins ou crée un crew »
// du profil ouvrait la création. D'abord rejoindre : la recherche de crews et « Crews de ton coin », avec les mêmes
// appels et les mêmes lignes que Personnes et crews de l'Explorer (lot R2) ; « Créer un crew » ensuite, en lien
// secondaire. Mode B (en-tête de fiche).
export const handle = ficheHandle;

export function meta() {
  return [{ title: `${crewLabels.joinTitle} · Orasso` }, { name: "robots", content: "noindex" }];
}

/** Comme l'Explorer : une recherche à partir de deux lettres, dans toute la France ; sinon les crews de mon coin. */
const MIN_QUERY = 2;

export async function loader({ request }: Route.LoaderArgs) {
  const me = await requireMe(request);
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  const coin = me.profile.departments ?? [];
  const searching = q.length >= MIN_QUERY;
  const params = new URLSearchParams({ limit: searching ? "20" : "6" });
  if (searching) params.set("q", q);
  else if (coin.length) params.set("departments", coin.join(","));
  const [crews, mine] = await Promise.all([
    api<Page<CrewCard>>(request, `/crews/search?${params}`),
    api<MyCrew[]>(request, "/me/crews"),
  ]);
  return {
    q,
    searching,
    tooShort: q.length > 0 && !searching,
    coinDept: coin[0] ?? null,
    crews: crews.ok ? crews.data.items : [],
    failed: crews.ok ? null : crews.error.message,
    myCrewIds: mine.ok ? mine.data.map((c) => c.id) : [],
    myCrewName: mine.ok ? (mine.data[0]?.name ?? null) : null,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  if (String(form.get("intent") ?? "") !== "crew_request") {
    return data({ crewError: "Action inconnue.", crewId: null }, { status: 400 });
  }
  const res = await crewAction(request, form);
  return data({ ...res.data, crewId: String(form.get("crewId") ?? "") }, { status: res.init?.status ?? 200 });
}

export default function JoinCrew({ loaderData, actionData }: Route.ComponentProps) {
  const { q, searching, tooShort, coinDept, crews, failed, myCrewIds, myCrewName } = loaderData;
  const busy = useNavigation().state !== "idle";
  const mine = new Set(myCrewIds);
  const sent = actionData && !actionData.crewError ? actionData.crewId : null;
  const shown = searching ? crews : crews.filter((c) => !mine.has(c.id));
  const rows = (
    <ul className="s-people">
      {shown.map((c) => (
        <CrewRowR2 key={c.id} crew={c} mine={mine.has(c.id)} sent={sent === c.id} busy={busy} />
      ))}
    </ul>
  );
  return (
    <>
      <FicheBar title={crewLabels.joinTitle} back="/app/moi" />
      <div className="s-narrow s-stack" data-testid="crew-join-page">
        <p className="o-t-meta s-muted">{crewLabels.joinHint}</p>
        <Form method="get" className="s-row" role="search">
          <TextField
            label={crewLabels.search}
            name="q"
            defaultValue={q}
            placeholder={crewLabels.joinSearchPlaceholder}
            data-testid="crew-join-q"
          />
          <Button type="submit" variant="secondary" icon="search">
            {crewLabels.search}
          </Button>
        </Form>
        {actionData?.crewError ? (
          <p className="s-error" role="alert">
            {actionData.crewError}
          </p>
        ) : null}
        {failed ? (
          <p className="s-error" role="alert">
            {failed}
          </p>
        ) : null}
        {tooShort ? <p className="o-t-caption s-muted">{R.tooShort}</p> : null}
        {searching ? (
          <PeopleSection title={R.crewsGroup(shown.length, false)} hint={R.crewsGroupHint} testId="crew-results">
            {shown.length === 0 ? <PeopleEmpty>{R.noCrews(q)}</PeopleEmpty> : null}
            {rows}
          </PeopleSection>
        ) : !tooShort && shown.length > 0 ? (
          <PeopleSection title={R.crewsNearTitle(coinDept)} hint={R.crewsNearHint(myCrewName)} testId="suggest-crews">
            {rows}
          </PeopleSection>
        ) : !tooShort && !failed ? (
          <PeopleEmpty>{R.noSuggestions}</PeopleEmpty>
        ) : null}
        <PrivacyNote>{searching ? R.privacyResults : R.privacyOpen}</PrivacyNote>
        <div className="s-stack s-stack--tight" data-testid="crew-join-create">
          <p className="o-t-caption s-muted">{crewLabels.joinOrCreate}</p>
          <p>
            <Button variant="secondary" icon="add" href="/app/crews" data-testid="crew-new">
              {crewLabels.createCrew}
            </Button>
          </p>
        </div>
      </div>
    </>
  );
}
