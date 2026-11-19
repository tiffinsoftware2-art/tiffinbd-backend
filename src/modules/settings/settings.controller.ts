import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Put,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { UpdateEscalationConfigDto } from './dto/update-escalation-config.dto';
import { UpdateManualOrderConfigDto } from './dto/update-manual-order-config.dto';
import { MailService } from './mail.service';
import { SettingsService } from './settings.service';
import { Audit } from '../audit/audit.decorator';

@Controller('api/v1/settings')
@Roles(UserRole.ADMIN)
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly mail: MailService,
  ) {}

  @Get('escalation')
  getEscalation() {
    return this.settings.getEscalationConfig();
  }

  @Audit('SETTINGS_ESCALATION_UPDATE', 'settings')
  @Put('escalation')
  updateEscalation(@Body() dto: UpdateEscalationConfigDto) {
    return this.settings.updateEscalationConfig(dto);
  }

  @Audit('SETTINGS_ESCALATION_TEST', 'settings')
  @Post('escalation/test')
  @HttpCode(HttpStatus.OK)
  async testEmail() {
    try {
      await this.mail.sendTestEmail();
      return { ok: true, message: 'Test email sent successfully.' };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new HttpException({ ok: false, message }, HttpStatus.BAD_GATEWAY);
    }
  }

  // Manual Order defaults (VAT%, delivery charge, platform fee).
  //
  // Read is BRANCH_MANAGER+, deliberately wider than the controller-level
  // @Roles(ADMIN): it must match POST /api/v1/orders/manual, since anyone who
  // can create a manual order needs these defaults to prefill the form. When
  // this was ADMIN-only, BRANCH_MANAGER/MANAGER got 403 here and the dashboard
  // silently fell back to hardcoded 27/3 and VAT 0 — persisting stale pricing.
  @Get('manual-order')
  @Roles(UserRole.BRANCH_MANAGER)
  getManualOrderConfig() {
    return this.settings.getManualOrderConfigSafe();
  }

  // Write is BUSINESS_HEAD+ as of 2026-07-15 (was ADMIN+, the controller
  // default). Manual Entry pricing is operational config, unlike the SMTP
  // credentials in escalation above — those stay ADMIN-only.
  @Audit('SETTINGS_MANUAL_ORDER_UPDATE', 'settings')
  @Put('manual-order')
  @Roles(UserRole.BUSINESS_HEAD)
  updateManualOrderConfig(@Body() dto: UpdateManualOrderConfigDto) {
    return this.settings.updateManualOrderConfig(dto);
  }
}
