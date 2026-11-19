import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

@Injectable()
export class InternalServiceTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const token = this.config.get<string>('app.internalServiceToken');
    if (!token) throw new UnauthorizedException('Internal service token not configured');
    const req = context.switchToHttp().getRequest<Request>();
    if (req.headers['x-internal-token'] !== token) {
      throw new UnauthorizedException('Invalid internal service token');
    }
    return true;
  }
}
