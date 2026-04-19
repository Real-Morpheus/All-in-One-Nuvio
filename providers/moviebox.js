// MovieBox Scraper for Nuvio
// Updated from Kotlin source - Compatible with Nuvio's JS environment (Hermes)
// Uses crypto-js and fetch

const CryptoJS = require('crypto-js');

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE = "https://api3.aoneroom.com";
const TMDB_API_KEY = 'd131017ccc6e5462a81c9304d21476de';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// Double-decoded secret keys (Base64 → UTF-8 String → Base64 WordArray)
const KEY_B64_DEFAULT = "NzZpUmwwN3MweFNOOWpxbUVXQXQ3OUVCSlp1bElRSXNWNjRGWnIyTw==";
const KEY_B64_ALT     = "WHFuMm5uTzQxL0w5Mm8xaXVYaFNMSFRiWHZZNFo1Wlo2Mm04bVNMQQ==";

const SECRET_KEY_DEFAULT = CryptoJS.enc.Base64.parse(
    CryptoJS.enc.Base64.parse(KEY_B64_DEFAULT).toString(CryptoJS.enc.Utf8)
);
const SECRET_KEY_ALT = CryptoJS.enc.Base64.parse(
    CryptoJS.enc.Base64.parse(KEY_B64_ALT).toString(CryptoJS.enc.Utf8)
);

// ─── Device / Brand Spoofing (matches Kotlin) ─────────────────────────────────

function generateDeviceId() {
    let id = '';
    const hex = '0123456789abcdef';
    for (let i = 0; i < 32; i++) id += hex[Math.floor(Math.random() * 16)];
    return id;
}

const DEVICE_ID = generateDeviceId();

const BRAND_MODELS = {
    Samsung:  ['SM-S918B', 'SM-A528B', 'SM-M336B'],
    Xiaomi:   ['2201117TI', 'M2012K11AI', 'Redmi Note 11'],
    OnePlus:  ['LE2111', 'CPH2449', 'IN2023'],
    Google:   ['Pixel 6', 'Pixel 7', 'Pixel 8'],
    Realme:   ['RMX3085', 'RMX3360', 'RMX3551'],
};

function randomBrandModel() {
    const brands = Object.keys(BRAND_MODELS);
    const brand = brands[Math.floor(Math.random() * brands.length)];
    const models = BRAND_MODELS[brand];
    const model = models[Math.floor(Math.random() * models.length)];
    return { brand, model };
}

// ─── Crypto Helpers ───────────────────────────────────────────────────────────

function md5Hex(input) {
    // input: CryptoJS WordArray or plain string
    return CryptoJS.MD5(input).toString(CryptoJS.enc.Hex);
}

function hmacMd5Base64(key, data) {
    return CryptoJS.HmacMD5(data, key).toString(CryptoJS.enc.Base64);
}

// ─── Token Generation ─────────────────────────────────────────────────────────

/**
 * Mirrors Kotlin's generateXClientToken:
 * timestamp → reverse → MD5 → "timestamp,hash"
 */
function generateXClientToken(timestamp) {
    const ts = String(timestamp || Date.now());
    const reversed = ts.split('').reverse().join('');
    const hash = md5Hex(reversed);
    return `${ts},${hash}`;
}

/**
 * Mirrors Kotlin's buildCanonicalString:
 * METHOD\naccept\ncontentType\nbodyLength\ntimestamp\nbodyHash\npath[?sortedQuery]
 */
function buildCanonicalString(method, accept, contentType, url, body, timestamp) {
    let path = '';
    let query = '';

    try {
        const u = new URL(url);
        path = u.pathname;
        const keys = Array.from(u.searchParams.keys()).sort();
        if (keys.length > 0) {
            query = keys.map(k =>
                u.searchParams.getAll(k).map(v => `${k}=${v}`).join('&')
            ).join('&');
        }
    } catch (e) {
        // Fallback: treat url as path
        path = url;
    }

    const canonicalUrl = query ? `${path}?${query}` : path;

    let bodyHash = '';
    let bodyLength = '';

    if (body) {
        const bodyWords = CryptoJS.enc.Utf8.parse(body);
        const totalBytes = bodyWords.sigBytes;

        if (totalBytes > 102400) {
            // Trim to 102400 bytes (matches Kotlin copyOfRange(0, 102400))
            const wordCount = Math.ceil(102400 / 4);
            const trimmed = CryptoJS.lib.WordArray.create(
                bodyWords.words.slice(0, wordCount),
                102400
            );
            bodyHash = md5Hex(trimmed);
            bodyLength = '102400';
        } else {
            bodyHash = md5Hex(bodyWords);
            bodyLength = String(totalBytes);
        }
    }

    return `${method.toUpperCase()}\n` +
        `${accept || ''}\n` +
        `${contentType || ''}\n` +
        `${bodyLength}\n` +
        `${timestamp}\n` +
        `${bodyHash}\n` +
        canonicalUrl;
}

/**
 * Mirrors Kotlin's generateXTrSignature.
 * Note: POST uses contentType "application/json; charset=utf-8"
 *       GET  uses contentType "application/json"
 *       Subtitle endpoints use "" for both accept and contentType
 */
function generateXTrSignature(method, accept, contentType, url, body = null, useAltKey = false, customTimestamp = null) {
    const timestamp = customTimestamp || Date.now();
    const canonical = buildCanonicalString(method, accept, contentType, url, body, timestamp);
    const secret = useAltKey ? SECRET_KEY_ALT : SECRET_KEY_DEFAULT;
    const sig = hmacMd5Base64(secret, canonical);
    return `${timestamp}|2|${sig}`;
}

// ─── Client-Info Builders ─────────────────────────────────────────────────────

/**
 * Main app headers (com.community.mbox.in) — used for search, home, subject GET.
 */
function buildMboxClientInfo(brand, model) {
    return JSON.stringify({
        package_name: "com.community.mbox.in",
        version_name: "3.0.03.0529.03",
        version_code: 50020042,
        os: "android",
        os_version: "16",
        device_id: DEVICE_ID,
        install_store: "ps",
        gaid: "d7578036d13336cc",
        brand: "google",
        model: "sdk_gphone64_x86_64",
        system_language: "en",
        net: "NETWORK_WIFI",
        region: "IN",
        timezone: "Asia/Calcutta",
        sp_code: ""
    });
}

/**
 * Play app headers (com.community.oneroom) — used for play-info and subtitles.
 * Note: Kotlin intentionally swaps brand/model fields here.
 */
function buildOneroomClientInfo(brand, model) {
    return JSON.stringify({
        package_name: "com.community.oneroom",
        version_name: "3.0.13.0325.03",
        version_code: 50020088,
        os: "android",
        os_version: "13",
        install_ch: "ps",
        device_id: DEVICE_ID,
        install_store: "ps",
        gaid: "1b2212c1-dadf-43c3-a0c8-bd6ce48ae22d",
        brand: model,   // intentionally swapped to match Kotlin
        model: brand,
        system_language: "en",
        net: "NETWORK_WIFI",
        region: "US",
        timezone: "Asia/Calcutta",
        sp_code: "",
        "X-Play-Mode": "1",
        "X-Idle-Data": "1",
        "X-Family-Mode": "0",
        "X-Content-Mode": "0"
    });
}

// ─── Header Factories ─────────────────────────────────────────────────────────

function makeMboxGetHeaders(url, timestamp) {
    const ts = timestamp || Date.now();
    const xClientToken = generateXClientToken(ts);
    const xTrSignature = generateXTrSignature('GET', 'application/json', 'application/json', url, null, false, ts);
    const { brand, model } = randomBrandModel();
    return {
        'User-Agent': `com.community.mbox.in/50020042 (Linux; U; Android 16; en_IN; sdk_gphone64_x86_64; Build/BP22.250325.006; Cronet/133.0.6876.3)`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Connection': 'keep-alive',
        'x-client-token': xClientToken,
        'x-tr-signature': xTrSignature,
        'x-client-info': buildMboxClientInfo(brand, model),
        'x-client-status': '0',
    };
}

function makeMboxPostHeaders(url, body, timestamp) {
    const ts = timestamp || Date.now();
    const xClientToken = generateXClientToken(ts);
    // POST signature uses "application/json; charset=utf-8" as contentType
    const xTrSignature = generateXTrSignature('POST', 'application/json', 'application/json; charset=utf-8', url, body, false, ts);
    const { brand, model } = randomBrandModel();
    return {
        'User-Agent': `com.community.mbox.in/50020042 (Linux; U; Android 16; en_IN; sdk_gphone64_x86_64; Build/BP22.250325.006; Cronet/133.0.6876.3)`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Connection': 'keep-alive',
        'x-client-token': xClientToken,
        'x-tr-signature': xTrSignature,
        'x-client-info': buildMboxClientInfo(brand, model),
        'x-client-status': '0',
    };
}

function makeOneroomGetHeaders(url, timestamp, token = null) {
    const ts = timestamp || Date.now();
    const { brand, model } = randomBrandModel();
    const xClientToken = generateXClientToken(ts);
    const xTrSignature = generateXTrSignature('GET', 'application/json', 'application/json', url, null, false, ts);
    const headers = {
        'User-Agent': `com.community.oneroom/50020088 (Linux; U; Android 13; en_US; ${brand}; Build/TQ3A.230901.001; Cronet/145.0.7582.0)`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Connection': 'keep-alive',
        'x-client-token': xClientToken,
        'x-tr-signature': xTrSignature,
        'x-client-info': buildOneroomClientInfo(brand, model),
        'x-client-status': '0',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
}

/**
 * Subtitle endpoint headers — accept/contentType are empty strings (matches Kotlin).
 */
function makeSubtitleHeaders(url, timestamp, token = null) {
    const ts = timestamp || Date.now();
    const { brand, model } = randomBrandModel();
    const xClientToken = generateXClientToken(ts);
    // Kotlin passes "" for both accept and contentType for subtitle calls
    const xTrSignature = generateXTrSignature('GET', '', '', url, null, false, ts);
    const mboxInfo = JSON.stringify({
        package_name: "com.community.mbox.in",
        version_name: "3.0.03.0529.03",
        version_code: 50020042,
        os: "android",
        os_version: "16",
        device_id: DEVICE_ID,
        install_store: "ps",
        gaid: "d7578036d13336cc",
        brand: "google",
        model: brand,
        system_language: "en",
        net: "NETWORK_WIFI",
        region: "IN",
        timezone: "Asia/Calcutta",
        sp_code: ""
    });
    const headers = {
        'User-Agent': `com.community.mbox.in/50020042 (Linux; U; Android 16; en_IN; ${brand}; Build/BP22.250325.006; Cronet/133.0.6876.3)`,
        'Accept': '',
        'Content-Type': '',
        'x-client-token': xClientToken,
        'x-tr-signature': xTrSignature,
        'x-client-info': mboxInfo,
        'X-Client-Status': '0',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
}

// ─── Low-level Fetch Helpers ──────────────────────────────────────────────────

function safeFetch(url, options) {
    return fetch(url, options)
        .then(res => {
            return res.text().then(text => {
                let json = null;
                try { json = JSON.parse(text); } catch (_) { }
                return { ok: res.ok, status: res.status, headers: res.headers, json, text };
            });
        })
        .catch(() => null);
}

function getJson(url, headers) {
    return safeFetch(url, { method: 'GET', headers })
        .then(r => (r && r.ok ? r.json : null));
}

function postJson(url, body, headers) {
    return safeFetch(url, { method: 'POST', headers, body })
        .then(r => (r && r.ok ? r.json : null));
}

// ─── TMDB Helpers ─────────────────────────────────────────────────────────────

function fetchTmdbDetails(tmdbId, mediaType) {
    const url = `${TMDB_BASE_URL}/${mediaType}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;
    return fetch(url)
        .then(r => r.json())
        .then(data => ({
            title: mediaType === 'movie'
                ? (data.title || data.original_title)
                : (data.name || data.original_name),
            year: (data.release_date || data.first_air_date || '').substring(0, 4),
            imdbId: data.external_ids && data.external_ids.imdb_id,
            originalTitle: data.original_title || data.original_name || '',
        }))
        .catch(() => null);
}

// ─── Title Normalization ──────────────────────────────────────────────────────

function normalizeTitle(s) {
    if (!s) return '';
    return s
        .replace(/\[.*?\]/g, ' ')
        .replace(/\(.*?\)/g, ' ')
        .replace(/\b(dub|dubbed|hd|4k|hindi|tamil|telugu|dual audio)\b/gi, ' ')
        .trim()
        .toLowerCase()
        .replace(/:/g, ' ')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// ─── Search ───────────────────────────────────────────────────────────────────

function searchMovieBox(query, page = 1) {
    const url = `${API_BASE}/wefeed-mobile-bff/subject-api/search/v2`;
    const body = JSON.stringify({ page, perPage: 20, keyword: query });
    const headers = makeMboxPostHeaders(url, body);

    return postJson(url, body, headers).then(res => {
        if (!res || !res.data || !res.data.results) return [];
        let subjects = [];
        res.data.results.forEach(group => {
            if (group.subjects) subjects = subjects.concat(group.subjects);
        });
        return subjects;
    }).catch(() => []);
}

function findBestMatch(subjects, tmdbTitle, tmdbYear, mediaType) {
    const normTarget = normalizeTitle(tmdbTitle);
    const targetType = mediaType === 'movie' ? 1 : 2;

    let bestMatch = null;
    let bestScore = 0;

    for (const subject of subjects) {
        if (subject.subjectType !== targetType) continue;

        const normTitle = normalizeTitle(subject.title || '');
        const year = subject.year ||
            (subject.releaseDate ? subject.releaseDate.substring(0, 4) : null);

        let score = 0;
        if (normTitle === normTarget) score += 50;
        else if (normTitle.includes(normTarget) || normTarget.includes(normTitle)) score += 15;

        if (tmdbYear && year && String(tmdbYear) === String(year)) score += 35;

        if (score > bestScore) {
            bestScore = score;
            bestMatch = subject;
        }
    }

    return bestScore >= 40 ? bestMatch : null;
}

// ─── Quality / Format Helpers ─────────────────────────────────────────────────

function getHighestQuality(resolutions) {
    const order = ['2160', '1440', '1080', '720', '480', '360', '240'];
    const s = String(resolutions || '');
    for (const q of order) {
        if (s.includes(q)) return parseInt(q, 10);
    }
    return 0;
}

function getFormatType(url, format) {
    const u = String(url || '').toLowerCase();
    const f = String(format || '').toLowerCase();
    if (u.startsWith('magnet:')) return 'MAGNET';
    if (u.endsWith('.torrent')) return 'TORRENT';
    if (u.includes('.mpd')) return 'DASH';
    if (f === 'hls' || u.includes('.m3u8')) return 'HLS';
    if (u.includes('.mp4') || u.includes('.mkv')) return 'VIDEO';
    return 'VIDEO';
}

// ─── Subtitle Fetching ────────────────────────────────────────────────────────

/**
 * Mirrors Kotlin's two subtitle endpoints:
 *  1. get-stream-captions?subjectId=&streamId=
 *  2. get-ext-captions?subjectId=&resourceId=&episode=0
 */
function fetchSubtitles(subjectId, streamId, token, langLabel) {
    const subtitles = [];

    const sub1Url = `${API_BASE}/wefeed-mobile-bff/subject-api/get-stream-captions?subjectId=${subjectId}&streamId=${streamId}`;
    const sub2Url = `${API_BASE}/wefeed-mobile-bff/subject-api/get-ext-captions?subjectId=${subjectId}&resourceId=${streamId}&episode=0`;

    const p1 = getJson(sub1Url, makeSubtitleHeaders(sub1Url, Date.now(), token))
        .then(res => {
            const caps = res && res.data && res.data.extCaptions;
            if (Array.isArray(caps)) {
                caps.forEach(c => {
                    const url = c.url;
                    const lang = c.language || c.lanName || c.lan || 'Unknown';
                    if (url) subtitles.push({ url, lang: `${lang} (${langLabel})` });
                });
            }
        }).catch(() => {});

    const p2 = getJson(sub2Url, makeSubtitleHeaders(sub2Url, Date.now(), token))
        .then(res => {
            const caps = res && res.data && res.data.extCaptions;
            if (Array.isArray(caps)) {
                caps.forEach(c => {
                    const url = c.url;
                    const lang = c.lan || c.lanName || c.language || 'Unknown';
                    if (url) subtitles.push({ url, lang: `${lang} (${langLabel})` });
                });
            }
        }).catch(() => {});

    return Promise.all([p1, p2]).then(() => subtitles);
}

// ─── Stream Fetching ──────────────────────────────────────────────────────────

/**
 * Mirrors Kotlin's loadLinks logic:
 *  1. GET subject to find dubs list + extract token from x-user header.
 *  2. For each subjectId (original + dubs), GET play-info.
 *  3. If play-info has streams → use them + fetch subtitles.
 *  4. If no streams → fallback to resourceDetectors (Kotlin's episode-mismatch fix).
 */
function getStreamLinks(subjectId, season = 0, episode = 0, mediaTitle = '', mediaType = 'movie') {
    const subjectUrl = `${API_BASE}/wefeed-mobile-bff/subject-api/get?subjectId=${subjectId}`;
    const subjectHeaders = makeOneroomGetHeaders(subjectUrl, Date.now());

    return safeFetch(subjectUrl, { method: 'GET', headers: subjectHeaders })
        .then(raw => {
            if (!raw || !raw.ok) return { subjectData: null, token: null };

            // Extract Bearer token from x-user response header
            let token = null;
            try {
                const xUser = raw.headers && raw.headers.get('x-user');
                if (xUser) {
                    const xUserJson = JSON.parse(xUser);
                    token = xUserJson.token || null;
                }
            } catch (_) {}

            const subjectData = raw.json && raw.json.data;
            return { subjectData, token };
        })
        .then(({ subjectData, token }) => {
            const subjectIds = [];
            let originalLang = 'Original';

            if (subjectData) {
                const dubs = subjectData.dubs;
                if (Array.isArray(dubs)) {
                    dubs.forEach(dub => {
                        const sid = String(dub.subjectId || '');
                        const lanName = dub.lanName || 'Unknown';
                        if (sid === String(subjectId)) {
                            originalLang = lanName;
                        } else if (sid) {
                            subjectIds.push({ id: sid, lang: lanName });
                        }
                    });
                }
            }

            // Original always goes first
            subjectIds.unshift({ id: String(subjectId), lang: originalLang });

            const promises = subjectIds.map(item =>
                fetchStreamsForSubject(item.id, item.lang, season, episode, token)
            );

            return Promise.all(promises).then(results => {
                const flat = results.flat();
                // Sort: highest quality first, then prefer DASH > HLS > VIDEO
                flat.sort((a, b) => {
                    const qDiff = (b.qualityNum || 0) - (a.qualityNum || 0);
                    if (qDiff !== 0) return qDiff;
                    return (b.typeRank || 0) - (a.typeRank || 0);
                });
                return flat;
            });
        })
        .catch(() => []);
}

function fetchStreamsForSubject(subjectId, lang, season, episode, token) {
    const langLabel = (lang || 'Original').replace(/dub/gi, 'Audio');
    const playUrl = `${API_BASE}/wefeed-mobile-bff/subject-api/play-info?subjectId=${subjectId}&se=${season}&ep=${episode}`;
    const playHeaders = makeOneroomGetHeaders(playUrl, Date.now(), token);

    return getJson(playUrl, playHeaders).then(playRes => {
        const rawStreams = playRes && playRes.data && playRes.data.streams;

        if (Array.isArray(rawStreams) && rawStreams.length > 0) {
            const subPromises = rawStreams.map(stream => {
                if (!stream.url) return Promise.resolve([]);

                const quality = getHighestQuality(stream.resolutions || '');
                const format = stream.format || '';
                const formatType = getFormatType(stream.url, format);
                const signCookie = stream.signCookie || null;
                const streamId = stream.id || `${subjectId}|${season}|${episode}`;

                const streamHeaders = { 'Referer': API_BASE };
                if (signCookie) streamHeaders['Cookie'] = signCookie;

                const streamObj = {
                    name: `MovieBox (${langLabel}) ${quality ? quality + 'p' : 'Auto'} [${formatType}]`,
                    title: mediaTitle || 'Stream',
                    url: stream.url,
                    quality: quality ? `${quality}p` : 'Auto',
                    qualityNum: quality,
                    typeRank: typeRank(stream.url),
                    headers: streamHeaders,
                    subtitles: [],
                };

                // Fetch subtitles (non-blocking, attach to stream)
                return fetchSubtitles(subjectId, streamId, token, langLabel)
                    .then(subs => {
                        streamObj.subtitles = subs;
                        return [streamObj];
                    })
                    .catch(() => [streamObj]);
            });

            return Promise.all(subPromises).then(arr => arr.flat());
        }

        // ── Fallback: resourceDetectors (Kotlin's episode-mismatch fix) ──────
        const fallbackUrl = `${API_BASE}/wefeed-mobile-bff/subject-api/get?subjectId=${subjectId}`;
        const fallbackHeaders = makeOneroomGetHeaders(fallbackUrl, Date.now(), token);

        return getJson(fallbackUrl, fallbackHeaders).then(fallbackRes => {
            const streams = [];
            const detectors = fallbackRes && fallbackRes.data && fallbackRes.data.resourceDetectors;
            if (Array.isArray(detectors)) {
                detectors.forEach(detector => {
                    const resList = detector.resolutionList;
                    if (!Array.isArray(resList)) return;
                    resList.forEach(video => {
                        const link = video.resourceLink;
                        if (!link) return;
                        const quality = parseInt(video.resolution, 10) || 0;
                        const se = video.se;
                        const ep = video.ep;
                        streams.push({
                            name: `MovieBox (${langLabel}) S${se}E${ep} ${quality}p [VIDEO]`,
                            title: mediaTitle || 'Stream',
                            url: link,
                            quality: quality ? `${quality}p` : 'Auto',
                            qualityNum: quality,
                            typeRank: 1,
                            headers: { 'Referer': API_BASE },
                            subtitles: [],
                        });
                    });
                });
            }
            return streams;
        }).catch(() => []);
    }).catch(() => []);
}

function typeRank(url) {
    const u = String(url || '').toLowerCase();
    if (u.includes('.mpd')) return 3;
    if (u.includes('.m3u8')) return 2;
    if (u.includes('.mp4') || u.includes('.mkv')) return 1;
    return 0;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Main entry point.
 * @param {string|number} tmdbId   - TMDB ID of the title
 * @param {'movie'|'tv'} mediaType - 'movie' or 'tv'
 * @param {number} seasonNum       - Season number (TV only)
 * @param {number} episodeNum      - Episode number (TV only)
 * @returns {Promise<Array>}       - Array of stream objects
 *   Each stream: { name, title, url, quality, headers, subtitles }
 */
function getStreams(tmdbId, mediaType, seasonNum = 1, episodeNum = 1) {
    const season  = mediaType === 'tv' ? seasonNum  : 0;
    const episode = mediaType === 'tv' ? episodeNum : 0;

    return fetchTmdbDetails(tmdbId, mediaType).then(details => {
        if (!details) return [];

        return searchMovieBox(details.title).then(subjects => {
            let bestMatch = findBestMatch(subjects, details.title, details.year, mediaType);

            if (!bestMatch && details.originalTitle && details.originalTitle !== details.title) {
                return searchMovieBox(details.originalTitle).then(subjects2 => {
                    const match2 = findBestMatch(subjects2, details.originalTitle, details.year, mediaType);
                    if (match2) {
                        return getStreamLinks(match2.subjectId, season, episode, details.title, mediaType);
                    }
                    return [];
                });
            }

            if (bestMatch) {
                return getStreamLinks(bestMatch.subjectId, season, episode, details.title, mediaType);
            }

            return [];
        });
    }).catch(() => []);
}

module.exports = { getStreams };
