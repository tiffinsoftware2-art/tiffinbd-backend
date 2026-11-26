import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CmsController, PublicSiteContentController } from './cms.controller';
import { CmsService } from './cms.service';
import { HeroSlide } from './entities/hero-slide.entity';
import { SiteVideo } from './entities/site-video.entity';

@Module({
  imports: [TypeOrmModule.forFeature([HeroSlide, SiteVideo])],
  controllers: [CmsController, PublicSiteContentController],
  providers: [CmsService],
})
export class CmsModule {}
