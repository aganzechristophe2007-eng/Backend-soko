import prisma from '../lib/prisma';
import { createNotificationService } from './notifications.service';

/**
 * Instance unique du service de notifications, partagée par server.ts et les contrôleurs
 * (messages, commandes, appels). Évite de créer plusieurs services et de dupliquer la configuration VAPID.
 */
export const notifier = createNotificationService(prisma);
export default notifier;
