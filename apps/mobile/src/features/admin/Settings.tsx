// Casquette Administration, réglages de la plateforme (lot 35d) : interrupteurs (inscriptions, sponsorisés, prestataires,
// billetterie), points et grades, listes proposées, modèles de messages d'Orasso. Chaque enregistrement est validé par son
// schéma partagé côté API et écrit au journal (`settings.update`). Super admin seulement.
import {
  Button,
  CheckboxField,
  Plate,
  SelectField,
  Text,
  TextField,
  tokens,
  useTheme,
} from "@orasso/design-system/native";
import {
  type AdminSettingKey,
  adminListCodes,
  adminSettingGroups,
  adminSettingLabels,
  adminTexts,
  eventFormatLabels,
  type Grade,
  gradeLabels,
  grades,
  adminAppLabels as L,
  type PlatformSettingKey,
  platformSettingKeys,
  platformSettingLabels,
  proActivityLabels,
  refusalReasonLabels,
  type TemplateKind,
  type TemplateView,
  templateKindLabels,
  templateKinds,
  vendorTypeLabels,
} from "@orasso/shared";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { ConfirmSheet } from "@/features/orga/ConfirmSheet";
import { moveCode, orderedCodes, toggleCode } from "@/lib/adminModel";
import { type AdminSettings, api } from "@/lib/api";
import { formatDayHour } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { SectionTitle } from "@/ui/Screens";
import { AdminFailure, AdminGate, AdminPage, EmptyOrLoading, useGesture } from "./kit";

const { space2, space3 } = tokens.spacing;

type ListKey = keyof typeof adminListCodes;

const codeLabel: Record<ListKey, Record<string, string>> = {
  "lists.refusal_reasons": refusalReasonLabels,
  "lists.vendor_types": vendorTypeLabels,
  "lists.pro_activities": proActivityLabels,
  "lists.event_formats": eventFormatLabels,
};

const POINT_KEYS = ["points.participation", "points.staff", "points.referral", "points.malus"] as const;

function entryOf(settings: AdminSettings | null, key: AdminSettingKey) {
  return settings?.entries.find((e) => e.key === key);
}

function SettingsBody() {
  const { t } = useTheme();
  const loaded = useApi(() => api.adminSettings(), []);
  const templates = useApi(() => api.adminTemplates(), []);
  // Les réglages renvoyés par chaque enregistrement remplacent ceux du chargement.
  const [fresh, setFresh] = useState<AdminSettings | null>(null);
  const settings = fresh ?? loaded.data;
  const gesture = useGesture();
  const [notice, setNotice] = useState<string | null>(null);

  const [flip, setFlip] = useState<{ key: string; label: string; to: boolean } | null>(null);
  const [pointsAsk, setPointsAsk] = useState(false);
  const [points, setPoints] = useState<Record<string, string>>({});
  const [thresholds, setThresholds] = useState<Record<string, string>>({});
  const [lists, setLists] = useState<Record<string, string[]>>({});

  // Les champs se remplissent une fois, à l'arrivée des réglages.
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (!settings || seeded) return;
    setSeeded(true);
    setPoints(Object.fromEntries(POINT_KEYS.map((k) => [k, String(entryOf(settings, k)?.value ?? "")])));
    const th = (entryOf(settings, "grades.thresholds")?.value ?? {}) as Record<Grade, number>;
    setThresholds(Object.fromEntries(grades.map((g) => [g, String(th[g] ?? "")])));
    setLists(
      Object.fromEntries(
        adminSettingGroups.lists.map((k) => [k, ((entryOf(settings, k)?.value ?? []) as string[]).slice()]),
      ),
    );
  }, [settings, seeded]);

  const put = async (key: string, value: unknown) => {
    const next = await api.putSetting(key, value);
    setFresh(next);
    return next;
  };

  async function saveFlip() {
    if (!flip) return;
    if (await gesture.run(() => put(flip.key, flip.to))) {
      setFlip(null);
      setNotice(adminTexts.saved);
    }
  }

  async function savePoints() {
    const ok = await gesture.run(async () => {
      for (const key of POINT_KEYS) await put(key, Number(points[key]));
      await put("grades.thresholds", Object.fromEntries(grades.map((g) => [g, Number(thresholds[g])])));
    });
    if (ok) {
      setPointsAsk(false);
      setNotice(adminTexts.saved);
    }
  }

  async function saveList(key: string) {
    setNotice(null);
    if (await gesture.run(() => put(key, lists[key] ?? []))) setNotice(adminTexts.saved);
  }

  const [pointsIssue, setPointsIssue] = useState<string | null>(null);

  // Modèles de messages d'Orasso.
  const [tplAsk, setTplAsk] = useState<TemplateView | null>(null);
  const [draft, setDraft] = useState<Record<string, { name: string; subject: string; body: string }>>({});
  const [created, setCreated] = useState<{ kind: TemplateKind; name: string; subject: string; body: string }>({
    kind: templateKinds[0],
    name: "",
    subject: "",
    body: "",
  });
  const tplGesture = useGesture();

  const tplDraft = (tp: TemplateView) => draft[tp.id] ?? { name: tp.name, subject: tp.subject ?? "", body: tp.body };

  return (
    <AdminPage
      title={adminTexts.settingsTitle}
      onRefresh={async () => {
        setFresh(null);
        setSeeded(false);
        await Promise.all([loaded.reload(), templates.reload()]);
      }}
      overlays={
        <>
          <ConfirmSheet
            visible={flip !== null}
            title={L.settingsSwitchConfirmTitle}
            body={`${flip?.label ?? ""} : ${flip?.to ? adminTexts.on : adminTexts.off}. ${L.settingsSwitchConfirmBody}`}
            confirmLabel={flip?.to ? adminTexts.enable : adminTexts.disable}
            confirmIcon={flip?.to ? "check" : "close"}
            busy={gesture.busy}
            error={gesture.error}
            onConfirm={() => void saveFlip()}
            onClose={() => {
              setFlip(null);
              gesture.setError(null);
            }}
          />
          <ConfirmSheet
            visible={pointsAsk}
            title={L.settingsPointsConfirmTitle}
            body={adminTexts.pointsWarning}
            confirmLabel={L.settingsPointsSave}
            busy={gesture.busy}
            error={gesture.error}
            onConfirm={() => void savePoints()}
            onClose={() => {
              setPointsAsk(false);
              gesture.setError(null);
            }}
          />
          <ConfirmSheet
            visible={tplAsk !== null}
            title={L.settingsTemplateDeleteTitle}
            body={L.settingsTemplateDeleteBody}
            confirmLabel={L.settingsTemplateRemove}
            confirmIcon="close"
            danger
            busy={tplGesture.busy}
            error={tplGesture.error}
            onConfirm={() =>
              void (async () => {
                if (tplAsk && (await tplGesture.run(() => api.deleteAdminTemplate(tplAsk.id)))) {
                  setTplAsk(null);
                  setNotice(adminTexts.saved);
                  await templates.reload();
                }
              })()
            }
            onClose={() => {
              setTplAsk(null);
              tplGesture.setError(null);
            }}
          />
        </>
      }
    >
      <AdminFailure error={loaded.error} />
      {!settings ? <EmptyOrLoading loading={loaded.loading} empty={adminTexts.noResult} /> : null}
      {notice ? <Notice>{notice}</Notice> : null}
      {gesture.error && flip === null && !pointsAsk ? <Notice tone="error">{gesture.error}</Notice> : null}
      {settings ? (
        <>
          <SectionTitle>{adminTexts.switchesTitle}</SectionTitle>
          {adminSettingGroups.switches.map((key) => {
            const on = entryOf(settings, key)?.value === true;
            return (
              <Plate key={key} style={styles.block} testID={`setting-${key}`}>
                <Text variant="body" color={t.color.plateInk}>
                  {adminSettingLabels[key]} · <Text variant="bodyStrong">{on ? adminTexts.on : adminTexts.off}</Text>
                </Text>
                <Button
                  variant="plate"
                  icon={on ? "close" : "check"}
                  onPress={() => {
                    gesture.setError(null);
                    setNotice(null);
                    setFlip({ key, label: adminSettingLabels[key], to: !on });
                  }}
                  fullWidth
                  testID={`setting-toggle-${key}`}
                >
                  {on ? adminTexts.disable : adminTexts.enable}
                </Button>
              </Plate>
            );
          })}
          <SectionTitle>{adminTexts.ticketingTitle}</SectionTitle>
          <Muted variant="caption">
            Les billets gratuits sont réels ; les billets payants restent en mode présentation (Stripe en mode test,
            aucun encaissement réel). Stripe : {settings.stripe.configured ? L.settingsStripeOn : L.settingsStripeOff}.
          </Muted>
          {platformSettingKeys.map((key: PlatformSettingKey) => {
            const on = settings[key];
            const locked = key === "ticketing.presentation_mode" && settings.presentationForced;
            return (
              <Plate key={key} style={styles.block} testID={`setting-${key}`}>
                <Text variant="body" color={t.color.plateInk}>
                  {platformSettingLabels[key]} · <Text variant="bodyStrong">{on ? adminTexts.on : adminTexts.off}</Text>
                  {locked ? L.settingsForced : ""}
                </Text>
                <Button
                  variant="plate"
                  icon={on ? "close" : "check"}
                  disabled={locked && on}
                  onPress={() => {
                    gesture.setError(null);
                    setNotice(null);
                    setFlip({ key, label: platformSettingLabels[key], to: !on });
                  }}
                  fullWidth
                  testID={`setting-toggle-${key}`}
                >
                  {on ? adminTexts.disable : adminTexts.enable}
                </Button>
              </Plate>
            );
          })}

          <SectionTitle>{adminTexts.pointsTitle}</SectionTitle>
          <Notice>{adminTexts.pointsWarning}</Notice>
          <Plate style={styles.block} testID="admin-points">
            {POINT_KEYS.map((key) => (
              <TextField
                key={key}
                label={adminSettingLabels[key]}
                value={points[key] ?? ""}
                onChangeText={(v) => setPoints((p) => ({ ...p, [key]: v }))}
                keyboardType="numbers-and-punctuation"
                testID={`field-${key}`}
              />
            ))}
            <Muted variant="label">{adminSettingLabels["grades.thresholds"]}</Muted>
            {grades.map((g) => (
              <TextField
                key={g}
                label={`${gradeLabels[g]} (points)`}
                value={thresholds[g] ?? ""}
                onChangeText={(v) => setThresholds((p) => ({ ...p, [g]: v }))}
                editable={g !== "rodage"}
                keyboardType="number-pad"
                testID={`field-grade-${g}`}
              />
            ))}
            {pointsIssue ? <Notice tone="error">{pointsIssue}</Notice> : null}
            <Button
              variant="plate"
              icon="check"
              onPress={() => {
                const all = [...POINT_KEYS.map((k) => points[k]), ...grades.map((g) => thresholds[g])];
                if (all.some((v) => v === undefined || v.trim() === "" || Number.isNaN(Number(v)))) {
                  setPointsIssue("Tous les champs demandent un nombre.");
                  return;
                }
                setPointsIssue(null);
                gesture.setError(null);
                setNotice(null);
                setPointsAsk(true);
              }}
              fullWidth
              testID="admin-points-save"
            >
              {L.settingsPointsSave}
            </Button>
            {entryOf(settings, "points.malus")?.updatedAt ? (
              <Text variant="caption" color={t.color.plateMuted}>
                Dernière modification : {formatDayHour(entryOf(settings, "points.malus")?.updatedAt ?? "")}
              </Text>
            ) : null}
          </Plate>

          <SectionTitle>{adminTexts.listsTitle}</SectionTitle>
          <Muted variant="caption">{adminTexts.listsHint}</Muted>
          {adminSettingGroups.lists.map((key) => {
            const listKey = key as ListKey;
            const chosen = lists[key] ?? [];
            const all = adminListCodes[listKey] as readonly string[];
            const ordered = orderedCodes(all, chosen);
            return (
              <Plate key={key} style={styles.block} testID={`list-${key}`}>
                <Text variant="bodyStrong" color={t.color.plateInk}>
                  {adminSettingLabels[key]}
                </Text>
                {ordered.map((code) => {
                  const on = chosen.includes(code);
                  return (
                    <View key={code} style={styles.codeRow}>
                      <View style={styles.grow}>
                        <CheckboxField
                          label={codeLabel[listKey][code] ?? code}
                          checked={on}
                          onChange={(v) => setLists((l) => ({ ...l, [key]: toggleCode(l[key] ?? [], code, v) }))}
                        />
                      </View>
                      {on ? (
                        <View style={styles.moves}>
                          <Button
                            variant="plate"
                            icon="up"
                            onPress={() => setLists((l) => ({ ...l, [key]: moveCode(l[key] ?? [], code, -1) }))}
                            testID={`list-up-${code}`}
                          >
                            {L.settingsListUp}
                          </Button>
                          <Button
                            variant="plate"
                            icon="down"
                            onPress={() => setLists((l) => ({ ...l, [key]: moveCode(l[key] ?? [], code, 1) }))}
                            testID={`list-down-${code}`}
                          >
                            {L.settingsListDown}
                          </Button>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
                <Button
                  variant="plate"
                  icon="check"
                  loading={gesture.busy}
                  onPress={() => void saveList(key)}
                  fullWidth
                  testID={`list-save-${key}`}
                >
                  {L.settingsListSave}
                </Button>
              </Plate>
            );
          })}

          <SectionTitle>{adminTexts.templatesTitle}</SectionTitle>
          <AdminFailure error={templates.error} />
          {tplGesture.error && tplAsk === null ? <Notice tone="error">{tplGesture.error}</Notice> : null}
          {(templates.data ?? []).map((tp) => {
            const d = tplDraft(tp);
            return (
              <Plate key={tp.id} style={styles.block} testID="template-row">
                <TextField
                  label={`${L.settingsTemplateName} · ${templateKindLabels[tp.kind]}`}
                  value={d.name}
                  onChangeText={(v) => setDraft((x) => ({ ...x, [tp.id]: { ...tplDraft(tp), name: v } }))}
                />
                <TextField
                  label={L.settingsTemplateSubject}
                  value={d.subject}
                  onChangeText={(v) => setDraft((x) => ({ ...x, [tp.id]: { ...tplDraft(tp), subject: v } }))}
                />
                <TextField
                  label={L.settingsTemplateBody}
                  value={d.body}
                  multiline
                  onChangeText={(v) => setDraft((x) => ({ ...x, [tp.id]: { ...tplDraft(tp), body: v } }))}
                />
                <Button
                  variant="plate"
                  icon="check"
                  loading={tplGesture.busy}
                  onPress={() =>
                    void (async () => {
                      if (
                        await tplGesture.run(() =>
                          api.updateAdminTemplate(tp.id, {
                            kind: tp.kind,
                            name: d.name.trim(),
                            subject: d.subject.trim() || null,
                            body: d.body.trim(),
                          }),
                        )
                      ) {
                        setNotice(adminTexts.saved);
                        await templates.reload();
                      }
                    })()
                  }
                  fullWidth
                >
                  {L.settingsTemplateSave}
                </Button>
                <Button
                  variant="plate"
                  icon="close"
                  onPress={() => {
                    tplGesture.setError(null);
                    setTplAsk(tp);
                  }}
                  fullWidth
                >
                  {L.settingsTemplateRemove}
                </Button>
              </Plate>
            );
          })}
          <Plate style={styles.block} testID="template-new">
            <Text variant="bodyStrong" color={t.color.plateInk}>
              {L.settingsTemplateNew}
            </Text>
            <SelectField
              label={L.settingsTemplateKind}
              value={created.kind}
              onValueChange={(v) => setCreated((c) => ({ ...c, kind: v as TemplateKind }))}
              options={templateKinds.map((k) => ({ value: k, label: templateKindLabels[k] }))}
            />
            <TextField
              label={L.settingsTemplateName}
              value={created.name}
              onChangeText={(v) => setCreated((c) => ({ ...c, name: v }))}
            />
            <TextField
              label={L.settingsTemplateSubject}
              value={created.subject}
              onChangeText={(v) => setCreated((c) => ({ ...c, subject: v }))}
            />
            <TextField
              label={L.settingsTemplateBody}
              value={created.body}
              multiline
              onChangeText={(v) => setCreated((c) => ({ ...c, body: v }))}
            />
            <Button
              variant="plate"
              icon="add"
              loading={tplGesture.busy}
              onPress={() =>
                void (async () => {
                  if (
                    await tplGesture.run(() =>
                      api.createAdminTemplate({
                        kind: created.kind,
                        name: created.name.trim(),
                        subject: created.subject.trim() || null,
                        body: created.body.trim(),
                      }),
                    )
                  ) {
                    setCreated({ kind: templateKinds[0], name: "", subject: "", body: "" });
                    setNotice(adminTexts.saved);
                    await templates.reload();
                  }
                })()
              }
              fullWidth
              testID="template-create"
            >
              {L.settingsTemplateAdd}
            </Button>
          </Plate>
        </>
      ) : null}
    </AdminPage>
  );
}

export function SettingsScreen() {
  return (
    <AdminGate title={adminTexts.settingsTitle}>
      <SettingsBody />
    </AdminGate>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
  codeRow: { gap: space2 },
  grow: { flex: 1 },
  moves: { flexDirection: "row", gap: space2 },
});
