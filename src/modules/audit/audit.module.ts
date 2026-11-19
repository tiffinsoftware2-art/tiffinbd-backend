import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditController } from './audit.controller';
import { AuditLog } from './entities/audit-log.entity';
import { AuditRepository } from './audit.repository';
import { AuditService } from './audit.service';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  controllers: [AuditController],
  providers: [AuditRepository, AuditService],
  // Exported so the app-level AuditInterceptor (registered in app.module.ts)
  // can resolve it.
  exports: [AuditService],
})
export class AuditModule {}
