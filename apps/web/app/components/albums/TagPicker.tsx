// Le plateau à choisir pour identifier une voiture, ou une personne par son pseudo (lot R9f, maquette R9.6 `plateauH`) : une fenêtre avec la
// recherche « Un nom, un pseudo, un numéro », les puces de catégorie, la grille des voitures (vignette à plaque masquée, « Toi » sur les
// miennes, nom jamais coupé, pseudo ou « compte privé »), et, à partir de deux caractères, l'onglet « Personnes ». Comme dans l'appli, aucune
// règle ici : l'API ne propose que les voitures pointées (ou toutes les retenues sans aucun pointage) et ne cherche une personne qu'à partir
// de deux caractères, parmi celles qui avaient une place ou une présence. Un passionné ne voit que ses voitures.
import { Button, Chip, Icon } from "@orasso/design-system/web";
import {
  ALBUM_TAG_SEARCH_MIN,
  type AlbumTagCreate,
  appendTaggablePage,
  createOperationGate,
  albumTagLabels as L,
  showPeopleTab,
  type Taggable,
  type TaggablePerson,
  type TaggableVehicle,
} from "@orasso/shared";
import { useEffect, useRef, useState } from "react";

import { apiFetch } from "../../lib/api.client";
import { PersonAvatar } from "../People";
import "../../styles/lineup.css";
import "../../styles/albums.css";

export type PickResult = { target: AlbumTagCreate; label: string; pseudo: string | null; self: boolean };

export function TagPicker({
  open,
  albumId,
  onClose,
  onPick,
}: {
  open: boolean;
  albumId: string;
  onClose: () => void;
  /** Pose l'identification ; une erreur levée s'affiche dans la fenêtre. */
  onPick: (pick: PickResult) => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [tab, setTab] = useState<"cars" | "people">("cars");
  const [data, setData] = useState<Taggable | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canSearchPeople = q.length >= ALBUM_TAG_SEARCH_MIN;
  const [loadingMore, setLoadingMore] = useState(false);
  const gate = useRef(createOperationGate());
  // L'onglet « Personnes » : dès deux caractères, ou dès que l'API rend « moi » sans recherche (identifiable par mon seul pseudo).
  const peopleTab = showPeopleTab(canSearchPeople, data?.people.length ?? 0);

  // La fenêtre suit `open` ; une fenêtre fermée (Échap) le dit au parent.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // Une fenêtre fermée vide tout : recherche, puce, plateau lu et opérations en cours (aucune page lue ne revient à la réouverture).
  useEffect(() => {
    if (open) return;
    gate.current.invalidate();
    setLoadingMore(false);
    setData(null);
    setText("");
    setQ("");
    setCategory(null);
    setTab("cars");
    setError(null);
    setBusy(null);
  }, [open]);

  // Une requête par pause dans la frappe, jamais une par lettre.
  useEffect(() => {
    const id = setTimeout(() => setQ(text.trim()), 280);
    return () => clearTimeout(id);
  }, [text]);

  useEffect(() => {
    if (!open) return;
    // Une génération par lecture : toute page encore en route (recherche, puce, album, réouverture) devient périmée.
    const current = gate.current.start();
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    const suffix = params.size ? `?${params}` : "";
    setLoadError(null);
    setLoadingMore(false);
    void apiFetch<Taggable>(`/albums/${encodeURIComponent(albumId)}/taggable${suffix}`).then((res) => {
      if (!current()) return;
      if (res.ok) setData(res.data);
      else setLoadError(res.error.message);
    });
    return () => gate.current.invalidate();
  }, [open, albumId, q, category]);

  useEffect(() => {
    if (!peopleTab && tab === "people") setTab("cars");
  }, [peopleTab, tab]);

  // Aucune voiture à proposer mais mon pseudo oui : l'onglet « Personnes » s'ouvre tout seul, **à l'arrivée des données** seulement
  // (un toucher sur « Voitures » est respecté ensuite).
  // biome-ignore lint/correctness/useExhaustiveDependencies: seulement à l'arrivée des données
  useEffect(() => {
    if (data && data.vehicles.length === 0 && data.people.length > 0 && !q && !category) setTab("people");
  }, [data]);

  /** « Voir plus » : la page suivante du plateau (60 voitures par page), ajoutée à celles déjà lues. */
  async function more() {
    if (!data || data.nextCursor === null || loadingMore) return;
    setLoadingMore(true);
    const current = gate.current.start();
    const params = new URLSearchParams({ cursor: String(data.nextCursor) });
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    const res = await apiFetch<Taggable>(`/albums/${encodeURIComponent(albumId)}/taggable?${params}`);
    // Recherche, puce, album ou réouverture changés pendant le chargement : la page est jetée.
    if (!current()) return;
    setLoadingMore(false);
    if (res.ok) setData((cur) => (cur ? appendTaggablePage(cur, res.data) : res.data));
    else setError(res.error.message);
  }

  async function pick(key: string, result: PickResult) {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      await onPick(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const owner = data?.role === "owner";
  return (
    <dialog
      ref={ref}
      className="tag-dialog"
      aria-label={L.identifyCar}
      // Seule la fermeture de **cette** fenêtre (Échap) prévient le parent.
      onClose={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid="tag-picker"
    >
      <div className="s-stack">
        <div className="tag-dialog__head">
          <h2 className="s-h2 tag-dialog__title">{L.identifyCar}</h2>
          <Button variant="close" label={L.screens.closePicker} onClick={onClose} />
        </div>
        <label className="o-t-label" htmlFor="tag-picker-search">
          {L.searchPlaceholder}
        </label>
        <input
          id="tag-picker-search"
          className="s-input"
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoComplete="off"
          maxLength={40}
          placeholder={L.searchPlaceholder}
          data-testid="tag-picker-search"
        />
        {owner && (
          <p className="o-t-caption s-muted" data-testid="tag-picker-own-only">
            {L.ownCarsOnly}
          </p>
        )}
        {data?.fallback && (
          <p className="s-notice" data-testid="tag-picker-fallback">
            {L.noCheckinLineup}
          </p>
        )}
        {data && data.categories.length > 1 && (
          <div className="tag-chips" role="radiogroup">
            <Chip selected={category === null} onClick={() => setCategory(null)}>
              {L.all}
            </Chip>
            {data.categories.map((c) => (
              <Chip
                key={c.slug}
                selected={category === c.slug}
                onClick={() => setCategory(category === c.slug ? null : c.slug)}
              >
                {`${c.label} · ${c.count}`}
              </Chip>
            ))}
          </div>
        )}
        {peopleTab && (
          <div className="tag-chips" role="tablist">
            <Chip selected={tab === "cars"} onClick={() => setTab("cars")}>
              {L.screens.tabCars}
            </Chip>
            <Chip selected={tab === "people"} onClick={() => setTab("people")}>
              {L.people}
            </Chip>
          </div>
        )}
        {loadError && (
          <p role="alert" className="s-error">
            {loadError}
          </p>
        )}
        {error && (
          <p role="alert" className="s-error" data-testid="tag-picker-error">
            {error}
          </p>
        )}
        {data && tab === "cars" && (
          <>
            {data.vehicles.length === 0 ? (
              <p className="s-muted" data-testid="tag-picker-empty">
                {L.screens.noMatch}
              </p>
            ) : (
              <ul className="lu-grid lu-grid--wide tag-grid" data-testid="tag-picker-grid">
                {data.vehicles.map((v) => (
                  <li key={v.vehicleId}>
                    <PickTile
                      car={v}
                      busy={busy === v.vehicleId}
                      disabled={busy !== null}
                      onPick={() =>
                        void pick(v.vehicleId, {
                          target: { vehicleId: v.vehicleId },
                          label: v.label,
                          pseudo: v.pseudo,
                          self: v.mine,
                        })
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
            {data.nextCursor !== null && (
              <Button
                type="button"
                variant="secondary"
                icon="down"
                disabled={loadingMore}
                onClick={() => void more()}
                data-testid="tag-picker-more"
              >
                {L.screens.moreCars}
              </Button>
            )}
          </>
        )}
        {data && tab === "people" && (
          <>
            {data.people.length === 0 ? (
              <p className="s-muted" data-testid="tag-picker-no-person">
                {L.screens.noPerson}
              </p>
            ) : (
              <ul className="tag-people" data-testid="tag-picker-people">
                {data.people.map((p) => (
                  <li key={p.userId}>
                    <PersonRow
                      person={p}
                      busy={busy === p.userId}
                      disabled={busy !== null}
                      onPick={() =>
                        void pick(p.userId, {
                          target: { userId: p.userId },
                          label: p.pseudo,
                          pseudo: p.pseudo,
                          self: p.mine,
                        })
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {!canSearchPeople && text.trim().length > 0 && <p className="o-t-caption s-muted">{L.screens.searchHint}</p>}
      </div>
    </dialog>
  );
}

function PickTile({
  car,
  busy,
  disabled,
  onPick,
}: {
  car: TaggableVehicle;
  busy: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      className={`lu-car tag-pick${car.mine ? " is-me" : ""}`}
      disabled={disabled}
      onClick={onPick}
      aria-label={[car.label, car.pseudo ?? L.privateAccount, car.mine ? L.you : null].filter(Boolean).join(", ")}
      data-testid={car.mine ? "tag-pick-car-me" : "tag-pick-car"}
    >
      <span className="lu-car__photo">
        {car.photoUrl ? <img src={car.photoUrl} alt="" loading="lazy" /> : <Icon name="vehicle" size={28} />}
        {car.mine && <span className="lu-me">{L.you}</span>}
      </span>
      <span className="lu-car__text">
        {/* Nom entier, jamais coupé : il passe à la ligne. */}
        <strong className="lu-car__name o-never-truncate" data-testid="tag-pick-car-name">
          {car.label}
        </strong>
        <span className="lu-car__who">
          {car.private && (
            <span role="img" aria-label={L.privateAccount}>
              <Icon name="lock" size={13} />
            </span>
          )}
          {busy ? L.screens.identifying : (car.pseudo ?? L.privateAccount)}
        </span>
      </span>
    </button>
  );
}

function PersonRow({
  person,
  busy,
  disabled,
  onPick,
}: {
  person: TaggablePerson;
  busy: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  return (
    <button type="button" className="tag-person" disabled={disabled} onClick={onPick} data-testid="tag-pick-person">
      <PersonAvatar url={person.avatarUrl} pseudo={person.pseudo} size={36} />
      <strong className="tag-person__name">{busy ? L.screens.identifying : person.pseudo}</strong>
      {person.mine && <span className="o-t-caption">{L.you}</span>}
    </button>
  );
}
