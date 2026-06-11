import { io, type Socket } from 'socket.io-client';
import { ENV } from '../constants/env';
import { logger } from '../utils/logger';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket) return socket;
  socket = io(ENV.wsUrl, {
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });
  socket.on('connect', () => logger.info('ws connected', socket?.id));
  socket.on('disconnect', (reason) => logger.warn('ws disconnected', reason));
  return socket;
}

export function subscribeProject(projectId: string, onEvent: (ev: unknown) => void): () => void {
  const s = getSocket();
  s.emit('project.subscribe', { projectId });
  s.on('project.progress', onEvent);
  return () => {
    s.emit('project.unsubscribe', { projectId });
    s.off('project.progress', onEvent);
  };
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
