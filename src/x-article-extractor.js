// X/Twitter Article & Note Tweet extraction via GraphQL API
// Injected into x.com tab via chrome.scripting.executeScript({ files: [...] })
// Communicates result back by setting window.__mvArticleResult

(async () => {
  try {
    const articleIdMatch = window.location.pathname.match(/\/(?:i\/)?article\/(\d+)/);
    const tweetIdMatch = window.location.pathname.match(/\/status(?:es)?\/(\d+)/);
    const isArticlePage = !!articleIdMatch;
    const id = (articleIdMatch && articleIdMatch[1]) || (tweetIdMatch && tweetIdMatch[1]);
    if (!id) { window.__mvArticleResult = null; return; }

    // X.com CSRF Cookie
    const getCookie = (name) => {
      const v = document.cookie.match('(^|;) ?' + name + '=([^;]*)(;|$)');
      return v ? v[2] : null;
    };
    const ct0 = getCookie('ct0');
    if (!ct0) { window.__mvArticleResult = null; return; }

    const bearer = "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

    const apiHeaders = {
      'authorization': bearer,
      'x-csrf-token': ct0,
      'x-twitter-active-user': 'yes',
      'x-twitter-client-language': 'en',
      'x-twitter-auth-type': 'OAuth2Session',
      'accept': 'application/json'
    };

    const features = {
      "creator_subscriptions_tweet_preview_api_enabled": true,
      "articles_preview_enabled": true,
      "responsive_web_twitter_article_tweet_consumption_enabled": true,
      "tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled": true,
      "longform_notetweets_rich_text_read_enabled": true,
      "longform_notetweets_inline_media_enabled": true,
      "responsive_web_graphql_skip_user_profile_image_extensions_enabled": false,
      "responsive_web_graphql_timeline_navigation_enabled": true,
      "responsive_web_profile_redirect_enabled": true,
      "rweb_tipjar_consumption_enabled": true,
      "profile_label_improvements_pcf_label_in_post_enabled": true
    };

    const fieldToggles = {
      "withArticleRichContentState": true,
      "withArticlePlainText": true,
      "withPayments": true,
      "withAuxiliaryUserLabels": true
    };

    // Try fetching TweetResultByRestId first as it can contain the article
    const tweetUrl = new URL('https://x.com/i/api/graphql/HJ9lpOL-ZlOk5CkCw0JW6Q/TweetResultByRestId');
    tweetUrl.searchParams.set('variables', JSON.stringify({
      tweetId: id, withCommunity: false, includePromotedContent: false, withVoice: true
    }));
    tweetUrl.searchParams.set('features', JSON.stringify(features));
    tweetUrl.searchParams.set('fieldToggles', JSON.stringify(fieldToggles));

    let res = await fetch(tweetUrl.toString(), { headers: apiHeaders });
    if (!res.ok) { window.__mvArticleResult = null; return; }
    let data = await res.json();

    let article = null;
    let result = data?.data?.tweetResult?.result || data?.data?.tweet_result?.result || data?.data?.tweet_result;
    if (result?.__typename === 'TweetWithVisibilityResults') result = result.tweet;

    // Check all known paths for article data in the tweet result
    article = result?.article?.article_results?.result
      || result?.legacy?.article_results?.result
      || result?.article?.result
      || result?.legacy?.article?.result
      || result?.legacy?.article?.article_results?.result
      || result?.article_results?.result;

    // If article not found directly, try extracting article ID from tweet URLs
    if (!article) {
      let articleRestId = null;

      const noteUrls = result?.note_tweet?.note_tweet_results?.result?.entity_set?.urls || [];
      for (const u of noteUrls) {
        const expanded = u.expanded_url || u.url || '';
        const m = expanded.match(/\/(?:i\/)?article\/(\d+)/);
        if (m) { articleRestId = m[1]; break; }
      }

      if (!articleRestId) {
        const legacyUrls = result?.legacy?.entities?.urls || [];
        for (const u of legacyUrls) {
          const expanded = u.expanded_url || u.url || '';
          const m = expanded.match(/\/(?:i\/)?article\/(\d+)/);
          if (m) { articleRestId = m[1]; break; }
        }
      }

      if (!articleRestId && isArticlePage) {
        articleRestId = id;
      }

      if (articleRestId) {
        const articleUrl = new URL('https://x.com/i/api/graphql/id8pHQbQi7eZ6P9mA1th1Q/ArticleEntityResultByRestId');
        articleUrl.searchParams.set('variables', JSON.stringify({ articleEntityId: articleRestId }));
        articleUrl.searchParams.set('features', JSON.stringify(features));
        articleUrl.searchParams.set('fieldToggles', JSON.stringify(fieldToggles));
        res = await fetch(articleUrl.toString(), { headers: apiHeaders });
        if (res.ok) {
          data = await res.json();
          article = data?.data?.article_result_by_rest_id?.result
            || data?.data?.article_result_by_rest_id
            || data?.data?.article_entity_result?.result;
        }
      }
    }

    // Check for long-form Note Tweets
    if (!article) {
      const noteTweet = result?.note_tweet?.note_tweet_results?.result;
      if (noteTweet) {
        const fullText = noteTweet.text || '';
        if (!fullText) { window.__mvArticleResult = null; return; }

        const user = result?.core?.user_results?.result?.legacy || {};
        const authorName = user.name || '';
        const authorHandle = user.screen_name || '';

        let content = '';
        const richtext = noteTweet.richtext;
        if (richtext && richtext.tags && richtext.tags.length > 0) {
          const sortedTags = [...richtext.tags].sort((a, b) => b.from_index - a.from_index);
          const chars = [...fullText];
          for (const tag of sortedTags) {
            const from = tag.from_index;
            const to = tag.to_index;
            const types = Array.isArray(tag.richtext_types) ? tag.richtext_types : [];
            if (types.includes('Bold') && types.includes('Italic')) {
              chars.splice(to, 0, '***');
              chars.splice(from, 0, '***');
            } else if (types.includes('Bold')) {
              chars.splice(to, 0, '**');
              chars.splice(from, 0, '**');
            } else if (types.includes('Italic')) {
              chars.splice(to, 0, '*');
              chars.splice(from, 0, '*');
            }
          }
          content = chars.join('');
        } else {
          content = fullText;
        }

        const legacyMedia = result?.legacy?.extended_entities?.media || result?.legacy?.entities?.media || [];
        const mediaMarkdown = legacyMedia
          .map(m => {
            if (m.type === 'video' || m.type === 'animated_gif') {
              const variants = m.video_info?.variants || [];
              const best = variants.filter(v => v.content_type === 'video/mp4').sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
              return best ? `[Video](${best.url})` : null;
            }
            return m.media_url_https ? `![](${m.media_url_https}?name=orig)` : null;
          })
          .filter(Boolean);

        if (mediaMarkdown.length > 0) {
          content += '\n\n' + mediaMarkdown.join('\n');
        }

        const firstLine = content.split('\n').find(l => l.trim()) || '';
        const title = firstLine.replace(/[*#>\-]/g, '').trim().substring(0, 100) || `Note by @${authorHandle}`;

        const header = [];
        if (authorName || authorHandle) {
          const who = authorName && authorHandle
            ? `${authorName} (@${authorHandle})`
            : authorHandle ? `@${authorHandle}` : authorName;
          header.push(`**Author:** ${who}`);
        }
        header.push('');

        window.__mvArticleResult = {
          title,
          content: header.join('\n') + '\n' + content.trim(),
          markdownReady: true
        };
        return;
      }
      window.__mvArticleResult = null;
      return;
    }

    // Found an Article Payload. Format natively.
    const title = typeof article.title === 'string' ? article.title.trim() : '';
    const blocks = article.content_state?.blocks || [];
    if (!blocks.length && !article.plain_text && !article.preview_text) {
      window.__mvArticleResult = null;
      return;
    }

    let content = '';
    if (blocks.length > 0) {
      const lines = [];
      let inCodeBlock = false;
      for (const b of blocks) {
        const text = (b.text || '').replace(/\s+$/, '');
        if (!text) { lines.push(''); continue; }
        const type = b.type || 'unstyled';

        if (type === 'code-block') {
          if (!inCodeBlock) { lines.push('```'); inCodeBlock = true; }
          lines.push(text);
        } else {
          if (inCodeBlock) { lines.push('```'); inCodeBlock = false; }
          if (type.startsWith('header-')) {
            const level = { 'header-one': 1, 'header-two': 2, 'header-three': 3, 'header-four': 4 }[type] || 1;
            lines.push('#'.repeat(level) + ' ' + text);
          } else if (type === 'unordered-list-item') {
            lines.push('- ' + text);
          } else if (type === 'ordered-list-item') {
            lines.push('1. ' + text);
          } else if (type === 'blockquote') {
            lines.push('> ' + text.replace(/\n/g, '\n> '));
          } else if (!/^XIMGPH_\d+$/.test(text.trim())) {
            lines.push(text);
          }
        }
      }
      if (inCodeBlock) lines.push('```');
      content = lines.join('\n\n').replace(/\n{3,}/g, '\n\n');
    } else if (article.plain_text) {
      content = article.plain_text;
    } else if (article.preview_text) {
      content = article.preview_text;
    }

    // Look for Media
    const mediaObj = {};
    const mediaList = [];
    for (const media of (article.media_entities || [])) {
      let url = media.media_info?.original_img_url;
      if (!url) {
        const variants = media.media_info?.variants || [];
        const mp4 = variants.filter(v => v.content_type?.includes('video')).sort((a, b) => (b.bit_rate || 0) - (a.bit_rate || 0))[0];
        url = mp4?.url || variants[0]?.url;
      }
      if (url && media.media_id) mediaObj[media.media_id] = url;
    }

    for (const key in article.content_state?.entityMap || {}) {
      const e = article.content_state.entityMap[key];
      if (e && e.value && (e.value.type === 'IMAGE' || e.value.type === 'MEDIA')) {
        const mediaItems = e.value.data?.mediaItems || [];
        for (const m of mediaItems) {
          const id = m.mediaId || m.media_id;
          if (id && mediaObj[id]) mediaList.push(mediaObj[id]);
        }
      }
    }

    if (mediaList.length > 0) {
      content += '\n\n## Media\n\n' + [...new Set(mediaList)].map(u => `![](${u})`).join('\n');
    }

    window.__mvArticleResult = {
      title: title || 'X Article',
      content: content.trim(),
      markdownReady: true
    };
  } catch (e) {
    window.__mvArticleResult = null;
  }
})();
