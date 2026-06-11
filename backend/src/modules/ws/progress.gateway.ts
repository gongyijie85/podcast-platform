import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { ProgressEvent } from '@shared/job';

@WebSocketGateway({
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
})
export class ProgressGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ProgressGateway.name);

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket): void {
    this.logger.log(`ws client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`ws client disconnected: ${client.id}`);
  }

  @SubscribeMessage('project.subscribe')
  handleSubscribe(
    @MessageBody() body: { projectId: string },
    @ConnectedSocket() client: Socket,
  ): { ok: true; room: string } {
    const room = this.roomFor(body.projectId);
    void client.join(room);
    this.logger.log(`client ${client.id} joined room ${room}`);
    return { ok: true, room };
  }

  @SubscribeMessage('project.unsubscribe')
  handleUnsubscribe(
    @MessageBody() body: { projectId: string },
    @ConnectedSocket() client: Socket,
  ): { ok: true } {
    void client.leave(this.roomFor(body.projectId));
    return { ok: true };
  }

  async emit(event: ProgressEvent): Promise<void> {
    const room = this.roomFor(event.projectId);
    this.server.to(room).emit('project.progress', event);
    this.server.to(room).emit(`project.${event.stage}`, event);
    this.logger.debug(
      `emit ${event.stage} ${event.progress}% to ${room}: ${event.message}`,
    );
  }

  private roomFor(projectId: string): string {
    return `project:${projectId}`;
  }
}
