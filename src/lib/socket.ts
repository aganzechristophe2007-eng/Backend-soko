// The dependency is provided at runtime; suppress the error when its typings
// are not available in the current TypeScript environment.
// @ts-expect-error -- socket.io-client may be installed without declarations
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(import.meta.env.VITE_API_URL as string, {
      withCredentials: true,
      autoConnect: true,
    });
  }
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}