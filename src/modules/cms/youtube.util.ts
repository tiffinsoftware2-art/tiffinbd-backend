// Takes the video ID out of any usual YouTube link, or a bare ID:
//   https://www.youtube.com/watch?v=NULExgnBsSs&t=10s
//   https://youtu.be/NULExgnBsSs?si=abc
//   https://www.youtube.com/embed/NULExgnBsSs
//   https://www.youtube.com/shorts/NULExgnBsSs
//   https://www.youtube.com/live/NULExgnBsSs
//   NULExgnBsSs
// Returns null when no valid ID is found.
const ID = /^[A-Za-z0-9_-]{11}$/;

export function parseYouTubeId(input: string): string | null {
  const raw = (input ?? '').trim();
  if (ID.test(raw)) return raw;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '').toLowerCase();
  let id: string | null = null;
  if (host === 'youtu.be') {
    id = url.pathname.split('/')[1] ?? null;
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else {
      const m = url.pathname.match(/^\/(embed|shorts|live|v)\/([^/?#]+)/);
      id = m ? m[2] : null;
    }
  }
  return id && ID.test(id) ? id : null;
}
