// Telegram Save Ack — session counter and dedup logic
// Dynamically imported by background.js when processing messages.

'use strict';

const SESSION_MAX_TRACKED_CHATS = 50;
const ACK_DEDUPE_MAX_KEYS = 500;
const ACK_DEDUPE_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const SESSION_CHAT_COUNTERS_KEY = 'session_chat_save_counts';
const SESSION_ACK_DEDUPE_KEY = 'session_ack_dedupe';
const _sessionFallback = {
  [SESSION_CHAT_COUNTERS_KEY]: {},
  [SESSION_ACK_DEDUPE_KEY]: {},
};

function getSessionStorageArea() {
  return chrome.storage.session || null;
}

async function getSessionState(key) {
  const area = getSessionStorageArea();
  if (!area) return _sessionFallback[key] || {};

  try {
    const data = await area.get([key]);
    return data[key] || {};
  } catch (err) {
    console.warn('[markdown-vault] session storage read failed:', err);
    return _sessionFallback[key] || {};
  }
}

async function setSessionState(key, value) {
  _sessionFallback[key] = value;
  const area = getSessionStorageArea();
  if (!area) return;

  try {
    await area.set({ [key]: value });
  } catch (err) {
    console.warn('[markdown-vault] session storage write failed:', err);
  }
}

async function incrementSessionSaveCount(chatId) {
  const chatKey = String(chatId);
  const now = Date.now();
  const counters = await getSessionState(SESSION_CHAT_COUNTERS_KEY);

  const current = counters[chatKey]?.count || 0;
  counters[chatKey] = { count: current + 1, touchedAt: now };

  const entries = Object.entries(counters);
  if (entries.length > SESSION_MAX_TRACKED_CHATS) {
    entries.sort((a, b) => (a[1]?.touchedAt || 0) - (b[1]?.touchedAt || 0));
    const over = entries.length - SESSION_MAX_TRACKED_CHATS;
    for (let i = 0; i < over; i++) {
      delete counters[entries[i][0]];
    }
  }

  await setSessionState(SESSION_CHAT_COUNTERS_KEY, counters);
  return counters[chatKey].count;
}

async function isSaveAckDuplicate(dedupeKey) {
  const now = Date.now();
  const dedupe = await getSessionState(SESSION_ACK_DEDUPE_KEY);
  let changed = false;

  for (const [key, ts] of Object.entries(dedupe)) {
    if (!ts || now - ts > ACK_DEDUPE_TTL_MS) {
      delete dedupe[key];
      changed = true;
    }
  }

  if (dedupe[dedupeKey]) {
    if (changed) await setSessionState(SESSION_ACK_DEDUPE_KEY, dedupe);
    return true;
  }

  dedupe[dedupeKey] = now;
  const entries = Object.entries(dedupe);
  if (entries.length > ACK_DEDUPE_MAX_KEYS) {
    entries.sort((a, b) => (a[1] || 0) - (b[1] || 0));
    const over = entries.length - ACK_DEDUPE_MAX_KEYS;
    for (let i = 0; i < over; i++) {
      delete dedupe[entries[i][0]];
    }
  }

  await setSessionState(SESSION_ACK_DEDUPE_KEY, dedupe);
  return false;
}

/**
 * @param {object} opts
 * @param {function} opts.telegramCall - telegramCall(token, method, params) from background.js
 */
export async function maybeSendSaveAck({ token, messageCtx, sendSaveAck, savedLabel, telegramCall }) {
  if (!sendSaveAck || !token || !messageCtx) return;
  if (messageCtx.source !== 'telegram') return;
  if (messageCtx.chat_id === undefined || messageCtx.update_id === undefined) return;

  const dedupeKey = `${messageCtx.chat_id}:${messageCtx.update_id}:${savedLabel || 'saved'}`;
  const duplicate = await isSaveAckDuplicate(dedupeKey);
  if (duplicate) return;

  const sessionCount = await incrementSessionSaveCount(messageCtx.chat_id);
  const ackText = `✅ Saved\n📊 Session saved count: ${sessionCount}`;

  const params = {
    chat_id: messageCtx.chat_id,
    text: ackText,
    disable_web_page_preview: true,
  };
  if (messageCtx.message_id !== undefined && messageCtx.message_id !== null) {
    params.reply_to_message_id = messageCtx.message_id;
  }

  try {
    await telegramCall(token, 'sendMessage', params);
  } catch (err) {
    console.warn('[markdown-vault] Failed to send save ack:', err);
  }
}
