// X/Twitter Tweet DOM extraction
// Injected into x.com tab via chrome.scripting.executeScript({ files: [...] })
// Returns result directly (last expression is resolved by executeScript)

(() => {
  const clean = value =>
    (value || '')
      .replace(/\u00A0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

  const uniq = values => [...new Set(values.filter(Boolean))];

  const toAbs = value => {
    if (!value) return '';
    try {
      return new URL(value, window.location.href).toString();
    } catch {
      return '';
    }
  };

  const normalizeImageUrl = src => {
    try {
      const u = new URL(src);
      u.searchParams.set('name', 'orig');
      return u.toString();
    } catch {
      return src;
    }
  };

  const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"], article[role="article"]'));
  const tweetArticle = articles.find(a => a.querySelector('time')) || articles[0] || null;
  if (!tweetArticle) return null;

  const text = Array.from(tweetArticle.querySelectorAll('div[data-testid="tweetText"]'))
    .map(el => clean(el.innerText || el.textContent))
    .filter(Boolean)
    .join('\n\n');

  const nameBlock = tweetArticle.querySelector('div[data-testid="User-Name"]');
  const spanValues = nameBlock
    ? Array.from(nameBlock.querySelectorAll('span'))
      .map(el => clean(el.innerText || el.textContent))
      .filter(Boolean)
    : [];

  const authorName = spanValues.find(v => !v.startsWith('@') && !v.includes('·')) || '';
  let authorHandle = (spanValues.find(v => v.startsWith('@')) || '').replace(/^@/, '');

  if (!authorHandle) {
    const profileLink = Array.from(tweetArticle.querySelectorAll('a[href^="/"]'))
      .map(a => toAbs(a.getAttribute('href')))
      .find(href => {
        try {
          const p = new URL(href).pathname;
          return /^\/[A-Za-z0-9_]{1,15}$/.test(p);
        } catch {
          return false;
        }
      });
    if (profileLink) {
      authorHandle = new URL(profileLink).pathname.replace(/^\/+/, '');
    }
  }

  const timeEl = tweetArticle.querySelector('time');
  const postedAt = timeEl?.getAttribute('datetime') || '';
  const permalink = toAbs(timeEl?.closest('a[href*="/status/"]')?.getAttribute('href') || window.location.href);
  const normalizedPermalink = permalink.replace(/\/+$/, '');

  const rawLinks = Array.from(tweetArticle.querySelectorAll('a[href]')).map(a => {
    const href = a.getAttribute('href');
    if (!href) return '';

    const title = (a.getAttribute('title') || '').trim();
    if (/^https?:\/\//i.test(title)) return title;

    const absoluteHref = toAbs(href);
    const linkText = clean(a.innerText || a.textContent);
    if (/^https?:\/\/t\.co\//i.test(absoluteHref) && /\.[a-z]{2,}/i.test(linkText)) {
      const candidate = /^https?:\/\//i.test(linkText) ? linkText : `https://${linkText}`;
      if (/^https?:\/\/[^\s]+$/i.test(candidate)) return candidate;
    }

    return absoluteHref;
  });

  const links = uniq(rawLinks)
    .map(link => link.replace(/\/+$/, ''))
    .filter(Boolean)
    .filter(link => {
      if (link === normalizedPermalink) return false;
      try {
        const host = new URL(link).hostname.toLowerCase().replace(/^www\./, '');
        return !(host === 'x.com' || host === 'twitter.com' || host.endsWith('.x.com') || host.endsWith('.twitter.com'));
      } catch {
        return false;
      }
    });

  const images = uniq(
    Array.from(tweetArticle.querySelectorAll('img[src]'))
      .map(img => toAbs(img.getAttribute('src') || img.src))
      .filter(src => /pbs\.twimg\.com\/(media|ext_tw_video_thumb)\//.test(src))
      .map(src => normalizeImageUrl(src))
  );

  const lines = [];

  if (authorName || authorHandle) {
    const who =
      authorName && authorHandle ? `${authorName} (@${authorHandle})`
        : authorHandle ? `@${authorHandle}`
          : authorName;
    lines.push(`**Author:** ${who}`);
  }
  if (postedAt) lines.push(`**Posted:** ${postedAt}`);
  if (permalink) lines.push(`**Post URL:** ${permalink}`);
  if (lines.length) lines.push('');

  if (text) {
    lines.push(text);
    lines.push('');
  }

  if (links.length) {
    lines.push('## Links');
    lines.push('');
    for (const link of links) lines.push(`- ${link}`);
    lines.push('');
  }

  if (images.length) {
    lines.push('## Images');
    lines.push('');
    images.forEach((src, idx) => lines.push(`![Post image ${idx + 1}](${src})`));
    lines.push('');
  }

  const contentMarkdown = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!contentMarkdown) return null;

  const displayAuthor = authorHandle ? `@${authorHandle}` : authorName || 'X';
  const preview = text ? clean(text).slice(0, 72) : '';
  const title = preview ? `${displayAuthor}: ${preview}` : `${displayAuthor} on X`;

  return { title, content: contentMarkdown, markdownReady: true };
})();
