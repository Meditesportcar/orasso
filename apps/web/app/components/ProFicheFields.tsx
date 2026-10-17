// Champs de la fiche pro, partagés par la création (`/app/pro/nouvelle`) et la modification (`/pro/<slug>`).
import { CheckboxField, TextField } from "@orasso/design-system/web";
import { type ProOwner, proActivityLabels, weekdayLabels, weekdays } from "@orasso/shared";

import { useProActivities } from "../lib/lists";
import { TextAreaField } from "./Fields";

export function ProFicheFields({ pro }: { pro?: ProOwner }) {
  // Lot 33 : activités proposées par l'administration ; celles déjà choisies restent affichées.
  const offered = useProActivities();
  const proActivities = [...offered, ...(pro?.activities ?? []).filter((a) => !offered.includes(a))];
  return (
    <>
      <TextField label="Nom de l'activité" name="name" defaultValue={pro?.name ?? ""} required />
      <fieldset className="s-fieldset">
        <legend className="o-t-label">Activités (6 au plus)</legend>
        <div className="s-checklist">
          {proActivities.map((a) => (
            <CheckboxField
              key={a}
              name="activities"
              value={a}
              label={proActivityLabels[a]}
              defaultChecked={pro?.activities.includes(a)}
            />
          ))}
        </div>
      </fieldset>
      <TextAreaField label="Présentation" name="description" defaultValue={pro?.description ?? ""} />
      <fieldset className="s-fieldset">
        <legend className="o-t-label">Où te trouver</legend>
        <TextField label="Adresse" name="addressLine" defaultValue={pro?.addressLine ?? ""} />
        <div className="s-two">
          <TextField label="Code postal" name="postalCode" defaultValue={pro?.postalCode ?? ""} />
          <TextField label="Ville" name="city" defaultValue={pro?.city ?? ""} />
        </div>
        <TextField
          label="Zone d'intervention"
          name="interventionDepartments"
          defaultValue={pro?.interventionDepartments.join(", ") ?? ""}
          help="Sans local ou à domicile : les départements où tu te déplaces (ex. 66, 11). Une adresse ou une zone est nécessaire pour publier."
        />
      </fieldset>
      <fieldset className="s-fieldset">
        <legend className="o-t-label">Contact</legend>
        <div className="s-two">
          <TextField label="Téléphone" name="phone" defaultValue={pro?.phone ?? ""} inputMode="tel" />
          <TextField label="E-mail" name="email" type="email" defaultValue={pro?.email ?? ""} />
        </div>
        <TextField label="Site web" name="website" defaultValue={pro?.website ?? ""} />
        <div className="s-two">
          <TextField label="Instagram" name="instagram" defaultValue={pro?.socials.instagram ?? ""} />
          <TextField label="Facebook" name="facebook" defaultValue={pro?.socials.facebook ?? ""} />
          <TextField label="TikTok" name="tiktok" defaultValue={pro?.socials.tiktok ?? ""} />
          <TextField label="YouTube" name="youtube" defaultValue={pro?.socials.youtube ?? ""} />
        </div>
      </fieldset>
      <fieldset className="s-fieldset">
        <legend className="o-t-label">Horaires</legend>
        <div className="s-two">
          {weekdays.map((d) => (
            <TextField
              key={d}
              label={weekdayLabels[d]}
              name={`hours_${d}`}
              defaultValue={pro?.hours[d] ?? ""}
              placeholder="9h-12h / 14h-18h"
            />
          ))}
        </div>
      </fieldset>
    </>
  );
}
