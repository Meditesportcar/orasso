// Pièces communes de la casquette Administration (lot 35d, décision D20) : la garde (rôle + double authentification),
// l'écran de page, le suivi d'un geste (occupé, message d'erreur de l'API), la feuille « motif + confirmation », les
// lignes de liste. Aucune règle métier : droits, motifs et traces sont ceux de l'API ; l'appli affiche ses refus.
import {
  Button,
  Chip,
  ChipRow,
  Icon,
  type IconName,
  Plate,
  Text,
  TextField,
  tokens,
  useTheme,
} from "@orasso/design-system/native";
import { type AdminOverview, adminAppLabels as L } from "@orasso/shared";
import { useRouter } from "expo-router";
import { createContext, type ReactNode, useCallback, useContext, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ConfirmSheet } from "@/features/orga/ConfirmSheet";
import { TwoFactorGate } from "@/features/orga/OrgaGate";
import { type AdminRole, adminRoleOf } from "@/lib/adminModel";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { isTwoFactorError } from "@/lib/orga";
import { usePersona } from "@/lib/persona";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen, TabScreen } from "@/ui/Screens";

const { space1, space2, space3 } = tokens.spacing;

// --- Garde ------------------------------------------------------------------------------------------------------------

type AdminValue = {
  role: AdminRole;
  /** Compteurs des files (super admin ; `null` pour le modérateur ou tant que l'API n'a pas répondu). */
  overview: AdminOverview | null;
  /** File des signalements en attente (modérateur : sa seule file). */
  pendingReports: number | null;
  reload: () => Promise<unknown>;
};
const AdminContext = createContext<AdminValue | null>(null);

export function useAdmin(): AdminValue {
  const value = useContext(AdminContext);
  if (!value) throw new Error("useAdmin doit être utilisé sous une <AdminGate>.");
  return value;
}

/** Erreur d'un appel d'administration : l'étape de double authentification, ou le message de l'API. */
export function AdminFailure({ error }: { error: unknown }) {
  if (!error) return null;
  if (isTwoFactorError(error)) return <TwoFactorGate />;
  return <Notice tone="error">{errorMessage(error)}</Notice>;
}

/**
 * Garde de la casquette Administration : rien sans la casquette active (la racine ramène au passionné), rien pour un
 * compte ordinaire, et rien ne se charge tant que la session n'a pas prouvé la double authentification (l'API répond
 * `two_factor_required` : on affiche l'étape existante). Le premier appel sert aussi à l'accueil : compteurs des files
 * pour le super admin, file des signalements pour le modérateur.
 */
export function AdminGate({
  title,
  children,
  moderator = false,
}: {
  title: string;
  children: ReactNode;
  /** Page ouverte au modérateur (accueil et signalements) ; les autres sont réservées au super admin. */
  moderator?: boolean;
}) {
  const { persona } = usePersona();
  const { me } = useSession();
  const role = adminRoleOf(me?.profile.platformRole);
  const overview = useApi(() => api.adminOverview(), [role], { enabled: role === "super_admin" });
  const reports = useApi(() => api.adminReports("pending"), [role], { enabled: role === "moderator" });
  const reload = useCallback(async () => {
    await Promise.all([overview.reload(), reports.reload()]);
  }, [overview.reload, reports.reload]);
  if (persona.kind !== "admin") return null;
  if (!role) {
    return (
      <TabScreen title={title}>
        <Notice tone="error">{L.notAdmin}</Notice>
      </TabScreen>
    );
  }
  if (role === "moderator" && !moderator) {
    return (
      <TabScreen title={title}>
        <Notice tone="error">{L.superAdminOnly}</Notice>
      </TabScreen>
    );
  }
  const probe = role === "super_admin" ? overview : reports;
  if (isTwoFactorError(probe.error)) {
    return (
      <TabScreen title={title}>
        <TwoFactorGate />
      </TabScreen>
    );
  }
  return (
    <AdminContext.Provider
      value={{ role, overview: overview.data, pendingReports: reports.data ? reports.data.items.length : null, reload }}
    >
      {children}
    </AdminContext.Provider>
  );
}

// --- Écran de page ----------------------------------------------------------------------------------------------------

/** Écran d'une page de l'administration (hors barre d'onglets) : ✕ Fermer revient à l'écran d'où l'on vient. */
export function AdminPage({
  title,
  facts,
  onRefresh,
  overlays,
  children,
}: {
  title: string;
  facts?: string;
  onRefresh?: () => Promise<unknown>;
  overlays?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <FlowScreen
      title={title}
      facts={facts}
      onClose={() => (router.canGoBack() ? router.back() : router.replace("/(admin)/administration"))}
      onRefresh={onRefresh}
      overlays={overlays}
    >
      {children}
    </FlowScreen>
  );
}

// --- Suivi d'un geste -------------------------------------------------------------------------------------------------

/**
 * Un geste d'écriture : occupé pendant l'appel, message de l'API gardé en cas d'échec (la saisie n'est pas perdue). `run`
 * renvoie `true` si l'appel a réussi.
 */
export function useGesture() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<unknown>(null);
  const run = useCallback(async (task: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await task();
      return true;
    } catch (e) {
      if (isTwoFactorError(e)) setBlocked(e);
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, blocked, setError, run };
}

// --- Feuille « motif + confirmation » ---------------------------------------------------------------------------------

/**
 * Confirmation d'un geste sensible, avec un motif ou une note. `minLength` 5 = motif obligatoire (la saisie vide est
 * refusée ici, avant l'appel, avec le même message que le site) ; 0 = note facultative. Les champs propres au geste
 * passent en `children`.
 */
export function ReasonSheet({
  visible,
  title,
  body,
  confirmLabel,
  confirmIcon = "check",
  danger = false,
  reasonLabel = L.reasonShort,
  minLength = 5,
  requiredMessage,
  multiline = true,
  busy,
  error,
  disabled = false,
  children,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  confirmIcon?: IconName;
  danger?: boolean;
  reasonLabel?: string;
  minLength?: number;
  /** Message sous le champ quand la saisie est trop courte (par défaut : le motif de 5 caractères du site). */
  requiredMessage?: string;
  multiline?: boolean;
  busy: boolean;
  error: string | null;
  disabled?: boolean;
  children?: ReactNode;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [issue, setIssue] = useState<string | undefined>();
  const submit = () => {
    const text = reason.trim();
    if (minLength > 0 && text.length < minLength) {
      setIssue(requiredMessage ?? `Indique le motif (${minLength} caractères au moins).`);
      return;
    }
    setIssue(undefined);
    onConfirm(text);
  };
  const close = () => {
    setIssue(undefined);
    onClose();
  };
  return (
    <ConfirmSheet
      visible={visible}
      title={title}
      body={body}
      confirmLabel={confirmLabel}
      confirmIcon={confirmIcon}
      danger={danger}
      busy={busy}
      disabled={disabled}
      error={error}
      onConfirm={submit}
      onClose={close}
    >
      {children}
      <TextField
        label={reasonLabel}
        value={reason}
        onChangeText={(v) => {
          setReason(v);
          setIssue(undefined);
        }}
        multiline={multiline}
        maxLength={1000}
        error={issue}
        testID="admin-reason"
      />
    </ConfirmSheet>
  );
}

// --- Lignes -----------------------------------------------------------------------------------------------------------

/** Une ligne qui ouvre un écran : libellé, compteur éventuel, chevron. */
export function LinkRow({
  label,
  count,
  icon = "next",
  onPress,
  testID,
}: {
  label: string;
  count?: number;
  icon?: IconName;
  onPress: () => void;
  testID?: string;
}) {
  const { t } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} testID={testID}>
      <Plate style={styles.link}>
        <Text variant="bodyStrong" color={t.color.plateInk} style={styles.grow}>
          {label}
        </Text>
        {count !== undefined && count > 0 ? (
          <Chip surface="plate" variant="accent">
            {String(count)}
          </Chip>
        ) : null}
        <Icon name={icon} size={18} color={t.color.plateInk} />
      </Plate>
    </Pressable>
  );
}

/** Rangée de filtres (une puce choisie à la fois). */
export function Filters<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { id: T; label: string }[];
  onChange: (id: T) => void;
}) {
  return (
    <ChipRow>
      {options.map((o) => (
        <Chip key={o.id} selected={o.id === value} onPress={() => onChange(o.id)}>
          {o.label}
        </Chip>
      ))}
    </ChipRow>
  );
}

/** Ligne « étiquette : valeur » dans une plaque. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  const { t } = useTheme();
  return (
    <View style={styles.fact}>
      <Text variant="label" color={t.color.plateMuted}>
        {label}
      </Text>
      <Text variant="body" color={t.color.plateInk}>
        {children}
      </Text>
    </View>
  );
}

/** Message de fin de geste, ou rien. */
export function Done({ children }: { children: ReactNode }) {
  return children ? <Notice>{children}</Notice> : null;
}

/** « Rien à traiter » ou « Chargement… » sous une liste vide. */
export function EmptyOrLoading({ loading, empty }: { loading: boolean; empty: string }) {
  return loading ? <Muted variant="body">{L.loading}</Muted> : <Notice>{empty}</Notice>;
}

/** Zone de recherche : un champ et un bouton « Chercher ». */
export function SearchBox({
  label,
  value,
  onChange,
  onSubmit,
  testID,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  testID?: string;
}) {
  return (
    <Plate style={styles.block}>
      <TextField
        label={label}
        value={value}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        testID={testID}
      />
      <Button variant="plate" icon="search" onPress={onSubmit} fullWidth testID={testID ? `${testID}-go` : undefined}>
        {L.search}
      </Button>
    </Plate>
  );
}

export const adminStyles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
});

const styles = StyleSheet.create({
  link: { flexDirection: "row", alignItems: "center", gap: space3, padding: space3 },
  grow: { flex: 1 },
  fact: { gap: space1 },
  block: { gap: space2, padding: space3 },
});
