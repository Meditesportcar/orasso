// Administration (lot 33) : registre des structures (statut, badge, propriétaire, demande d'aide), fiche et « survoler »
// l'espace de la structure en mode assistance (lecture seule tant qu'elle n'a pas demandé d'aide).
import { Button, Chip, TextField } from "@orasso/design-system/web";
import { adminTexts, assistanceTexts, type StructureVerification, structureVerificationLabels } from "@orasso/shared";
import { Form } from "react-router";

import { requireSuperAdmin } from "../../lib/admin.server";
import { apiOrThrow } from "../../lib/api.server";
import { formatDay } from "../../lib/format";
import type { Route } from "./+types/structures";

type Row = {
  id: string;
  slug: string;
  name: string;
  verification: StructureVerification;
  badgeExpiresAt: string | null;
  city: string | null;
  department: string | null;
  owner: { id: string; pseudo: string } | null;
  members: number;
  events: number;
  assistanceOpen: boolean;
};

export function meta() {
  return [{ title: "Structures · Administration · Orasso" }, { name: "robots", content: "noindex, nofollow" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireSuperAdmin(request);
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const rows = await apiOrThrow<Row[]>(request, `/admin/structure-registry${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  return { q, rows };
}

export default function AdminStructures({ loaderData }: Route.ComponentProps) {
  const { q, rows } = loaderData;
  return (
    <>
      <div className="orga__head">
        <div>
          <div className="s-label o-t-label">Administration</div>
          <h1 className="s-title">Structures</h1>
        </div>
      </div>
      <section className="orga__panel s-stack">
        <Form method="get" className="adm-search" role="search">
          <TextField label="Nom de la structure" name="q" defaultValue={q} />
          <Button type="submit" variant="secondary" icon="search">
            Chercher
          </Button>
        </Form>
        {rows.length === 0 ? (
          <p className="s-notice">{adminTexts.noResult}</p>
        ) : (
          <div className="adm-scroll">
            <table className="adm-table" data-testid="structures-table">
              <thead>
                <tr>
                  <th scope="col">Structure</th>
                  <th scope="col">Statut</th>
                  <th scope="col">Badge</th>
                  <th scope="col">Propriétaire</th>
                  <th scope="col">Membres · événements</th>
                  <th scope="col">Espace</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} data-testid="structure-row" data-slug={s.slug}>
                    <td>
                      <a href={`/admin/structures/${s.id}`}>{s.name}</a>
                      <div className="o-t-caption">{[s.city, s.department].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td>
                      {structureVerificationLabels[s.verification]}
                      {s.assistanceOpen && (
                        <div>
                          <Chip>Demande d'aide</Chip>
                        </div>
                      )}
                    </td>
                    <td>{s.badgeExpiresAt ? `jusqu'au ${formatDay(s.badgeExpiresAt)}` : "—"}</td>
                    <td>{s.owner ? <a href={`/admin/utilisateurs/${s.owner.id}`}>{s.owner.pseudo}</a> : "—"}</td>
                    <td>
                      {s.members} · {s.events}
                    </td>
                    <td>
                      <a href={`/orga/${s.slug}`}>{assistanceTexts.survey}</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
