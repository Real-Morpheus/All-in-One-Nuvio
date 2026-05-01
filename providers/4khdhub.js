'use strict';

// ── undici (built-in Node ≥18) for proxy-aware fetch ─────────────────────────
let undici_fetch, ProxyAgent;
try {
    const undici = require('undici');
    undici_fetch = undici.fetch;
    ProxyAgent   = undici.ProxyAgent;
    console.log('[ProxyManager] undici loaded — proxy support ENABLED');
} catch (e) {
    console.warn('[ProxyManager] undici not found — proxy support DISABLED, using direct fetch');
}

// ── Endpoints ─────────────────────────────────────────────────────────────────
const API_BASE = 'https://hdhub.thevolecitor.qzz.io';

const API_CONFIGS = [
    'eyJ0b3Jib3giOiJ1bnNldCIsInF1YWxpdGllcyI6IjIxNjBwLDEwODBwLDcyMHAsNDgwcCIsInNvcnQiOiJkZXNjIn0',
    'eyJ0b3Jib3giOiJ1bnNldCIsInF1YWxpdGllcyI6IjIxNjBwLDEwODBwLDcyMHAiLCJzb3J0IjoiZGVzYyJ9'
];

// ── User-Agent pool ────────────────────────────────────────────────────────────
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:115.0) Gecko/20100101 Firefox/115.0',
];
function randomUA() { return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]; }

const BASE_HEADERS = {
    'Accept':          'application/json, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer':         'https://web.stremio.com/',
    'Origin':          'https://web.stremio.com',
};

// ── Cache config ──────────────────────────────────────────────────────────────
const TTL_OK          = 15 * 60 * 1000;
const TTL_429         =  2 * 60 * 1000;
const TTL_ERROR       =  1 * 60 * 1000;
const TTL_STALE_GRACE = 30 * 60 * 1000;
const REFRESH_THRESH  = 0.80;

const cache    = new Map();
const inFlight = new Map();

function getCached(key) {
    const e = cache.get(key);
    if (!e) return { hit: false };
    const age = Date.now() - e.ts;
    if (age < e.ttl) {
        if (!e.refreshing && age > e.ttl * REFRESH_THRESH) e.refreshing = true;
        return { hit: true, val: e.val, stale: false };
    }
    if (age < TTL_STALE_GRACE && e.val) return { hit: true, val: e.val, stale: true };
    cache.delete(key);
    return { hit: false };
}
function setCached(key, val, ttl) {
    cache.set(key, { val, ts: Date.now(), ttl, refreshing: false });
}

// =============================================================================
//  PROXY POOL MANAGER
// =============================================================================
const PROXY_REFRESH_INTERVAL = 10 * 60 * 1000;  // refresh every 10 min
const MAX_PROXY_FAILS        = 3;                 // drop proxy after 3 consecutive fails
const PROXY_CONNECT_TIMEOUT  = 10000;             // 10s proxy connect timeout

let proxyPool       = [];   // [{ url: 'ip:port', fails: 0 }]
let proxyPoolTs     = 0;
let proxyIdx        = 0;
let proxyRefreshing = false;

/**
 * Fetch the proxy list from free-proxy-list.net.
 * Parses the textarea for the raw "ip:port" list and the HTML table
 * to identify HTTPS-capable proxies (preferred).
 */
async function fetchProxyList() {
    // Anonymous proxy page — higher quality, hides real IP from target servers
    const res = await fetch('https://free-proxy-list.net/en/anonymous-proxy.html', {
        credentials: 'omit',
        headers: {
            'User-Agent':                'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:148.0) Gecko/20100101 Firefox/148.0',
            'Accept':                    'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language':           'en-US,en;q=0.9',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest':            'document',
            'Sec-Fetch-Mode':            'navigate',
            'Sec-Fetch-Site':            'same-origin',
            'Sec-Fetch-User':            '?1',
            'Priority':                  'u=0, i',
            'Pragma':                    'no-cache',
            'Cache-Control':             'no-cache',
            'Referer':                   'https://free-proxy-list.net/',
        },
        signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) throw new Error(`free-proxy-list HTTP ${res.status}`);
    const html = await res.text();

    // Raw proxy list lives inside a <textarea>
    const taMatch = html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/);
    if (!taMatch) throw new Error('Proxy list textarea not found');

    const allProxies = taMatch[1]
        .split('\n')
        .map(l => l.trim())
        .filter(l => /^\d+\.\d+\.\d+\.\d+:\d+$/.test(l));

    // Identify HTTPS-capable proxies from the table column "Https"
    const httpsSet = new Set();
    const rowRe = /<tr><td>([\d.]+)<\/td><td>(\d+)<\/td>[\s\S]*?<td class='hx'>(yes|no)<\/td>/g;
    let m;
    while ((m = rowRe.exec(html)) !== null) {
        if (m[3] === 'yes') httpsSet.add(`${m[1]}:${m[2]}`);
    }

    // Prefer HTTPS proxies; fall back to full list if fewer than 10 HTTPS
    let chosen = allProxies.filter(p => httpsSet.has(p));
    if (chosen.length < 10) chosen = allProxies;

    // Shuffle for even distribution across instances
    for (let i = chosen.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [chosen[i], chosen[j]] = [chosen[j], chosen[i]];
    }

    return chosen.slice(0, 60);
}

async function refreshProxies() {
    if (proxyRefreshing) return;
    proxyRefreshing = true;
    try {
        const list = await fetchProxyList();
        proxyPool   = list.map(url => ({ url, fails: 0 }));
        proxyPoolTs = Date.now();
        proxyIdx    = 0;
        console.log(`[ProxyManager] Pool refreshed: ${proxyPool.length} anonymous proxies`);
    } catch (err) {
        console.warn(`[ProxyManager] Refresh failed: ${err.message}`);
    } finally {
        proxyRefreshing = false;
    }
}

/** Returns next healthy proxy (round-robin), or null if none available. */
function getNextProxy() {
    if (Date.now() - proxyPoolTs > PROXY_REFRESH_INTERVAL) {
        refreshProxies().catch(() => {});
    }
    const healthy = proxyPool.filter(p => p.fails < MAX_PROXY_FAILS);
    if (!healthy.length) return null;
    const p = healthy[proxyIdx % healthy.length];
    proxyIdx++;
    return p;
}

function markProxyFailed(proxy)  { if (proxy) proxy.fails++; }
function markProxySuccess(proxy) { if (proxy) proxy.fails = 0; }

// Kick off first proxy fetch at startup (non-blocking)
refreshProxies().catch(() => {});

// =============================================================================
//  HTTP FETCH — proxy-aware with automatic direct fallback
// =============================================================================

/**
 * Attempt the request via a rotating free proxy.
 * On any proxy error (network / timeout / 429) mark it failed and fall
 * back to a direct connection so the user always gets a response.
 */
async function httpGet(url, timeoutMs = 18000) {
    const headers = { ...BASE_HEADERS, 'User-Agent': randomUA() };

    if (ProxyAgent && undici_fetch) {
        const proxy = getNextProxy();
        if (proxy) {
            try {
                const dispatcher = new ProxyAgent({
                    uri:            `http://${proxy.url}`,
                    connectTimeout: PROXY_CONNECT_TIMEOUT,
                    bodyTimeout:    timeoutMs,
                    headersTimeout: timeoutMs,
                });
                const res = await undici_fetch(url, {
                    headers,
                    signal:     AbortSignal.timeout(timeoutMs),
                    dispatcher,
                });

                if (res.status === 429) {
                    markProxyFailed(proxy);
                    console.warn(`[ProxyManager] 429 via ${proxy.url} — falling back to direct`);
                    // fall through
                } else {
                    res.ok ? markProxySuccess(proxy) : markProxyFailed(proxy);
                    return res;
                }
            } catch (err) {
                markProxyFailed(proxy);
                console.warn(`[ProxyManager] ${proxy.url} error: ${err.message} — trying direct`);
                // fall through
            }
        }
    }

    // Direct (fallback or no proxy available)
    return fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
}

// ── Fetch raw data with retry + multi-config fallback ─────────────────────────
async function fetchRaw(idPart, type) {
    const errors = [];

    for (const config of API_CONFIGS) {
        const url = `${API_BASE}/${config}/stream/${type}/${idPart}.json`;
        console.log(`[HDHubAPI] -> ${url}`);

        for (let attempt = 0; attempt < 3; attempt++) {
            if (attempt > 0) {
                const delay = 1000 * attempt + Math.random() * 500;
                await new Promise(r => setTimeout(r, delay));
            }
            try {
                const res = await httpGet(url, 18000);

                if (res.ok) {
                    const data = await res.json();
                    console.log(`[HDHubAPI] OK ${res.status} config[${API_CONFIGS.indexOf(config)}] attempt ${attempt + 1}`);
                    return { ok: true, data, status: res.status };
                }

                if (res.status === 429) {
                    console.warn(`[HDHubAPI] 429 on attempt ${attempt + 1} — rotating to next config`);
                    errors.push(`config[${API_CONFIGS.indexOf(config)}] 429`);
                    break;
                }

                if (res.status >= 500) {
                    console.warn(`[HDHubAPI] ${res.status} server error attempt ${attempt + 1}`);
                    errors.push(`config[${API_CONFIGS.indexOf(config)}] HTTP ${res.status}`);
                    continue;
                }

                errors.push(`config[${API_CONFIGS.indexOf(config)}] HTTP ${res.status}`);
                break;

            } catch (err) {
                console.warn(`[HDHubAPI] fetch error attempt ${attempt + 1}: ${err.message}`);
                errors.push(err.message);
            }
        }
    }

    return { ok: false, errors };
}

// ── Deduplicated fetch ────────────────────────────────────────────────────────
function deduplicatedFetch(cacheKey, idPart, type) {
    if (inFlight.has(cacheKey)) {
        console.log(`[HDHubAPI] Joining in-flight request for ${cacheKey}`);
        return inFlight.get(cacheKey);
    }

    const promise = (async () => {
        try {
            const result = await fetchRaw(idPart, type);

            if (result.ok) {
                setCached(cacheKey, result.data, TTL_OK);
                return result.data;
            }

            const stale = cache.get(cacheKey);
            if (stale && stale.val) {
                console.warn(`[HDHubAPI] Serving STALE cache for ${cacheKey}`);
                stale.ts = Date.now() - stale.ttl * 0.5;
                return stale.val;
            }

            const emptyData   = { streams: [] };
            const errorStr    = (result.errors || []).join(', ');
            const isRateLimit = errorStr.includes('429');
            setCached(cacheKey, emptyData, isRateLimit ? TTL_429 : TTL_ERROR);
            console.warn(`[HDHubAPI] Cached empty (${isRateLimit ? '429 freeze' : 'error freeze'}) for ${cacheKey}`);
            return emptyData;

        } finally {
            inFlight.delete(cacheKey);
        }
    })();

    inFlight.set(cacheKey, promise);
    return promise;
}

// ── Parsers ───────────────────────────────────────────────────────────────────
function extractQuality(name) {
    const n = (name || '').toUpperCase();
    if (n.includes('4K') || n.includes('2160P')) return '4K';
    if (n.includes('1080P')) return '1080p';
    if (n.includes('720P'))  return '720p';
    if (n.includes('480P'))  return '480p';
    return 'HD';
}
function extractLang(description) {
    const d = (description || '').toLowerCase();
    if (d.includes('.multi.'))   return 'Multi';
    if (d.includes('.hindi.'))   return 'Hindi';
    if (d.includes('.english.')) return 'English';
    if (d.includes('.tamil.'))   return 'Tamil';
    if (d.includes('.telugu.'))  return 'Telugu';
    return 'Hindi';
}
function extractSize(description) {
    const m = (description || '').match(/💾\s*([\d.]+\s*[KMGT]B)/i);
    return m ? m[1].replace(/\s+/, '') : null;
}
function extractServer(description) {
    const parts = (description || '').split('|');
    if (parts.length > 1) return parts[parts.length - 1].trim();
    return 'Direct';
}

// ── Filtering ─────────────────────────────────────────────────────────────────
function isUnwanted(s) {
    const desc = (s.description || '').toLowerCase();
    const name = (s.name || '').toLowerCase();
    const url  = (s.url  || '').toLowerCase();
    if (desc.includes('[10gbps download only]'))  return true;
    if (name.includes('hubcdn') || desc.includes('[hls stream]')) return true;
    if (name.includes('[castle]'))                return true;
    if (url.includes('pixeldrain'))               return true;
    if (url.includes('googleusercontent.com'))    return true;
    if (url.includes('drive.google.com') || url.includes('googleapis.com')) return true;
    return false;
}

// ── Build stream object ───────────────────────────────────────────────────────
function buildStream(apiStream, providerName, isTv, season, episode) {
    if (isUnwanted(apiStream) || !apiStream.url) return null;
    const quality  = extractQuality(apiStream.name);
    const lang     = extractLang(apiStream.description);
    const size     = extractSize(apiStream.description);
    const server   = extractServer(apiStream.description);
    const epSuffix = (isTv && season != null && episode != null)
        ? ` S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
        : '';
    return {
        name:  `${providerName} (${lang}) - ${quality}`,
        title: `${epSuffix.trim()}${size ? ` [${size}]` : ''} · ${server}`.trim(),
        url:   apiStream.url,
        behaviorHints: {
            notWebReady: true,
            ...(apiStream.behaviorHints || {}),
            bingeGroup: providerName.toLowerCase().replace(/\s+/g, '') + '-' + quality
        }
    };
}

// ── Main export (only 4KHDHub streams) ────────────────────────────────────────
/**
 * getStreams(imdbId, mediaType, season, episode)
 * @param {string} imdbId   – e.g. "tt0133093" (The Matrix)
 * @param {string} mediaType – "movie" or "tv"/"series"
 * @param {number} season
 * @param {number} episode
 * @returns {Promise<Array>}   – array of 4KHDHub stream objects
 */
async function getStreams(imdbId, mediaType, season, episode) {
    const isTv     = mediaType === 'tv' || mediaType === 'series';
    const type     = isTv ? 'series' : 'movie';
    const se       = isTv ? (season  || 1) : 0;
    const ep       = isTv ? (episode || 1) : 0;
    const cacheKey = `4khdhub:${imdbId}:${type}:${se}:${ep}`;

    const { hit, val, stale } = getCached(cacheKey);
    if (hit && !stale) {
        console.log(`[4KHDHub] Cache HIT ${cacheKey}`);
        return buildResults(val, isTv, se, ep);
    }

    const idPart = isTv ? `${imdbId}%3A${se}%3A${ep}` : imdbId;

    if (hit && stale) {
        console.log(`[4KHDHub] Stale cache HIT — returning stale, refreshing background`);
        deduplicatedFetch(cacheKey, idPart, type).catch(() => {});
        return buildResults(val, isTv, se, ep);
    }

    const rawData = await deduplicatedFetch(cacheKey, idPart, type);
    return buildResults(rawData, isTv, se, ep);
}

function buildResults(rawData, isTv, season, episode) {
    const allStreams = (rawData && rawData.streams) || [];
    const khdhub = [];

    for (const s of allStreams) {
        // Keep only streams starting with '4KHDHub'
        if (!s.name || !s.name.startsWith('4KHDHub')) continue;
        if (isUnwanted(s)) continue;
        const built = buildStream(s, '4KHDHub', isTv, season, episode);
        if (built) khdhub.push(built);
    }

    console.log(`[4KHDHub] Total streams: ${khdhub.length}`);
    return khdhub;
}

module.exports = { getStreams };
