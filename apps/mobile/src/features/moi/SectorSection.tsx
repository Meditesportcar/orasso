// Moi, secteur : départements (le premier sert à mesurer la distance), rayon des notifications (10 à 300 km) et
// centres d'intérêt (les catégories du référentiel). Chaque changement est enregistré tout de suite.
import { Button, Chip, ChipRow, Plate, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import { useState } from "react";
import { StyleSheet } from "react-native";

import { api } from "@/lib/api";
import { addDepartment, normalizeDepartment } from "@/lib/settingsPatch";
import { useApi } from "@/lib/useApi";
import { SectionTitle } from "@/ui/Screens";
import { Slider } from "@/ui/Slider";
import type { SettingsApi } from "./useSettings";

const { space2, space3 } = tokens.spacing;

export function SectorSection({ settings, save }: Pick<SettingsApi, "settings" | "save">) {
  const { t } = useTheme();
  const categories = useApi(() => api.categories(), [], { cacheKey: "categories" });
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | undefined>();
  const [radius, setRadius] = useState<number | null>(null);
  const shownRadius = radius ?? settings?.radiusKm ?? 50;

  function add() {
    if (!settings) return;
    const normalized = normalizeDepartment(code);
    if (!normalized) {
      setCodeError("Département inconnu : saisis son numéro (ex. 66, 2A, 974).");
      return;
    }
    setCodeError(undefined);
    setCode("");
    void save({ departments: addDepartment(settings.departments, normalized) });
  }

  return (
    <>
      <SectionTitle>Secteur et centres d'intérêt</SectionTitle>
      <Plate style={styles.block} testID="moi-sector">
        <Text variant="label" color={t.color.plateMuted}>
          Départements
        </Text>
        {settings && settings.departments.length > 0 ? (
          <ChipRow>
            {settings.departments.map((d) => (
              <Chip
                key={d}
                surface="plate"
                selected
                accessibilityLabel={`Retirer le département ${d}`}
                onPress={() => void save({ departments: settings.departments.filter((x) => x !== d) })}
              >
                {`${d} ✕`}
              </Chip>
            ))}
          </ChipRow>
        ) : (
          <Text variant="caption" color={t.color.plateMuted}>
            Aucun département : choisis le tien pour voir les événements près de chez toi.
          </Text>
        )}
        <TextField
          label="Ajouter un département"
          value={code}
          onChangeText={(v) => {
            setCode(v);
            setCodeError(undefined);
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={3}
          onSubmitEditing={add}
          help="Le premier de la liste sert à mesurer la distance. Touche un département pour le retirer."
          error={codeError}
        />
        <Button variant="plate" icon="add" disabled={!settings || code.trim() === ""} onPress={add} fullWidth>
          Ajouter ce département
        </Button>
      </Plate>

      <Plate style={styles.block}>
        <Text variant="label" color={t.color.plateMuted}>
          Rayon des notifications
        </Text>
        <Slider
          label="Rayon des notifications"
          value={shownRadius}
          min={10}
          max={300}
          step={10}
          format={(v) => `${v} km`}
          onChange={setRadius}
          onCommit={(v) => {
            void save({ radiusKm: v });
            setRadius(null);
          }}
        />
        <Text variant="caption" color={t.color.plateMuted}>
          {`${shownRadius} km autour du centre de ton premier département : au-delà, pas de notification « près de chez toi ».`}
        </Text>
      </Plate>

      <Plate style={styles.block}>
        <Text variant="label" color={t.color.plateMuted}>
          Centres d'intérêt
        </Text>
        {categories.data ? (
          <ChipRow>
            {categories.data.map((c) => {
              const on = settings?.interests.includes(c.id) ?? false;
              return (
                <Chip
                  key={c.id}
                  surface="plate"
                  selected={on}
                  onPress={() =>
                    settings &&
                    void save({
                      interests: on ? settings.interests.filter((id) => id !== c.id) : [...settings.interests, c.id],
                    })
                  }
                >
                  {c.label}
                </Chip>
              );
            })}
          </ChipRow>
        ) : (
          <Text variant="caption" color={t.color.plateMuted}>
            Chargement…
          </Text>
        )}
      </Plate>
    </>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
});
