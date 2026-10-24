// Explorer, segment Personnes et crews (lot R2, maquettes R2.6 et R2.7 ; il remplace la feuille « tout le monde » du lot
// C2a) : aucun annuaire. À l'ouverture, la recherche (pseudo, crew, modèle) et des suggestions courtes, chacune avec sa
// raison, tirées de données publiques seulement : « D'autres Supra » (des garages publics, ni moi ni mes amis) et « Crews
// du 66 » (les crews, publics par nature). Ni « Amis de tes amis » (aucune liste d'amis n'est publique) ni « Vus aux
// mêmes sorties » (il faudrait l'accord de chacun : v2.1, « Le plateau »). Une recherche montre Personnes puis Crews ;
// un compte privé n'y montre que ce qu'il montre déjà à tout le monde (pseudo, grade, marque et modèle), sans
// département (l'API le garantit). Une action par ligne (« Ajouter », « Rejoindre »), secondaire, avec son icône.
import { archivoAt, Icon, Photo, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  type CrewCard,
  gradeLabels,
  PEOPLE_SEARCH_MIN_QUERY,
  type PersonCard,
  explorerR2Labels as R,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { SmallButton } from "@/features/sorties/bits";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { mediaSource } from "@/lib/media";
import { LoadError } from "@/ui/LoadError";
import { Muted } from "@/ui/Muted";
import { deptLong } from "./ExplorerSheets";
import type { PeopleFilters, PeopleShow, PeopleWhere } from "./explorerChoice";

const { space1, space2 } = tokens.spacing;

const initialsOf = (name: string) =>
  name
    .replace(/[_\d]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("") || name.slice(0, 2).toUpperCase();

/** Rond de 42 px : l'image si elle existe, sinon les initiales. */
function Round({ url, name, mine }: { url: string | null; name: string; mine?: boolean }) {
  const { t } = useTheme();
  const c = t.color;
  const source = mediaSource(url);
  return (
    <View style={[styles.round, { backgroundColor: mine ? c.accent : c.surfaceRaised }]}>
      {source ? (
        <Photo source={source} style={StyleSheet.absoluteFill as never} accessibilityLabel="" />
      ) : (
        <Text variant="label" color={mine ? c.accentInk : c.ink} style={styles.roundText}>
          {initialsOf(name)}
        </Text>
      )}
    </View>
  );
}

/** `.prow` : rond, nom en gras, une ligne, une action à droite ; toucher la ligne ouvre le profil ou le crew. */
function Row({
  lead,
  title,
  caption,
  trailing,
  onPress,
  testID,
}: {
  lead: ReactNode;
  title: string;
  caption: ReactNode;
  trailing: ReactNode;
  onPress: () => void;
  testID: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View style={[styles.row, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]} testID={testID}>
      <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={title} style={styles.rowMain}>
        {lead}
        <View style={styles.grow}>
          <Text variant="bodyStrong" color={c.ink} style={styles.rowTitle}>
            {title}
          </Text>
          <Text variant="caption" color={c.inkMuted} style={styles.rowCap}>
            {caption}
          </Text>
        </View>
      </Pressable>
      {trailing}
    </View>
  );
}

function Section({
  title,
  hint,
  children,
  testID,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  testID: string;
}) {
  const { t } = useTheme();
  return (
    <View style={styles.section} testID={testID}>
      <View style={styles.secH}>
        <Text variant="bodyStrong" color={t.color.ink} style={styles.secTitle} accessibilityRole="header">
          {title}
        </Text>
        {hint ? (
          <Text variant="caption" color={t.color.inkMuted} style={styles.secHint}>
            {hint}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function Empty({ children }: { children: string }) {
  const { t } = useTheme();
  return (
    <View style={[styles.empty, { borderColor: t.color.line }]}>
      <Text variant="caption" color={t.color.inkMuted}>
        {children}
      </Text>
    </View>
  );
}

/** « Ajouter » (demande d'ami), « Demande envoyée », ou « Écrire » à un ami. */
function PersonAction({ person }: { person: PersonCard }) {
  const router = useRouter();
  const [state, setState] = useState(person.friendship);
  const [busy, setBusy] = useState(false);
  if (state === "friends") {
    return (
      <SmallButton
        icon="chat"
        disabled={busy}
        testID="person-write"
        onPress={async () => {
          setBusy(true);
          try {
            const { id } = await api.openDirect(person.userId);
            router.push(`/boite/${id}`);
          } catch {
            // Plus amis entre-temps : le profil propose la demande de contact.
            router.push(`/u/${encodeURIComponent(person.pseudo)}`);
          } finally {
            setBusy(false);
          }
        }}
      >
        {R.write}
      </SmallButton>
    );
  }
  if (state === "pending_out") {
    return (
      <SmallButton icon="check" disabled testID="person-requested">
        {R.requested}
      </SmallButton>
    );
  }
  if (state === "pending_in") {
    // Il m'a déjà demandé : son profil propose d'accepter.
    return (
      <SmallButton
        icon="add"
        onPress={() => router.push(`/u/${encodeURIComponent(person.pseudo)}`)}
        testID="person-add"
      >
        {R.add}
      </SmallButton>
    );
  }
  return (
    <SmallButton
      icon="add"
      disabled={busy}
      testID="person-add"
      onPress={async () => {
        setBusy(true);
        try {
          const res = await api.requestFriend(person.pseudo, "search");
          setState(res.status === "accepted" ? "friends" : "pending_out");
        } catch {
          // La demande se refait depuis le profil (limite, compte bloqué…).
          router.push(`/u/${encodeURIComponent(person.pseudo)}`);
        } finally {
          setBusy(false);
        }
      }}
    >
      {R.add}
    </SmallButton>
  );
}

/** « Rejoindre » (demande au chef du crew), « Demande envoyée », ou ton crew (il s'ouvre). */
function CrewAction({ crew, mine }: { crew: CrewCard; mine: boolean }) {
  const { t } = useTheme();
  const router = useRouter();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  if (mine) {
    return (
      <View style={styles.go} accessibilityElementsHidden>
        <Icon name="next" size={20} color={t.color.inkMuted} />
      </View>
    );
  }
  if (sent) {
    return (
      <SmallButton icon="check" disabled testID="crew-requested">
        {R.joinRequested}
      </SmallButton>
    );
  }
  return (
    <SmallButton
      icon="add"
      disabled={busy}
      testID="crew-join"
      onPress={async () => {
        setBusy(true);
        try {
          await api.requestCrew(crew.id, null);
          setSent(true);
        } catch {
          router.push(`/crew/${crew.slug}`);
        } finally {
          setBusy(false);
        }
      }}
    >
      {R.join}
    </SmallButton>
  );
}

function PersonRow({ person, testID = "person-row" }: { person: PersonCard; testID?: string }) {
  const { t } = useTheme();
  const router = useRouter();
  // Compte privé (non ami) : ses départements ne sont pas donnés par l'API.
  const hidden = person.departments === null;
  const caption = (
    <>
      {hidden ? (
        <Text variant="caption" color={t.color.ink} style={styles.priv}>
          {`${R.privateAccount} · `}
        </Text>
      ) : null}
      {[
        person.vehicles[0]?.label,
        !hidden && person.departments?.[0] ? deptLong(person.departments[0]) : null,
        R.grade(gradeLabels[person.grade]),
      ]
        .filter(Boolean)
        .join(" · ")}
    </>
  );
  return (
    <Row
      testID={testID}
      lead={<Round url={person.avatarUrl} name={person.pseudo} />}
      title={person.pseudo}
      caption={caption}
      onPress={() => router.push(`/u/${encodeURIComponent(person.pseudo)}`)}
      trailing={<PersonAction person={person} />}
    />
  );
}

function CrewRow({ crew, mine }: { crew: CrewCard; mine: boolean }) {
  const router = useRouter();
  return (
    <Row
      testID="crew-row"
      lead={<Round url={crew.logoUrl} name={crew.name} mine={mine} />}
      title={crew.name}
      caption={[deptLong(crew.department), R.members(crew.membersCount), mine ? R.yourCrew : null]
        .filter(Boolean)
        .join(" · ")}
      onPress={() => router.push(`/crew/${crew.slug}`)}
      trailing={<CrewAction crew={crew} mine={mine} />}
    />
  );
}

function PrivacyNote({ children }: { children: string }) {
  const { t } = useTheme();
  return (
    <View style={styles.pnote} testID="people-privacy">
      <Icon name="lock" size={16} color={t.color.accentText} />
      <Text variant="caption" color={t.color.inkMuted} style={styles.grow}>
        {children}
      </Text>
    </View>
  );
}

const SUGGESTED = 3;

export function PeopleSegment({
  q,
  where,
  show,
  filters,
  coin,
}: {
  q: string;
  where: PeopleWhere;
  show: PeopleShow;
  filters: PeopleFilters;
  coin: readonly string[];
}) {
  const router = useRouter();
  const text = q.trim();
  const filtered = Boolean(filters.categoryId || filters.grade);
  const searching = text.length > 0 || filtered;
  const tooShort = text.length > 0 && text.length < PEOPLE_SEARCH_MIN_QUERY && !filtered;
  const dept = where.kind === "dept" ? where.code : null;
  // Les crews proposés : ceux du département choisi, sinon de mon coin ; partout en France, les plus suivis.
  const crewDept = where.kind === "dept" ? where.code : where.kind === "mine" ? (coin[0] ?? null) : null;

  const [mine, setMine] = useState<CrewCard[] | null>(null);
  const [suggest, setSuggest] = useState<{
    sameModel: { model: string; vehicle: string; items: PersonCard[] } | null;
    crews: CrewCard[];
  } | null>(null);
  const [results, setResults] = useState<{ people: PersonCard[]; more: boolean; crews: CrewCard[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let alive = true;
    void api.myCrews().then(
      (list) => alive && setMine(list),
      () => alive && setMine([]),
    );
    return () => {
      alive = false;
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: relu quand la recherche, le lieu ou les filtres changent
  useEffect(() => {
    const id = ++request.current;
    setError(null);
    if (tooShort) return;
    const timer = setTimeout(
      () => {
        const run = searching
          ? Promise.all([
              api.searchPeople({
                q: text || undefined,
                department: dept ?? undefined,
                categoryId: filters.categoryId || undefined,
                grade: filters.grade || undefined,
              }),
              text ? api.searchCrews(text, dept ?? undefined) : Promise.resolve({ items: [] as CrewCard[] }),
            ]).then(([people, crews]) => {
              if (id === request.current)
                setResults({ people: people.items, more: Boolean(people.nextCursor), crews: crews.items });
            })
          : Promise.all([api.peopleSuggestions(dept ?? undefined), api.searchCrews("", crewDept ?? undefined)]).then(
              ([s, crews]) => {
                if (id === request.current) setSuggest({ sameModel: s.sameModel, crews: crews.items });
              },
            );
        run.catch((e) => {
          if (id === request.current) setError(errorMessage(e));
        });
      },
      text ? 300 : 0,
    );
    return () => clearTimeout(timer);
  }, [text, searching, tooShort, dept, crewDept, filters.categoryId, filters.grade, retry]);

  const myIds = new Set((mine ?? []).map((x) => x.id));
  const showPeople = show !== "crews";
  const showCrews = show !== "people";
  const privacy = <PrivacyNote>{searching ? R.privacyResults : R.privacyOpen}</PrivacyNote>;

  if (error) {
    return (
      <View style={styles.col} testID="people-search">
        <LoadError message={error} onRetry={() => setRetry((n) => n + 1)} />
      </View>
    );
  }

  if (tooShort) {
    return (
      <View style={styles.col} testID="people-search">
        <Muted variant="caption">{R.tooShort}</Muted>
      </View>
    );
  }

  if (searching) {
    const people = results?.people ?? [];
    const crews = results?.crews ?? [];
    const peopleBlock = showPeople ? (
      <Section
        key="people"
        title={R.peopleGroup(people.length, results?.more ?? false)}
        hint={R.peopleGroupHint}
        testID="people-results"
      >
        {results === null ? <Muted variant="caption">…</Muted> : null}
        {results && people.length === 0 ? <Empty>{text ? R.noPeople(text) : R.noPeopleFiltered}</Empty> : null}
        {people.map((p) => (
          <PersonRow key={p.userId} person={p} />
        ))}
      </Section>
    ) : null;
    const crewBlock =
      showCrews && text ? (
        <Section key="crews" title={R.crewsGroup(crews.length, false)} hint={R.crewsGroupHint} testID="crew-results">
          {results && crews.length === 0 ? <Empty>{R.noCrews(text)}</Empty> : null}
          {crews.map((x) => (
            <CrewRow key={x.id} crew={x} mine={myIds.has(x.id)} />
          ))}
        </Section>
      ) : null;
    // Maquette R2.7 : le groupe qui a des résultats d'abord (« supra » : des personnes ; « drift » : des crews).
    const crewsFirst = results !== null && people.length === 0 && crews.length > 0;
    return (
      <View style={styles.col} testID="people-search">
        {crewsFirst ? [crewBlock, peopleBlock] : [peopleBlock, crewBlock]}
        {privacy}
      </View>
    );
  }

  const same = suggest?.sameModel ?? null;
  const crews = (suggest?.crews ?? []).filter((x) => !myIds.has(x.id)).slice(0, SUGGESTED);
  const nothing = suggest !== null && !same && crews.length === 0;
  return (
    <View style={styles.col} testID="people-search">
      {suggest === null ? <Muted variant="caption">…</Muted> : null}
      {showPeople && same ? (
        <Section title={R.sameModelTitle(same.model)} hint={R.sameModelHint(same.vehicle)} testID="suggest-same-model">
          {same.items.map((p) => (
            <PersonRow key={p.userId} person={p} testID="suggested-person" />
          ))}
        </Section>
      ) : null}
      {showCrews && crews.length ? (
        <Section
          title={R.crewsNearTitle(crewDept)}
          hint={R.crewsNearHint(mine?.[0]?.name ?? null)}
          testID="suggest-crews"
        >
          {crews.map((x) => (
            <CrewRow key={x.id} crew={x} mine={false} />
          ))}
        </Section>
      ) : null}
      {nothing ? <Empty>{R.noSuggestions}</Empty> : null}
      {privacy}
      <View style={styles.actions}>
        <SmallButton icon="add" onPress={() => router.push("/crew/nouveau")} testID="crew-new">
          {R.createCrew}
        </SmallButton>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  col: { gap: 18 },
  grow: { flex: 1, minWidth: 0 },
  section: { gap: space2 },
  secH: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space2 },
  secTitle: { flexShrink: 1, fontSize: 14.5, lineHeight: 18, fontFamily: archivoAt(100, 800) },
  secHint: { flexShrink: 1, fontSize: 12, lineHeight: 15, textAlign: "right" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  rowMain: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10 },
  rowTitle: { fontSize: 14, lineHeight: 17, fontFamily: archivoAt(100, 800) },
  rowCap: { fontSize: 12, lineHeight: 16 },
  priv: { fontSize: 12, lineHeight: 16, fontFamily: archivoAt(100, 750) },
  round: {
    width: 42,
    height: 42,
    borderRadius: 21,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  roundText: { fontSize: 13, fontFamily: archivoAt(100, 900) },
  go: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  empty: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5, borderStyle: "dashed" },
  pnote: { flexDirection: "row", alignItems: "flex-start", gap: space1 + 4, paddingHorizontal: 2 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
});
