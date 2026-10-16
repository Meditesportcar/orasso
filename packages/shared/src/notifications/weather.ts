import type { NotificationFamily } from "../enums";

/** Météo (lot 28) : suggestion aux organisateurs de passer l'événement en Incertain. Famille `staff` : ne se coupe pas. */
export const weatherNotificationTypes = {
  event_weather_suggest_uncertain: "staff",
} as const satisfies Record<string, NotificationFamily>;

export const weatherNotificationLabels: Record<keyof typeof weatherNotificationTypes, string> = {
  event_weather_suggest_uncertain: "Météo annoncée mauvaise",
};
