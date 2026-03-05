// X/Twitter Article DOM fallback extraction
// Used when GraphQL API extraction fails
// Sets window.__mvArticleDomResult with the extracted data

(() => {
  try {
    const allText = document.body.innerText || '';
    const hasArticleHeader = allText.includes('Article') || document.querySelector('a[aria-label="Back"]');

    if (!hasArticleHeader) { window.__mvArticleDomResult = null; return; }

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

    if (textBlocks.length === 0) { window.__mvArticleDomResult = null; return; }

    const title = textBlocks[0].length <= 200 ? textBlocks[0] : textBlocks[0].substring(0, 100);
    const content = textBlocks.join('\n\n');

    if (content.length < 200) { window.__mvArticleDomResult = null; return; }

    window.__mvArticleDomResult = {
      title: title,
      content: content.trim(),
      markdownReady: true
    };
  } catch (e) {
    console.error('[markdown-vault] Article DOM extraction error:', e);
    window.__mvArticleDomResult = null;
  }
})();
