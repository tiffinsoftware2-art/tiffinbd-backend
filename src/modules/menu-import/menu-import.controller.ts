import {
  Body,
  Controller,
  Get,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { Audit } from '../audit/audit.decorator';
import { buildTemplate, MAX_IMPORT_BYTES } from './menu-import.parser';
import { MenuImportService } from './menu-import.service';

type Upload = { buffer: Buffer; size: number; originalname: string } | undefined;
const uploadOptions = { limits: { fileSize: MAX_IMPORT_BYTES } };

// ADMIN+ only, like editing the menu itself. `target` is WEBSITE or a platform.
@Controller('api/v1/menu-import')
@Roles(UserRole.ADMIN)
export class MenuImportController {
  constructor(private readonly importer: MenuImportService) {}

  @Get('template')
  async template(): Promise<StreamableFile> {
    return new StreamableFile(await buildTemplate(), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="menu-import-template.xlsx"',
    });
  }

  // Shows what would happen. Changes nothing.
  @Post('preview')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  preview(@Body('target') target: string, @UploadedFile() file: Upload) {
    return this.importer.run(target, file, false);
  }

  // Saves the valid rows in one go (all or nothing). Rows with errors are skipped.
  @Audit('MENU_IMPORT', 'menu_import')
  @Post('apply')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  apply(@Body('target') target: string, @UploadedFile() file: Upload) {
    return this.importer.run(target, file, true);
  }
}
