// Administration (lot 33) : base véhicules (marques, modèles, générations) et file « Autre ». On choisit à gauche la
// marque et le modèle (en les créant au besoin), puis on rattache chaque véhicule « Autre » de la file à ce modèle ; le
// véhicule garde ses photos et son historique, le propriétaire est prévenu.
// Lot R4a (maquette R4.8b) : en tête, la file « Modèles proposés » : les fiches dont le modèle (ou la marque) a été tapé,
// regroupées par texte, la plus grosse file en tête ; un geste rattache tout le groupe (« Ajouter à la liste et rattacher
// les N fiches », ou « Rattacher à un modèle existant »), la liste des fiches visible avant de valider.
import { Button, Chip, SelectField, TextField } from "@orasso/design-system/web";
import {
  adminTexts,
  type OtherVehicleGroup,
  type ReferenceGeneration,
  type ReferenceMake,
  type ReferenceModel,
  styleLabels,
  type VehicleProposalGroup,
  type VehicleProposalPage,
  vehicleTypeLabels,
  vehicleTypes,
} from "@orasso/shared";
import { data, Form, redirect, useNavigation } from "react-router";

import { requireSuperAdmin } from "../../lib/admin.server";
import { api, apiOrThrow } from "../../lib/api.server";
import type { Route } from "./+types/vehicules";

export function meta() {
  return [{ title: "Base véhicules · Administration · Orasso" }, { name: "robots", content: "noindex, nofollow" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireSuperAdmin(request);
  const url = new URL(request.url);
  const makeId = url.searchParams.get("marque");
  const modelId = url.searchParams.get("modele");
  // Lot R4a, tour 2 : la file se lit par pages de groupes entiers (`?propositions=<curseur>`).
  const proposalCursor = url.searchParams.get("propositions");
  const [makes, others, proposalPage, styleQueue] = await Promise.all([
    apiOrThrow<ReferenceMake[]>(request, "/admin/vehicle-reference/makes"),
    apiOrThrow<OtherVehicleGroup[]>(request, "/admin/vehicle-reference/others"),
    apiOrThrow<VehicleProposalPage>(
      request,
      `/admin/vehicle-reference/proposals${proposalCursor ? `?cursor=${encodeURIComponent(proposalCursor)}` : ""}`,
    ),
    // Lot R5a : le nombre de styles proposés, sur l'onglet « Styles ».
    apiOrThrow<{ total: number }>(request, "/admin/category-proposals"),
  ]);
  const proposals = proposalPage.items;
  // Modèles existants des marques connues de la file (« Rattacher à un modèle existant »).
  const proposalMakes = [...new Set(proposals.filter((g) => !g.make.isOther).map((g) => g.make.id))];
  const proposalModels = Object.fromEntries(
    await Promise.all(
      proposalMakes.map(
        async (id) =>
          [
            id,
            (await apiOrThrow<ReferenceModel[]>(request, `/admin/vehicle-reference/makes/${id}/models`)).filter(
              (m) => !m.isOther,
            ),
          ] as const,
      ),
    ),
  );
  const models = makeId
    ? await apiOrThrow<ReferenceModel[]>(request, `/admin/vehicle-reference/makes/${makeId}/models`)
    : [];
  const generations =
    modelId && models.some((m) => m.id === modelId)
      ? await apiOrThrow<ReferenceGeneration[]>(request, `/admin/vehicle-reference/models/${modelId}/generations`)
      : [];
  return {
    makes,
    models,
    generations,
    others,
    proposals,
    proposalsNext: proposalPage.nextCursor,
    proposalModels,
    make: makes.find((m) => m.id === makeId) ?? null,
    model: models.find((m) => m.id === modelId) ?? null,
    done: url.searchParams.get("fait"),
    stylesProposed: styleQueue.total,
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireSuperAdmin(request);
  const form = await request.formData();
  const text = (name: string) => String(form.get(name) ?? "").trim();
  const intent = text("intent");
  const back = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (text("makeId")) p.set("marque", text("makeId"));
    if (text("modelId")) p.set("modele", text("modelId"));
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return `/admin/vehicules?${p}`;
  };
  const year = (name: string) => (text(name) ? Number(text(name)) : null);
  let res: Awaited<ReturnType<typeof api<{ id: string }>>>;
  switch (intent) {
    case "make":
      res = await api(request, "/admin/vehicle-reference/makes", {
        method: "POST",
        json: { name: text("name"), country: text("country").toUpperCase() || null },
      });
      if (res.ok) return redirect(`/admin/vehicules?marque=${res.data.id}&fait=marque`);
      break;
    case "model":
      res = await api(request, "/admin/vehicle-reference/models", {
        method: "POST",
        json: { makeId: text("makeId"), name: text("name"), vehicleType: text("vehicleType") },
      });
      if (res.ok) return redirect(`/admin/vehicules?marque=${text("makeId")}&modele=${res.data.id}&fait=modele`);
      break;
    case "generation":
      res = await api(request, "/admin/vehicle-reference/generations", {
        method: "POST",
        json: { modelId: text("modelId"), name: text("name"), yearFrom: year("yearFrom"), yearTo: year("yearTo") },
      });
      if (res.ok) return redirect(back({ fait: "generation" }));
      break;
    case "delete":
      res = await api(request, `/admin/vehicle-reference/${text("kind")}/${encodeURIComponent(text("id"))}`, {
        method: "DELETE",
      });
      if (res.ok) return redirect(back({ fait: "suppression" }));
      break;
    // Lot R4a : rattachement groupé d'un groupe de « Modèles proposés ».
    case "proposal-add":
    case "proposal-attach": {
      const attach = intent === "proposal-attach";
      res = await api(request, `/admin/vehicle-reference/proposals/${encodeURIComponent(text("key"))}/accept`, {
        method: "POST",
        json: attach
          ? { makeId: text("makeId"), modelId: text("existingModelId"), version: text("version") }
          : text("makeId")
            ? { makeId: text("makeId"), modelName: text("modelName"), version: text("version") }
            : {
                version: text("version"),
                makeName: text("makeName"),
                country: text("country").toUpperCase() || null,
                modelName: text("modelName"),
              },
      });
      if (res.ok) return redirect("/admin/vehicules?fait=proposition");
      break;
    }
    case "reassign":
      res = await api(request, `/admin/vehicles/${encodeURIComponent(text("vehicleId"))}/reassign`, {
        method: "POST",
        json: { makeId: text("makeId"), modelId: text("modelId"), generationId: text("generationId") || null },
      });
      if (res.ok) return redirect(back({ fait: "rattache" }));
      break;
    default:
      return data({ error: "Action inconnue." }, { status: 400 });
  }
  return data({ error: res.ok ? "Erreur inattendue." : res.error.message }, { status: res.ok ? 500 : res.status });
}

export default function AdminVehicles({ loaderData, actionData }: Route.ComponentProps) {
  const {
    makes,
    models,
    generations,
    others,
    proposals,
    proposalsNext,
    proposalModels,
    make,
    model,
    done,
    stylesProposed,
  } = loaderData;
  const busy = useNavigation().state !== "idle";
  const target = make && model && !model.isOther ? { make, model } : null;
  return (
    <>
      <div className="orga__head">
        <div>
          <div className="s-label o-t-label">Administration</div>
          <h1 className="s-title">Base véhicules</h1>
        </div>
      </div>
      {/* Lot R5a (maquette R5.3) : l'onglet « Styles » de la base véhicules. */}
      <nav className="s-tabs" aria-label="Base véhicules" data-testid="vehicle-base-tabs">
        <a href="/admin/vehicules" aria-current="page">
          <Chip selected>{styleLabels.baseTab}</Chip>
        </a>
        <a href="/admin/vehicules/styles">
          <Chip>{styleLabels.adminTabCount(stylesProposed)}</Chip>
        </a>
      </nav>
      {done && (
        <p className="s-notice s-notice--ok" role="status" data-testid="vehicles-done">
          C'est fait. L'action est écrite au journal d'administration.
        </p>
      )}
      {actionData?.error && (
        <p className="s-error" role="alert">
          {actionData.error}
        </p>
      )}

      <section className="orga__panel s-stack" aria-labelledby="proposals" data-testid="proposals">
        <h2 id="proposals" className="s-h2">
          {adminTexts.proposals} · {proposals.length}
        </h2>
        <p className="s-muted">{adminTexts.proposalsHint}</p>
        {proposals.length === 0 ? (
          <p className="s-notice" data-testid="proposals-empty">
            {adminTexts.overviewEmpty}
          </p>
        ) : (
          proposals.map((g, i) => (
            <ProposalGroup key={g.key} group={g} open={i === 0} models={proposalModels[g.make.id] ?? []} busy={busy} />
          ))
        )}
        {proposalsNext ? (
          <a className="o-t-body" href={`/admin/vehicules?propositions=${proposalsNext}`} data-testid="proposals-next">
            {adminTexts.proposalsNext}
          </a>
        ) : null}
      </section>

      <div className="adm-columns">
        <section className="orga__panel s-stack" aria-labelledby="makes">
          <h2 id="makes" className="s-h2">
            Marques
          </h2>
          <ul className="adm-list" data-testid="makes">
            {makes.map((m) => (
              <li key={m.id}>
                <a href={`/admin/vehicules?marque=${m.id}`} aria-current={make?.id === m.id ? "true" : undefined}>
                  {m.name}
                  {m.country ? ` · ${m.country}` : ""} · {m.vehicles}
                </a>
              </li>
            ))}
          </ul>
          <Form method="post" className="s-stack" data-testid="make-form">
            <input type="hidden" name="intent" value="make" />
            <TextField label="Nouvelle marque" name="name" required />
            <TextField label="Pays (FR, DE…)" name="country" maxLength={2} />
            <Button type="submit" variant="secondary" icon="add" loading={busy}>
              Créer la marque
            </Button>
          </Form>
        </section>

        {make && !make.isOther && (
          <section className="orga__panel s-stack" aria-labelledby="models">
            <h2 id="models" className="s-h2 o-never-truncate">
              Modèles · {make.name}
            </h2>
            <ul className="adm-list" data-testid="models">
              {models.map((m) => (
                <li key={m.id}>
                  <a
                    href={`/admin/vehicules?marque=${make.id}&modele=${m.id}`}
                    aria-current={model?.id === m.id ? "true" : undefined}
                  >
                    {m.name} · {vehicleTypeLabels[m.vehicleType as keyof typeof vehicleTypeLabels]} · {m.vehicles}
                  </a>
                </li>
              ))}
            </ul>
            <Form method="post" className="s-stack" data-testid="model-form">
              <input type="hidden" name="intent" value="model" />
              <input type="hidden" name="makeId" value={make.id} />
              <TextField label="Nouveau modèle" name="name" required />
              <SelectField
                label="Type"
                name="vehicleType"
                options={vehicleTypes.map((t) => ({ value: t, label: vehicleTypeLabels[t] }))}
              />
              <Button type="submit" variant="secondary" icon="add" loading={busy}>
                Créer le modèle
              </Button>
            </Form>
            {make.vehicles === 0 && (
              <Form method="post">
                <input type="hidden" name="intent" value="delete" />
                <input type="hidden" name="kind" value="makes" />
                <input type="hidden" name="id" value={make.id} />
                <Button type="submit" variant="secondary" icon="close" loading={busy}>
                  Supprimer la marque
                </Button>
              </Form>
            )}
          </section>
        )}

        {make && model && !model.isOther && (
          <section className="orga__panel s-stack" aria-labelledby="gens">
            <h2 id="gens" className="s-h2 o-never-truncate">
              Générations · {make.name} {model.name}
            </h2>
            <ul className="adm-list" data-testid="generations">
              {generations.map((g) => (
                <li key={g.id} className="o-never-truncate">
                  {g.name}
                  {g.yearFrom ? ` · ${g.yearFrom}–${g.yearTo ?? ""}` : ""} · {g.vehicles}
                </li>
              ))}
            </ul>
            <Form method="post" className="s-stack" data-testid="generation-form">
              <input type="hidden" name="intent" value="generation" />
              <input type="hidden" name="makeId" value={make.id} />
              <input type="hidden" name="modelId" value={model.id} />
              <TextField label="Nouvelle génération" name="name" required />
              <TextField label="De (année)" name="yearFrom" type="number" />
              <TextField label="À (année)" name="yearTo" type="number" />
              <Button type="submit" variant="secondary" icon="add" loading={busy}>
                Créer la génération
              </Button>
            </Form>
          </section>
        )}
      </div>

      <section className="orga__panel s-stack" aria-labelledby="others" data-testid="others">
        <h2 id="others" className="s-h2">
          {adminTexts.otherQueue}
        </h2>
        <p className="s-muted">{adminTexts.otherQueueHint}</p>
        {target ? (
          <p className="o-t-caption">
            Rattacher à : <strong className="o-never-truncate">{`${target.make.name} ${target.model.name}`}</strong>
          </p>
        ) : (
          <p className="s-notice">Choisis d'abord une marque et un modèle à gauche (crée-les au besoin).</p>
        )}
        {others.length === 0 ? (
          <p className="s-notice" data-testid="others-empty">
            {adminTexts.overviewEmpty}
          </p>
        ) : (
          others.map((g) => (
            <div key={g.key} className="s-stack" data-testid="other-group">
              <h3 className="s-h3 o-never-truncate">
                {g.level === "make"
                  ? "Marque inconnue"
                  : g.level === "model"
                    ? `${g.make.name} · modèle inconnu`
                    : `${g.make.name} ${g.model.name} · génération inconnue`}{" "}
                · {g.vehicles.length}
              </h3>
              {g.vehicles.map((v) => (
                <div key={v.id} className="adm-other" data-testid="other-vehicle">
                  {v.photoUrl ? (
                    <img className="adm-other__photo" src={v.photoUrl} alt="" />
                  ) : (
                    <span className="adm-other__photo" />
                  )}
                  <div className="s-stack s-stack--tight">
                    <p className="o-never-truncate">{v.description ?? "Sans description"}</p>
                    <p className="o-t-caption">
                      {v.ownerPseudo}
                      {v.year ? ` · ${v.year}` : ""}
                      {v.engine ? ` · ${v.engine}` : ""}
                    </p>
                    {target && (
                      <Form method="post" className="adm-search">
                        <input type="hidden" name="intent" value="reassign" />
                        <input type="hidden" name="vehicleId" value={v.id} />
                        <input type="hidden" name="makeId" value={target.make.id} />
                        <input type="hidden" name="modelId" value={target.model.id} />
                        <SelectField
                          label="Génération"
                          name="generationId"
                          options={[
                            { value: "", label: "Sans génération précise" },
                            ...generations.filter((x) => !x.isOther).map((x) => ({ value: x.id, label: x.name })),
                          ]}
                        />
                        <Button type="submit" variant="secondary" icon="check" loading={busy}>
                          {adminTexts.reassign}
                        </Button>
                      </Form>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </section>
    </>
  );
}

const SINCE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" });

/** Un groupe de « Modèles proposés » (`.r4grp` de la maquette R4.8b) : les variantes, les fiches, le geste. */
function ProposalGroup({
  group: g,
  open,
  models,
  busy,
}: {
  group: VehicleProposalGroup;
  open: boolean;
  models: ReferenceModel[];
  busy: boolean;
}) {
  const n = g.count;
  const title = g.level === "make" ? `${g.makeName ?? "?"} ${g.modelName}` : `${g.make.name} ${g.modelName}`;
  const known =
    g.level === "make" ? adminTexts.proposalTypedMake(g.makeName ?? "") : adminTexts.proposalKnownMake(g.make.name);
  const variants = g.variants.map((v) => `« ${v.text} » (${v.count})`).join(", ");
  return (
    <details className="adm-proposal" open={open} data-testid="proposal-group">
      <summary className="adm-proposal__head">
        <span className="adm-proposal__n" aria-hidden="true">
          {n}
        </span>
        <span className="s-stack s-stack--tight">
          <strong className="o-never-truncate">{title}</strong>
          <span className="o-t-caption s-muted">
            {known} · {variants}
          </span>
        </span>
        <span className="o-t-label adm-proposal__count">{adminTexts.proposalCount(n)}</span>
      </summary>
      <table className="adm-proposal__table">
        <thead>
          <tr>
            <th>Propriétaire</th>
            <th>Tapé</th>
            <th>Année</th>
            <th>Département</th>
            <th>Depuis</th>
          </tr>
        </thead>
        <tbody>
          {g.vehicles.map((v) => (
            <tr key={v.id} data-testid="proposal-vehicle">
              <td>{v.ownerPseudo}</td>
              <td className="o-never-truncate">{[v.typedMake, v.typedModel].filter(Boolean).join(" ")}</td>
              <td>{v.year ?? "—"}</td>
              <td>{v.department ?? "—"}</td>
              <td>{SINCE.format(new Date(v.createdAt))}</td>
            </tr>
          ))}
          {n > g.vehicles.length ? (
            <tr>
              <td colSpan={5} className="o-t-caption">
                {adminTexts.proposalMore(n - g.vehicles.length)}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <Form method="post" className="adm-proposal__act" data-testid="proposal-add">
        <input type="hidden" name="intent" value="proposal-add" />
        <input type="hidden" name="key" value={g.key} />
        <input type="hidden" name="version" value={g.version} />
        {g.level === "make" ? (
          <>
            <TextField label="Nouvelle marque" name="makeName" defaultValue={g.makeName ?? ""} required />
            <TextField label="Pays (FR, DE…)" name="country" maxLength={2} />
          </>
        ) : (
          <input type="hidden" name="makeId" value={g.make.id} />
        )}
        <TextField label={adminTexts.proposalModelName} name="modelName" defaultValue={g.modelName} required />
        <Button type="submit" icon="check" loading={busy}>
          {adminTexts.proposalAdd(n)}
        </Button>
      </Form>
      {g.level === "model" && models.length > 0 ? (
        <Form method="post" className="adm-proposal__act" data-testid="proposal-attach">
          <input type="hidden" name="intent" value="proposal-attach" />
          <input type="hidden" name="key" value={g.key} />
          <input type="hidden" name="version" value={g.version} />
          <input type="hidden" name="makeId" value={g.make.id} />
          <SelectField
            label={adminTexts.proposalExisting}
            name="existingModelId"
            required
            placeholder={adminTexts.proposalPickModel}
            defaultValue=""
            options={models.map((m) => ({ value: m.id, label: m.name }))}
          />
          <Button type="submit" variant="secondary" icon="layers" loading={busy}>
            {adminTexts.proposalAttach}
          </Button>
        </Form>
      ) : null}
      <p className="o-t-caption s-muted">{adminTexts.proposalNotice(title)}</p>
    </details>
  );
}
