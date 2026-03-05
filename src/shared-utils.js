// Shared utility functions used by background.js and handler modules.
// This module has no dependencies on background.js state.

'use strict';

// ─── Sanitization ────────────────────────────────────────────────────────────
export function sanitizeUrlForDisplay(url) {
  try {
    const u = new URL(url);
    if (u.username || u.password) {
      u.username = '***';
      u.password = '***';
    }
    return u.toString();
  } catch { return url; }
}

export function sanitizeTitle(title) {
  return (title || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Slugify / Date / Filenames ──────────────────────────────────────────────
export function slugify(text, maxLen = 60) {
  return (text || 'untitled')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen) || 'untitled';
}

function pad2(num) {
  return String(num).padStart(2, '0');
}

export function dateString(date = new Date()) {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  return `${year}-${month}-${day}`;
}

export function localIsoString(date = new Date()) {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hours = pad2(date.getHours());
  const minutes = pad2(date.getMinutes());
  const seconds = pad2(date.getSeconds());

  const tzOffsetMins = -date.getTimezoneOffset();
  const tzSign = tzOffsetMins >= 0 ? '+' : '-';
  const tzAbs = Math.abs(tzOffsetMins);
  const tzHours = pad2(Math.floor(tzAbs / 60));
  const tzMinutes = pad2(tzAbs % 60);

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${tzSign}${tzHours}:${tzMinutes}`;
}

export function buildFilename(title, pattern, date) {
  const slug = slugify(title);
  const d = date || dateString();
  switch (pattern) {
    case 'slug-YYYY-MM-DD': return `${slug}-${d}.md`;
    case 'slug': return `${slug}.md`;
    case 'YYYY-MM-DD-slug':
    default: return `${d}-${slug}.md`;
  }
}

// ─── Markdown Building ───────────────────────────────────────────────────────
export function buildFrontmatter(fields) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === 'string') {
      const escaped = v
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '');
      lines.push(`${k}: "${escaped}"`);
    } else {
      lines.push(`${k}: ${v}`);
    }
  }
  lines.push('---', '');
  return lines.join('\n');
}

export function escapeMarkdownHeading(text) {
  return (text || '').replace(/([\\`*_{}[\]()#+\-.!|~>])/g, '\\$&');
}

// ─── File System Helpers ─────────────────────────────────────────────────────
export async function writeFile(fileHandle, content) {
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

export async function readFile(fileHandle) {
  const file = await fileHandle.getFile();
  return file.text();
}

export async function getUniqueFileHandle(dirHandle, filename) {
  const ext = filename.endsWith('.md') ? '.md' : '';
  const base = ext ? filename.slice(0, -3) : filename;

  try {
    await dirHandle.getFileHandle(filename, { create: false });
    for (let i = 2; i <= 99; i++) {
      const candidate = `${base}-${i}${ext}`;
      try {
        await dirHandle.getFileHandle(candidate, { create: false });
      } catch {
        return dirHandle.getFileHandle(candidate, { create: true });
      }
    }
  } catch {
    return dirHandle.getFileHandle(filename, { create: true });
  }

  return dirHandle.getFileHandle(`${base}-${Date.now()}${ext}`, { create: true });
}

export async function saveMarkdownFile(dirHandle, filename, content) {
  const fileHandle = await getUniqueFileHandle(dirHandle, filename);
  await writeFile(fileHandle, content);
  return fileHandle.name;
}

export async function appendToDaily(dirHandle, content, date) {
  const filename = `${date}.md`;
  let existing = '';

  try {
    const fh = await dirHandle.getFileHandle(filename, { create: false });
    existing = await readFile(fh);
  } catch {
    // File doesn't exist yet
  }

  const separator = existing ? '\n\n---\n\n' : '';
  const newContent = existing + separator + content;

  const fh = await dirHandle.getFileHandle(filename, { create: true });
  await writeFile(fh, newContent);
}

export async function saveImageToFolder(dirHandle, date, filename, arrayBuffer) {
  let dayDir;
  try {
    dayDir = await dirHandle.getDirectoryHandle(date, { create: true });
  } catch {
    dayDir = dirHandle;
  }

  const fh = await dayDir.getFileHandle(filename, { create: true });
  const writable = await fh.createWritable();
  await writable.write(arrayBuffer);
  await writable.close();
  return `${date}/${filename}`;
}

// ─── Offscreen Document ──────────────────────────────────────────────────────
async function ensureOffscreen() {
  if (typeof chrome.offscreen.hasDocument === 'function') {
    const has = await chrome.offscreen.hasDocument();
    if (has) return;
  }

  try {
    await chrome.offscreen.createDocument({
      url: 'pages/offscreen/offscreen.html',
      reasons: ['DOM_PARSER'],
      justification: 'Parse HTML with Readability for article extraction',
    });
  } catch (e) {
    if (!e.message?.includes('single offscreen') && !e.message?.includes('already')) {
      throw e;
    }
  }
}

export async function offscreenMessage(payload) {
  await ensureOffscreen();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Offscreen timeout')), 30000);

    chrome.runtime.sendMessage(
      { target: 'offscreen', ...payload },
      response => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response?.success) {
          resolve(response);
        } else {
          reject(new Error(response?.error || 'Offscreen operation failed'));
        }
      }
    );
  });
}

export async function parseHtmlViaOffscreen(html, url, useGFM) {
  return offscreenMessage({ type: 'parse_html', html, url, useGFM });
}

export async function convertHtmlToMarkdown(title, html, url, useGFM) {
  return offscreenMessage({ type: 'convert_html', title, html, url, useGFM });
}
