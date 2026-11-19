import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { UserRole } from '../../common/enums/user-role.enum';
import {
  deriveAction,
  outcomeFor,
  resolveActor,
  resolveEntityId,
  sanitizePayload,
  shouldAudit,
} from './audit-rules';
import { AUDIT_META, AuditMeta } from './audit.decorator';
import { AuditService } from './audit.service';

// Registered as an APP_INTERCEPTOR in app.module.ts, alongside the two
// APP_GUARDs. All decision logic lives in audit-rules.ts, which is Nest-free
// and unit-tested; this class only plumbs the request into it.
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // WebSocket events (OrdersGateway) have no HTTP request to describe.
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<Request>();
    if (!shouldAudit(req.method, req.path)) return next.handle();

    const res = context.switchToHttp().getResponse<Response>();
    const meta = this.reflector.get<AuditMeta | undefined>(AUDIT_META, context.getHandler());

    // Snapshot the body now — a handler is free to mutate the DTO it was given.
    const payload = sanitizePayload(req.body);

    return next.handle().pipe(
      tap({
        next: (responseBody: unknown) => this.scheduleWrite(req, res, meta, payload, responseBody),
        // A rejected attempt is often the row that matters, so failures are
        // recorded too (ADR-019 §4). The exception filter sets the real status
        // on its way out, which is why the status is read on 'finish' rather
        // than guessed from the error here.
        error: () => this.scheduleWrite(req, res, meta, payload, null),
      }),
    );
  }

  // Deferred to the response's 'finish' event for two reasons. Nest applies
  // @HttpCode *after* the interceptor chain, so reading res.statusCode any
  // earlier records 200 for every 201/202 route. And it puts the INSERT
  // strictly after the client has its response, which is what ADR-019 §5 asks
  // for.
  private scheduleWrite(
    req: Request,
    res: Response,
    meta: AuditMeta | undefined,
    payload: Record<string, unknown> | null,
    responseBody: unknown,
  ): void {
    res.once('finish', () => {
      void this.write(req, meta, payload, responseBody, res.statusCode);
    });
  }

  private write(
    req: Request,
    meta: AuditMeta | undefined,
    payload: Record<string, unknown> | null,
    responseBody: unknown,
    statusCode: number,
  ): Promise<void> {
    const actor = resolveActor((req as Request & { user?: unknown }).user, payload);

    const forwarded = req.headers['x-forwarded-for'];
    const ip =
      (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : undefined) ??
      req.ip ??
      null;

    const userAgent = req.headers['user-agent'];

    return this.auditService.record({
      actor_user_id: actor.userId,
      actor_username: actor.username,
      // audit-rules.ts is deliberately free of Nest/enum imports, so the role
      // comes back as a plain string and is narrowed at this single boundary.
      actor_role: actor.role as UserRole | null,
      actor_branch_id: actor.branchId,
      action: meta?.action ?? deriveAction(req.method, req.path),
      entity_type: meta?.entityType ?? null,
      entity_id: resolveEntityId(req.params as Record<string, string>, responseBody),
      method: req.method.toUpperCase(),
      path: req.path.slice(0, 255),
      status_code: statusCode,
      outcome: outcomeFor(statusCode),
      payload,
      ip_address: ip ? ip.slice(0, 45) : null,
      user_agent: typeof userAgent === 'string' ? userAgent.slice(0, 255) : null,
    });
  }
}
