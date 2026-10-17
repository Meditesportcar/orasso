// Administration (lot 33) : registre des utilisateurs, recherche par pseudo ou adresse e-mail, page suivante par curseur.
import { Button, Chip, TextField } from "@orasso/design-system/web";
import { type AdminUserRow, adminTexts, gradeLabels, type Page, platformRoleLabels } from "@orasso/shared";
import { Form } from "react-router";

import { requireSuperAdmin } from "../../lib/admin.server";
import { apiOrThrow } from "../../lib/api.server";
import { formatDay } from "../../lib/format";
import type { Route } from "./+types/utilisateurs";

export function meta() {
  return [{ title: "Utilisateurs · Administration · Orasso" }, { name: "robots", content: "noindex, nofollow" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireSuperAdmin(request);
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const cursor = url.searchParams.get("apres") ?? "";
  const params = new URLSearchParams({ limit: "30" });
  if (q) params.set("q", q);
  if (cursor) params.set("cursor", cursor);
  const page = await apiOrThrow<Page<AdminUserRow>>(request, `/admin/users?${params}`);
  return { q, page };
}

function state(u: AdminUserRow): string | null {
  if (u.deletedAt) return "Supprimé";
  if (u.bannedAt) return "Banni";
  if (u.suspendedUntil && new Date(u.suspendedUntil) > new Date()) return "Suspendu";
  return null;
}

export default function AdminUsers({ loaderData }: Route.ComponentProps) {
  const { q, page } = loaderData;
  return (
    <>
      <div className="orga__head">
        <div>
          <div className="s-label o-t-label">Administration</div>
          <h1 className="s-title">Utilisateurs</h1>
        </div>
      </div>
      <section className="orga__panel s-stack">
        <Form method="get" className="adm-search" role="search">
          <TextField label={adminTexts.userSearch} name="q" defaultValue={q} />
          <Button type="submit" variant="secondary" icon="search">
            Chercher
          </Button>
        </Form>
        {page.items.length === 0 ? (
          <p className="s-notice">{adminTexts.noResult}</p>
        ) : (
          <div className="adm-scroll">
            <table className="adm-table" data-testid="users-table">
              <thead>
                <tr>
                  <th scope="col">Pseudo</th>
                  <th scope="col">Adresse</th>
                  <th scope="col">Rôle</th>
                  <th scope="col">Grade</th>
                  <th scope="col">Inscrit le</th>
                  <th scope="col">État</th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((u) => (
                  <tr key={u.id} data-testid="user-row">
                    <td>
                      <a href={`/admin/utilisateurs/${u.id}`}>{u.pseudo}</a>
                    </td>
                    <td>
                      {u.email}
                      {u.emailVerified ? "" : " · non confirmée"}
                    </td>
                    <td>{platformRoleLabels[u.platformRole]}</td>
                    <td>
                      {gradeLabels[u.grade]} · {u.pointsSeason} pts
                    </td>
                    <td>{formatDay(u.createdAt)}</td>
                    <td>{state(u) ? <Chip>{state(u)}</Chip> : "Actif"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {page.nextCursor && (
          <a
            className="o-t-button"
            href={`/admin/utilisateurs?${new URLSearchParams({ ...(q ? { q } : {}), apres: page.nextCursor })}`}
          >
            Page suivante
          </a>
        )}
      </section>
    </>
  );
}
