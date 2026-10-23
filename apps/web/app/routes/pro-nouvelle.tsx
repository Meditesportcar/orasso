// Création de la fiche pro (docs/02 : « créer une fiche pro » depuis Moi > mes casquettes). Une fiche par compte.
import { Button, Plate } from "@orasso/design-system/web";
import type { ProOwner } from "@orasso/shared";
import { data, Form, redirect, useNavigation } from "react-router";
import { FicheBar, ficheHandle } from "../components/FicheBar";
import { FileField } from "../components/Fields";
import { ProFicheFields } from "../components/ProFicheFields";
import { api, requireMe } from "../lib/api.server";
import { proBodyFrom } from "../lib/proForm.server";
import type { Route } from "./+types/pro-nouvelle";

// Lot M7 : fiche ou parcours, mode B (en-tête de fiche, sans bande ni barre d'onglets).
export const handle = ficheHandle;

export function meta() {
  return [{ title: "Créer ma fiche pro · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const me = await requireMe(request);
  if (me.pro) throw redirect(`/pro/${me.pro.slug}`);
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  await requireMe(request);
  const form = await request.formData();
  const parsed = proBodyFrom(form);
  if ("error" in parsed) return data({ error: parsed.error }, { status: 400 });
  const res = await api<ProOwner>(request, "/pros", { method: "POST", json: parsed.body });
  if (!res.ok) return data({ error: res.error.message }, { status: res.status });
  const logo = form.get("logo");
  if (logo instanceof File && logo.size > 0) {
    const upload = new FormData();
    upload.set("logo", logo);
    await api(request, `/pros/${res.data.id}/logo`, { method: "POST", body: upload });
  }
  return redirect(`/pro/${res.data.slug}?creee=1`);
}

export default function ProNouvelle({ actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  return (
    <div className="s-narrow s-stack">
      <div className="s-head">
        <FicheBar title="Créer ma fiche pro" facts="Professionnels" back="/app/moi" />
        <p className="s-lead">
          Gratuit jusqu'au 21 juin 2027. Tu complèteras ensuite tes remises par grade, tes photos et la vérification de
          ton SIRET.
        </p>
      </div>
      <Plate as="section" aria-label="Fiche pro">
        <Form method="post" encType="multipart/form-data" className="s-form" data-testid="pro-create">
          <ProFicheFields />
          <FileField label="Logo" name="logo" accept="image/*" />
          {actionData?.error && (
            <p className="s-error" role="alert">
              {actionData.error}
            </p>
          )}
          <div>
            <Button type="submit" icon="check" loading={busy}>
              Créer ma fiche
            </Button>
          </div>
        </Form>
      </Plate>
    </div>
  );
}
