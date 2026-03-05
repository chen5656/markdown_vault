// Readability + selector fallback extractor — runs in page context via executeScript({ files: })
// Requires Readability.js to be injected first.
(function () {
  // Try Readability first
  try {
    const reader = new Readability(document.cloneNode(true));
    const article = reader.parse();
    if (article) {
      window.__mvReadabilityResult = {
        title: article.title,
        content: article.content,
        excerpt: article.excerpt,
        byline: article.byline,
        siteName: article.siteName,
      };
      return;
    }
  } catch {
    // Readability failed — fall through to selector fallback
  }

  // Selector fallback for JS-heavy sites (Next.js/React apps, etc.)
  const candidates = [
    'main article',
    'article',
    '[role="main"] article',
    '[role="main"]',
    '.post-content',
    '.article-content',
    '.entry-content',
    '.prose',
    '.content',
    'main',
  ];
  for (const sel of candidates) {
    const el = document.querySelector(sel);
    if (el && el.textContent.trim().length > 200) {
      window.__mvReadabilityResult = { title: document.title, content: el.innerHTML };
      return;
    }
  }

  window.__mvReadabilityResult = null;
})();
