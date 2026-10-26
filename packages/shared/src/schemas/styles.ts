// Styles des véhicules (lot R5a, maquettes R5.2 et R5.3) : proposition d'un membre, catalogue et file de l'admin.
import { z } from "zod";
import { type VehicleType, vehicleTypes } from "../enums";
import {
  type CategoryFamily,
  type CategoryIcon,
  type CategoryProposalStatus,
  categoryIcons,
  cleanStyleName,
  STYLE_NAME_MAX,
  STYLE_NAME_MIN,
  styleFamilies,
} from "../rules/styles";

/** Nom de style tapé : nettoyé, 2 à 24 caractères (message en français pour le formulaire). */
const styleName = z
  .string()
  .max(200)
  .transform((v, ctx) => {
    const clean = cleanStyleName(v);
    if (!clean) {
      ctx.addIssue({
        code: "custom",
        message: `Le nom du style fait ${STYLE_NAME_MIN} à ${STYLE_NAME_MAX} caractères`,
      });
      return z.NEVER;
    }
    return clean;
  });

/** `POST /categories/proposals` : « Il manque un style ? Propose-le ». `vehicleId` : le véhicule de l'auteur, s'il existe. */
export const categoryProposalSchema = z.object({
  label: styleName,
  vehicleType: z.enum(vehicleTypes),
  vehicleId: z.uuid().optional(),
});
export type CategoryProposalInput = z.infer<typeof categoryProposalSchema>;
/** Réponse (liste blanche) : la proposition de l'auteur. */
export type CategoryProposalResult = { id: string; label: string; status: CategoryProposalStatus };

/** Âge minimal d'un style (« 30 ans et plus ») : 1 à 100 ans, ou aucun. */
const minAge = z.number().int().min(1).max(100).nullable();

/** `POST /admin/categories` : un style ajouté au type de l'onglet (famille, icône de la liste fermée). */
export const adminCategoryCreateSchema = z.object({
  label: styleName,
  labelM: styleName.nullable().optional(),
  family: z.enum(styleFamilies),
  icon: z.enum(categoryIcons),
  minVehicleAge: minAge.optional(),
  vehicleType: z.enum(vehicleTypes),
});
export type AdminCategoryCreate = z.infer<typeof adminCategoryCreateSchema>;

/** `PATCH /admin/categories/:id` : renommer, masculin, famille, icône, âge minimal, pause. */
export const adminCategoryUpdateSchema = z
  .object({
    label: styleName.optional(),
    labelM: styleName.nullable().optional(),
    family: z.enum(styleFamilies).optional(),
    icon: z.enum(categoryIcons).optional(),
    minVehicleAge: minAge.optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Rien à modifier" });
export type AdminCategoryUpdate = z.infer<typeof adminCategoryUpdateSchema>;

/** `PATCH /admin/categories/order` : les styles d'un type, dans le nouvel ordre. */
export const adminCategoryOrderSchema = z.object({
  vehicleType: z.enum(vehicleTypes),
  ids: z.array(z.uuid()).min(1).max(200),
});
export type AdminCategoryOrder = z.infer<typeof adminCategoryOrderSchema>;

/** Un style du catalogue vu par l'admin, avec le nombre de véhicules qui l'ont, par type. */
export type AdminCategory = {
  id: string;
  slug: string;
  label: string;
  labelM: string | null;
  family: CategoryFamily;
  icon: CategoryIcon;
  minVehicleAge: number | null;
  allowedVehicleTypes: string[] | null;
  allowedCountries: string[] | null;
  /** Réservé à certaines marques (Supercar). */
  makeMode: "any" | "whitelist";
  active: boolean;
  position: number;
  vehicles: Record<VehicleType, number>;
};

/** Empreinte d'un groupe (`version`) : 32 caractères hexadécimaux. */
const version = z.string().regex(/^[0-9a-f]{32}$/, "Groupe inconnu");

/** « Ajouter au catalogue » : le style créé (nom modifiable), sa famille et son icône. */
export const adminStyleAcceptSchema = z.object({
  version,
  label: styleName,
  labelM: styleName.nullable().optional(),
  family: z.enum(styleFamilies),
  icon: z.enum(categoryIcons),
  minVehicleAge: minAge.optional(),
});
export type AdminStyleAccept = z.infer<typeof adminStyleAcceptSchema>;

/** « Rattacher à… » un style existant. */
export const adminStyleMergeSchema = z.object({ version, categoryId: z.uuid() });
export type AdminStyleMerge = z.infer<typeof adminStyleMergeSchema>;

/** « Refuser ». */
export const adminStyleDeclineSchema = z.object({ version });
export type AdminStyleDecline = z.infer<typeof adminStyleDeclineSchema>;

/**
 * Un groupe de la file « Styles proposés » : les propositions en attente de même clé normalisée (`styleKey`, sans
 * accents, casse ni ponctuation). `label` : la variante la plus tapée ; `existing` : un style du catalogue de même clé.
 */
export type AdminStyleProposalGroup = {
  key: string;
  label: string;
  variants: { text: string; count: number }[];
  vehicleTypes: VehicleType[];
  count: number;
  /** Proposants (pseudos, 20 au plus). */
  authors: string[];
  /** Nombre de propositions qui viennent avec un véhicule (le style y sera posé si les règles l'acceptent). */
  withVehicle: number;
  since: string;
  version: string;
  existing: { id: string; label: string } | null;
};
