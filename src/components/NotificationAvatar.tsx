import React from 'react';
import { getMediaUrl } from '../lib/media';
import cbfLogo from '../CBF.jpg';

/**
 * Visuel d'une notification, façon Facebook :
 *  - notification d'une personne (message, commande, nouveau produit...) : sa photo de profil,
 *    avec le logo CBF SOKO en pastille ;
 *  - notification du système : le logo CBF SOKO.
 * Le logo CBF SOKO est donc visible sur toutes les notifications.
 */
export interface NotificationActor {
  id: string;
  name: string;
  avatar: string | null;
}

export default function NotificationAvatar({ actor, size = 48 }: { actor?: NotificationActor | null; size?: number }) {
  const badge = Math.round(size * 0.42);
  return (
    <span className="relative inline-flex flex-shrink-0" style={{ width: size, height: size }}>
      {actor ? (
        <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-[#FFF1E7] text-base font-bold text-[#FF6B00]">
          {actor.avatar ? <img src={getMediaUrl(actor.avatar)} alt="" className="h-full w-full object-cover" /> : actor.name.charAt(0).toUpperCase()}
        </span>
      ) : (
        <img src={cbfLogo} alt="CBF SOKO" className="h-full w-full rounded-full bg-white object-cover" />
      )}
      {actor && (
        <img
          src={cbfLogo}
          alt="CBF SOKO"
          className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white object-cover"
          style={{ width: badge, height: badge }}
        />
      )}
    </span>
  );
}
