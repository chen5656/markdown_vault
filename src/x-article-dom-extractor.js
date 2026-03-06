// X/Twitter Article DOM fallback extraction
// Used when GraphQL API extraction fails
// Returns result directly (last expression is resolved by executeScript)

(() => {
  try {
    const allText = document.body.innerText || '';
    const hasArticleHeader = allText.includes('Article') || document.querySelector('a[aria-label="Back"]');

    if (!hasArticleHeader) return null;

    const mainContent = document.querySelector('main') || document.body;
    const candidateBlocks = Array.from(mainContent.querySelectorAll('div[dir="auto"], span[dir="auto"]'));

    const textBlocks = [];
    const seen = new Set();
    for (const el of candidateBlocks) {
      const text = (el.innerText || el.textContent || '').trim();
      if (text.length < 10) continue;
      if (seen.has(text)) continue;
      if (el.closest('nav, header, [role="banner"]')) continue;
      if (/^@\w+$/.test(text)) continue;
      seen.add(text);
      textBlocks.push(text);
    }

    if (textBlocks.length === 0) return null;

    const title = textBlocks[0].length <= 200 ? textBlocks[0] : textBlocks[0].substring(0, 100);
    const content = textBlocks.join('\n\n');

    if (content.length < 200) return null;

    return {
      title: title,
      content: content.trim(),
      markdownReady: true
    };
  } catch (e) {
    console.error('[markdown-vault] Article DOM extraction error:', e);
    return null;
  }
})();
