// Explorer (docs/02) : trois segments, recherche en tête. Événements (liste ou carte, affinités, date, distance, filtres),
// Pros (même principe) et Personnes et crews (lot 17 ; crews : lot 19). La recherche de premier
// niveau (`app/recherche.tsx`) renvoie ici par « Voir tout » avec le segment et le texte en paramètres.

import { Chip, ChipRow } from "@orasso/design-system/native";
import { explorerLabels } from "@orasso/shared";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { CrewSearch } from "@/features/crews/CrewSearch";
import { EventsSegment } from "@/features/explorer/EventsSegment";
import { ProsSegment } from "@/features/explorer/ProsSegment";
import { PeopleSearch } from "@/features/social/PeopleSearch";
import { TabScreen } from "@/ui/Screens";

type Segment = "evenements" | "pros" | "personnes";
const SEGMENTS: Segment[] = ["evenements", "pros", "personnes"];
const LABELS: Record<Segment, string> = {
  evenements: explorerLabels.segmentEvents,
  pros: explorerLabels.segmentPros,
  personnes: explorerLabels.segmentPeople,
};

export default function Explorer() {
  const params = useLocalSearchParams<{ segment?: string; q?: string }>();
  const fromParams = (SEGMENTS as string[]).includes(params.segment ?? "") ? (params.segment as Segment) : "evenements";
  const [segment, setSegment] = useState<Segment>(fromParams);
  const q = typeof params.q === "string" ? params.q : "";

  // « Voir tout » d'une recherche : on arrive avec un segment et un texte.
  useEffect(() => {
    setSegment(fromParams);
  }, [fromParams]);

  return (
    <TabScreen title={explorerLabels.title}>
      <ChipRow>
        {SEGMENTS.map((s) => (
          <Chip key={s} selected={segment === s} onPress={() => setSegment(s)}>
            {LABELS[s]}
          </Chip>
        ))}
      </ChipRow>
      {segment === "evenements" ? <EventsSegment key={`e|${q}`} initialQ={q} /> : null}
      {segment === "pros" ? <ProsSegment key={`p|${q}`} initialQ={q} /> : null}
      {segment === "personnes" ? (
        <>
          <PeopleSearch key={`s|${q}`} initialQ={q} />
          <CrewSearch />
        </>
      ) : null}
    </TabScreen>
  );
}
