import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class IngestSecretGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.config.get<string>('ingest.websiteSecret');
    if (!secret) {
      throw new UnauthorizedException('Ingest secret not configured');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers['x-tiffin-secret'];

    if (header !== secret) {
      throw new UnauthorizedException('Invalid ingest secret');
    }

    return true;
  }
}
