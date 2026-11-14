// « QR de la page » (lot R9h partie 2, T50 ; lot R9b, T23 de l'appli) : l'icône de côté du propriétaire, qui ouvre une fenêtre montrant
// le QR du lien public de sa page (`/o/<slug>`, `/p/<slug>`, `/providers/<id>`, `/m/<id>`) et les boutons de partage. Le QR est celui du
// site (`Qr`, sombre sur clair dans les deux thèmes) ; il porte une adresse publique, jamais un secret.
import { Button } from "@orasso/design-system/web";
import { pagesLabels as L } from "@orasso/shared";
import { useId, useRef } from "react";

import "../../styles/moderation.css";
import "../../styles/pages.css";
import { SideIcon } from "../profile/ProfileHead";
import { Qr } from "../Qr";
import { ShareButtons } from "../ShareButtons";

export function PageQr({ name, url }: { name: string; url: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  return (
    <>
      <SideIcon icon="qr" label={L.qrPage} onClick={() => ref.current?.showModal()} testId="page-qr-open" />
      <dialog ref={ref} className="mod-dialog" aria-labelledby={titleId} data-testid="page-qr-dialog">
        <div className="s-stack">
          <div className="mod-dialog__head">
            <h2 id={titleId} className="s-h2 mod-dialog__title">
              {L.qrTitle}
            </h2>
            <Button variant="close" label={L.close} onClick={() => ref.current?.close()} />
          </div>
          <div className="pg-qr" data-testid="page-qr">
            <Qr payload={url} label={`${L.qrTitle} : ${name}`} />
            <strong className="o-never-truncate">{name}</strong>
            <span className="o-t-caption s-muted">{L.qrHelp}</span>
          </div>
          <ShareButtons url={url} title={`${name} sur Orasso`} />
        </div>
      </dialog>
    </>
  );
}
