import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

interface SocketJwtPayload {
  sub: string;
  role: string;
  branchId: string | null;
}

@WebSocketGateway()
export class OrdersGateway implements OnGatewayConnection {
  @WebSocketServer() private readonly server!: Server;
  private readonly logger = new Logger(OrdersGateway.name);

  constructor(private readonly jwt: JwtService) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      client.disconnect();
      return;
    }
    try {
      const payload = this.jwt.verify<SocketJwtPayload>(token);
      if (payload.branchId) {
        // Branch-scoped user — only receives events for their branch
        await client.join(`branch:${payload.branchId}`);
      } else {
        // Superadmin — receives all branch events
        await client.join('admins');
      }
    } catch {
      this.logger.warn(`Socket rejected — invalid token: ${client.id}`);
      client.disconnect();
    }
  }

  /**
   * Emit an event scoped to a branch.
   * Branch users in `branch:{branchId}` and superadmins in `admins` both receive it.
   * Socket.IO deduplicates — a socket in both rooms won't receive the event twice.
   */
  emit(event: string, payload: object, branchId?: string | null): void {
    if (branchId) {
      this.server.to(`branch:${branchId}`).to('admins').emit(event, payload);
    } else {
      this.server.emit(event, payload);
    }
  }
}
