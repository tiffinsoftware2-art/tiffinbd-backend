import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EscalationConfig } from './entities/escalation-config.entity';
import { ManualOrderConfig } from './entities/manual-order-config.entity';
import { MailService } from './mail.service';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [TypeOrmModule.forFeature([EscalationConfig, ManualOrderConfig])],
  controllers: [SettingsController],
  providers: [SettingsService, MailService],
  exports: [SettingsService, MailService],
})
export class SettingsModule {}
