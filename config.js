'use strict';

require('dotenv').config({ quiet: true });

const API_VERSION = '1.0.0';
const API_PREFIX = '/api/v1';

const positiveInt = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// "false"/empty -> false, "1" -> 1 (number of proxy hops), anything else is passed
// to Express as-is (e.g. "loopback"). Never trust "all proxies" by accident:
// a spoofable X-Forwarded-For would let clients dodge the IP rate limit.
function parseTrustProxy(value) {
  if (value === undefined || value === '' || value === 'false') return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';
  return {
    nodeEnv,
    isProduction,
    port: positiveInt(env.PORT, 3000),
    version: API_VERSION,
    prefix: API_PREFIX,
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    rateLimit: {
      limit: positiveInt(env.RATE_LIMIT_MAX, 100),
      windowMs: positiveInt(env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
      ipCeiling: positiveInt(env.RATE_LIMIT_IP_CEILING, 1000),
    },
    // Demo tokens exist only outside production; in production nothing is valid
    // until real tokens are configured.
    tokens: {
      admin: env.ADMIN_API_TOKEN || (isProduction ? undefined : 'admin-token-123'),
      viewer: env.VIEWER_API_TOKEN || (isProduction ? undefined : 'viewer-token-123'),
    },
  };
}

module.exports = { loadConfig, API_VERSION, API_PREFIX };
