import { parseYouTubeId } from './youtube.util';

describe('parseYouTubeId', () => {
  it('reads the ID from every usual kind of YouTube link', () => {
    for (const link of [
      'NULExgnBsSs',
      'https://www.youtube.com/watch?v=NULExgnBsSs',
      'https://www.youtube.com/watch?v=NULExgnBsSs&t=42s',
      'youtube.com/watch?v=NULExgnBsSs',
      'https://m.youtube.com/watch?v=NULExgnBsSs',
      'https://youtu.be/NULExgnBsSs?si=b3EGDfTf9-9K4sJ1',
      'https://www.youtube.com/embed/NULExgnBsSs?si=b3EGDfTf9-9K4sJ1',
      'https://www.youtube.com/shorts/NULExgnBsSs',
      'https://www.youtube.com/live/NULExgnBsSs?feature=share',
    ]) {
      expect(parseYouTubeId(link)).toBe('NULExgnBsSs');
    }
  });

  it('rejects links that are not YouTube videos', () => {
    for (const bad of [
      '',
      'hello',
      'https://vimeo.com/123456789',
      'https://www.youtube.com/@Tiffinbd',
      'https://evil.com/watch?v=NULExgnBsSs',
    ]) {
      expect(parseYouTubeId(bad)).toBeNull();
    }
  });
});
