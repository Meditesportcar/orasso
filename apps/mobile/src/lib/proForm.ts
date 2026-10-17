// Fiche pro dans l'appli (lot 35c) : du formulaire au corps de l'API, avec les règles de l'espace pro du site
// (`proForm.server.ts`, `pro-fiche.tsx`) : au moins une activité, zone d'intervention en codes de département, adresses
// web complétées en https, remises entières de 0 à 50 % (0 ou vide = pas de remise). L'API reste juge de la suite
// (remises croissantes avec le grade, SIRET, publication).
import {
  departmentSchema,
  type Grade,
  gradeLabels,
  grades,
  PRO_DISCOUNT_MAX_PERCENT,
  type ProActivity,
  type ProDiscountsInput,
  type ProOwner,
  type ProUpdate,
  proActivities,
  type Weekday,
  weekdays,
} from "@orasso/shared";

export const socialNetworks = ["instagram", "facebook", "tiktok", "youtube"] as const;
export type SocialNetwork = (typeof socialNetworks)[number];

export type ProFicheForm = {
  name: string;
  activities: ProActivity[];
  description: string;
  addressLine: string;
  postalCode: string;
  city: string;
  /** « 66, 11 » : zone d'intervention d'un pro sans local. */
  zone: string;
  phone: string;
  email: string;
  website: string;
  socials: Record<SocialNetwork, string>;
  hours: Record<Weekday, string>;
};

export function formOfPro(pro: ProOwner): ProFicheForm {
  return {
    name: pro.name,
    activities: [...pro.activities],
    description: pro.description ?? "",
    addressLine: pro.addressLine ?? "",
    postalCode: pro.postalCode ?? "",
    city: pro.city ?? "",
    zone: pro.interventionDepartments.join(", "),
    phone: pro.phone ?? "",
    email: pro.email ?? "",
    website: pro.website ?? "",
    socials: Object.fromEntries(socialNetworks.map((n) => [n, pro.socials[n] ?? ""])) as Record<SocialNetwork, string>,
    hours: Object.fromEntries(weekdays.map((d) => [d, pro.hours[d] ?? ""])) as Record<Weekday, string>,
  };
}

/** Formulaire vide d'une création (lot 34). */
export function emptyProForm(): ProFicheForm {
  return {
    name: "",
    activities: [],
    description: "",
    addressLine: "",
    postalCode: "",
    city: "",
    zone: "",
    phone: "",
    email: "",
    website: "",
    socials: Object.fromEntries(socialNetworks.map((n) => [n, ""])) as Record<SocialNetwork, string>,
    hours: Object.fromEntries(weekdays.map((d) => [d, ""])) as Record<Weekday, string>,
  };
}

/** Ajoute ou retire une activité (six au plus, vérifié par l'API). */
export function toggleActivity(list: ProActivity[], activity: ProActivity): ProActivity[] {
  return list.includes(activity) ? list.filter((a) => a !== activity) : [...list, activity];
}

const web = (value: string): string | null => {
  const text = value.trim();
  if (!text) return null;
  return /^https?:\/\//i.test(text) ? text : `https://${text}`;
};

/** Corps `PATCH /pros/:id`, ou le message d'erreur à afficher. */
export function proBody(form: ProFicheForm): { body: ProUpdate } | { error: string } {
  if (form.name.trim().length < 2) return { error: "Donne un nom à ton activité (2 caractères au moins)." };
  if (form.activities.length === 0) return { error: "Choisis au moins une activité." };
  if (form.activities.some((a) => !(proActivities as readonly string[]).includes(a))) {
    return { error: "Activité inconnue." };
  }
  const zone = form.zone
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((d) => d.toUpperCase());
  if (zone.some((d) => !departmentSchema.safeParse(d).success)) {
    return { error: "Zone d'intervention : codes de département séparés par des virgules (ex. 66, 11)." };
  }
  const text = (value: string) => value.trim() || null;
  const socials = Object.fromEntries(
    socialNetworks.map((n) => [n, web(form.socials[n])] as const).filter(([, v]) => v),
  );
  const hours = Object.fromEntries(weekdays.map((d) => [d, text(form.hours[d])]));
  return {
    body: {
      name: form.name.trim(),
      activities: form.activities,
      description: text(form.description),
      addressLine: text(form.addressLine),
      postalCode: text(form.postalCode),
      city: text(form.city),
      interventionDepartments: [...new Set(zone)],
      phone: text(form.phone),
      email: text(form.email),
      website: web(form.website),
      socials,
      hours,
    },
  };
}

// --- Remises par grade -------------------------------------------------------------------------------------------

export type DiscountTexts = Record<Grade, string>;

export function discountTexts(discounts: ProOwner["discounts"]): DiscountTexts {
  return Object.fromEntries(grades.map((g) => [g, discounts[g] ? String(discounts[g]) : ""])) as DiscountTexts;
}

/** Corps `PUT /pros/:id/discounts` : vide ou 0 = pas de remise, sinon un entier de 1 à 50. */
export function discountsBody(texts: DiscountTexts): { body: ProDiscountsInput } | { error: string } {
  const discounts: Record<string, number | null> = {};
  for (const g of grades) {
    const raw = texts[g].trim().replace(/\s*%$/, "");
    if (!raw) {
      discounts[g] = null;
      continue;
    }
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > PRO_DISCOUNT_MAX_PERCENT) {
      return { error: `Remise de ${gradeLabels[g]} : un nombre entier de 0 à ${PRO_DISCOUNT_MAX_PERCENT}.` };
    }
    discounts[g] = n === 0 ? null : n;
  }
  return { body: { discounts } };
}

/** Le SIRET s'écrit avec ou sans espaces : on n'envoie que les chiffres. */
export const siretDigits = (value: string): string => value.replace(/\s+/g, "");

/** Organisateurs à proposer comme partenaires : ceux qui ne sont pas déjà liés (en attente ou acceptés). */
export function partnerChoices<T extends { slug: string }>(structures: T[], linkedSlugs: string[]): T[] {
  const linked = new Set(linkedSlugs);
  return structures.filter((s) => !linked.has(s.slug));
}
