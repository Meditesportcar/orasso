// Administration (lot 57) : profils média à vérifier. D26 (Damien, 19/10) : aucun numéro de carte de presse ;
// l'équipe vérifie le profil (nom, formats, liens vers le travail du média) et pose « Profil vérifié »
// (`POST /admin/media/:id/verify`, tracé au journal d'administration), ou le retire.
import { Button, Chip, ChipRow } from "@orasso/design-system/web";
import {
  adminTexts,
  instagramUrl,
  mediaAppLabels as L,
  type MediaProfileView,
  mediaFormatLabels,
} from "@orasso/shared";
import { data, Form, redirect, useNavigation } from "react-router";

import { requireSuperAdmin } from "../../lib/admin.server";
import { api, apiOrThrow } from "../../lib/api.server";
import { formatDay } from "../../lib/format";
import type { Route } from "./+types/medias";

export function meta() {
  return [{ title: "Médias · Administration · Orasso" }, { name: "robots", content: "noindex, nofollow" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireSuperAdmin(request);
  const url = new URL(request.url);
  const filter = url.searchParams.get("filtre") === "all" ? "all" : "to_verify";
  const rows = await apiOrThrow<MediaProfileView[]>(request, `/admin/media?pending=${filter === "all" ? "0" : "1"}`);
  return { filter, rows, done: url.searchParams.get("fait") };
}

export async function action({ request }: Route.ActionArgs) {
  await requireSuperAdmin(request);
  const form = await request.formData();
  const id = String(form.get("mediaId") ?? "");
  const res = await api(request, `/admin/media/${encodeURIComponent(id)}/verify`, {
    method: "POST",
    json: { verified: String(form.get("verified")) === "true" },
  });
  if (!res.ok) return data({ id, error: res.error.message }, { status: res.status });
  return redirect(`/admin/medias?filtre=${String(form.get("filter") ?? "to_verify")}&fait=1`);
}

/** Les liens qui montrent le travail du média (ce que l'équipe vérifie). */
function links(m: MediaProfileView): { label: string; href: string | null }[] {
  const out: { label: string; href: string | null }[] = [];
  if (m.website) out.push({ label: L.profileWebsite, href: m.website });
  if (m.instagram) out.push({ label: `${L.profileInstagram} ${m.instagram}`, href: instagramUrl(m.instagram) });
  if (m.youtube) out.push({ label: L.profileYoutube, href: m.youtube });
  return out;
}

export default function AdminMedias({ loaderData, actionData }: Route.ComponentProps) {
  const { filter, rows, done } = loaderData;
  const busy = useNavigation().state !== "idle";
  return (
    <>
      <div className="orga__head">
        <div>
          <div className="s-label o-t-label">Administration</div>
          <h1 className="s-title">Médias</h1>
        </div>
        <nav className="s-row" aria-label="Filtre">
          <a href="/admin/medias" aria-current={filter === "to_verify" ? "page" : undefined}>
            <Chip selected={filter === "to_verify"}>À vérifier</Chip>
          </a>
          <a href="/admin/medias?filtre=all" aria-current={filter === "all" ? "page" : undefined}>
            <Chip selected={filter === "all"}>Tous</Chip>
          </a>
        </nav>
      </div>
      <p className="s-muted">{L.profileVerifyNote}</p>
      {done && (
        <p className="s-notice s-notice--ok" role="status" data-testid="admin-media-done">
          C'est fait. L'action est écrite au journal d'administration.
        </p>
      )}
      {rows.length === 0 ? (
        <p className="s-notice">{adminTexts.noResult}</p>
      ) : (
        rows.map((m) => (
          <section key={m.id} className="orga__panel s-stack" data-testid="admin-media-row" aria-label={m.name}>
            <div className="s-row s-row--between">
              <div className="s-stack s-stack--tight">
                <h2 className="s-h2 o-never-truncate">
                  <a href={`/m/${m.id}`}>{m.name}</a>
                </h2>
                <span className="o-t-caption">
                  Créé le {formatDay(m.createdAt)}
                  {m.departments.length ? ` · ${m.departments.join(", ")}` : ` · ${L.profileCoverAll}`}
                </span>
              </div>
              <Chip variant={m.verifiedAt ? "verified" : "default"}>
                {m.verifiedAt ? L.profileVerified : L.profileToVerify}
              </Chip>
            </div>
            <ChipRow>
              {m.formats.map((f) => (
                <Chip key={f}>{mediaFormatLabels[f]}</Chip>
              ))}
            </ChipRow>
            {m.description && <p className="s-prewrap">{m.description}</p>}
            <p className="o-t-caption">
              {links(m).map((x, i) => (
                <span key={x.label}>
                  {i > 0 ? " · " : ""}
                  {x.href ? (
                    <a href={x.href} target="_blank" rel="noreferrer">
                      {x.label}
                    </a>
                  ) : (
                    x.label
                  )}
                </span>
              ))}
            </p>
            {m.issue && <p className="o-t-caption s-muted">{m.issue}</p>}
            <Form method="post">
              <input type="hidden" name="mediaId" value={m.id} />
              <input type="hidden" name="filter" value={filter} />
              <input type="hidden" name="verified" value={m.verifiedAt ? "false" : "true"} />
              <Button
                type="submit"
                variant="secondary"
                icon={m.verifiedAt ? "close" : "check"}
                loading={busy}
                data-testid="admin-media-verify"
              >
                {m.verifiedAt ? "Retirer « Profil vérifié »" : "Vérifier le profil"}
              </Button>
            </Form>
            {actionData && "id" in actionData && actionData.id === m.id && (
              <p className="s-error" role="alert">
                {actionData.error}
              </p>
            )}
          </section>
        ))
      )}
    </>
  );
}
