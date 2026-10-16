const logger = require('./logger');

/**
 * Simple in-memory rate limiter for customer messages.
 *
 * Without this, anyone can flood the admin group by hammering the bot.
 * State lives in memory only: a restart clears it, which is fine for
 * this use case.
 */
const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_PER_WINDOW = 15;   // messages allowed per customer per window
const MIN_GAP_MS = 700;      // minimum spacing between two messages

// customerId -> { count, windowStart, lastMessageAt, warnedAt }
const buckets = new Map();

// Keep the map from growing forever on a long-running process
const MAX_TRACKED = 5000;

/**
 * Record a customer message and report whether it should be forwarded.
 * @param {number} customerId - Telegram chat ID
 * @returns {{allowed: boolean, reason?: string, retryAfterSeconds?: number, shouldWarn: boolean}}
 */
function checkMessage(customerId) {
  const now = Date.now();

  if (buckets.size > MAX_TRACKED) {
    // Drop stale entries (older than 10 windows) rather than growing unbounded
    for (const [id, bucket] of buckets) {
      if (now - bucket.windowStart > WINDOW_MS * 10) {
        buckets.delete(id);
      }
    }
  }

  let bucket = buckets.get(customerId);

  if (!bucket) {
    bucket = { count: 0, windowStart: now, lastMessageAt: 0, warnedAt: 0 };
    buckets.set(customerId, bucket);
  }

  // Reset the window once it has elapsed
  if (now - bucket.windowStart >= WINDOW_MS) {
    bucket.count = 0;
    bucket.windowStart = now;
  }

  if (bucket.lastMessageAt && now - bucket.lastMessageAt < MIN_GAP_MS) {
    const waitMs = MIN_GAP_MS - (now - bucket.lastMessageAt);
    // Do not move lastMessageAt here: the customer's wait is measured from
    // their last accepted message, and pushing it back each time would make
    // the reported wait grow (or the gap never elapse under a message storm).
    return {
      allowed: false,
      reason: 'too_fast',
      retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)),
      shouldWarn: markWarned(bucket, now)
    };
  }

  if (bucket.count >= MAX_PER_WINDOW) {
    return {
      allowed: false,
      reason: 'rate_limited',
      retryAfterSeconds: Math.max(1, Math.ceil((WINDOW_MS - (now - bucket.windowStart)) / 1000)),
      shouldWarn: markWarned(bucket, now)
    };
  }

  bucket.count += 1;
  bucket.lastMessageAt = now;

  return { allowed: true, shouldWarn: false };
}

/**
 * Only tell the customer we are throttling them once per window, so the
 * warning itself cannot be used to flood their chat.
 */
function markWarned(bucket, now) {
  if (now - bucket.warnedAt > WINDOW_MS) {
    bucket.warnedAt = now;
    return true;
  }
  return false;
}

function reset(customerId) {
  if (customerId === undefined) {
    buckets.clear();
    return;
  }
  buckets.delete(customerId);
}

module.exports = {
  checkMessage,
  reset,
  WINDOW_MS,
  MAX_PER_WINDOW
};
