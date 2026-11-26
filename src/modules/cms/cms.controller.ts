import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { publicBaseUrl } from '../../common/utils/public-base-url';
import { Audit } from '../audit/audit.decorator';
import {
  CreateVideoDto,
  ReorderDto,
  UpdateSlideDto,
  UpdateVideoDto,
} from './cms.dto';
import { CmsService, MAX_HERO_IMAGE_BYTES } from './cms.service';

// Website CMS — Super Admin only. Hero slider images and YouTube videos shown
// on the customer website.
@Controller('api/v1/cms')
@Roles(UserRole.SUPER_ADMIN)
export class CmsController {
  constructor(private readonly cms: CmsService) {}

  @Get()
  content(@Req() req: Request) {
    return this.cms.content(publicBaseUrl(req));
  }

  @Audit('CMS_HERO_IMAGE_ADD', 'site_hero_slide')
  @Post('slides')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_HERO_IMAGE_BYTES } }),
  )
  addSlide(
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @Body('alt') alt: string | undefined,
    @Req() req: Request,
  ) {
    return this.cms.addSlide(file, alt, publicBaseUrl(req));
  }

  // Declared before 'slides/:id' so "order" is never read as an id.
  @Audit('CMS_HERO_REORDER', 'site_hero_slide')
  @Put('slides/order')
  reorderSlides(@Body() dto: ReorderDto) {
    return this.cms.reorderSlides(dto.ids);
  }

  @Audit('CMS_HERO_IMAGE_UPDATE', 'site_hero_slide')
  @Patch('slides/:id')
  updateSlide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSlideDto,
    @Req() req: Request,
  ) {
    return this.cms.updateSlide(id, dto.alt, publicBaseUrl(req));
  }

  @Audit('CMS_HERO_IMAGE_REMOVE', 'site_hero_slide')
  @Delete('slides/:id')
  removeSlide(@Param('id', ParseUUIDPipe) id: string) {
    return this.cms.removeSlide(id);
  }

  @Audit('CMS_VIDEO_ADD', 'site_video')
  @Post('videos')
  addVideo(@Body() dto: CreateVideoDto) {
    return this.cms.addVideo(dto);
  }

  @Audit('CMS_VIDEO_REORDER', 'site_video')
  @Put('videos/order')
  reorderVideos(@Body() dto: ReorderDto) {
    return this.cms.reorderVideos(dto.ids);
  }

  @Audit('CMS_VIDEO_UPDATE', 'site_video')
  @Patch('videos/:id')
  updateVideo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVideoDto,
  ) {
    return this.cms.updateVideo(id, dto);
  }

  @Audit('CMS_VIDEO_REMOVE', 'site_video')
  @Delete('videos/:id')
  removeVideo(@Param('id', ParseUUIDPipe) id: string) {
    return this.cms.removeVideo(id);
  }
}

// Public, read-only: what the website shows. Nothing here may write.
@Public()
@Controller('api/v1')
export class PublicSiteContentController {
  constructor(private readonly cms: CmsService) {}

  // Short cache: a change in the dashboard shows on the website within a minute.
  @Get('site-content')
  @Header('Cache-Control', 'public, max-age=60')
  content(@Req() req: Request) {
    return this.cms.content(publicBaseUrl(req));
  }

  // The link carries ?v=<last change>, so each version can be cached for long.
  @Get('site-images/:id')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async image(@Param('id', ParseUUIDPipe) id: string): Promise<StreamableFile> {
    const img = await this.cms.slideImage(id);
    if (!img) throw new NotFoundException('Image not found');
    return new StreamableFile(img.data, { type: img.mime });
  }
}
