import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { detectImageMime } from '../menu/menu-image.util';
import { HeroSlide } from './entities/hero-slide.entity';
import { SiteVideo } from './entities/site-video.entity';
import type { CreateVideoDto, UpdateVideoDto } from './cms.dto';
import { parseYouTubeId } from './youtube.util';

// Hero images: the dashboard shrinks them in the browser first, so this is a
// safety limit, not the usual size.
export const MAX_HERO_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_SLIDES = 20;
const MAX_VIDEOS = 30;

export type SlideView = {
  id: string;
  alt: string;
  sortOrder: number;
  imageUrl: string;
};
export type VideoView = {
  id: string;
  youtubeId: string;
  title: string;
  sortOrder: number;
};

@Injectable()
export class CmsService {
  constructor(
    @InjectRepository(HeroSlide) private readonly slides: Repository<HeroSlide>,
    @InjectRepository(SiteVideo) private readonly videos: Repository<SiteVideo>,
    private readonly dataSource: DataSource,
  ) {}

  // ── Reading ────────────────────────────────────────────────────────────────

  // Image links carry ?v=<last change>, so a replaced image gets a new link
  // and the old one can be cached for a long time.
  private slideView(s: HeroSlide, baseUrl: string): SlideView {
    return {
      id: s.id,
      alt: s.alt,
      sortOrder: s.sort_order,
      imageUrl: `${baseUrl}/api/v1/site-images/${s.id}?v=${s.updated_at.getTime()}`,
    };
  }

  private videoView(v: SiteVideo): VideoView {
    return {
      id: v.id,
      youtubeId: v.youtube_id,
      title: v.title,
      sortOrder: v.sort_order,
    };
  }

  async content(
    baseUrl: string,
  ): Promise<{ slides: SlideView[]; videos: VideoView[] }> {
    const [slides, videos] = await Promise.all([
      this.slides.find({ order: { sort_order: 'ASC', created_at: 'ASC' } }),
      this.videos.find({ order: { sort_order: 'ASC', created_at: 'ASC' } }),
    ]);
    return {
      slides: slides.map((s) => this.slideView(s, baseUrl)),
      videos: videos.map((v) => this.videoView(v)),
    };
  }

  async slideImage(id: string): Promise<{ data: Buffer; mime: string } | null> {
    const row = await this.slides
      .createQueryBuilder('s')
      .addSelect('s.data')
      .where('s.id = :id', { id })
      .getOne();
    return row ? { data: row.data, mime: row.mime_type } : null;
  }

  // ── Hero slides ────────────────────────────────────────────────────────────

  async addSlide(
    file: { buffer: Buffer } | undefined,
    alt: string | undefined,
    baseUrl: string,
  ): Promise<SlideView> {
    if (!file?.buffer?.length)
      throw new BadRequestException('Choose an image to upload.');
    const mime = detectImageMime(file.buffer);
    if (!mime)
      throw new BadRequestException('Upload a JPEG, PNG or WebP image.');
    if ((await this.slides.count()) >= MAX_SLIDES) {
      throw new BadRequestException(
        `The slider can hold at most ${MAX_SLIDES} images.`,
      );
    }
    const last = await this.slides.findOne({
      where: {},
      order: { sort_order: 'DESC' },
    });
    const saved = await this.slides.save(
      this.slides.create({
        data: file.buffer,
        mime_type: mime,
        alt: (alt ?? '').trim().slice(0, 255),
        sort_order: (last?.sort_order ?? -1) + 1,
      }),
    );
    return this.slideView(saved, baseUrl);
  }

  async updateSlide(
    id: string,
    alt: string,
    baseUrl: string,
  ): Promise<SlideView> {
    const slide = await this.slides.findOne({ where: { id } });
    if (!slide) throw new NotFoundException('Image not found');
    slide.alt = alt.trim().slice(0, 255);
    return this.slideView(await this.slides.save(slide), baseUrl);
  }

  async removeSlide(id: string): Promise<{ id: string }> {
    const res = await this.slides.delete({ id });
    if (!res.affected) throw new NotFoundException('Image not found');
    return { id };
  }

  async reorderSlides(ids: string[]): Promise<{ ok: true }> {
    await this.reorder(this.slides, ids);
    return { ok: true };
  }

  // ── Videos ─────────────────────────────────────────────────────────────────

  private youtubeIdOrThrow(url: string): string {
    const id = parseYouTubeId(url);
    if (!id) throw new BadRequestException('That is not a YouTube video link.');
    return id;
  }

  async addVideo(dto: CreateVideoDto): Promise<VideoView> {
    const youtubeId = this.youtubeIdOrThrow(dto.url);
    if ((await this.videos.count()) >= MAX_VIDEOS) {
      throw new BadRequestException(
        `The website can show at most ${MAX_VIDEOS} videos.`,
      );
    }
    const last = await this.videos.findOne({
      where: {},
      order: { sort_order: 'DESC' },
    });
    const saved = await this.videos.save(
      this.videos.create({
        youtube_id: youtubeId,
        title: (dto.title ?? '').trim(),
        sort_order: (last?.sort_order ?? -1) + 1,
      }),
    );
    return this.videoView(saved);
  }

  async updateVideo(id: string, dto: UpdateVideoDto): Promise<VideoView> {
    const video = await this.videos.findOne({ where: { id } });
    if (!video) throw new NotFoundException('Video not found');
    if (dto.url !== undefined)
      video.youtube_id = this.youtubeIdOrThrow(dto.url);
    if (dto.title !== undefined) video.title = dto.title.trim();
    return this.videoView(await this.videos.save(video));
  }

  async removeVideo(id: string): Promise<{ id: string }> {
    const res = await this.videos.delete({ id });
    if (!res.affected) throw new NotFoundException('Video not found');
    return { id };
  }

  async reorderVideos(ids: string[]): Promise<{ ok: true }> {
    await this.reorder(this.videos, ids);
    return { ok: true };
  }

  // Sets sort_order to each id's position. The list must contain every item
  // exactly once, so a stale page can't silently drop or duplicate one.
  private async reorder(
    repo: Repository<HeroSlide> | Repository<SiteVideo>,
    ids: string[],
  ): Promise<void> {
    const all = await (repo as Repository<{ id: string }>).find({
      select: { id: true },
    });
    const known = new Set(all.map((r) => r.id));
    if (
      ids.length !== known.size ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !known.has(id))
    ) {
      throw new BadRequestException(
        'The list changed. Reload the page and try again.',
      );
    }
    const table = repo.metadata.tableName;
    await this.dataSource.transaction(async (m) => {
      for (const [i, id] of ids.entries()) {
        await m.query(`UPDATE \`${table}\` SET sort_order = ? WHERE id = ?`, [
          i,
          id,
        ]);
      }
    });
  }
}
