// Xiaohongshu (小红书) content extraction
// Returns result directly (last expression is resolved by executeScript)

(() => {
  const cleanText = t => (t || '').replace(/\s+/g, ' ').trim();

  const title = document.querySelector('meta[property="og:title"]')?.content
    || document.querySelector('#detail-title, .note-title, h1')?.innerText
    || document.title
    || '';

  const descEl = document.querySelector('#detail-desc, .note-content, .desc, .note-text');
  const description = descEl ? cleanText(descEl.innerText || descEl.textContent) : '';

  const authorEl = document.querySelector(
    '.author-name, .username, .user-name, .author-wrapper .name, .user-info .nickname'
  );
  const author = cleanText(authorEl?.innerText || authorEl?.textContent || '');

  const seen = new Set();
  const imageUrls = Array.from(document.querySelectorAll('img'))
    .map(img => img.src || img.getAttribute('src') || '')
    .filter(src => src && /xhscdn|sns-img|ci\.xiaohongshu/.test(src))
    .filter(src => {
      const key = src.split('!')[0];
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const hasVideo = !!document.querySelector('video, .player-container, .video-player, xg-video-container');
  return { title: cleanText(title), description, author, imageUrls, hasVideo };
})();
