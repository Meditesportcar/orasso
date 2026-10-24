import { Button, Chip, Icon, type IconName, proActivityIcons } from "@orasso/design-system/web";
import {
  type Category,
  type CrewCard,
  coarsePosition,
  type EventCard,
  type EventFormat,
  type ExplorerWhere,
  effectiveWhere,
  eventFormatLabels,
  eventFormats,
  eventHints,
  explorerLabels,
  gradeLabels,
  grades,
  habitualWhere,
  explorerV2Labels as L,
  type MyCrew,
  notOver,
  type Page,
  PEOPLE_SEARCH_MIN_QUERY,
  type PeopleSearchPage,
  type PeopleWhere,
  type PersonCard,
  type Preferences,
  type ProActivityCounts,
  type ProCard,
  peopleSearchPlace,
  peopleSuggestPlace,
  proActivities,
  proActivityLabels,
  explorerR2Labels as R,
  SEARCH_MAX_LENGTH,
  SEARCH_MIN_LENGTH,
  type SearchResults,
  sameWhere,
  searchGroupLabels,
} from "@orasso/shared";
import { data, Form, redirect, useNavigation } from "react-router";
import { CrewRow } from "../components/Crews";
import { EventsMap } from "../components/EventsMap";
import { EventTile } from "../components/EventTile";
import { CrewRowR2, PeopleEmpty, PeopleSection, PersonRowR2, PrivacyNote } from "../components/ExplorerPeople";
import { ExplorerProTile } from "../components/ExplorerPro";
import { ChipGroup, ChoiceList, deptLong, Hidden, PillSheet, WhereForm } from "../components/ExplorerUi";
import { FriendAction, PersonAvatar, PersonRow } from "../components/People";
import { ProsMap } from "../components/ProsMap";
import { ProTile } from "../components/ProTile";
import { api, apiOrThrow, getMe } from "../lib/api.server";
import { now } from "../lib/clock";
import { crewAction, isCrewIntent } from "../lib/crews.server";
import { explorerChoice } from "../lib/explorerChoice.server";
import {
  activeFilters,
  EVENT_SORTS,
  type EventFilters,
  type EventSort,
  eventsParams,
  failureMessage,
  firstFailure,
  isMover,
  type PeopleShow,
  type ProSort,
  parseChosenWhere,
  parseEventSort,
  parseGrade,
  parseJob,
  parsePeopleWhere,
  parseProSort,
  parseShow,
  parseWhen,
  preferredFormats,
  prosParams,
} from "../lib/explorerQuery";
import { friendAction } from "../lib/friends.server";
import { isMessageIntent, messageAction } from "../lib/messaging.server";
import { withRetour } from "../lib/retour";
import type { Route } from "./+types/app-explorer";

// Explorer (docs/02, lots 17, 29 et R2) : même structure dans les trois segments (Événements, Pros, Personnes et crews),
// comme l'appli : le segment, la recherche du segment actif, puis une ligne de trois pastilles qui montrent leur valeur
// (contour : les réglages habituels ; plein, encre : une valeur choisie ; nombre moutarde : les filtres actifs). Chaque
// pastille ouvre une feuille (fenêtre). Une seule feuille « Où chercher ? », commune aux Événements et aux Pros. Personnes
// et crews : aucun annuaire (suggestions publiques, recherche). Tous les réglages sont dans l'adresse de la page ; le
// dernier choix est aussi gardé dans un cookie de préférence (lot R1), jamais la position.
export function meta() {
  return [{ title: "Explorer · Orasso" }, { name: "robots", content: "noindex" }];
}

const SEGMENTS = ["resultats", "evenements", "pros", "personnes"] as const;
type Segment = (typeof SEGMENTS)[number];
/** Provisoire (le libellé partagé est côté appli) : le lien qui recharge la page après une erreur. */
const RETRY = "Réessayer";
const PAGE = 24;
const MAP_PAGE = 100;
/** Les réglages gardés d'un segment à l'autre : le lieu (Événements et Pros partagent « Où chercher ? ») et la vue. */
const PLACE_KEYS = ["autour", "ailleurs", "rayon", "lat", "lng", "vue"] as const;

/** Le lieu choisi, ou celui des réglages habituels, tel que la page l'affiche. */
type Place = { where: ExplorerWhere; set: boolean; wantedMe: boolean; hasPosition: boolean };

type EventsData = {
  page: Page<EventCard>;
  items: EventCard[];
  sort: EventSort;
  filters: EventFilters;
  /** « Tes préférences » restreignent les types (et ce n'est pas une recherche) : le choix « Mes préférences » existe. */
  hasPrefs: boolean;
  prefOn: boolean;
  place: Place;
};
type ProsData = { page: Page<ProCard>; job: string; sort: ProSort; counts: ProActivityCounts | null; place: Place };
type PeopleData = {
  /** `null` : rien de choisi (suggestions de mon coin ; une recherche s'élargit d'elle-même à toute la France). */
  where: PeopleWhere | null;
  show: PeopleShow;
  interet: string;
  grade: string;
  searching: boolean;
  tooShort: boolean;
  /** Des filtres sans texte : on reste sur les suggestions et on le dit. */
  needText: boolean;
  /** La recherche a été élargie d'elle-même à toute la France (aucun lieu choisi). */
  broadened: boolean;
  categories: Category[];
  crewDept: string;
  people: PeopleSearchPage | null;
  crews: CrewCard[];
  sameModel: { model: string; vehicle: string; items: PersonCard[] } | null;
  myCrewIds: string[];
  myCrewName: string | null;
};

/**
 * Lot R1 : une arrivée sans réglage reprend le dernier choix (cookie de préférence) ; chaque réglage choisi le remplace.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  // Tour 2 : le choix appartient au compte connecté (`explorerChoice.server.ts`).
  const choice = await explorerChoice(request, url);
  if (choice.redirectTo) throw redirect(choice.redirectTo);
  const result = await load(request, url);
  return choice.setCookie ? data(result, { headers: { "set-cookie": choice.setCookie } }) : result;
}

async function load(request: Request, url: URL) {
  const get = (name: string) => url.searchParams.get(name) ?? "";
  const q = get("q").trim().slice(0, SEARCH_MAX_LENGTH);
  const requested = get("segment");
  const segment: Segment = (SEGMENTS as readonly string[]).includes(requested)
    ? (requested as Segment)
    : q
      ? "resultats"
      : "evenements";
  const vue: "liste" | "carte" = get("vue") === "carte" ? "carte" : "liste";
  const cursor = get("suite");
  const cur: Record<string, string> = { segment };
  const base = {
    segment,
    q,
    vue,
    cur,
    cursor,
    coin: [] as string[],
    gradeLabel: null as string | null,
    signedIn: false,
    failed: null as string | null,
    results: null as SearchResults | null,
    events: null as EventsData | null,
    pros: null as ProsData | null,
    people: null as PeopleData | null,
  };

  if (segment === "resultats") {
    if (q.length < SEARCH_MIN_LENGTH) return base;
    const res = await api<SearchResults>(request, `/search?${new URLSearchParams({ q, limit: "5" })}`);
    return { ...base, results: res.ok ? res.data : null, failed: failureMessage(res) };
  }

  // Les préférences et le compte : le point de départ de l'Explorer, jamais une limite (lot M6).
  const [me, prefsRes] = await Promise.all([getMe(request), api<Preferences>(request, "/me/preferences")]);
  const prefs = prefsRes.ok ? prefsRes.data : null;
  const coin = prefs?.departments.length ? prefs.departments : (me?.profile.departments ?? []);
  const gradeLabel = me ? gradeLabels[me.profile.grade] : null;
  const withMe = { ...base, coin, gradeLabel, signedIn: me !== null };

  // Personnes et crews : des départements seulement, aucune position, aucun annuaire. Sans texte (≥ 2 caractères), aucune
  // liste de personnes : les filtres n'affinent qu'une recherche par texte (tour 2).
  if (segment === "personnes") {
    const where = parsePeopleWhere(get("lieu"), get("ailleurs"));
    const show = parseShow(get("montrer"));
    const interet = /^[0-9a-f-]{36}$/i.test(get("interet")) ? get("interet") : "";
    const grade = parseGrade(get("grade"));
    const tooShort = q.length > 0 && q.length < PEOPLE_SEARCH_MIN_QUERY;
    const searching = q.length >= PEOPLE_SEARCH_MIN_QUERY;
    const needText = !searching && !tooShort && Boolean(interet || grade);
    const searchPlace = peopleSearchPlace(where, coin);
    // Les crews proposés : ceux du lieu choisi, sinon de mon coin ; partout en France, les plus suivis.
    const suggestDepts = peopleSuggestPlace(where, coin);
    if (where?.kind === "mine") cur.lieu = "coin";
    if (where?.kind === "all") cur.lieu = "partout";
    if (where?.kind === "dept") {
      cur.lieu = "ailleurs";
      cur.ailleurs = where.code;
    }
    if (show !== "all") cur.montrer = show;
    if (interet) cur.interet = interet;
    if (grade) cur.grade = grade;
    const [categories, mine] = await Promise.all([
      apiOrThrow<Category[]>(request, "/vehicle-reference/categories"),
      api<MyCrew[]>(request, "/me/crews"),
    ]);
    const view: PeopleData = {
      where,
      show,
      interet,
      grade,
      searching,
      tooShort,
      needText,
      broadened: searching && searchPlace.broadened,
      categories,
      crewDept: suggestDepts.join(", "),
      people: null,
      crews: [],
      sameModel: null,
      myCrewIds: mine.ok ? mine.data.map((c) => c.id) : [],
      myCrewName: mine.ok ? (mine.data[0]?.name ?? null) : null,
    };
    if (tooShort) return { ...withMe, people: view };
    if (searching) {
      // Une recherche (≥ 2 lettres), puis ses filtres : Personnes puis Crews.
      const params = new URLSearchParams({ q });
      if (searchPlace.departments) params.set("departments", searchPlace.departments);
      if (interet) params.set("categoryId", interet);
      if (grade) params.set("grade", grade);
      if (cursor) params.set("cursor", cursor);
      const crewParams = new URLSearchParams({ limit: "20", q });
      if (searchPlace.departments) crewParams.set("departments", searchPlace.departments);
      const [people, crews] = await Promise.all([
        show === "crews" ? Promise.resolve(null) : api<PeopleSearchPage>(request, `/users/search?${params}`),
        show !== "people" ? api<Page<CrewCard>>(request, `/crews/search?${crewParams}`) : Promise.resolve(null),
      ]);
      return {
        ...withMe,
        people: { ...view, people: people?.ok ? people.data : null, crews: crews?.ok ? crews.data.items : [] },
        failed: firstFailure(people, crews),
      };
    }
    // Sans texte : des suggestions courtes, de données publiques seulement (les filtres seuls ne listent personne).
    const suggestParams = new URLSearchParams();
    if (suggestDepts.length) suggestParams.set("departments", suggestDepts.join(","));
    const crewParams = new URLSearchParams({ limit: "6" });
    if (suggestDepts.length) crewParams.set("departments", suggestDepts.join(","));
    const [suggestions, crews] = await Promise.all([
      show === "crews"
        ? Promise.resolve(null)
        : api<{ sameModel: PeopleData["sameModel"] }>(request, `/users/suggestions?${suggestParams}`),
      show === "people" ? Promise.resolve(null) : api<Page<CrewCard>>(request, `/crews/search?${crewParams}`),
    ]);
    return {
      ...withMe,
      people: {
        ...view,
        sameModel: suggestions?.ok ? suggestions.data.sameModel : null,
        crews: crews?.ok ? crews.data.items : [],
      },
      failed: firstFailure(suggestions, crews),
    };
  }

  // Événements et Pros : « Où chercher ? », commun. La position (« Autour de moi ») reste dans l'adresse de cette
  // recherche, arrondie ; elle n'est jamais enregistrée (le cookie ne garde que le mode et la distance).
  const lat = get("lat") === "" ? Number.NaN : Number(get("lat"));
  const lng = get("lng") === "" ? Number.NaN : Number(get("lng"));
  const position =
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
      ? coarsePosition({ lat, lng })
      : null;
  const chosen = parseChosenWhere(get);
  const positionOn = position !== null && chosen?.kind === "me";
  const searching = q.length > 0;
  const hasCoin = coin.length > 0;
  const habitual = habitualWhere(prefs ? { radiusKm: prefs.radiusKm } : null, positionOn, hasCoin);
  const effective = effectiveWhere(chosen, habitual, { positionOn, hasCoin, searching });
  const usedPosition = effective.kind === "me" ? position : null;
  const place: Place = {
    where: effective,
    set: chosen !== null && !sameWhere(effective, habitual),
    wantedMe: chosen?.kind === "me" && position === null,
    hasPosition: usedPosition !== null,
  };
  if (vue === "carte") cur.vue = "carte";
  if (chosen?.kind === "me") {
    cur.autour = "moi";
    cur.rayon = String(chosen.km);
    if (usedPosition) {
      cur.lat = String(usedPosition.lat);
      cur.lng = String(usedPosition.lng);
    }
  } else if (chosen?.kind === "dept") {
    cur.autour = "ailleurs";
    cur.ailleurs = chosen.code;
  } else if (chosen) {
    cur.autour = chosen.kind === "mine" ? "coin" : "partout";
  }
  const where = { where: effective, coin };

  if (segment === "evenements") {
    const sort = parseEventSort(get("tri"));
    const formatRaw = get("format");
    const format = (eventFormats as readonly string[]).includes(formatRaw) ? (formatRaw as EventFormat) : "";
    const prefOn = formatRaw !== "all";
    const prefTypes = preferredFormats(prefs?.eventFormats);
    // Les types de « Tes préférences » s'appliquent tant qu'aucun format n'est choisi à la main ; jamais à une recherche.
    const prefFormats = prefOn && !format && !searching ? prefTypes : [];
    const when = parseWhen(get("quand"));
    const affinity = me !== null && (get("affinites") === "1" || get("tri") === "affinites");
    const followed = me !== null && get("suivis") === "1";
    const filters: EventFilters = { format, formats: prefFormats, when, affinity, followed };
    if (get("tri")) cur.tri = sort;
    if (format || formatRaw === "all" || formatRaw === "prefs") cur.format = format || formatRaw;
    if (when !== "all") cur.quand = when;
    if (affinity) cur.affinites = "1";
    if (followed) cur.suivis = "1";
    const params = eventsParams({
      q,
      filters,
      sort,
      place: where,
      position: usedPosition,
      now: now(),
      mode: vue === "carte" ? "map" : "list",
      limit: vue === "carte" ? MAP_PAGE : PAGE,
      cursor: cursor || undefined,
    });
    const res = await api<Page<EventCard>>(request, `/events?${params}`);
    const page = res.ok ? res.data : { items: [], nextCursor: null };
    return {
      ...withMe,
      events: {
        page,
        // Lot R1 : un événement terminé ne se montre plus (liste comme carte).
        items: notOver(page.items, now()),
        sort,
        filters,
        hasPrefs: prefTypes.length > 0 && !searching,
        prefOn,
        place,
      },
      failed: failureMessage(res),
    };
  }

  const job = parseJob(get("metier"));
  const sort = parseProSort(get("tri"));
  if (get("tri")) cur.tri = sort;
  if (job) cur.metier = job;
  const common = { q, job, sort, place: where, position: usedPosition };
  const [res, counts] = await Promise.all([
    api<Page<ProCard>>(
      request,
      `/pros?${prosParams({ ...common, mode: vue === "carte" ? "map" : "list", limit: vue === "carte" ? MAP_PAGE : PAGE, cursor: cursor || undefined })}`,
    ),
    api<ProActivityCounts>(
      request,
      `/pros/activities?${prosParams({ ...common, job: "", mode: "list", limit: 1, forCounts: true })}`,
    ),
  ]);
  return {
    ...withMe,
    pros: {
      page: res.ok ? res.data : { items: [], nextCursor: null },
      job,
      sort,
      counts: counts.ok ? counts.data : null,
      place,
    },
    failed: firstFailure(res, counts),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  if (isMessageIntent(intent)) return messageAction(request, form);
  if (isCrewIntent(intent)) {
    const res = await crewAction(request, form);
    // Quel crew vient de recevoir une demande : sa ligne passe à « Demande envoyée ».
    return data({ ...res.data, crewId: String(form.get("crewId") ?? "") }, res.init ?? undefined);
  }
  return friendAction(request, form);
}

/** Adresse de l'Explorer avec les réglages donnés (les valeurs vides sont omises). */
function href(params: Record<string, string | number | null | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value !== null && value !== undefined && value !== "") query.set(key, String(value));
  const text = query.toString();
  return text ? `/app/explorer?${text}` : "/app/explorer";
}

/** Le lieu, sur sa pastille. */
function wherePill(where: ExplorerWhere, coin: readonly string[]): string {
  if (where.kind === "me") return R.pillMe(where.km);
  if (where.kind === "mine") return R.pillMine(coin);
  if (where.kind === "dept") return deptLong(where.code);
  return R.pillAll;
}

/** Le lieu, en clair, pour la ligne de la liste. */
function placeLine(where: ExplorerWhere, coin: readonly string[]): string {
  if (where.kind === "me") return R.lineMe(where.km);
  if (where.kind === "mine") return coin.map(deptLong).join(", ");
  if (where.kind === "dept") return deptLong(where.code);
  return R.lineAll;
}

const SORT_ICONS: Record<EventSort, IconName> = {
  date: "calendar",
  distance: "place",
  recent: "spark",
  seats: "vehicle",
};
const SHOW_OPTIONS: { id: PeopleShow; icon: IconName; label: string }[] = [
  { id: "all", icon: "explore", label: R.showAll },
  { id: "people", icon: "profile", label: R.showPeople },
  { id: "crews", icon: "staff", label: R.showCrews },
];
const WHEN_OPTIONS = [
  { value: "all", label: L.whenAll },
  { value: "weekend", label: L.whenWeekend },
  { value: "month", label: L.whenMonth },
];
const PLACE_OMIT = ["autour", "ailleurs", "rayon", "lat", "lng"];

export default function Explorer({ loaderData, actionData }: Route.ComponentProps) {
  const { segment, q, vue, cur, cursor, coin, gradeLabel, signedIn, failed, results, events, pros, people } =
    loaderData;
  const busy = useNavigation().state !== "idle";
  const done = actionData as unknown as
    | {
        friendError?: string | null;
        crewError?: string | null;
        crewOk?: string | null;
        crewId?: string;
        messageError?: string | null;
      }
    | undefined;
  const actionError = done?.friendError ?? done?.crewError ?? done?.messageError ?? null;
  const sentCrew = done && !done.crewError && done.crewId ? done.crewId : null;

  /** L'adresse avec les réglages courants (`cur`) et la recherche, modifiés par `over` (`null` retire un réglage). */
  const link = (over: Record<string, string | null> = {}) => href({ ...cur, q, ...over });
  /** Les réglages courants à garder dans un formulaire, sauf ceux que le formulaire pose lui-même. */
  const hiddenFor = (omit: readonly string[] = []): [string, string][] => {
    const out = Object.entries(cur).filter(([key]) => !omit.includes(key));
    if (q && !omit.includes("q")) out.push(["q", q]);
    return out;
  };

  const carry: Record<string, string> = {};
  if (segment === "evenements" || segment === "pros") for (const key of PLACE_KEYS) if (cur[key]) carry[key] = cur[key];
  const segments: { id: Segment; label: string }[] = [
    ...(q && segment === "resultats" ? [{ id: "resultats" as const, label: explorerLabels.segmentAll }] : []),
    { id: "evenements", label: R.segmentEvents },
    { id: "pros", label: R.segmentPros },
    { id: "personnes", label: R.segmentPeople },
  ];

  const viewLinks = (
    <nav className="s-row" aria-label="Affichage">
      <a href={link({ vue: null })} aria-current={vue === "liste" ? "page" : undefined} data-testid="list-toggle">
        <Chip selected={vue === "liste"}>{explorerLabels.list}</Chip>
      </a>
      <a href={link({ vue: "carte" })} aria-current={vue === "carte" ? "page" : undefined} data-testid="map-toggle">
        <Chip selected={vue === "carte"}>{explorerLabels.map}</Chip>
      </a>
    </nav>
  );
  const nextLink = (cursor: string | null | undefined) => (cursor ? link({ suite: cursor }) : null);

  const whereSheet = (place: Place, seeLabel: string) => (
    <PillSheet
      icon="place"
      value={wherePill(place.where, coin)}
      set={place.set}
      title={R.whereSheet}
      testId="around-open"
      sheetId="where-sheet"
    >
      <WhereForm
        field="autour"
        hidden={hiddenFor(PLACE_OMIT)}
        mode={
          place.where.kind === "me"
            ? "moi"
            : place.where.kind === "mine"
              ? "coin"
              : place.where.kind === "dept"
                ? "ailleurs"
                : "partout"
        }
        km={place.where.kind === "me" ? place.where.km : 100}
        dept={place.where.kind === "dept" ? place.where.code : ""}
        coin={coin}
        hasPosition={place.hasPosition}
        position={place.hasPosition && cur.lat && cur.lng ? { lat: cur.lat, lng: cur.lng } : null}
        seeLabel={seeLabel}
      />
    </PillSheet>
  );

  let pills: React.ReactNode = null;
  if (segment === "evenements" && events) {
    const f = events.filters;
    const nFilters = activeFilters(f);
    pills = (
      <>
        {whereSheet(events.place, R.seeEvents(null))}
        {vue === "carte" ? null : (
          <PillSheet
            icon="sort"
            value={R.sortPill[f.affinity ? "date" : events.sort] ?? events.sort}
            set={events.sort !== "date"}
            title={R.sortEventsSheet}
            testId="sort-open"
            sheetId="sort-sheet"
          >
            <ChoiceList
              label={R.sortEventsSheet}
              choices={EVENT_SORTS.map((s) => ({
                id: s,
                label: L.sorts[s]?.label ?? s,
                hint: L.sorts[s]?.hint,
                icon: SORT_ICONS[s],
                href: link({ tri: s }),
                selected: events.sort === s,
                testId: `sort-${s}`,
              }))}
            />
            <p className="o-t-caption s-muted">{R.sortHint}</p>
          </PillSheet>
        )}
        <PillSheet
          icon="filter"
          value={R.filters}
          count={nFilters || undefined}
          set={nFilters > 0 || (!events.prefOn && events.hasPrefs)}
          title={R.filtersSheet}
          testId="filters-toggle"
          sheetId="filters-sheet"
        >
          <form method="get" action="/app/explorer" className="ex-filters" data-testid="explorer-filters">
            <Hidden entries={hiddenFor(["format", "quand", "affinites", "suivis"])} />
            <ChipGroup
              label={L.groupFormat}
              name="format"
              value={f.format || (events.prefOn && events.hasPrefs ? "prefs" : "all")}
              options={[
                ...(events.hasPrefs ? [{ value: "prefs", label: R.formatPrefs }] : []),
                { value: "all", label: L.formatAll },
                ...eventFormats.map((x) => ({ value: x, label: eventFormatLabels[x] })),
              ]}
            />
            <ChipGroup label={L.groupWhen} name="quand" value={f.when} options={WHEN_OPTIONS} />
            {signedIn ? (
              <ChipGroup
                label={L.groupTaste}
                name="affinites"
                kind="checkbox"
                value=""
                options={[
                  { value: "1", name: "affinites", label: L.tasteAffinity, checked: f.affinity },
                  { value: "1", name: "suivis", label: L.tasteFollowed, checked: f.followed },
                ]}
              />
            ) : null}
            <Button type="submit" icon="check" fullWidth data-testid="filters-apply">
              {R.seeEvents(null)}
            </Button>
          </form>
        </PillSheet>
      </>
    );
  } else if (segment === "pros" && pros) {
    const counts = pros.counts;
    pills = (
      <>
        {whereSheet(pros.place, R.seePros(null))}
        <PillSheet
          icon="wrench"
          k={R.job}
          value={pros.job ? proActivityLabels[pros.job as keyof typeof proActivityLabels] : R.jobAll}
          set={Boolean(pros.job)}
          title={R.jobSheet}
          testId="job-open"
          sheetId="job-sheet"
        >
          <ChoiceList
            grid
            label={R.jobSheet}
            choices={[
              {
                id: "all",
                label: R.jobAllLong,
                icon: "grid",
                meta: counts ? R.prosCount(counts.total) : undefined,
                href: link({ metier: null }),
                selected: !pros.job,
                testId: "job-all",
              },
              ...proActivities.map((a) => {
                const n = counts ? (counts.counts[a] ?? 0) : null;
                return {
                  id: a,
                  label: proActivityLabels[a],
                  icon: proActivityIcons[a] as IconName,
                  meta: n === null ? undefined : R.jobCount(n),
                  href: link({ metier: a }),
                  selected: pros.job === a,
                  disabled: n === 0 && pros.job !== a,
                  testId: `job-${a}`,
                };
              }),
            ]}
          />
          <p className="o-t-caption s-muted">{R.jobHint}</p>
        </PillSheet>
        {vue === "carte" ? null : (
          <PillSheet
            icon="sort"
            value={R.sortPill[pros.sort === "name" ? "name" : "distance"] ?? pros.sort}
            set={pros.sort !== "distance"}
            title={R.sortProsSheet}
            testId="pro-sort-open"
            sheetId="pro-sort-sheet"
          >
            <ChoiceList
              label={R.sortProsSheet}
              choices={(["distance", "name"] as const).map((s) => ({
                id: s,
                label: R.proSorts[s]?.label ?? s,
                hint: R.proSorts[s]?.hint,
                icon: s === "distance" ? ("place" as IconName) : ("list" as IconName),
                href: link({ tri: s }),
                selected: pros.sort === s,
                testId: `sort-${s}`,
              }))}
            />
            <p className="o-t-caption s-muted">{R.sortHint}</p>
          </PillSheet>
        )}
      </>
    );
  } else if (segment === "personnes" && people) {
    const w = people.where;
    const nFilters = (people.interet ? 1 : 0) + (people.grade ? 1 : 0);
    // Rien de choisi : contour. Les suggestions viennent de mon coin ; une recherche s'élargit d'elle-même à la France.
    const wherePillValue =
      w === null
        ? people.searching || coin.length === 0
          ? R.pillAll
          : R.pillMine(coin)
        : w.kind === "mine"
          ? R.pillMine(coin)
          : w.kind === "dept"
            ? deptLong(w.code)
            : R.pillAll;
    pills = (
      <>
        <PillSheet
          icon="place"
          value={wherePillValue}
          set={w !== null}
          title={R.whereSheet}
          testId="people-where-open"
          sheetId="people-where-sheet"
        >
          <WhereForm
            people
            field="lieu"
            hidden={hiddenFor(["lieu", "ailleurs"])}
            mode={
              w === null
                ? people.searching || coin.length === 0
                  ? "partout"
                  : "coin"
                : w.kind === "mine"
                  ? "coin"
                  : w.kind === "dept"
                    ? "ailleurs"
                    : "partout"
            }
            km={100}
            dept={w?.kind === "dept" ? w.code : ""}
            coin={coin}
            hasPosition={false}
            seeLabel={R.seeResults}
          />
        </PillSheet>
        <PillSheet
          icon="profile"
          k={R.show}
          value={SHOW_OPTIONS.find((o) => o.id === people.show)?.label ?? R.showAll}
          set={people.show !== "all"}
          title={R.showSheet}
          testId="show-open"
          sheetId="show-sheet"
        >
          <ChoiceList
            label={R.showSheet}
            choices={SHOW_OPTIONS.map((o) => ({
              id: o.id,
              label: o.label,
              icon: o.icon,
              href: link({ montrer: o.id === "all" ? null : o.id }),
              selected: people.show === o.id,
              testId: `show-${o.id}`,
            }))}
          />
        </PillSheet>
        <PillSheet
          icon="filter"
          value={R.filters}
          count={nFilters || undefined}
          set={nFilters > 0}
          title={R.filtersSheet}
          testId="people-filters"
          sheetId="people-filters-sheet"
        >
          <form method="get" action="/app/explorer" className="ex-filters" data-testid="people-filters-panel">
            <Hidden entries={hiddenFor(["interet", "grade"])} />
            <ChipGroup
              label="Centre d'intérêt"
              name="interet"
              value={people.interet}
              options={[
                { value: "", label: L.formatAll },
                ...people.categories.map((c) => ({ value: c.id, label: c.label })),
              ]}
            />
            <ChipGroup
              label="Grade, au moins"
              name="grade"
              value={people.grade}
              options={[{ value: "", label: L.formatAll }, ...grades.map((g) => ({ value: g, label: gradeLabels[g] }))]}
            />
            <p className="o-t-caption s-muted">{R.peopleFiltersHint}</p>
            <Button type="submit" icon="check" fullWidth data-testid="people-filters-apply">
              {R.seeResults}
            </Button>
          </form>
        </PillSheet>
      </>
    );
  }

  const placeNote = (place: Place | undefined) =>
    place?.wantedMe ? (
      <p className="o-t-caption s-muted" role="status" data-testid="position-note">
        {explorerLabels.positionDenied}
      </p>
    ) : place?.hasPosition ? (
      <p className="o-t-caption s-muted" data-testid="position-note">
        {explorerLabels.usingPosition}
      </p>
    ) : null;

  return (
    <div className="s-stack" data-testid="explorer">
      <h1 className="s-title">{explorerLabels.title}</h1>
      <div className="ex-head" data-testid="explorer-head">
        <nav className="s-row" aria-label={R.segments}>
          {segments.map((s) => (
            <a
              key={s.id}
              href={href({ segment: s.id, q, ...(s.id === "personnes" ? {} : carry) })}
              aria-current={segment === s.id ? "page" : undefined}
              data-testid={`segment-${s.id}`}
            >
              <Chip selected={segment === s.id}>{s.label}</Chip>
            </a>
          ))}
        </nav>
        <Form
          method="get"
          action="/app/explorer"
          role="search"
          id="explorer-form"
          className="ex-search"
          data-testid="explorer-search"
        >
          {segment === "resultats" ? <input type="hidden" name="segment" value="resultats" /> : null}
          {segment === "resultats" ? null : <Hidden entries={hiddenFor(["q"])} />}
          <label className="ex-search__field">
            <Icon name="search" size={18} />
            <span className="o-visually-hidden">{R.searchLabel}</span>
            <input
              type="search"
              name="q"
              defaultValue={q}
              maxLength={SEARCH_MAX_LENGTH}
              placeholder={
                segment === "pros"
                  ? R.searchPros
                  : segment === "personnes"
                    ? R.searchPeople
                    : segment === "resultats"
                      ? explorerLabels.searchPlaceholder
                      : R.searchEvents
              }
              data-testid={segment === "personnes" ? "people-q" : "events-q"}
            />
            {/* `.exsearch .xclr` : ✕ dans le champ ; la loupe envoie la recherche (le site marche sans JavaScript). */}
            {q && segment !== "resultats" ? (
              <a className="ex-search__btn" href={href({ ...cur, q: null })} data-testid="search-clear">
                <Icon name="close" size={16} />
                <span className="o-visually-hidden">{R.clearSearch}</span>
              </a>
            ) : null}
            <button type="submit" className="ex-search__btn" data-testid="search-submit">
              <Icon name="search" size={16} />
              <span className="o-visually-hidden">{R.searchLabel}</span>
            </button>
          </label>
        </Form>
        {pills ? (
          <fieldset className="ex-pills">
            <legend className="o-visually-hidden">{R.pills}</legend>
            {pills}
          </fieldset>
        ) : null}
      </div>

      {failed && (
        <p className="s-error" role="alert" data-testid="explorer-failed">
          {failed}{" "}
          <a href={link({ suite: cursor || null })} data-testid="explorer-retry">
            {RETRY}
          </a>
        </p>
      )}
      {actionError && (
        <p className="s-error" role="alert">
          {actionError}
        </p>
      )}

      {segment === "resultats" && (
        <div className="s-stack" data-testid="search-results">
          {q.length < SEARCH_MIN_LENGTH ? (
            <p className="s-notice">{q ? explorerLabels.searchTooShort : explorerLabels.searchIdle}</p>
          ) : results ? (
            <ResultGroups results={results} busy={busy} q={q} />
          ) : null}
        </div>
      )}

      {segment === "evenements" && events && (
        <div className="s-stack" data-testid="events-segment">
          {placeNote(events.place)}
          {viewLinks}
          <p className="ex-line o-t-caption" data-testid="sort-line">
            {[
              R.eventsLine(
                events.page.total ?? events.items.length,
                events.page.total === undefined && events.page.nextCursor !== null,
              ),
              placeLine(events.place.where, coin),
              events.filters.affinity ? L.sortAffinity : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {events.items.length === 0 && !failed ? (
            <p className="s-notice" data-testid="events-empty">
              {explorerLabels.eventsEmpty}
            </p>
          ) : null}
          {events.items.length > 0 && (
            <div className="evs">
              {vue === "carte" && <EventsMap events={events.items} />}
              <div className="s-grid s-grid--list" data-testid="events-list">
                {events.items.map((event) => (
                  <EventTile key={event.id} event={event} hints={eventHints(event)} />
                ))}
              </div>
            </div>
          )}
          {nextLink(events.page.nextCursor) && (
            <p className="s-center">
              <Button href={nextLink(events.page.nextCursor) ?? ""} variant="secondary" icon="add">
                {explorerLabels.more}
              </Button>
            </p>
          )}
        </div>
      )}

      {segment === "pros" && pros && (
        <ProsList
          pros={pros}
          coin={coin}
          vue={vue}
          viewLinks={viewLinks}
          note={placeNote(pros.place)}
          gradeLabel={gradeLabel}
          failed={failed}
          more={nextLink(pros.page.nextCursor)}
        />
      )}

      {segment === "personnes" && people && !failed && (
        <PeopleList view={people} q={q} busy={busy} sentCrew={sentCrew} more={nextLink(people.people?.nextCursor)} />
      )}
    </div>
  );
}

function ProsList({
  pros,
  coin,
  vue,
  viewLinks,
  note,
  gradeLabel,
  failed,
  more,
}: {
  pros: ProsData;
  coin: string[];
  vue: "liste" | "carte";
  viewLinks: React.ReactNode;
  note: React.ReactNode;
  gradeLabel: string | null;
  failed: string | null;
  more: string | null;
}) {
  const items = pros.page.items;
  const workshops = items.filter((p) => !isMover(p));
  const movers = items.filter(isMover);
  const count = pros.page.total ?? items.length;
  const tile = (p: ProCard) => <ExplorerProTile key={p.slug} pro={p} gradeLabel={gradeLabel} />;
  return (
    <div className="s-stack" data-testid="pros-segment">
      {note}
      {viewLinks}
      <p className="ex-line o-t-caption" data-testid="pros-line">
        {[
          R.prosLine(count, pros.page.total === undefined && pros.page.nextCursor !== null),
          pros.job ? proActivityLabels[pros.job as keyof typeof proActivityLabels] : null,
          placeLine(pros.place.where, coin),
          pros.sort === "distance" ? R.prosNearest : R.prosByName,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {items.length === 0 && !failed ? (
        <p className="s-notice" data-testid="pros-empty">
          {explorerLabels.prosEmpty}
        </p>
      ) : null}
      {items.length > 0 && (
        <div className="evs">
          {vue === "carte" && <ProsMap pros={items} />}
          <div className="s-stack" data-testid="pros-list">
            <div className="s-grid s-grid--list">{workshops.map(tile)}</div>
            {movers.length > 0 ? (
              <>
                <h2 className="ex-sub o-t-label" data-testid="pros-movers">
                  {R.movers}
                </h2>
                <div className="s-grid s-grid--list">{movers.map(tile)}</div>
              </>
            ) : null}
          </div>
        </div>
      )}
      {more && (
        <p className="s-center">
          <Button href={more} variant="secondary" icon="add">
            {explorerLabels.more}
          </Button>
        </p>
      )}
    </div>
  );
}

function PeopleList({
  view,
  q,
  busy,
  sentCrew,
  more,
}: {
  view: PeopleData;
  q: string;
  busy: boolean;
  sentCrew: string | null;
  more: string | null;
}) {
  const mine = new Set(view.myCrewIds);
  const showPeople = view.show !== "crews";
  const showCrews = view.show !== "people";
  const privacy = <PrivacyNote>{view.searching ? R.privacyResults : R.privacyOpen}</PrivacyNote>;
  const crewRow = (c: CrewCard) => (
    <CrewRowR2 key={c.id} crew={c} mine={mine.has(c.id)} sent={sentCrew === c.id} busy={busy} />
  );

  if (view.tooShort) {
    return (
      <div className="s-stack" data-testid="people-search">
        <p className="o-t-caption s-muted">{R.tooShort}</p>
      </div>
    );
  }

  if (view.searching) {
    const people = view.people?.items ?? [];
    const crews = view.crews;
    const peopleBlock = showPeople ? (
      <PeopleSection
        key="people"
        title={R.peopleGroup(people.length, Boolean(view.people?.nextCursor))}
        hint={R.peopleGroupHint}
        testId="people-results"
      >
        {view.broadened ? (
          <p className="o-t-caption s-muted" role="status" data-testid="people-broadened">
            {R.broadened}
          </p>
        ) : null}
        {people.length === 0 ? <PeopleEmpty>{R.noPeople(q)}</PeopleEmpty> : null}
        <ul className="s-people">
          {people.map((p) => (
            <PersonRowR2 key={p.userId} person={p} busy={busy} />
          ))}
        </ul>
        {more ? (
          <Button variant="secondary" icon="add" href={more}>
            {explorerLabels.more}
          </Button>
        ) : null}
      </PeopleSection>
    ) : null;
    const crewBlock =
      showCrews && q ? (
        <PeopleSection
          key="crews"
          title={R.crewsGroup(crews.length, false)}
          hint={R.crewsGroupHint}
          testId="crew-results"
        >
          {crews.length === 0 ? <PeopleEmpty>{R.noCrews(q)}</PeopleEmpty> : null}
          <ul className="s-people">{crews.map(crewRow)}</ul>
        </PeopleSection>
      ) : null;
    // Maquette R2.7 : le groupe qui a des résultats d'abord (« supra » : des personnes ; « drift » : des crews).
    const crewsFirst = people.length === 0 && crews.length > 0;
    return (
      <div className="s-stack" data-testid="people-search">
        {crewsFirst ? [crewBlock, peopleBlock] : [peopleBlock, crewBlock]}
        {privacy}
      </div>
    );
  }

  const same = view.sameModel;
  const crews = view.crews.filter((c) => !mine.has(c.id)).slice(0, 3);
  const nothing = !same && crews.length === 0;
  return (
    <div className="s-stack" data-testid="people-search">
      {showPeople && same ? (
        <PeopleSection
          title={R.sameModelTitle(same.model)}
          hint={R.sameModelHint(same.vehicle)}
          testId="suggest-same-model"
        >
          <ul className="s-people">
            {same.items.map((p) => (
              <PersonRowR2 key={p.userId} person={p} busy={busy} testId="suggested-person" />
            ))}
          </ul>
        </PeopleSection>
      ) : null}
      {showCrews && crews.length > 0 ? (
        <PeopleSection
          title={R.crewsNearTitle(view.crewDept || null)}
          hint={R.crewsNearHint(view.myCrewName)}
          testId="suggest-crews"
        >
          <ul className="s-people">{crews.map(crewRow)}</ul>
        </PeopleSection>
      ) : null}
      {view.needText ? (
        <p className="o-t-caption s-muted" role="status" data-testid="people-need-text">
          {R.peopleFiltersNeedText}
        </p>
      ) : null}
      {nothing ? <PeopleEmpty>{R.noSuggestions}</PeopleEmpty> : null}
      {privacy}
      <p>
        <Button variant="secondary" icon="add" href="/app/crews" data-testid="crew-new">
          {R.createCrew}
        </Button>
      </p>
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
