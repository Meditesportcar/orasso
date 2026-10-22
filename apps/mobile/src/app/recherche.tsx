// Recherche de premier niveau (docs/02, ARCHITECTURE-SUITE § 13.1) : un champ, cinq groupes de résultats (événements,
// pros, personnes, véhicules, crews), cinq lignes chacun, puis « Voir tout » vers le segment d'Explorer. Ouverte depuis la
// barre du haut de tous les onglets. Confidentialité : tout vient de `GET /search`, qui applique les mêmes règles que
// les profils (un compte privé ne livre que pseudo, photo, grade, marque et modèle).
import { Button, TextField } from "@orasso/design-system/native";
import {
  explorerLabels,
  SEARCH_MAX_LENGTH,
  SEARCH_MIN_LENGTH,
  type SearchResults,
  searchGroupLabels,
} from "@orasso/shared";
import { Redirect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { CrewRowNative } from "@/features/crews/CrewSearch";
import { EventRow, ProRow, VehicleHitRow } from "@/features/explorer/rows";
import { PersonRow } from "@/features/social/PersonRow";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { usePersona } from "@/lib/persona";
import { isBaseKind, tabHref } from "@/lib/personaModel";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen, SectionTitle } from "@/ui/Screens";

/**
 * Lot C2a (artefact DA v2 : la loupe mène à Explorer, « chaque fonction à un seul endroit ») : pour l'exposant et le
 * visiteur, la loupe ouvre l'onglet Explorer, dont le champ cherche événements, pros, personnes et crews. Les autres
 * casquettes (sans Explorer de passionné) gardent cette recherche.
 */
export default function Recherche() {
  const { persona } = usePersona();
  const own = isBaseKind(persona.kind) ? tabHref(persona.kind, "explorer") : null;
  return own ? <Redirect href={own as never} /> : <SearchScreen />;
}

function SearchScreen() {
  const router = useRouter();
  const { persona, base, choose } = usePersona();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const text = q.trim();

  const load = useCallback(async () => {
    const id = ++request.current;
    if (text.length < SEARCH_MIN_LENGTH) {
      setResults(null);
      setError(null);
      return;
    }
    try {
      const found = await api.search(text);
      if (id !== request.current) return;
      setResults(found);
      setError(null);
    } catch (e) {
      if (id === request.current) setError(errorMessage(e));
    }
  }, [text]);

  // Pause de frappe : on interroge l'API une fois que la saisie s'arrête.
  useEffect(() => {
    const timer = setTimeout(() => void load(), 300);
    return () => clearTimeout(timer);
  }, [load]);

  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const seeAll = (segment: "evenements" | "pros" | "personnes") => (
    <Button
      variant="secondary"
      icon="next"
      onPress={() => {
        // Lot 40 : l'Explorer de la casquette active, sinon celui de la casquette de base (pro, organisateur…).
        const own = tabHref(persona.kind, "explorer");
        const query = `segment=${segment}&q=${encodeURIComponent(text)}`;
        if (own) router.navigate(`${own}?${query}` as never);
        else choose(base, `${tabHref(base.kind, "explorer") ?? "/"}?${query}`);
      }}
      fullWidth
      testID={`see-all-${segment}`}
    >
      {explorerLabels.seeAll}
    </Button>
  );
  const empty =
    results !== null &&
    results.events.length +
      results.pros.length +
      results.people.length +
      results.vehicles.length +
      results.crews.length ===
      0;

  return (
    <FlowScreen title={explorerLabels.searchTitle} onClose={close}>
      <TextField
        label={explorerLabels.searchTitle}
        placeholder={explorerLabels.searchPlaceholder}
        value={q}
        onChangeText={setQ}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        maxLength={SEARCH_MAX_LENGTH}
        testID="search-q"
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
      {text.length < SEARCH_MIN_LENGTH ? (
        <Muted variant="body">{text ? explorerLabels.searchTooShort : explorerLabels.searchIdle}</Muted>
      ) : null}
      {empty ? <Muted variant="body">{explorerLabels.searchEmpty}</Muted> : null}

      {results && results.events.length > 0 ? (
        <>
          <SectionTitle>{searchGroupLabels.events}</SectionTitle>
          {results.events.map((e) => (
            <EventRow key={e.id} event={e} hints={false} />
          ))}
          {results.more.events ? seeAll("evenements") : null}
        </>
      ) : null}
      {results && results.pros.length > 0 ? (
        <>
          <SectionTitle>{searchGroupLabels.pros}</SectionTitle>
          {results.pros.map((p) => (
            <ProRow key={p.slug} pro={p} hints={false} />
          ))}
          {results.more.pros ? seeAll("pros") : null}
        </>
      ) : null}
      {results && results.people.length > 0 ? (
        <>
          <SectionTitle>{searchGroupLabels.people}</SectionTitle>
          {results.people.map((p) => (
            <PersonRow key={p.userId} person={p} onChanged={() => void load()} />
          ))}
          {results.more.people ? seeAll("personnes") : null}
        </>
      ) : null}
      {results && results.crews.length > 0 ? (
        <>
          <SectionTitle>{searchGroupLabels.crews}</SectionTitle>
          {results.crews.map((c) => (
            <CrewRowNative key={c.id} crew={c} onPress={() => router.push(`/crew/${c.slug}`)} />
          ))}
          {results.more.crews ? seeAll("personnes") : null}
        </>
      ) : null}
      {results && results.vehicles.length > 0 ? (
        <>
          <SectionTitle>{searchGroupLabels.vehicles}</SectionTitle>
          {results.vehicles.map((v) => (
            <VehicleHitRow key={v.id} hit={v} />
          ))}
          {results.more.vehicles ? seeAll("personnes") : null}
        </>
      ) : null}
    </FlowScreen>
  );
}
