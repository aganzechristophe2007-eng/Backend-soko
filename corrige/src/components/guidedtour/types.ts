export interface TourStep {
  id: string;
  /** Sélecteur CSS de l'élément réel à mettre en évidence (ex. [data-tour="search"]). Sans cible : carte centrée. */
  target?: string;
  title: string;
  body: string;
  /** Petite consigne « À vous de jouer » affichée quand l'étape attend une action réelle. */
  actionHint?: string;
  /**
   * 'click' : l'étape avance dès que l'utilisateur clique réellement sur la cible.
   * Le clic n'est jamais bloqué ni détourné ; « Suivant » reste toujours disponible.
   * À réserver aux actions qui ne quittent pas la page.
   */
  waitFor?: 'click';
  placement?: 'top' | 'bottom' | 'auto';
}

export interface UseGuidedTourOptions {
  /** Identifiant unique de la page (clé de mémorisation). */
  tourId: string;
  steps: TourStep[];
  /** true quand la page est prête (données chargées, éléments rendus). Le démarrage automatique attend ce signal. */
  ready: boolean;
  autoStart?: boolean;
}
