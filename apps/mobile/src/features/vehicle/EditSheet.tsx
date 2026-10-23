// Page du véhicule, « Modifier la fiche » (lot 35c, D20) : année, couleur, moteur, puissance, poids, préparation,
// description, catégories (celles qui ne conviennent pas sont grisées avec la raison, comme à l'ajout) et plaque. Une
// plaque déjà prise par un autre membre lance une demande de transfert : le véhicule reste, la plaque attend la réponse.
import { Button, CheckboxField, Chip, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import { garageAppLabels as L, VEHICLE_ENGINE_MAX, type VehicleFull } from "@orasso/shared";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useApi } from "@/lib/useApi";
import { hasChanges, type VehicleEditForm, vehicleEditForm, vehicleUpdateBody } from "@/lib/vehicleEdit";
import { AppSheet } from "@/ui/AppSheet";
import { Feedback } from "@/ui/Feedback";
import { Muted } from "@/ui/Muted";

const { space2 } = tokens.spacing;

export function EditSheet({
  vehicle,
  certified,
  visible,
  onClose,
  onSaved,
}: {
  vehicle: VehicleFull;
  certified: boolean;
  visible: boolean;
  onClose: () => void;
  /** Recharge la page (une plaque d'un autre membre y apparaît « en attente de transfert ») et affiche le message. */
  onSaved: (message: string) => Promise<unknown>;
}) {
  const { t } = useTheme();
  const [form, setForm] = useState<VehicleEditForm>(() => vehicleEditForm(vehicle));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = Boolean(vehicle.plateTransfer);
  const active = vehicle.status === "active";

  // À chaque ouverture, les champs repartent de la fiche telle que l'API la renvoie.
  useEffect(() => {
    if (visible) {
      setForm(vehicleEditForm(vehicle));
      setError(null);
    }
  }, [visible, vehicle]);

  const yearValue = /^\d{4}$/.test(form.year) ? Number.parseInt(form.year, 10) : undefined;
  const categories = useApi(
    () =>
      api.categories({
        makeId: vehicle.makeId,
        modelId: vehicle.modelId,
        vehicleType: vehicle.vehicleType,
        year: yearValue,
      }),
    [vehicle.makeId, vehicle.modelId, vehicle.vehicleType, yearValue],
    { enabled: visible },
  );

  const patch = (change: Partial<VehicleEditForm>) => setForm((f) => ({ ...f, ...change }));
  const toggleCategory = (id: string) =>
    patch({
      categoryIds: form.categoryIds.includes(id)
        ? form.categoryIds.filter((x) => x !== id)
        : [...form.categoryIds, id].slice(0, 10),
    });

  async function save() {
    const parsed = vehicleUpdateBody(form, vehicle);
    if ("error" in parsed) return setError(parsed.error);
    if (!hasChanges(parsed)) return setError(L.nothingChanged);
    setBusy(true);
    setError(null);
    try {
      await api.updateVehicle(vehicle.id, parsed.body);
      await onSaved(L.saved);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel={L.editTitle} maxHeight={0.9}>
      <Text variant="title" color={t.color.ink}>
        {L.editTitle}
      </Text>
      {certified ? <Muted variant="caption">{L.certifiedWarning}</Muted> : null}
      <TextField
        label={L.year}
        value={form.year}
        onChangeText={(year) => patch({ year })}
        keyboardType="number-pad"
        maxLength={4}
        testID="vehicle-year"
      />
      <TextField label={L.color} value={form.color} onChangeText={(color) => patch({ color })} maxLength={40} />
      <TextField
        label={L.engine}
        value={form.engine}
        onChangeText={(engine) => patch({ engine })}
        maxLength={VEHICLE_ENGINE_MAX}
      />
      <TextField
        label={L.power}
        value={form.powerHp}
        onChangeText={(powerHp) => patch({ powerHp })}
        keyboardType="number-pad"
        maxLength={4}
      />
      <TextField
        label={L.weight}
        value={form.weightKg}
        onChangeText={(weightKg) => patch({ weightKg })}
        keyboardType="number-pad"
        maxLength={5}
      />
      <TextField
        label={L.preparation}
        value={form.preparation}
        onChangeText={(preparation) => patch({ preparation })}
        multiline
        maxLength={2000}
        style={{ minHeight: 72 }}
      />
      <TextField
        label={L.description}
        value={form.description}
        onChangeText={(description) => patch({ description })}
        multiline
        maxLength={2000}
        style={{ minHeight: 96 }}
        testID="vehicle-description"
      />
      <TextField
        label={L.plate}
        help={locked ? L.plateLocked : active ? L.plateHelp : undefined}
        value={form.plate}
        onChangeText={(plate) => patch({ plate })}
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!locked && !form.unregistered}
        placeholder="AB-123-CD"
        testID="vehicle-plate"
      />
      <CheckboxField
        label={L.unregistered}
        checked={form.unregistered}
        disabled={locked}
        onChange={(unregistered) => patch({ unregistered })}
      />
      {categories.data && categories.data.length > 0 ? (
        <>
          <Muted variant="label">{L.categories}</Muted>
          {categories.data.map((c) => {
            const chosen = form.categoryIds.includes(c.id);
            return (
              <View key={c.id} style={[styles.category, !c.eligible && !chosen && styles.off]}>
                <Chip selected={chosen} onPress={c.eligible || chosen ? () => toggleCategory(c.id) : undefined}>
                  {c.label}
                </Chip>
                {c.reason && !c.eligible ? <Muted variant="caption">{c.reason}</Muted> : null}
              </View>
            );
          })}
        </>
      ) : null}
      <Feedback error={error} onPlate={false} testID="vehicle-edit" />
      <Button
        variant="secondary"
        icon="check"
        loading={busy}
        onPress={() => void save()}
        fullWidth
        testID="vehicle-save"
      >
        {L.save}
      </Button>
      <Button variant="plate" icon="close" onPress={onClose} fullWidth>
        Annuler
      </Button>
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  category: { flexDirection: "row", alignItems: "center", gap: space2, flexWrap: "wrap" },
  off: { opacity: 0.55 },
});
