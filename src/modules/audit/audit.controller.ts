import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuditLogFilterDto } from './dto/audit-log-filter.dto';
import { AuditService } from './audit.service';

// ADMIN+ only, unscoped by branch (ADR-019 §8). The frontend gate in
// Sidebar.tsx and the page's RoleGate list ['SUPER_ADMIN', 'ADMIN'] — the
// three must change together.
//
// Read-only by design: audit_log is append-only (BR-AUD-005), so this
// controller deliberately exposes no mutating route.
@Controller('api/v1/audit-logs')
@Roles(UserRole.ADMIN)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  search(@Query() filters: AuditLogFilterDto) {
    return this.auditService.search(filters);
  }

  // Feeds the dashboard's Action dropdown from what is actually in the table,
  // so it cannot drift as endpoints are added.
  @Get('actions')
  listActions() {
    return this.auditService.listActions();
  }
}
