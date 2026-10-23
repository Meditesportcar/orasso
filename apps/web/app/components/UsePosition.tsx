import { Button } from "@orasso/design-system/web";
import { coarsePosition, explorerLabels } from "@orasso/shared";
import { useState } from "react";
import { useNavigate } from "react-router";

/**
 * « Utiliser ma position » (lot 29, ARCHITECTURE-SUITE § 13.2) : facultatif. La position de l'appareil est lue au clic,
 * ramenée au dixième de degré (environ 11 km), mise dans l'adresse de la page pour cette recherche seulement et n'est
 * jamais enregistrée. Refusée ou indisponible : on garde le secteur du profil.
 */
export function UsePosition({ formId }: { formId: string }) {
  const navigate = useNavigate();
  const [denied, setDenied] = useState(false);

  function ask() {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form || !("geolocation" in navigator)) {
      setDenied(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { lat, lng } = coarsePosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        const params = new URLSearchParams();
        for (const [key, value] of new FormData(form).entries()) {
          if (typeof value === "string" && value) params.set(key, value);
        }
        params.set("lat", String(lat));
        // Lot M4, tour 2 : utiliser sa position, c'est choisir « Autour de moi » dans l'Explorer.
        if (form.elements.namedItem("autour")) params.set("autour", "moi");
        params.set("lng", String(lng));
        params.delete("suite");
        navigate(`?${params}`);
      },
      () => setDenied(true),
      { maximumAge: 300_000, timeout: 10_000 },
    );
  }

  return (
    <div className="s-stack s-stack--tight">
      <Button type="button" variant="secondary" icon="place" onClick={ask} data-testid="use-position">
        {explorerLabels.usePosition}
      </Button>
      {denied && (
        <p className="o-t-caption s-muted" role="status">
          {explorerLabels.positionDenied}
        </p>
      )}
    </div>
  );
}
