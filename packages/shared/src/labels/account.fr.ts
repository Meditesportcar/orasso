import type { DevicePlatform, ProfileVisibility } from "../enums";

// Compte : visibilité du profil, appareils.

export const profileVisibilityLabels: Record<ProfileVisibility, string> = {
  public: "Public",
  private: "Privé",
};

export const devicePlatformLabels: Record<DevicePlatform, string> = {
  ios: "iPhone",
  android: "Android",
  web: "Navigateur",
};
