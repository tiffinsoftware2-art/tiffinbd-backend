import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { InternalServiceTokenGuard } from '../../common/guards/internal-service-token.guard';
import type { JwtPayload } from '../auth/auth.service';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { DevicesService } from './devices.service';
import { Audit } from '../audit/audit.decorator';

@Controller('api/v1/devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Audit('DEVICE_REGISTER', 'device')
  @Post('register')
  @HttpCode(HttpStatus.NO_CONTENT)
  async register(
    @Body() dto: RegisterDeviceDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    // Branchless users (Super Admin, Admin, Business Head, Manager) register with
    // branch_id = NULL. This used to return early, which is why they held no FCM
    // token at all and only ever saw alerts while the app was open — see ADR-020.
    // What they receive is then decided by role, not by this row: Manager is
    // unioned into every branch's order push, the other three get only the
    // escalation alert.
    await this.devicesService.register(user.sub, user.branchId ?? null, dto.fcmToken);
  }

  @Audit('DEVICE_UNREGISTER', 'device')
  @Delete('unregister')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unregister(@CurrentUser() user: JwtPayload): Promise<void> {
    await this.devicesService.unregister(user.sub);
  }

  // Called by tiffinbd-notification for order pushes. Returns the branch's own
  // devices PLUS the all-branch order-alert roles, so the created push and the
  // stop push address the same set. Internal service token, not JWT.
  @Get()
  @Public()
  @UseGuards(InternalServiceTokenGuard)
  async getByBranch(@Query('branchId') branchId: string): Promise<{ tokens: string[] }> {
    const tokens = await this.devicesService.getOrderAlertTokens(branchId);
    return { tokens };
  }

  // Called by tiffinbd-notification for escalation alerts — every active
  // oversight role's token, across all branches. Internal token, not JWT, same
  // as the branch lookup above. NOT named 'supervisors': Manager is branchless
  // too but belongs to the order-alert audience, so the old name now describes
  // the wrong set. See ADR-020.
  @Get('escalation-targets')
  @Public()
  @UseGuards(InternalServiceTokenGuard)
  async getEscalationTargets(): Promise<{ tokens: string[] }> {
    const tokens = await this.devicesService.getEscalationAlertTokens();
    return { tokens };
  }

  // Called by tiffinbd-notification to prune expired FCM tokens
  @Audit('DEVICE_TOKEN_DELETE', 'device')
  @Delete('token')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(InternalServiceTokenGuard)
  async removeToken(@Body('token') token: string): Promise<void> {
    await this.devicesService.removeExpiredToken(token);
  }
}
