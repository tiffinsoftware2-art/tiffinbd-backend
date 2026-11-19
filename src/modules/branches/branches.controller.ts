import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { BranchesService } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { Audit } from '../audit/audit.decorator';

@Controller('api/v1/branches')
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Get()
  @Roles(UserRole.STAFF)
  findAll() {
    return this.branchesService.findAll();
  }

  @Audit('BRANCH_CREATE', 'branch')
  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateBranchDto) {
    return this.branchesService.create(dto);
  }

  @Get(':id')
  @Roles(UserRole.STAFF)
  findOne(@Param('id') id: string) {
    return this.branchesService.findById(id);
  }

  @Get(':id/activity')
  @Roles(UserRole.ADMIN)
  getActivity(@Param('id') id: string) {
    return this.branchesService.getBranchActivity(id);
  }

  @Audit('BRANCH_UPDATE', 'branch')
  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateBranchDto) {
    return this.branchesService.update(id, dto);
  }

  @Audit('BRANCH_DELETE', 'branch')
  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.branchesService.remove(id);
  }
}
