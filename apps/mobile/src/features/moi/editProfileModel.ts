// « Modifier mon profil » (lot R5b) : les valeurs du formulaire et l'enregistrement, sans React Native.
//
// Tour 2 (relecture Codex 3) : après un enregistrement réussi, le formulaire et le profil du compte (écran et cache hors
// ligne) prennent le profil **renvoyé par le PATCH** (pseudo, description, réseaux ramenés à leur pseudo). Avant, l'écran
// relisait `/me` : sans réseau, la session rendait l'ancien cache, le formulaire reprenait les anciennes valeurs sous
// « Profil enregistré », et un nouvel enregistrement les aurait renvoyées.
import type { Me, ProfileUpdate, SocialNetwork } from "@orasso/shared";

export type EditSocials = Record<SocialNetwork, string>;
export type EditProfileForm = { pseudo: string; bio: string; socials: EditSocials };

export const emptySocials = (): EditSocials => ({ instagram: "", tiktok: "", youtube: "", facebook: "", snapchat: "" });

/** Les champs du formulaire, tels que le compte les a. */
export function editFormOf(profile: Pick<Me["profile"], "pseudo" | "bio" | "socials">): EditProfileForm {
  return {
    pseudo: profile.pseudo,
    bio: profile.bio ?? "",
    socials: { ...emptySocials(), ...(profile.socials ?? {}) },
  };
}

/**
 * Enregistre le formulaire. `update` : `PATCH /me/profile`, qui rend le compte à jour ; `adopt` : la session le prend
 * (écran et cache hors ligne). Rend les champs à afficher, ceux du profil renvoyé.
 */
export async function saveEditProfile(
  form: EditProfileForm,
  deps: { update: (body: ProfileUpdate) => Promise<Me>; adopt: (me: Me) => Promise<void> },
): Promise<EditProfileForm> {
  const fresh = await deps.update({ pseudo: form.pseudo, bio: form.bio, socials: form.socials });
  await deps.adopt(fresh);
  return editFormOf(fresh.profile);
}
