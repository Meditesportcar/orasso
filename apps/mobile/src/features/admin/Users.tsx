// Casquette Administration, registre des utilisateurs et fiche d'un utilisateur (lot 35d). Recherche par pseudo ou adresse,
// page suivante par curseur ; la fiche montre le compte, les structures, les véhicules, les points, les sanctions, les
// appareils et les sessions, puis les gestes de l'équipe : ajuster les points, sanctionner, réinitialiser la double
// authentification (A5), rôle de modérateur, anonymiser. Chaque geste demande un motif d'au moins 5 caractères, passe
// par une feuille de confirmation et s'écrit au journal d'administration. L'API refuse l'action sur soi-même et celle
// d'un modérateur sur un super admin : son message s'affiche tel quel.
import { Button, Chip, Plate, SelectField, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  type AdminUserDetail,
  type AdminUserRow,
  adminTexts,
  gradeLabels,
  adminAppLabels as L,
  type PointKind,
  platformRoleLabels,
  pointKindLabels,
  reportReasonLabels,
  reportReasons,
  type SanctionKind,
  sanctionKindLabels,
  sanctionKinds,
} from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet } from "react-native";

import { parsePoints, userStateOf } from "@/lib/adminModel";
import { api } from "@/lib/api";
import { now } from "@/lib/clock";
import { formatDay, formatDayHour } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { SectionTitle } from "@/ui/Screens";
import { AdminFailure, AdminGate, AdminPage, EmptyOrLoading, Fact, ReasonSheet, SearchBox, useGesture } from "./kit";

const { space2, space3 } = tokens.spacing;

// --- Registre ---------------------------------------------------------------------------------------------------------

function UsersBody() {
  const { t } = useTheme();
  const router = useRouter();
  const [field, setField] = useState("");
  const [q, setQ] = useState("");
  const first = useApi(() => api.adminUsers(q), [q]);
  const [more, setMore] = useState<AdminUserRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Une nouvelle recherche, ou un rechargement, repart de la première page.
  useEffect(() => {
    setMore([]);
    setCursor(first.data?.nextCursor ?? null);
  }, [first.data]);
  const items = [...(first.data?.items ?? []), ...more];

  async function next() {
    if (!cursor) return;
    try {
      const page = await api.adminUsers(q, cursor);
      setMore((m) => [...m, ...page.items]);
      setCursor(page.nextCursor);
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }

  return (
    <AdminPage title={L.registryUsers} onRefresh={first.reload}>
      <SearchBox
        label={adminTexts.userSearch}
        value={field}
        onChange={setField}
        onSubmit={() => setQ(field.trim())}
        testID="admin-users-q"
      />
      <AdminFailure error={first.error} />
      {loadError ? <Notice tone="error">{loadError}</Notice> : null}
      {!first.data ? (
        <EmptyOrLoading loading={first.loading} empty={adminTexts.noResult} />
      ) : items.length === 0 ? (
        <Notice>{adminTexts.noResult}</Notice>
      ) : null}
      {items.map((u) => {
        const state = userStateOf(u, now());
        return (
          <Pressable
            key={u.id}
            accessibilityRole="button"
            accessibilityLabel={u.pseudo}
            onPress={() => router.push(`/(admin)/utilisateur/${u.id}` as never)}
            testID="user-row"
          >
            <Plate style={styles.block}>
              <Text variant="bodyStrong" color={t.color.plateInk}>
                {u.pseudo}
              </Text>
              <Text variant="caption" color={t.color.plateMuted}>
                {u.email}
                {u.emailVerified ? "" : " · non confirmée"}
              </Text>
              <Text variant="caption" color={t.color.plateMuted}>
                {platformRoleLabels[u.platformRole]} · {gradeLabels[u.grade]} · {u.pointsSeason} pts · inscrit le{" "}
                {formatDay(u.createdAt)}
              </Text>
              {state ? <Chip surface="plate">{state}</Chip> : null}
            </Plate>
          </Pressable>
        );
      })}
      {cursor ? (
        <Button variant="plate" icon="down" onPress={() => void next()} fullWidth testID="admin-users-more">
          {L.more}
        </Button>
      ) : null}
    </AdminPage>
  );
}

export function UsersScreen() {
  return (
    <AdminGate title={L.registryUsers}>
      <UsersBody />
    </AdminGate>
  );
}

// --- Fiche ------------------------------------------------------------------------------------------------------------

type Gesture = "points" | "sanction" | "twofactor" | "role" | "anonymize";

function UserBody() {
  const { t } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useSession();
  const user = useApi(() => api.adminUser(id), [id]);
  const gesture = useGesture();
  const [pending, setPending] = useState<Gesture | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [points, setPoints] = useState("");
  const [pointsIssue, setPointsIssue] = useState<string | undefined>();
  const [kind, setKind] = useState<SanctionKind>(sanctionKinds[0]);
  const [motive, setMotive] = useState<(typeof reportReasons)[number]>(reportReasons[0]);
  const u: AdminUserDetail | null = user.data;
  const self = Boolean(u && me?.user.id === u.id);
  const deleted = Boolean(u?.deletedAt);
  const moderator = u?.platformRole === "moderator";

  async function confirm(reason: string) {
    if (!pending || !u) return;
    const ok = await gesture.run(() => {
      switch (pending) {
        case "points":
          return api.adjustPoints(u.id, parsePoints(points) ?? 0, reason);
        case "sanction":
          return api.sanctionUser(u.id, { kind, reason: motive, note: reason });
        case "twofactor":
          return api.resetTwoFactor(u.id, reason);
        case "role":
          return api.setUserRole(u.id, moderator ? "user" : "moderator", reason);
        case "anonymize":
          return api.anonymizeUser(u.id, reason);
      }
    });
    if (!ok) return;
    setPending(null);
    setNotice(L.doneLogged);
    if (pending === "points") setPoints("");
    await user.reload();
  }

  const sheet = (() => {
    switch (pending) {
      case "points":
        return {
          title: L.pointsConfirmTitle,
          body: L.pointsConfirmBody(parsePoints(points) ?? 0),
          label: "Ajuster",
          icon: "grade" as const,
          danger: false,
        };
      case "sanction":
        return {
          title: L.sanctionConfirmTitle,
          body: L.sanctionConfirmBody,
          label: adminTexts.sanction,
          icon: "flag" as const,
          danger: kind === "ban",
        };
      case "twofactor":
        return {
          title: L.twoFactorConfirmTitle,
          body: L.twoFactorConfirmBody,
          label: "Réinitialiser",
          icon: "undo" as const,
          danger: false,
        };
      case "role":
        return {
          title: L.roleConfirmTitle,
          body: L.roleConfirmBody,
          label: moderator ? L.roleRemoveButton : L.roleGiveButton,
          icon: "staff" as const,
          danger: false,
        };
      case "anonymize":
        return {
          title: L.anonymizeConfirmTitle,
          body: L.anonymizeConfirmBody,
          label: "Anonymiser",
          icon: "close" as const,
          danger: true,
        };
      default:
        return { title: "", body: "", label: "", icon: "check" as const, danger: false };
    }
  })();

  const open = (g: Gesture) => {
    gesture.setError(null);
    setNotice(null);
    setPending(g);
  };
  const state = u ? userStateOf(u, now()) : null;

  return (
    <AdminPage
      title={u?.pseudo ?? L.registryUsers}
      facts={
        u ? `${platformRoleLabels[u.platformRole]} · ${gradeLabels[u.grade]} · ${u.pointsSeason} points` : undefined
      }
      onRefresh={user.reload}
      overlays={
        <ReasonSheet
          visible={pending !== null}
          title={sheet.title}
          body={sheet.body}
          confirmLabel={sheet.label}
          confirmIcon={sheet.icon}
          danger={sheet.danger}
          reasonLabel={adminTexts.reasonLabel}
          busy={gesture.busy}
          error={gesture.error}
          onConfirm={(reason) => void confirm(reason)}
          onClose={() => {
            setPending(null);
            gesture.setError(null);
          }}
        />
      }
    >
      <AdminFailure error={user.error} />
      {!u ? <EmptyOrLoading loading={user.loading} empty={adminTexts.noResult} /> : null}
      {notice ? <Notice>{notice}</Notice> : null}
      {u ? (
        <>
          <Muted variant="caption">Inscrit le {formatDay(u.createdAt)}</Muted>
          {state ? (
            <Chip variant="accent">
              {u.bannedAt || u.deletedAt ? state : `${state} jusqu'au ${formatDay(u.suspendedUntil ?? "")}`}
            </Chip>
          ) : null}

          <SectionTitle>Compte</SectionTitle>
          <Plate style={styles.block}>
            <Fact label="Adresse">{`${u.email} ${u.emailVerified ? "(confirmée)" : "(non confirmée)"}`}</Fact>
            <Fact label="Nom">{[u.firstName, u.lastName].filter(Boolean).join(" ") || "—"}</Fact>
            <Fact label="Téléphone">{u.phone ?? "—"}</Fact>
            <Fact label="Secteur">{u.departments.join(", ") || "—"}</Fact>
            <Fact label="Newsletter">{u.newsletterOptIn ? "Acceptée" : "Non"}</Fact>
            <Fact label="Double authentification">{L.userTwoFactor(u.twoFactor.totp, u.twoFactor.passkeys)}</Fact>
            <Fact label="Fiche pro">{u.pro ? u.pro.name : "—"}</Fact>
          </Plate>

          <SectionTitle>Structures et véhicules</SectionTitle>
          <Plate style={styles.block}>
            {u.structures.length === 0 ? <Muted variant="body">{L.userNoStructure}</Muted> : null}
            {u.structures.map((s) => (
              <Text key={s.id} variant="body" color={t.color.plateInk}>
                {s.name} · {s.role} · {s.status}
              </Text>
            ))}
            {u.vehicles.length === 0 ? <Muted variant="body">{L.userNoVehicle}</Muted> : null}
            {u.vehicles.map((v) => (
              <Text key={v.id} variant="body" color={t.color.plateInk}>
                {v.label}
                {v.year ? ` · ${v.year}` : ""} · {v.status}
                {v.certified ? " · Certifié" : ""}
              </Text>
            ))}
          </Plate>

          <SectionTitle>Points et modération</SectionTitle>
          <Plate style={styles.block}>
            {u.points.slice(0, 8).map((p) => (
              <Text key={p.id} variant="body" color={t.color.plateInk}>
                {p.points > 0 ? `+${p.points}` : p.points} · {pointKindLabels[p.kind as PointKind] ?? p.kind} ·{" "}
                {formatDay(p.at)}
              </Text>
            ))}
            <Text variant="body" color={t.color.plateInk}>
              Signalements émis : {u.reports.emitted} · reçus : {u.reports.received}
            </Text>
            {u.sanctions.map((s) => (
              <Text key={s.id} variant="body" color={t.color.plateInk}>
                {sanctionKindLabels[s.kind as SanctionKind]} ·{" "}
                {reportReasonLabels[s.reason as keyof typeof reportReasonLabels]} · {formatDay(s.startsAt)}
                {s.liftedAt ? " · levée" : ""}
              </Text>
            ))}
          </Plate>

          <SectionTitle>Appareils et sessions</SectionTitle>
          <Plate style={styles.block}>
            {u.devices.map((d) => (
              <Text key={d.id} variant="body" color={t.color.plateInk}>
                Téléphone {d.platform} · {d.lastSeenAt ? `vu le ${formatDayHour(d.lastSeenAt)}` : "jamais vu"}
                {d.revoked ? " · retiré" : ""}
              </Text>
            ))}
            {u.sessions.length === 0 ? <Muted variant="body">{L.userNoSession}</Muted> : null}
            {u.sessions.map((s) => (
              <Text key={s.id} variant="body" color={t.color.plateInk}>
                {s.device} · depuis le {formatDayHour(s.createdAt)}
              </Text>
            ))}
          </Plate>

          {self ? <Notice>{adminTexts.selfForbidden}</Notice> : null}
          {!deleted && !self ? (
            <>
              <SectionTitle>{adminTexts.adjustPoints}</SectionTitle>
              <Plate style={styles.block} testID="action-points">
                <TextField
                  label={L.userPoints}
                  value={points}
                  onChangeText={(v) => {
                    setPoints(v);
                    setPointsIssue(undefined);
                  }}
                  keyboardType="numbers-and-punctuation"
                  error={pointsIssue}
                  testID="admin-points"
                />
                <Button
                  variant="plate"
                  icon="grade"
                  onPress={() => {
                    if (parsePoints(points) === null) {
                      setPointsIssue("Un nombre entier, positif ou négatif.");
                      return;
                    }
                    open("points");
                  }}
                  fullWidth
                  testID="admin-points-go"
                >
                  Ajuster
                </Button>
              </Plate>

              {u.platformRole !== "super_admin" ? (
                <>
                  <SectionTitle>{adminTexts.sanction}</SectionTitle>
                  <Plate style={styles.block} testID="action-sanction">
                    <SelectField
                      label="Sanction"
                      value={kind}
                      onValueChange={(v) => setKind(v as SanctionKind)}
                      options={sanctionKinds.map((k) => ({ value: k, label: sanctionKindLabels[k] }))}
                    />
                    <SelectField
                      label="Motif"
                      value={motive}
                      onValueChange={(v) => setMotive(v as (typeof reportReasons)[number])}
                      options={reportReasons.map((r) => ({ value: r, label: reportReasonLabels[r] }))}
                    />
                    <Button
                      variant="plate"
                      icon="flag"
                      onPress={() => open("sanction")}
                      fullWidth
                      testID="admin-sanction-go"
                    >
                      Sanctionner
                    </Button>
                  </Plate>
                </>
              ) : null}

              <SectionTitle>{adminTexts.resetTwoFactor}</SectionTitle>
              <Plate style={styles.block} testID="action-twofactor">
                <Text variant="caption" color={t.color.plateMuted}>
                  {adminTexts.resetTwoFactorHint}
                </Text>
                <Button
                  variant="plate"
                  icon="undo"
                  onPress={() => open("twofactor")}
                  fullWidth
                  testID="admin-twofactor-go"
                >
                  Réinitialiser
                </Button>
              </Plate>

              {u.platformRole !== "super_admin" ? (
                <>
                  <SectionTitle>{moderator ? L.roleRemove : L.roleGive}</SectionTitle>
                  <Plate style={styles.block} testID="action-role">
                    <Button variant="plate" icon="staff" onPress={() => open("role")} fullWidth testID="admin-role-go">
                      {moderator ? L.roleRemoveButton : L.roleGiveButton}
                    </Button>
                  </Plate>
                </>
              ) : null}

              {u.platformRole === "user" ? (
                <>
                  <SectionTitle>{adminTexts.anonymize}</SectionTitle>
                  <Plate style={styles.block} testID="action-anonymize">
                    <Text variant="caption" color={t.color.plateMuted}>
                      {adminTexts.anonymizeHint}
                    </Text>
                    <Button
                      variant="alert"
                      icon="close"
                      onPress={() => open("anonymize")}
                      fullWidth
                      testID="admin-anonymize-go"
                    >
                      Anonymiser
                    </Button>
                  </Plate>
                </>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </AdminPage>
  );
}

export function UserFileScreen() {
  return (
    <AdminGate title={L.registryUsers}>
      <UserBody />
    </AdminGate>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
});
