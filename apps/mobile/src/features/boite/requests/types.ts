/** Props d'une section de Boîte > Demandes (une sorte de demande = un fichier de `features/boite/requests/`). */
export type RequestSectionProps = {
  /** Après une décision : la Boîte recharge ses compteurs. */
  onChanged: () => void;
  /** Change quand la Boîte se recharge (retour sur l'onglet, événement temps réel). */
  refreshKey: number;
};
