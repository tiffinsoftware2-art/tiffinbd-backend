import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Addon } from '../addons/entities/addon.entity';
import { Branch } from '../branches/entities/branch.entity';
import { MenuItem } from '../menu/entities/menu-item.entity';
import { TiffinBDAdapter } from './adapters/tiffinbd.adapter';
import { NormalizationService } from './normalization.service';

@Module({
  imports: [TypeOrmModule.forFeature([MenuItem, Branch, Addon])],
  providers: [NormalizationService, TiffinBDAdapter],
  exports: [NormalizationService],
})
export class NormalizationModule {}
