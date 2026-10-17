// Casquette Administration, onglets Accueil, Registres et Gestion (lot 35d). L'accueil reprend celui du site (« toutes les
// files et ce qui attend », `GET /admin/overview`) : une ligne par file avec son compteur. Le modérateur n'a que sa file.
// Registres et Gestion rangent les autres pages (la barre d'onglets n'a pas de place pour dix-sept entrées).
import { adminTexts, adminAppLabels as L } from "@orasso/shared";
import { useRouter } from "expo-router";

import { type AdminGroup, countOf, overviewTotal, sectionsOf } from "@/lib/adminModel";
import { useClockAvailable } from "@/lib/clock";
import { Muted } from "@/ui/Muted";
import { SectionTitle, TabScreen } from "@/ui/Screens";
import { AdminGate, LinkRow, useAdmin } from "./kit";

function Hub({ group, title, hint }: { group: AdminGroup; title: string; hint?: string }) {
  const router = useRouter();
  const { role, overview } = useAdmin();
  const clock = useClockAvailable();
  const sections = sectionsOf(group, role, clock);
  return (
    <TabScreen title={title} facts={role === "moderator" ? L.kindModerator : L.kind}>
      {hint ? <Muted variant="caption">{hint}</Muted> : null}
      {sections.map((s) => (
        <LinkRow
          key={s.id}
          label={s.label}
          count={countOf(s, overview)}
          onPress={() => router.push(s.route as never)}
          testID={`admin-link-${s.id}`}
        />
      ))}
    </TabScreen>
  );
}

function Home() {
  const router = useRouter();
  const { role, overview, pendingReports, reload } = useAdmin();
  const clock = useClockAvailable();
  const queues = sectionsOf("queues", role, clock);
  const total = overview ? overviewTotal(overview) : null;
  return (
    <TabScreen
      title={role === "moderator" ? L.homeModeratorTitle : L.homeTitle}
      facts={role === "moderator" ? L.kindModerator : L.kind}
      onRefresh={reload}
    >
      <Muted variant="body">
        {role === "moderator" ? L.homeModeratorHint : total === 0 ? adminTexts.overviewEmpty : adminTexts.overview}
      </Muted>
      <SectionTitle>{L.queuesTitle}</SectionTitle>
      {queues.map((s) => (
        <LinkRow
          key={s.id}
          label={s.label}
          count={role === "moderator" ? (pendingReports ?? undefined) : countOf(s, overview)}
          onPress={() => router.push(s.route as never)}
          testID={`tile-${s.count ?? s.id}`}
        />
      ))}
    </TabScreen>
  );
}

export function AdminHomeScreen() {
  return (
    <AdminGate title={L.homeTitle} moderator>
      <Home />
    </AdminGate>
  );
}

export function AdminRegistriesScreen() {
  return (
    <AdminGate title={L.registriesTitle}>
      <Hub group="registries" title={L.registriesTitle} />
    </AdminGate>
  );
}

export function AdminManageScreen() {
  return (
    <AdminGate title={L.settingsTitle}>
      <Hub group="manage" title={L.settingsTitle} />
    </AdminGate>
  );
}
