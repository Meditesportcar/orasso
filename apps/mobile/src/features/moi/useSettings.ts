// Réglages du compte (`GET/PATCH /me/settings`) : chaque changement est affiché tout de suite puis envoyé seul ; si l'API
// refuse, on recharge ce qu'elle a réellement. Pas de cache dans le trousseau : ces réglages sont ceux d'un compte.
import type { AccountSettingsUpdate } from "@orasso/shared";
import { useCallback, useState } from "react";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { applySettingsPatch } from "@/lib/settingsPatch";
import { useApi } from "@/lib/useApi";

export function useSettings() {
  const query = useApi(() => api.settings(), []);
  const [error, setError] = useState<string | null>(null);
  const { data, setData, reload } = query;

  const save = useCallback(
    async (patch: AccountSettingsUpdate) => {
      setError(null);
      setData(data ? applySettingsPatch(data, patch) : data);
      try {
        setData(await api.updateSettings(patch));
      } catch (e) {
        setError(errorMessage(e));
        await reload();
      }
    },
    [data, setData, reload],
  );

  return { settings: data, loading: query.loading, error, save, reload };
}

export type SettingsApi = ReturnType<typeof useSettings>;
