import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(import.meta.env.VITE_API_URL as string, {
      withCredentials: true,
      autoConnect: true,
      // Essaie le websocket direct en premier (évite le round-trip de "long polling" initial
      // avant upgrade) : connexion et signalisation d'appel plus rapides. `polling` reste en
      // secours si le websocket est bloqué par le réseau/proxy de l'utilisateur.
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });
  }
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}