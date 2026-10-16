// Lecture du formulaire de fiche pro (création et modification) : champs texte → corps de l'API.
import { departmentSchema, type ProUpdate, proActivities, weekdays } from "@orasso/shared";

const url = (value: string): string | null => {
  if (!value) return null;
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
};

/** Corps `ProUpdate` d'après le formulaire, ou le message d'erreur à afficher. */
export function proBodyFrom(form: FormData): { body: ProUpdate } | { error: string } {
  const text = (name: string) => String(form.get(name) ?? "").trim();
  const activities = form.getAll("activities").map(String);
  if (activities.length === 0) return { error: "Choisis au moins une activité." };
  if (activities.some((a) => !(proActivities as readonly string[]).includes(a))) return { error: "Activité inconnue." };
  const zone = text("interventionDepartments")
    .split(/[\s,;]+/)
    .filter(Boolean);
  if (zone.some((d) => !departmentSchema.safeParse(d).success)) {
    return { error: "Zone d'intervention : codes de département séparés par des virgules (ex. 66, 11)." };
  }
  const socials = Object.fromEntries(
    (["instagram", "facebook", "tiktok", "youtube"] as const).map((k) => [k, url(text(k))]).filter(([, v]) => v),
  );
  const hours = Object.fromEntries(weekdays.map((d) => [d, text(`hours_${d}`) || null]));
  return {
    body: {
      name: text("name"),
      activities: activities as ProUpdate["activities"],
      description: text("description") || null,
      addressLine: text("addressLine") || null,
      postalCode: text("postalCode") || null,
      city: text("city") || null,
      interventionDepartments: zone,
      phone: text("phone") || null,
      email: text("email") || null,
      website: url(text("website")),
      socials,
      hours,
    },
  };
}
