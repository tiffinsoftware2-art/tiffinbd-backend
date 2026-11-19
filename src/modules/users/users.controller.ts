import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import type { JwtPayload } from '../auth/auth.service';
import { AdminResetPasswordDto } from './dto/admin-reset-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersDto } from './dto/list-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';
import { Audit } from '../audit/audit.decorator';

@Controller('api/v1/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(UserRole.MANAGER)
  findAll(@Query() query: ListUsersDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    return this.usersService.findAll(page, limit);
  }

  @Get(':id')
  @Roles(UserRole.MANAGER)
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Audit('USER_CREATE', 'user')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateUserDto, @CurrentUser() requester: JwtPayload) {
    return this.usersService.create(dto, requester);
  }

  @Audit('USER_UPDATE', 'user')
  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() requester: JwtPayload,
  ) {
    return this.usersService.update(id, dto, requester);
  }

  @Audit('USER_PASSWORD_RESET', 'user')
  @Patch(':id/password')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  resetPassword(
    @Param('id') id: string,
    @Body() dto: AdminResetPasswordDto,
    @CurrentUser() requester: JwtPayload,
  ) {
    return this.usersService.resetPassword(id, dto, requester);
  }

  @Get(':id/login-activity')
  @Roles(UserRole.ADMIN)
  getLoginActivity(@Param('id') id: string, @Query('limit') limit?: string) {
    const parsedLimit = Math.min(parseInt(limit ?? '50', 10) || 50, 200);
    return this.usersService.getLoginActivity(id, parsedLimit);
  }
}
