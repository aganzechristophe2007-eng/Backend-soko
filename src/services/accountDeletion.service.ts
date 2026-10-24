import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import { invalidateAccountStatus } from '../lib/accountState';

/**
 * Suppression définitive des comptes dont le délai de grâce (30 jours) est écoulé.
 * Le compte est ANONYMISÉ plutôt que effacé : les commandes, paiements et messages des autres
 * utilisateurs gardent leur cohérence comptable, mais plus aucune donnée personnelle ne subsiste
 * (nom, email, téléphone, photo, mot de passe, abonnements push, notifications, préférences, favoris, blocages).
 */
export async function sweepAccountDeletions(): Promise<void> {
  const due = await prisma.user.findMany({
    where: { accountStatus: 'PENDING_DELETION', deletionScheduledAt: { lte: new Date() } },
    select: { id: true },
    take: 20,
  });

  for (const { id } of due) {
    try {
      // Mot de passe aléatoire inconnu de tous : aucune connexion possible.
      const lockedPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
      await prisma.$transaction([
        prisma.user.update({
          where: { id },
          data: {
            accountStatus: 'DELETED',
            name: 'Compte supprimé',
            email: `deleted+${id}@deleted.invalid`,
            phone: null,
            avatar: null,
            password: lockedPassword,
            deletionScheduledAt: null,
          },
        }),
        prisma.pushSubscription.deleteMany({ where: { userId: id } }),
        prisma.notification.deleteMany({ where: { userId: id } }),
        prisma.userPreferences.deleteMany({ where: { userId: id } }),
        prisma.blockedUser.deleteMany({ where: { OR: [{ blockerId: id }, { blockedId: id }] } }),
        prisma.favorite.deleteMany({ where: { userId: id } }),
      ]);
      invalidateAccountStatus(id);
    } catch (err) {
      console.error(`[suppression de compte] Échec pour ${id} :`, (err as Error).message);
    }
  }
}
