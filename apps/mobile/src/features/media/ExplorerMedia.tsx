// Explorer de la casquette Média (lot 55, prototype DA v2 `s-agenda`) : « Un média couvre souvent hors de son coin ».
// Deux segments : Chercher (partout en France, région au choix, format, ce mois-ci, « Accréditation ouverte », bascule
// Carte, chaque événement dit l'état de l'accréditation ou propose de la demander, avec le temps de route estimé « ≈ 3 h »)
// et Mon agenda (la semaine, « Cette semaine » / « Plus tard », les événements couverts et gardés). Tri, filtres, état
// des accréditations et temps de route sont ceux de l'API (`GET /events`, lot 45) ; rien n'est recalculé ici.
import { Button, Chip, ChipRow, EmptyState, Icon, OLoader, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type EventCard, eventFormatLabels, eventFormats, mediaAppLabels as L, regions } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import { ExplorerMap } from "@/features/explorer/ExplorerMap";
import { eventPins } from "@/features/explorer/mapPins";
import { usePaged } from "@/features/explorer/usePaged";
import { api } from "@/lib/api";
import { nowMs } from "@/lib/clock";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { TabScreen } from "@/ui/Screens";
import {
  type AgendaItem,
  agendaState,
  cardState,
  defaultSearchFilters,
  detailLine,
  type SearchFilters,
  searchQuery,
  splitAgenda,
  weekStrip,
} from "./model";
import { EventLine, KeepButton, StateAction, WeekStrip } from "./parts";
import { RequestSheet, type RequestTarget } from "./RequestSheet";

const { space2, space3 } = tokens.spacing;

type Segment = "search" | "agenda";

export function ExplorerMedia() {
  const { t } = useTheme();
  const router = useRouter();
  const [segment, setSegment] = useState<Segment>("search");
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<SearchFilters>(defaultSearchFilters);
  const [view, setView] = useState<"list" | "map">("list");
  const [target, setTarget] = useState<RequestTarget | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  // Événements « sur invitation » repérés par l'API pendant la session : plus de demande possible.
  const [invited, setInvited] = useState<string[]>([]);
  const [kept, setKept] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const profile = useApi(async () => (await api.myMediaProfile()).profile, [], { cacheKey: "media-profile" });
  const agenda = useApi(() => api.mediaAgenda(), [], { cacheKey: "media-agenda" });
  const list = usePaged(
    (cursor) => api.exploreEvents(searchQuery(q, filters, new Date(nowMs()), view, cursor)),
    [q, filters, view],
    q ? 300 : 0,
    segment === "search",
  );

  const items = list.items ?? [];
  const savedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const w of agenda.data?.weeks ?? []) for (const i of w.items) if (i.saved) ids.add(i.event.id);
    for (const [id, on] of Object.entries(kept)) {
      if (on) ids.add(id);
      else ids.delete(id);
    }
    return ids;
  }, [agenda.data, kept]);
  const pins = useMemo(() => eventPins(list.items ?? []), [list.items]);
  const picked: EventCard[] = items.filter((e) => selected.includes(e.id));
  const now = new Date(nowMs());
  const open = (slug: string) => router.push(`/e/${slug}`);
  const issue = profile.data?.issue ?? null;

  const set = <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  function ask(e: { id: string; slug: string; title: string }) {
    setError(null);
    if (issue) return setError(issue);
    setTarget({ id: e.id, slug: e.slug, title: e.title });
  }

  async function toggleKeep(id: string) {
    const on = !savedIds.has(id);
    setKept((k) => ({ ...k, [id]: on }));
    try {
      if (on) await api.saveMediaEvent(id);
      else await api.unsaveMediaEvent(id);
      await agenda.reload();
    } catch (e) {
      setKept((k) => ({ ...k, [id]: !on }));
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const reloadAll = () => Promise.all([list.reload(), agenda.reload()]);
  const week = weekStrip(now, agenda.data);
  const split = splitAgenda(agenda.data, now);

  return (
    <TabScreen
      title={L.explorerTitle}
      facts={L.explorerFacts}
      onRefresh={async () => void (await reloadAll())}
      overlays={
        <RequestSheet
          target={target}
          defaultFormats={profile.data?.formats ?? []}
          onClose={() => setTarget(null)}
          onSent={() => void reloadAll()}
          onInvitation={(id) => setInvited((cur) => [...cur, id])}
        />
      }
    >
      <ChipRow>
        <Chip selected={segment === "search"} onPress={() => setSegment("search")}>
          {L.segSearch}
        </Chip>
        <Chip selected={segment === "agenda"} onPress={() => setSegment("agenda")}>
          {L.segAgenda}
        </Chip>
      </ChipRow>

      {error ? (
        <Notice tone="error" testID="media-error">
          {error}
        </Notice>
      ) : null}
      {error && issue ? (
        <Button
          variant="secondary"
          icon="profile"
          onPress={() => router.push("/media/modifier")}
          fullWidth
          testID="media-complete-profile"
        >
          {L.casquetteEdit}
        </Button>
      ) : null}

      {segment === "search" ? (
        <>
          <View style={[styles.search, { backgroundColor: t.color.surfaceField, borderColor: t.color.line }]}>
            <Icon name="search" size={18} color={t.color.inkMuted} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder={L.searchPlaceholder}
              placeholderTextColor={t.color.inkFaint}
              accessibilityLabel={L.searchLabel}
              autoCapitalize="none"
              returnKeyType="search"
              style={[styles.input, { color: t.color.ink }]}
              testID="media-q"
            />
          </View>
          <Muted variant="label">{L.where}</Muted>
          <ChipRow>
            <Chip selected={filters.region === ""} onPress={() => set("region", "")}>
              {L.allFrance}
            </Chip>
            {regions.map((r) => (
              <Chip
                key={r.code}
                selected={filters.region === r.code}
                onPress={() => set("region", filters.region === r.code ? "" : r.code)}
              >
                {r.name}
              </Chip>
            ))}
          </ChipRow>
          <Muted variant="label">{L.whatWhen}</Muted>
          <ChipRow>
            {eventFormats.map((f) => (
              <Chip
                key={f}
                selected={filters.format === f}
                onPress={() => set("format", filters.format === f ? "" : f)}
              >
                {eventFormatLabels[f]}
              </Chip>
            ))}
            <Chip selected={filters.thisMonth} onPress={() => set("thisMonth", !filters.thisMonth)}>
              {L.thisMonth}
            </Chip>
            <Chip selected={filters.openOnly} onPress={() => set("openOnly", !filters.openOnly)}>
              {L.openOnly}
            </Chip>
          </ChipRow>

          <View style={styles.countRow}>
            <Muted variant="caption" style={styles.fill}>
              {list.items ? L.results(items.length, list.hasMore, filters.openOnly) : ""}
            </Muted>
            <Chip selected={view === "map"} onPress={() => setView((v) => (v === "map" ? "list" : "map"))}>
              {view === "map" ? L.list : L.map}
            </Chip>
          </View>

          {list.error ? <Notice tone="error">{list.error}</Notice> : null}
          {list.items === null && !list.error ? (
            <View style={styles.loading} testID="media-loading">
              <OLoader label={L.loading} />
            </View>
          ) : null}
          {list.items?.length === 0 ? <EmptyState title={L.emptyTitle} text={L.emptyText} /> : null}

          {view === "map" && list.items ? (
            <ExplorerMap
              pins={pins}
              me={null}
              selectedId={selected.length === 1 ? selected[0] : null}
              onSelect={(p) => setSelected([p.id])}
              onSelectGroup={(group) => setSelected(group.map((p) => p.id))}
            >
              {picked.length > 0 ? (
                <View style={styles.picked} testID="media-map-picked">
                  {picked.map((e) => (
                    <SearchLine
                      key={e.id}
                      event={e}
                      kept={savedIds.has(e.id)}
                      invited={invited.includes(e.id)}
                      onOpen={() => open(e.slug)}
                      onAsk={() => ask(e)}
                      onKeep={() => void toggleKeep(e.id)}
                    />
                  ))}
                </View>
              ) : (
                <Text variant="caption" color={t.color.inkMuted}>
                  {L.mapHint}
                </Text>
              )}
            </ExplorerMap>
          ) : null}
          {view === "list"
            ? items.map((e) => (
                <SearchLine
                  key={e.id}
                  event={e}
                  kept={savedIds.has(e.id)}
                  invited={invited.includes(e.id)}
                  onOpen={() => open(e.slug)}
                  onAsk={() => ask(e)}
                  onKeep={() => void toggleKeep(e.id)}
                />
              ))
            : null}
          {view === "list" && list.hasMore ? (
            <Button
              variant="secondary"
              icon="add"
              loading={list.loadingMore}
              onPress={() => void list.loadMore()}
              fullWidth
            >
              Voir plus
            </Button>
          ) : null}
        </>
      ) : (
        <>
          <Muted variant="body">{L.agendaIntro}</Muted>
          <WeekStrip days={week} />
          {agenda.error && !agenda.data ? <Notice tone="error">{agenda.error.message}</Notice> : null}
          {agenda.data && split.thisWeek.length + split.later.length === 0 ? (
            <EmptyState title={L.agendaEmpty} text={L.agendaEmptyText} />
          ) : null}
          {split.thisWeek.length > 0 ? <Muted variant="label">{L.thisWeek}</Muted> : null}
          {split.thisWeek.map((i) => (
            <AgendaLine key={i.event.id} item={i} onOpen={open} onAsk={ask} onKeep={(id) => void toggleKeep(id)} />
          ))}
          {split.later.length > 0 ? <Muted variant="label">{L.later}</Muted> : null}
          {split.later.map((i) => (
            <AgendaLine key={i.event.id} item={i} onOpen={open} onAsk={ask} onKeep={(id) => void toggleKeep(id)} />
          ))}
        </>
      )}
    </TabScreen>
  );
}

/** Une carte de la recherche : l'état de l'accréditation (la mienne, « Demander », fermée) et « Garder ». */
function SearchLine({
  event,
  kept,
  invited,
  onOpen,
  onAsk,
  onKeep,
}: {
  event: EventCard;
  kept: boolean;
  invited: boolean;
  onOpen: () => void;
  onAsk: () => void;
  onKeep: () => void;
}) {
  return (
    <EventLine
      testID="media-event"
      startsAt={event.startsAt}
      title={event.title}
      detail={detailLine(event)}
      onPress={onOpen}
      right={
        <>
          <KeepButton kept={kept} title={event.title} onPress={onKeep} />
          <StateAction state={cardState(event.accreditation)} invitation={invited} onRequest={onAsk} />
        </>
      }
    />
  );
}

function AgendaLine({
  item,
  onOpen,
  onAsk,
  onKeep,
}: {
  item: AgendaItem;
  onOpen: (slug: string) => void;
  onAsk: (e: { id: string; slug: string; title: string }) => void;
  onKeep: (id: string) => void;
}) {
  const e = item.event;
  const state = agendaState(item);
  const keptNote = item.saved && !item.accreditation ? (item.accreditationOpen ? L.keptOpen : L.keptOnly) : "";
  return (
    <EventLine
      testID="media-agenda-event"
      startsAt={e.startsAt}
      title={e.title}
      detail={[detailLine(e), keptNote].filter(Boolean).join(" · ")}
      onPress={() => onOpen(e.slug)}
      right={
        <>
          {item.saved ? <KeepButton kept title={e.title} onPress={() => onKeep(e.id)} /> : null}
          <StateAction state={state} onRequest={() => onAsk(e)} />
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: space2,
    minHeight: 48,
    paddingHorizontal: space3,
    borderRadius: tokens.radius.radiusPill,
    borderWidth: 1.5,
  },
  input: { flex: 1, minHeight: 44, fontSize: tokens.type.body.fontSize },
  countRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space2 },
  loading: { alignItems: "center", paddingVertical: space2 },
  picked: { gap: space2 },
});
