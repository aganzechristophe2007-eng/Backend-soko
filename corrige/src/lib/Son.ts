import { useEffect } from 'react';

/**
 * Joue la sonnerie CBF SOKO quand le service worker signale une notification push
 * alors que l'appli est ouverte. À appeler une seule fois, dans App().
 *
 * Les navigateurs n'autorisent le son qu'après un premier toucher de l'utilisateur :
 * le fichier est donc "déverrouillé" au premier clic ou toucher sur la page.
 */
export function useNotificationSound() {
  useEffect(() => {
    const audio = new Audio('/sounds/notification.wav');
    audio.preload = 'auto';
    audio.volume = 0.8;

    const unlock = () => {
      audio.muted = true;
      audio
        .play()
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
        })
        .catch(() => {
          audio.muted = false;
        });
    };
    window.addEventListener('pointerdown', unlock, { once: true });

    const onMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'PLAY_NOTIFICATION_SOUND') {
        audio.currentTime = 0;
        audio.play().catch(() => undefined);
      }
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);

    return () => {
      window.removeEventListener('pointerdown', unlock);
      navigator.serviceWorker?.removeEventListener('message', onMessage);
    };
  }, []);
}