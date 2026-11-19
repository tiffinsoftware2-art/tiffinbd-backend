import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import type { JwtPayload } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import type { User } from './entities/user.entity';
import { Audit } from '../audit/audit.decorator';

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @UseGuards(AuthGuard('local'))
  @Audit('LOGIN', 'session')
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() _dto: LoginDto,
    @Req() req: Request,
  ): Promise<{ accessToken: string; refreshToken: string; user: object }> {
    const user = req.user as User;
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';

    const tokens = await this.authService.login(user, ip);

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        branchId: user.branch_id,
        must_change_password: user.must_change_password,
      },
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: RefreshDto,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    // AuthService.refresh() rotates the refresh token (revokes the old one,
    // issues a new one) — both must be returned. Previously only accessToken
    // was returned, so every client kept reusing the now-revoked old token;
    // the *next* refresh attempt was then treated as a replay of a revoked
    // token (breach detection) and wiped every session for the user. See
    // authentication.md § Token Refresh (tiffinbd-context).
    const tokens = await this.authService.refresh(dto.refreshToken);
    return { accessToken: tokens.access_token, refreshToken: tokens.refresh_token };
  }

  // Not @Public() — goes through the global JwtAuthGuard, which resolves the
  // user via AuthRepository.findUserById() (filters is_active: true) before
  // this handler ever runs. A blocked/deactivated user 401s here even with a
  // still-unexpired access token — this is what the frontend's
  // AuthHydrator/`/api/auth/me` proxy call on every page load to detect a
  // revoked session, instead of trusting the JWT payload's own claims.
  @Get('me')
  async me(@Req() req: Request): Promise<{
    userId: string;
    username: string;
    role: JwtPayload['role'];
    branchId: string | null;
    must_change_password: boolean;
  }> {
    const payload = req.user as JwtPayload;
    return this.authService.getMe(payload.sub);
  }

  @Audit('PASSWORD_CHANGE', 'user')
  @Patch('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ): Promise<{ access_token: string; refresh_token: string }> {
    const payload = (req as unknown as { user: JwtPayload }).user;
    return this.authService.changePassword(
      payload.sub,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  @Audit('LOGOUT', 'session')
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Body() dto: Partial<RefreshDto>,
    @Req() req: Request,
  ): Promise<{ success: boolean }> {
    const payload = req.user as JwtPayload;
    if (dto?.refreshToken) {
      await this.authService.logout(payload.sub, dto.refreshToken);
    }
    return { success: true };
  }
}
