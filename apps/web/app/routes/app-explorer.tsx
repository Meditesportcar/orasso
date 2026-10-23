import {
  Button,
  Chip,
  departmentChoices,
  departmentLabel,
  Plate,
  SelectField,
  TextField,
} from "@orasso/design-system/web";
import {
  type Category,
  type CrewCard,
  coarsePosition,
  crewLabels,
  departments,
  type EventCard,
  type EventSort,
  eventFormatLabels,
  eventFormats,
  eventHints,
  explorerLabels,
  explorerV2Labels,
  fromWallTime,
  gradeLabels,
  grades,
  hasPeopleSearchCriteria,
  type Page,
  type PeopleSearchPage,
  type ProCard,
  proActivities,
  proActivityLabels,
  proHints,
  SEARCH_MAX_LENGTH,
  SEARCH_MIN_LENGTH,
  type SearchResults,
  searchGroupLabels,
  socialLabels,
} from "@orasso/shared";
import { Form, useNavigation } from "react-router";

import { CrewRow } from "../components/Crews";
import { EventsMap } from "../components/EventsMap";
import { EventTile } from "../components/EventTile";
import { FriendAction, PersonAvatar, PersonRow } from "../components/People";
import { ProsMap } from "../components/ProsMap";
import { ProTile } from "../components/ProTile";
import { UsePosition } from "../components/UsePosition";
import { api, apiOrThrow } from "../lib/api.server";
import { friendAction } from "../lib/friends.server";
import { withRetour } from "../lib/retour";
import type { Route } from "./+types/app-explorer";

// Explorer (docs/02, lots 17 et 29) : recherche en tête, quatre vues : les résultats groupés de la recherche de premier
// niveau, les Événements (liste ou carte, affinités / date / distance, filtres), les Pros (même principe) et les
// Personnes et crews (lot 17 ; les crews arrivent avec le lot 19). Tous les réglages sont dans l'adresse de la page.
export function meta() {
  return [{ title: "Explorer · Orasso" }, { name: "robots", content: "noindex" }];
}

const SEGMENTS = ["resultats", "evenements", "pros", "personnes"] as const;
type Segment = (typeof SEGMENTS)[number];
const PAGE = 24;
const MAP_PAGE = 100;
const RADII = [10, 25, 50, 100, 200];
// Lot M4 (maquette 3.2, parité du site) : aussi « Nouveautés » et « Places restantes ».
const EVENT_SORTS: Record<string, EventSort> = {
  affinites: "affinity",
  date: "date",
  distance: "distance",
  nouveautes: "recent",
  places: "seats",
};

/** « 2026-10-17 » → instant de minuit (début) ou de 23 h 59 (fin) à Paris ; `null` si la date est illisible. */
function dayBound(value: string, end: boolean): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  return fromWallTime({
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: end ? 23 : 0,
    minute: end ? 59 : 0,
  }).toISOString();
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const get = (name: string) => url.searchParams.get(name) ?? "";
  const q = get("q").trim().slice(0, SEARCH_MAX_LENGTH);
  const requested = get("segment");
  const segment: Segment = (SEGMENTS as readonly string[]).includes(requested)
    ? (requested as Segment)
    : q
      ? "resultats"
      : "evenements";
  const vue = get("vue") === "carte" ? "carte" : "liste";
  const lat = get("lat") === "" ? Number.NaN : Number(get("lat"));
  const lng = get("lng") === "" ? Number.NaN : Number(get("lng"));
  const position =
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
      ? coarsePosition({ lat, lng })
      : null;
  const radius = RADII.includes(Number(get("rayon"))) ? Number(get("rayon")) : null;
  const cursor = get("suite");
  // Lot M4, tour 2 (décision de Damien du 23/10) : « Autour de… » comme l'appli. `autour` : `coin` (départements du
  // compte), `moi` (la position de l'appareil, dans l'adresse seulement) ou un département (« Ailleurs… »). Sans
  // choix : la position si elle est là, sinon le coin. Temporaire : rien n'est enregistré.
  const autour = get("autour");
  const aroundDept = (departments as readonly string[]).includes(autour) ? autour : null;
  const around: "mine" | "me" | "dept" = aroundDept
    ? "dept"
    : autour === "coin"
      ? "mine"
      : position && (autour === "moi" || autour === "")
        ? "me"
        : "mine";

  const base = { segment, q, vue, position, radius, around, aroundDept, wantedMe: autour === "moi" && !position };
  const empty = {
    results: null as SearchResults | null,
    events: null as Page<EventCard> | null,
    pros: null as Page<ProCard> | null,
    people: null as PeopleSearchPage | null,
    categories: [] as Category[],
    failed: null as string | null,
    // Crews (lots 19 et 29) : même texte et même département que les personnes (segment « Personnes et crews »).
    crews: null as CrewCard[] | null,
  };

  if (segment === "resultats") {
    if (q.length < SEARCH_MIN_LENGTH) return { ...base, ...empty, filters: {} as Record<string, string> };
    const res = await api<SearchResults>(request, `/search?${new URLSearchParams({ q, limit: "5" })}`);
    return {
      ...base,
      ...empty,
      results: res.ok ? res.data : null,
      failed: res.ok ? null : res.error.message,
      filters: {} as Record<string, string>,
    };
  }

  if (segment === "evenements") {
    const filters = {
      format: (eventFormats as readonly string[]).includes(get("format")) ? get("format") : "",
      categoryId: /^[0-9a-f-]{36}$/i.test(get("categorie")) ? get("categorie") : "",
      department: (departments as readonly string[]).includes(get("departement")) ? get("departement") : "",
      from: /^\d{4}-\d{2}-\d{2}$/.test(get("du")) ? get("du") : "",
      to: /^\d{4}-\d{2}-\d{2}$/.test(get("au")) ? get("au") : "",
      sort: get("tri") in EVENT_SORTS ? get("tri") : "affinites",
    };
    const params = new URLSearchParams({
      limit: String(vue === "carte" ? MAP_PAGE : PAGE),
      sort: EVENT_SORTS[filters.sort] ?? "affinity",
    });
    if (q) params.set("q", q);
    if (filters.format) params.set("format", filters.format);
    if (filters.categoryId) params.set("categoryId", filters.categoryId);
    if (filters.department) params.set("department", filters.department);
    const from = dayBound(filters.from, false);
    const to = dayBound(filters.to, true);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    // Tour 2 : la distance de l'Explorer, ou « Partout en France » (aucun rayon) ; le point de départ choisi.
    if (radius) params.set("radiusKm", String(radius));
    else params.set("everywhere", "1");
    if (position && around === "me") {
      params.set("lat", String(position.lat));
      params.set("lng", String(position.lng));
    }
    if (aroundDept) params.set("around", aroundDept);
    if (cursor) params.set("cursor", cursor);
    const [events, categories] = await Promise.all([
      api<Page<EventCard>>(request, `/events?${params}`),
      apiOrThrow<Category[]>(request, "/vehicle-reference/categories"),
    ]);
    return {
      ...base,
      ...empty,
      filters,
      categories,
      events: events.ok ? events.data : { items: [], nextCursor: null },
      failed: events.ok ? null : events.error.message,
    };
  }

  if (segment === "pros") {
    const filters = {
      activity: (proActivities as readonly string[]).includes(get("activite")) ? get("activite") : "",
      department: (departments as readonly string[]).includes(get("departement")) ? get("departement") : "",
      sort: get("tri") === "distance" ? "distance" : "nom",
    };
    const params = new URLSearchParams({
      limit: String(vue === "carte" ? MAP_PAGE : PAGE),
      sort: filters.sort === "distance" ? "distance" : "name",
    });
    if (q) params.set("q", q);
    if (filters.activity) params.set("activity", filters.activity);
    if (filters.department) params.set("department", filters.department);
    if (radius) params.set("radiusKm", String(radius));
    if (position) {
      params.set("lat", String(position.lat));
      params.set("lng", String(position.lng));
    }
    if (cursor) params.set("cursor", cursor);
    const pros = await api<Page<ProCard>>(request, `/pros?${params}`);
    return {
      ...base,
      ...empty,
      filters,
      pros: pros.ok ? pros.data : { items: [], nextCursor: null },
      failed: pros.ok ? null : pros.error.message,
    };
  }

  // Personnes et crews (lot 17).
  const filters = {
    department: get("departement"),
    categoryId: get("interet"),
    grade: get("grade"),
  };
  const categories = await apiOrThrow<Category[]>(request, "/vehicle-reference/categories");
  let crews: CrewCard[] | null = null;
  if (q || filters.department) {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (filters.department) qs.set("department", filters.department);
    const found = await api<Page<CrewCard>>(request, `/crews/search?${qs}`);
    crews = found.ok ? found.data.items : [];
  }
  const criteria = { q, ...filters };
  if (!hasPeopleSearchCriteria(criteria)) return { ...base, ...empty, crews, filters, categories };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(criteria)) if (value) params.set(key, value);
  if (cursor) params.set("cursor", cursor);
  const res = await api<PeopleSearchPage>(request, `/users/search?${params}`);
  return {
    ...base,
    ...empty,
    crews,
    filters,
    categories,
    people: res.ok ? res.data : null,
    failed: res.ok ? null : res.error.message,
  };
}

export async function action({ request }: Route.ActionArgs) {
  return friendAction(request, await request.formData());
}

/** Adresse de l'Explorer avec les réglages donnés (les valeurs vides sont omises). */
function href(params: Record<string, string | number | null | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value !== null && value !== undefined && value !== "") query.set(key, String(value));
  const text = query.toString();
  return text ? `/app/explorer?${text}` : "/app/explorer";
}

export default function Explorer({ loaderData, actionData }: Route.ComponentProps) {
  const { segment, q, vue, position, radius, filters, results, events, pros, people, categories, failed, crews } =
    loaderData;
  const { around, aroundDept, wantedMe } = loaderData;
  const busy = useNavigation().state !== "idle";
  const f = filters as Record<string, string>;
  const segments: { id: Segment; label: string }[] = [
    ...(q ? [{ id: "resultats" as const, label: explorerLabels.segmentAll }] : []),
    { id: "evenements", label: explorerLabels.segmentEvents },
    { id: "pros", label: explorerLabels.segmentPros },
    { id: "personnes", label: explorerLabels.segmentPeople },
  ];
  // Réglages communs conservés d'un changement de vue à l'autre.
  const autour = around === "dept" ? aroundDept : around === "me" ? "moi" : "coin";
  // Tour 2 : la position ne reste dans l'adresse (et les champs cachés) que pour « Autour de moi ».
  const usedPosition = around === "me" ? position : null;
  const keep = { segment, q, ...f, rayon: radius, lat: usedPosition?.lat, lng: usedPosition?.lng, autour };
  // Tour 2 : « Revenir à mon coin » (point de départ et distance remis, position oubliée).
  const home = href({ ...keep, autour: "coin", rayon: null, lat: null, lng: null, suite: null });
  const away = around !== "mine" || radius !== null;
  const withoutPosition = href({ ...keep, lat: null, lng: null, suite: null });
  const viewLinks = (
    <nav className="s-row" aria-label="Affichage">
      <a href={href({ ...keep, vue: "liste", suite: null })} aria-current={vue === "liste" ? "page" : undefined}>
        <Chip selected={vue === "liste"}>{explorerLabels.list}</Chip>
      </a>
      <a href={href({ ...keep, vue: "carte", suite: null })} aria-current={vue === "carte" ? "page" : undefined}>
        <Chip selected={vue === "carte"}>{explorerLabels.map}</Chip>
      </a>
    </nav>
  );
  const positionNote = usedPosition ? (
    <p className="o-t-caption s-muted" data-testid="position-note">
      {explorerLabels.usingPosition} · <a href={withoutPosition}>{explorerLabels.stopPosition}</a>
    </p>
  ) : null;
  const nextHref = (cursor: string | null | undefined) => (cursor ? href({ ...keep, vue, suite: cursor }) : null);

  return (
    <div className="s-stack" data-testid="explorer">
      <h1 className="s-title">{explorerLabels.title}</h1>
      <nav className="s-row" aria-label="Segments d'Explorer">
        {segments.map((s) => (
          <a
            key={s.id}
            href={href({ segment: s.id, q })}
            aria-current={segment === s.id ? "page" : undefined}
            data-testid={`segment-${s.id}`}
          >
            <Chip selected={segment === s.id}>{s.label}</Chip>
          </a>
        ))}
      </nav>

      {failed && (
        <p className="s-error" role="alert">
          {failed}
        </p>
      )}

      {segment === "resultats" && (
        <div className="s-stack" data-testid="search-results">
          <Plate as="section" aria-label={explorerLabels.searchTitle}>
            <Form method="get" className="s-filters" role="search" id="explorer-form">
              <TextField
                label={explorerLabels.searchTitle}
                name="q"
                defaultValue={q}
                placeholder={explorerLabels.searchPlaceholder}
                maxLength={SEARCH_MAX_LENGTH}
              />
              <Button type="submit" variant="secondary" icon="search">
                Rechercher
              </Button>
            </Form>
          </Plate>
          {actionData?.friendError && (
            <p className="s-error" role="alert">
              {actionData.friendError}
            </p>
          )}
          {q.length < SEARCH_MIN_LENGTH ? (
            <p className="s-notice">{q ? explorerLabels.searchTooShort : explorerLabels.searchIdle}</p>
          ) : results ? (
            <ResultGroups results={results} busy={busy} q={q} />
          ) : null}
        </div>
      )}

      {segment === "evenements" && (
        <div className="s-stack" data-testid="events-segment">
          <Plate as="section" aria-label={explorerLabels.filters}>
            <Form method="get" className="s-filters" id="explorer-form" data-testid="events-filters">
              <input type="hidden" name="segment" value="evenements" />
              <input type="hidden" name="vue" value={vue} />
              {usedPosition && <input type="hidden" name="lat" value={usedPosition.lat} />}
              {usedPosition && <input type="hidden" name="lng" value={usedPosition.lng} />}
              <TextField
                label={explorerLabels.searchTitle}
                name="q"
                defaultValue={q}
                placeholder="Nom ou ville"
                maxLength={SEARCH_MAX_LENGTH}
              />
              <SelectField
                label={explorerLabels.filterFormat}
                name="format"
                defaultValue={f.format}
                options={[
                  { value: "", label: explorerLabels.filterAll },
                  ...eventFormats.map((x) => ({ value: x, label: eventFormatLabels[x] })),
                ]}
              />
              <SelectField
                label={explorerLabels.filterCategory}
                name="categorie"
                defaultValue={f.categoryId}
                options={[
                  { value: "", label: explorerLabels.filterAllFeminine },
                  ...categories.map((c) => ({ value: c.id, label: c.label })),
                ]}
              />
              <SelectField
                label={explorerLabels.filterDepartment}
                name="departement"
                defaultValue={f.department}
                options={[
                  { value: "", label: explorerLabels.filterAll },
                  ...departments.map((d) => ({ value: d, label: d })),
                ]}
              />
              <TextField label={explorerLabels.filterFrom} name="du" type="date" defaultValue={f.from} />
              <TextField label={explorerLabels.filterTo} name="au" type="date" defaultValue={f.to} />
              <SelectField
                label={explorerLabels.sort}
                name="tri"
                defaultValue={f.sort}
                options={[
                  { value: "affinites", label: explorerLabels.sortAffinity },
                  { value: "date", label: explorerLabels.sortDate },
                  { value: "distance", label: explorerLabels.sortDistance },
                  { value: "nouveautes", label: explorerV2Labels.sorts.recent?.label ?? "Nouveautés" },
                  { value: "places", label: explorerV2Labels.sorts.seats?.label ?? "Places restantes" },
                ]}
              />
              {/* Tour 2 : « Autour de… » et la distance de l'Explorer, comme l'appli. */}
              <SelectField
                label={explorerV2Labels.aroundButton}
                name="autour"
                defaultValue={autour ?? "coin"}
                data-testid="around-select"
                options={[
                  { value: "coin", label: explorerV2Labels.aroundMine },
                  { value: "moi", label: explorerV2Labels.aroundMe },
                  ...departmentChoices.map((d) => ({
                    value: d.code,
                    label: `${explorerV2Labels.aroundElsewhere} ${departmentLabel(d)}`,
                  })),
                ]}
              />
              <SelectField
                label={explorerV2Labels.aroundDistance}
                name="rayon"
                defaultValue={radius ? String(radius) : ""}
                options={[
                  { value: "", label: explorerV2Labels.everywhere },
                  ...RADII.map((r) => ({ value: String(r), label: explorerV2Labels.aroundKm(r) })),
                ]}
              />
              <Button type="submit" variant="secondary" icon="search">
                {explorerLabels.filtersApply}
              </Button>
              <Button href={href({ segment: "evenements" })} variant="secondary" icon="undo">
                {explorerLabels.filtersReset}
              </Button>
            </Form>
            <UsePosition formId="explorer-form" />
          </Plate>
          {positionNote}
          <p className="o-t-caption s-muted" data-testid="around-line">
            {around === "dept" && aroundDept
              ? explorerV2Labels.fromDeptElsewhere(aroundDept)
              : around === "me"
                ? explorerV2Labels.fromPosition
                : explorerV2Labels.aroundMine}
            {radius ? ` · ${explorerV2Labels.withinKm(radius)}` : ` · ${explorerV2Labels.everywhereLine}`}
            {wantedMe ? ` · ${explorerLabels.usePosition}` : ""}
            {away ? (
              <>
                {" · "}
                <a href={home} data-testid="around-back">
                  {explorerV2Labels.backHome}
                </a>
              </>
            ) : null}
          </p>
          {viewLinks}
          {events && events.items.length === 0 && !failed ? (
            <p className="s-notice" data-testid="events-empty">
              {explorerLabels.eventsEmpty}
            </p>
          ) : null}
          {events && events.items.length > 0 && (
            <div className="evs">
              {vue === "carte" && <EventsMap events={events.items} />}
              <div className="s-grid s-grid--list" data-testid="events-list">
                {events.items.map((event) => (
                  <EventTile key={event.id} event={event} hints={eventHints(event)} />
                ))}
              </div>
            </div>
          )}
          {nextHref(events?.nextCursor) && (
            <p className="s-center">
              <Button href={nextHref(events?.nextCursor) ?? ""} variant="secondary" icon="add">
                {explorerLabels.more}
              </Button>
            </p>
          )}
        </div>
      )}

      {segment === "pros" && (
        <div className="s-stack" data-testid="pros-segment">
          <Plate as="section" aria-label={explorerLabels.filters}>
            <Form method="get" className="s-filters" id="explorer-form" data-testid="pros-filters">
              <input type="hidden" name="segment" value="pros" />
              <input type="hidden" name="vue" value={vue} />
              {position && <input type="hidden" name="lat" value={position.lat} />}
              {position && <input type="hidden" name="lng" value={position.lng} />}
              <TextField
                label={explorerLabels.searchTitle}
                name="q"
                defaultValue={q}
                placeholder="Nom, ville ou activité"
                maxLength={SEARCH_MAX_LENGTH}
              />
              <SelectField
                label={explorerLabels.filterActivity}
                name="activite"
                defaultValue={f.activity}
                options={[
                  { value: "", label: explorerLabels.filterAllFeminine },
                  ...proActivities.map((a) => ({ value: a, label: proActivityLabels[a] })),
                ]}
              />
              <SelectField
                label={explorerLabels.filterDepartment}
                name="departement"
                defaultValue={f.department}
                options={[
                  { value: "", label: explorerLabels.filterAll },
                  ...departments.map((d) => ({ value: d, label: d })),
                ]}
              />
              <SelectField
                label={explorerLabels.sort}
                name="tri"
                defaultValue={f.sort}
                options={[
                  { value: "nom", label: explorerLabels.sortName },
                  { value: "distance", label: explorerLabels.sortDistance },
                ]}
              />
              <SelectField
                label={explorerLabels.filterRadius}
                name="rayon"
                defaultValue={radius ? String(radius) : ""}
                options={[
                  { value: "", label: explorerLabels.filterAll },
                  ...RADII.map((r) => ({ value: String(r), label: `${r} km` })),
                ]}
              />
              <Button type="submit" variant="secondary" icon="search">
                {explorerLabels.filtersApply}
              </Button>
              <Button href={href({ segment: "pros" })} variant="secondary" icon="undo">
                {explorerLabels.filtersReset}
              </Button>
            </Form>
            <UsePosition formId="explorer-form" />
          </Plate>
          {positionNote}
          {viewLinks}
          {pros && pros.items.length === 0 && !failed ? (
            <p className="s-notice" data-testid="pros-empty">
              {explorerLabels.prosEmpty}
            </p>
          ) : null}
          {pros && pros.items.length > 0 && (
            <div className="evs">
              {vue === "carte" && <ProsMap pros={pros.items} />}
              <div className="s-grid s-grid--list" data-testid="pros-list">
                {pros.items.map((pro) => (
                  <ProTile key={pro.slug} pro={pro} hints={proHints(pro)} />
                ))}
              </div>
            </div>
          )}
          {nextHref(pros?.nextCursor) && (
            <p className="s-center">
              <Button href={nextHref(pros?.nextCursor) ?? ""} variant="secondary" icon="add">
                {explorerLabels.more}
              </Button>
            </p>
          )}
        </div>
      )}

      {segment === "personnes" && (
        <div className="s-stack" data-testid="people-search">
          <Plate as="section" aria-label={explorerLabels.searchPeopleCrews}>
            <Form method="get" className="s-filters">
              <input type="hidden" name="segment" value="personnes" />
              <TextField
                label={explorerLabels.searchPeopleCrews}
                name="q"
                defaultValue={q}
                placeholder={explorerLabels.searchPeopleCrewsPlaceholder}
                maxLength={SEARCH_MAX_LENGTH}
              />
              <SelectField
                label={socialLabels.filterDepartment}
                name="departement"
                defaultValue={f.department}
                options={[{ value: "", label: "Tous" }, ...departments.map((d) => ({ value: d, label: d }))]}
              />
              <SelectField
                label={socialLabels.filterInterest}
                name="interet"
                defaultValue={f.categoryId}
                options={[{ value: "", label: "Tous" }, ...categories.map((c) => ({ value: c.id, label: c.label }))]}
              />
              <SelectField
                label={socialLabels.filterGrade}
                name="grade"
                defaultValue={f.grade}
                options={[
                  { value: "", label: socialLabels.filterAnyGrade },
                  ...grades.map((g) => ({ value: g, label: gradeLabels[g] })),
                ]}
              />
              <Button type="submit" variant="secondary" icon="search">
                Rechercher
              </Button>
            </Form>
          </Plate>

          {actionData?.friendError && (
            <p className="s-error" role="alert">
              {actionData.friendError}
            </p>
          )}
          {!people && !failed && <p className="s-notice">{socialLabels.searchPeopleIdle}</p>}
          {people && people.items.length === 0 && <p className="s-notice">{socialLabels.searchPeopleEmpty}</p>}
          {people && people.items.length > 0 && (
            <ul className="s-people" data-testid="people-results">
              {people.items.map((person) => (
                <PersonRow
                  key={person.userId}
                  person={person}
                  action={
                    <FriendAction
                      state={person.friendship}
                      pseudo={person.pseudo}
                      userId={person.userId}
                      requestId={person.friendshipId}
                      source="search"
                      busy={busy}
                    />
                  }
                />
              ))}
            </ul>
          )}
          {people?.nextCursor && (
            <Button
              variant="secondary"
              icon="next"
              href={href({ segment: "personnes", q, ...f, suite: people.nextCursor })}
            >
              Suite
            </Button>
          )}
          <Button variant="secondary" icon="crew" href="/app/amis">
            {socialLabels.myFriends}
          </Button>
          {!crews && <p className="o-t-caption s-muted">{crewLabels.searchIdle}</p>}
          {crews && crews.length === 0 && <p className="s-notice">{crewLabels.searchEmpty}</p>}
          {crews && crews.length > 0 && (
            <ul className="s-people" aria-label={crewLabels.crews} data-testid="crew-results">
              {crews.map((c) => (
                <CrewRow key={c.id} crew={c} />
              ))}
            </ul>
          )}
          <Button variant="secondary" icon="crew" href="/app/crews">
            {crewLabels.myCrews}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Résultats de la recherche de premier niveau : un bloc par groupe, cinq lignes, puis « Voir tout ». */
function ResultGroups({ results, busy, q }: { results: SearchResults; busy: boolean; q: string }) {
  const nothing =
    results.events.length +
      results.pros.length +
      results.people.length +
      results.vehicles.length +
      results.crews.length ===
    0;
  if (nothing) {
    return (
      <p className="s-notice" data-testid="search-empty">
        {explorerLabels.searchEmpty}
      </p>
    );
  }
  const seeAll = (group: "evenements" | "pros" | "personnes", show: boolean) =>
    show ? (
      <p>
        <Button href={href({ segment: group, q })} variant="secondary" icon="next" data-testid={`see-all-${group}`}>
          {explorerLabels.seeAll}
        </Button>
      </p>
    ) : null;
  return (
    <>
      {results.events.length > 0 && (
        <section className="s-stack s-stack--tight" aria-label={searchGroupLabels.events} data-testid="group-events">
          <h2 className="s-h2">{searchGroupLabels.events}</h2>
          <div className="s-grid s-grid--list">
            {results.events.map((event) => (
              <EventTile key={event.id} event={event} />
            ))}
          </div>
          {seeAll("evenements", results.more.events)}
        </section>
      )}
      {results.pros.length > 0 && (
        <section className="s-stack s-stack--tight" aria-label={searchGroupLabels.pros} data-testid="group-pros">
          <h2 className="s-h2">{searchGroupLabels.pros}</h2>
          <div className="s-grid s-grid--list">
            {results.pros.map((pro) => (
              <ProTile key={pro.slug} pro={pro} />
            ))}
          </div>
          {seeAll("pros", results.more.pros)}
        </section>
      )}
      {results.people.length > 0 && (
        <section className="s-stack s-stack--tight" aria-label={searchGroupLabels.people} data-testid="group-people">
          <h2 className="s-h2">{searchGroupLabels.people}</h2>
          <ul className="s-people">
            {results.people.map((person) => (
              <PersonRow
                key={person.userId}
                person={person}
                action={
                  <FriendAction
                    state={person.friendship}
                    pseudo={person.pseudo}
                    userId={person.userId}
                    requestId={person.friendshipId}
                    source="search"
                    busy={busy}
                  />
                }
              />
            ))}
          </ul>
          {seeAll("personnes", results.more.people)}
        </section>
      )}
      {results.crews.length > 0 && (
        <section className="s-stack s-stack--tight" aria-label={searchGroupLabels.crews} data-testid="group-crews">
          <h2 className="s-h2">{searchGroupLabels.crews}</h2>
          <ul className="s-people">
            {results.crews.map((c) => (
              <CrewRow key={c.id} crew={c} />
            ))}
          </ul>
          {seeAll("personnes", results.more.crews)}
        </section>
      )}
      {results.vehicles.length > 0 && (
        <section
          className="s-stack s-stack--tight"
          aria-label={searchGroupLabels.vehicles}
          data-testid="group-vehicles"
        >
          <h2 className="s-h2">{searchGroupLabels.vehicles}</h2>
          <ul className="s-people">
            {results.vehicles.map((v) => (
              <li key={v.id} className="s-person" data-testid="vehicle-hit">
                <PersonAvatar url={v.owner.avatarUrl} pseudo={v.owner.pseudo} size={48} />
                <div className="s-person__main">
                  <a className="s-person__name o-t-title" href={withRetour(`/v/${v.id}`, "/app/explorer")}>
                    {v.label}
                  </a>
                  <span className="o-t-caption s-muted">
                    <a href={withRetour(`/u/${encodeURIComponent(v.owner.pseudo)}`, "/app/explorer")}>
                      {v.owner.pseudo}
                    </a>{" "}
                    · {gradeLabels[v.owner.grade]}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          {seeAll("personnes", results.more.vehicles)}
        </section>
      )}
    </>
  );
}
