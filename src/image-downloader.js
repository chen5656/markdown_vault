// Image download utilities — handles twimg size fallback and batch downloads
// Loaded via importScripts in the Service Worker.

'use strict';

export function getImageDownloadCandidates(remoteUrl) {
  const candidates = [remoteUrl];

  try {
    const u = new URL(remoteUrl);
    const isTwimgMedia = u.hostname === 'pbs.twimg.com' && /\/(media|ext_tw_video_thumb)\//.test(u.pathname);
    if (!isTwimgMedia) return candidates;

    const sizeOrder = ['orig', '4096x4096', 'large', 'medium', 'small'];
    const currentSize = u.searchParams.get('name');
    const names = currentSize
      ? [currentSize, ...sizeOrder.filter(name => name !== currentSize)]
      : sizeOrder;

    for (const name of names) {
      const next = new URL(u.toString());
      next.searchParams.set('name', name);
      candidates.push(next.toString());
    }
  } catch {
    // Keep default single candidate.
  }

  return [...new Set(candidates)];
}

export async function fetchFirstWorkingImage(remoteUrl) {
  const candidates = getImageDownloadCandidates(remoteUrl);
  let lastErr = null;

  for (const candidateUrl of candidates) {
    try {
      const resp = await fetch(candidateUrl);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const contentType = (resp.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (contentType && !contentType.startsWith('image/')) {
        throw new Error(`Non-image response (${contentType})`);
      }

      const buffer = await resp.arrayBuffer();
      return { buffer, contentType, usedUrl: candidateUrl };
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr || new Error('Failed to download image');
}
