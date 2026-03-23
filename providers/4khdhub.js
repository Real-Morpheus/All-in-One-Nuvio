/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                      4KHDHub — Nuvio Stream Plugin                          ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  Source     › https://4khdhub.dad                                           ║
 * ║  Author     › Sanchit  |  TG: @S4NCHITT                                     ║
 * ║  Project    › Murph's Streams                                                ║
 * ║  Manifest   › https://badboysxs-morpheus.hf.space/manifest.json             ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  Supports   › Movies & Series (480p / 1080p / 2160p 4K / DV HDR)            ║
 * ║  Chain      › gadgetsweb.xyz redirect → HubCloud → extractor API            ║
 * ║  Info       › Quality · codec · language · size parsed from page HTML       ║
 * ║  Parallel   › All items resolved concurrently                               ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

'use strict';

const cheerio = require('cheerio-without-node-native');

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL       = 'https://4khdhub.dad';
const TMDB_API_KEY   = '439c478a771f35c05022f9feabcca01c';
const PLUGIN_TAG     = '[4KHDHub]';

// Extractor API — resolves HubCloud/gadgetsweb obfuscated links to direct URLs
const EXTRACTOR_API  = 'https://extractors-api.onrender.com';

const DEFAULT_HEADERS = {
  'User-Agent'      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept'          : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language' : 'en-US,en;q=0.9',
};

// ─────────────────────────────────────────────────────────────────────────────
// Simple LRU Cache (stream results + page searches)
// ─────────────────────────────────────────────────────────────────────────────

function LRUCache(max, ttlMs) {
  this.max  = max;
  this.ttl  = ttlMs;
  this.map  = {};
  this.keys = [];
}

LRUCache.prototype.get = function (k) {
  var e = this.map[k];
  if (!e) return undefined;
  if (Date.now() - e.ts > this.ttl) { delete this.map[k]; return undefined; }
  return e.v;
};

LRUCache.prototype.set = function (k, v) {
  if (this.map[k]) {
    this.map[k] = { v: v, ts: Date.now() };
    return;
  }
  if (this.keys.length >= this.max) {
    var oldest = this.keys.shift();
    delete this.map[oldest];
  }
  this.keys.push(k);
  this.map[k] = { v: v, ts: Date.now() };
};

var streamCache = new LRUCache(200, 30 * 60 * 1000);   // 30 min
var metaCache   = new LRUCache(500, 24 * 60 * 60 * 1000); // 24 hr
var pageCache   = new LRUCache(300, 60 * 60 * 1000);   // 1 hr

// ─────────────────────────────────────────────────────────────────────────────
// HTTP Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fetchText(url, extraHeaders) {
  return fetch(url, {
    headers  : Object.assign({}, DEFAULT_HEADERS, extraHeaders || {}),
    redirect : 'follow',
  })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
      return res.text();
    })
    .catch(function (err) {
      console.log(PLUGIN_TAG + ' fetchText failed [' + url.slice(0, 80) + ']: ' + err.message);
      return null;
    });
}

function fetchJson(url, extraHeaders) {
  return fetch(url, {
    headers  : Object.assign({}, DEFAULT_HEADERS, { 'Accept': 'application/json' }, extraHeaders || {}),
    redirect : 'follow',
  })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
      return res.json();
    })
    .catch(function (err) {
      console.log(PLUGIN_TAG + ' fetchJson failed [' + url.slice(0, 80) + ']: ' + err.message);
      return null;
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Levenshtein — title matching
// ─────────────────────────────────────────────────────────────────────────────

function levenshtein(s, t) {
  if (s === t) return 0;
  var n = s.length, m = t.length;
  if (!n) return m; if (!m) return n;
  var d = [];
  for (var i = 0; i <= n; i++) { d[i] = [i]; }
  for (var j = 0; j <= m; j++) { d[0][j] = j; }
  for (var i2 = 1; i2 <= n; i2++) {
    for (var j2 = 1; j2 <= m; j2++) {
      var cost = s[i2 - 1] === t[j2 - 1] ? 0 : 1;
      d[i2][j2] = Math.min(d[i2-1][j2] + 1, d[i2][j2-1] + 1, d[i2-1][j2-1] + cost);
    }
  }
  return d[n][m];
}

// ─────────────────────────────────────────────────────────────────────────────
// TMDB Lookup
// ─────────────────────────────────────────────────────────────────────────────

function getTmdbDetails(tmdbId, type) {
  var cacheKey = '4khd_meta_' + tmdbId + '_' + type;
  var hit = metaCache.get(cacheKey);
  if (hit) return Promise.resolve(hit);

  var isTv  = (type === 'tv' || type === 'series');
  var url   = 'https://api.themoviedb.org/3/' + (isTv ? 'tv' : 'movie') + '/' + tmdbId + '?api_key=' + TMDB_API_KEY;
  console.log(PLUGIN_TAG + ' TMDB → ' + url);

  return fetchJson(url).then(function (data) {
    if (!data) return null;
    var title    = isTv ? data.name  : data.title;
    var dateStr  = isTv ? data.first_air_date : data.release_date;
    var year     = dateStr ? parseInt(dateStr.slice(0, 4)) : 0;
    var result   = { title: title || null, year: year, isTv: isTv };
    if (title) metaCache.set(cacheKey, result);
    return result;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Page Info Parsers
// The new 4khdhub.dad site has a very clean structure per download card:
//
//   .download-header  → card title + badges (size, language, source)
//   .file-title       → actual MKV filename (encodes quality, codec, audio)
//   .badge spans      → coloured pills for size, language, codec
//
// Example filename:
//   Peaky.Blinders.The.Immortal.Man.2026.2160p.NF.WEB-DL.Multi.DDP5.1.DV.HDR.H.265-4kHDHub.Com.mkv
// Example header title:
//   Peaky Blinders: The Immortal Man (2160p WEB-DL DV HDR H265)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract quality label from any text string.
 */
function extractQuality(text) {
  var t = (text || '').toUpperCase();
  if (/\b(2160P|4K)\b/.test(t))  return '4K (2160p)';
  if (/\b1080P\b/.test(t))       return '1080p';
  if (/\b720P\b/.test(t))        return '720p';
  if (/\b480P\b/.test(t))        return '480p';
  return null;
}

/**
 * Extract video codec from filename or header.
 * Returns e.g. "H265", "x264", "AV1", "HEVC", "DV HDR H265"
 */
function extractCodec(text) {
  var t = text || '';
  // Order matters — check combined HDR variants first
  if (/DV[\s.]HDR[\s.]H[\s.]?265/i.test(t) || /HDR[\s.-]DV[\s.]H[\s.]?265/i.test(t)) return 'DV HDR H265';
  if (/DV[\s.]HDR/i.test(t))                 return 'DV HDR';
  if (/HDR[\s.-]DV/i.test(t))                return 'HDR DV';
  if (/\bHDR\b/i.test(t))                    return 'HDR';
  if (/\bDV\b/i.test(t))                     return 'DV';
  if (/H[\s.]?265|HEVC/i.test(t))            return 'H265/HEVC';
  if (/H[\s.]?264|x264/i.test(t))            return 'x264';
  if (/\bAV1\b/i.test(t))                    return 'AV1';
  return null;
}

/**
 * Extract source label (WEB-DL, BluRay, etc.)
 */
function extractSource(text) {
  var m = (text || '').match(/\b(WEB[\s-]?DL|WEBRip|BluRay|Blu[\s-]?Ray|BRRip|HDTV|HDCAM|NF|AMZN|DSNP|HBO|ATVP)\b/i);
  return m ? m[1].toUpperCase().replace(/\s/g, '-') : null;
}

/**
 * Extract audio format (DDP5.1, Atmos, AAC, etc.)
 */
function extractAudio(text) {
  if (/DDP5\.1.*Atmos|Atmos.*DDP5\.1/i.test(text)) return 'DDP5.1 Atmos';
  if (/DDP5\.1/i.test(text))                        return 'DDP5.1';
  if (/DDP/i.test(text))                             return 'DDP';
  if (/Atmos/i.test(text))                           return 'Atmos';
  if (/AAC5\.1/i.test(text))                         return 'AAC5.1';
  if (/\bAAC\b/i.test(text))                         return 'AAC';
  if (/\bAC3\b/i.test(text))                         return 'AC3';
  return null;
}

/**
 * Parse languages from badge text or header/filename.
 * Returns array like ["Hindi", "Tamil", "Telugu", "English"]
 */
function extractLanguages(text) {
  var t = text || '';
  var langs = [];
  var LANG_PATTERNS = [
    ['Hindi',      /\bHindi\b/i],
    ['English',    /\bEnglish\b/i],
    ['Tamil',      /\bTamil\b/i],
    ['Telugu',     /\bTelugu\b/i],
    ['Malayalam',  /\bMalayalam\b/i],
    ['Kannada',    /\bKannada\b/i],
    ['Bengali',    /\bBengali\b/i],
    ['Punjabi',    /\bPunjabi\b/i],
    ['Korean',     /\bKorean\b/i],
    ['Japanese',   /\bJapanese\b/i],
    ['Chinese',    /\bChinese\b/i],
    ['Spanish',    /\bSpanish\b/i],
    ['French',     /\bFrench\b/i],
    ['German',     /\bGerman\b/i],
    ['Arabic',     /\bArabic\b/i],
    ['Russian',    /\bRussian\b/i],
    ['Turkish',    /\bTurkish\b/i],
    ['Portuguese', /\bPortuguese\b/i],
  ];
  // Also handle "Multi" flag
  if (/\bMulti\b/i.test(t)) langs.push('Multi');

  LANG_PATTERNS.forEach(function (pair) {
    if (pair[1].test(t)) langs.push(pair[0]);
  });
  return langs;
}

/**
 * Extract file size from badge text like "17.07 GB", "3.24 GB".
 */
function extractSize(text) {
  var m = (text || '').match(/([\d.]+\s*(?:GB|MB|TB|KB))/i);
  return m ? m[1].replace(/\s+/, '') : null;
}

/**
 * Full card info object parsed from a .download-item element.
 *
 * Returns:
 *   { quality, codec, source, audio, languages, size, filename, headerTitle }
 */
function parseCardInfo($, el) {
  var header     = $(el).find('.download-header').first();
  var headerText = header.find('.flex-1').text().trim();
  var fileTitle  = $(el).find('.file-title').text().trim();

  // Combine all badge text for language / size extraction
  var badgeText = '';
  header.find('.badge').each(function (_, b) { badgeText += ' ' + $(b).text().trim(); });

  // Combined text corpus for parsing
  var corpus = headerText + ' ' + fileTitle + ' ' + badgeText;

  var quality   = extractQuality(corpus);
  var codec     = extractCodec(fileTitle || headerText);
  var source    = extractSource(corpus);
  var audio     = extractAudio(fileTitle);
  var languages = extractLanguages(badgeText + ' ' + headerText);
  var size      = extractSize(badgeText);

  return {
    quality     : quality,
    codec       : codec,
    source      : source,
    audio       : audio,
    languages   : languages,
    size        : size,
    filename    : fileTitle,
    headerTitle : headerText,
  };
}

/**
 * Build the human-readable info label shown in the stream name/title.
 * e.g. "4K (2160p) · WEB-DL · DV HDR H265 · DDP5.1 Atmos · 17.07GB"
 */
function buildInfoLabel(info) {
  var parts = [];
  if (info.quality)  parts.push(info.quality);
  if (info.source)   parts.push(info.source);
  if (info.codec)    parts.push(info.codec);
  if (info.audio)    parts.push(info.audio);
  if (info.size)     parts.push(info.size);
  return parts.join(' · ') || 'Unknown';
}

function formatLanguages(langs) {
  if (!langs || !langs.length) return null;
  return langs.join(' + ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Server label from URL
// ─────────────────────────────────────────────────────────────────────────────

function serverLabel(url) {
  var u = (url || '').toLowerCase();
  if (u.includes('pixeldrain'))                    return 'PixelDrain';
  if (u.includes('.r2.dev') || u.includes('r2.')) return 'R2 CDN';
  if (u.includes('mayhem') || u.includes('/fsl')) return 'FSL';
  if (u.includes('gofile'))                        return 'GoFile';
  if (u.includes('mega.nz'))                       return 'Mega';
  if (u.includes('workers.dev'))                   return 'CF Worker';
  if (u.includes('hubcloud'))                      return 'HubCloud';
  if (u.includes('gadgets'))                       return 'GadgetsWeb';
  return 'Direct';
}

function isGdrive(url) {
  var u = (url || '').toLowerCase();
  return u.includes('drive.google.com') ||
         u.includes('googleusercontent.com') ||
         (u.includes('googleapis.com') && !u.includes('tmdb'));
}

// ─────────────────────────────────────────────────────────────────────────────
// atob Polyfill + rot13 (for obfuscated redirect resolution — old chain fallback)
// ─────────────────────────────────────────────────────────────────────────────

function atobPolyfill(input) {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  var str = String(input).replace(/=+$/, '');
  var output = '';
  for (var bc = 0, bs, buffer, i = 0;
    (buffer = str.charAt(i++));
    ~buffer && ((bs = bc % 4 ? bs * 64 + buffer : buffer), bc++ % 4)
      ? (output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6))))
      : 0) {
    buffer = chars.indexOf(buffer);
  }
  return output;
}

function rot13(str) {
  return str.replace(/[a-zA-Z]/g, function (c) {
    return String.fromCharCode(
      (c <= 'Z' ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26
    );
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Redirect resolvers
// New site uses gadgetsweb.xyz?id=BASE64 → resolves to HubCloud or direct URL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a gadgetsweb.xyz/?id=... redirect URL to the target HubCloud URL.
 * These redirects respond with a redirect Location header or meta-refresh.
 */
function resolveGadgetsWeb(redirectUrl) {
  return fetch(redirectUrl, {
    headers  : DEFAULT_HEADERS,
    redirect : 'manual', // Don't follow — we want the Location header
  })
    .then(function (res) {
      // 301/302 redirect — grab Location
      var location = res.headers.get('location');
      if (location && location.startsWith('http')) return location;

      // Follow up to 5 hops manually if needed
      return res.text().then(function (html) {
        // meta refresh
        var m = html.match(/content=["'][^"']*url=([^"']+)["']/i);
        if (m) return m[1];
        // window.location
        var m2 = html.match(/window\.location(?:\.href)?\s*=\s*["']([^"']+)["']/i);
        if (m2) return m2[1];
        // Try following redirect normally
        return fetch(redirectUrl, { headers: DEFAULT_HEADERS, redirect: 'follow' })
          .then(function (res2) { return res2.url; })
          .catch(function () { return null; });
      });
    })
    .catch(function (err) {
      console.log(PLUGIN_TAG + ' gadgetsweb resolve failed: ' + err.message);
      return null;
    });
}

/**
 * Resolve the old obfuscated redirect pattern (4khdhub.fans-style, kept as
 * fallback in case redirect chains still use it).
 */
function resolveObfuscatedRedirect(redirectUrl) {
  return fetchText(redirectUrl).then(function (html) {
    if (!html) return null;
    try {
      var m = html.match(/'o','(.*?)'/);
      if (m) {
        var step4 = JSON.parse(atobPolyfill(rot13(atobPolyfill(atobPolyfill(m[1])))));
        if (step4 && step4.o) return atobPolyfill(step4.o);
      }
      var m2 = html.match(/var\s+o\s*=\s*['"]([A-Za-z0-9+/=]+)['"]/);
      if (m2) {
        var decoded = atobPolyfill(m2[1]);
        if (decoded.startsWith('http')) return decoded;
      }
    } catch (e) {
      console.log(PLUGIN_TAG + ' Obfuscated resolve error: ' + e.message);
    }
    return null;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Extractor API — resolves HubCloud → FSL / PixelDrain / R2 direct links
// ─────────────────────────────────────────────────────────────────────────────

function resolveViaExtractorApi(hubCloudUrl) {
  var apiUrl = EXTRACTOR_API + '/extract?url=' + encodeURIComponent(hubCloudUrl);
  console.log(PLUGIN_TAG + ' Extractor API → ' + hubCloudUrl.slice(0, 80));

  return fetchJson(apiUrl).then(function (data) {
    if (!data) return [];
    var results = [];

    // Top-level direct URL
    if (data.url && !isGdrive(data.url)) {
      results.push({ url: data.url, label: data.name || data.label || '', size: data.size || null, direct: true });
    }

    // Sources array
    if (Array.isArray(data.sources)) {
      data.sources.forEach(function (s) {
        if (s.url && !isGdrive(s.url)) {
          results.push({ url: s.url, label: s.name || s.label || '', size: s.size || null, direct: true });
        }
      });
    }

    // Links array
    if (Array.isArray(data.links)) {
      data.links.forEach(function (l) {
        var url = typeof l === 'string' ? l : (l.url || l.link || null);
        if (url && !isGdrive(url)) {
          results.push({ url: url, label: l.label || l.name || '', size: l.size || null, direct: true });
        }
      });
    }

    console.log(PLUGIN_TAG + ' Extractor returned ' + results.length + ' link(s)');
    return results;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Download link extraction from a single .download-item card
// New site structure:
//   .download-header → card header with title + badges
//   .file-title      → MKV filename
//   .grid.grid-cols-2 a.btn → "Download HubCloud" and "Download HubDrive" buttons
//   href = gadgetsweb.xyz/?id=BASE64
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract raw gadgetsweb/hubcloud URLs from a download card element.
 * Returns array of { url, type } where type is 'hubcloud' or 'hubdrive'.
 */
function extractCardLinks($, el) {
  var links = [];

  // Find all download buttons in the card
  $(el).find('a.btn[href]').each(function (_, a) {
    var href = $(a).attr('href') || '';
    var text = $(a).text().trim().toLowerCase();
    if (!href) return;

    if (text.includes('hubcloud') || href.includes('gadgetsweb')) {
      links.push({ url: href, type: 'hubcloud' });
    } else if (text.includes('hubdrive')) {
      links.push({ url: href, type: 'hubdrive' });
    }
  });

  return links;
}

/**
 * Fully resolve a single download card:
 * gadgetsweb → HubCloud URL → extractor API → direct stream URLs
 *
 * Returns array of { url, label, size, direct }
 */
function resolveCard($, el) {
  var cardLinks = extractCardLinks($, el);
  if (!cardLinks.length) return Promise.resolve([]);

  // Prefer HubCloud over HubDrive; try both, use first that works
  var hubCloudEntry = cardLinks.find(function (l) { return l.type === 'hubcloud'; });
  var hubDriveEntry = cardLinks.find(function (l) { return l.type === 'hubdrive'; });
  var entry = hubCloudEntry || hubDriveEntry;

  if (!entry) return Promise.resolve([]);

  console.log(PLUGIN_TAG + ' Resolving gadgetsweb: ' + entry.url.slice(0, 80));

  // Step 1: gadgetsweb redirect → HubCloud URL
  return resolveGadgetsWeb(entry.url).then(function (hubCloudUrl) {
    if (!hubCloudUrl) {
      // Fallback: try obfuscated pattern
      return resolveObfuscatedRedirect(entry.url);
    }
    return hubCloudUrl;
  }).then(function (hubCloudUrl) {
    if (!hubCloudUrl) {
      console.log(PLUGIN_TAG + ' Could not resolve gadgetsweb redirect');
      return [];
    }
    console.log(PLUGIN_TAG + ' HubCloud URL: ' + hubCloudUrl.slice(0, 80));

    // Step 2: extractor API → direct stream URLs
    return resolveViaExtractorApi(hubCloudUrl);
  }).catch(function (err) {
    console.log(PLUGIN_TAG + ' Card resolve error: ' + err.message);
    return [];
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Site Search — find the correct movie/series page on 4khdhub.dad
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Search 4khdhub.dad for a title. The site has a search endpoint at /?s=query.
 * Cards are <a class="movie-card"> with .movie-card-title and .movie-card-meta.
 */
function searchSite(title, year) {
  var searchUrl = BASE_URL + '/?s=' + encodeURIComponent(title);
  console.log(PLUGIN_TAG + ' Search → ' + searchUrl);

  return fetchText(searchUrl).then(function (html) {
    if (!html) return null;
    var $ = cheerio.load(html);
    var results = [];

    $('a.movie-card[href]').each(function (_, el) {
      var href      = $(el).attr('href') || '';
      var cardTitle = $(el).find('.movie-card-title').text().trim();
      var cardMeta  = $(el).find('.movie-card-meta').text().trim();
      var cardYear  = parseInt((cardMeta.match(/\d{4}/) || [])[0]) || 0;

      if (!href || !cardTitle) return;

      // Normalise to absolute URL
      if (!href.startsWith('http')) href = BASE_URL + (href.startsWith('/') ? '' : '/') + href;

      results.push({
        href      : href,
        title     : cardTitle,
        year      : cardYear,
        distance  : levenshtein(cardTitle.toLowerCase(), title.toLowerCase()),
      });
    });

    if (!results.length) return null;

    // Sort by title similarity then year proximity
    results.sort(function (a, b) {
      if (a.distance !== b.distance) return a.distance - b.distance;
      return Math.abs(a.year - year) - Math.abs(b.year - year);
    });

    // Accept if Levenshtein distance is reasonable
    var best = results[0];
    if (best.distance > Math.min(6, Math.floor(title.length * 0.4))) {
      console.log(PLUGIN_TAG + ' Best search hit "' + best.title + '" too far (dist=' + best.distance + ')');
      return null;
    }

    console.log(PLUGIN_TAG + ' Best hit: "' + best.title + '" (' + best.year + ') dist=' + best.distance);
    return best.href;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Detail Page Scraper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scrape a detail page and collect all .download-item cards.
 * For series, filter to the correct season/episode using the card heading text.
 */
function scrapeDetailPage(pageUrl, isSeries, season, episode) {
  var cacheKey = 'page_' + pageUrl + '_' + season + '_' + episode;
  var cached   = pageCache.get(cacheKey);
  if (cached) return Promise.resolve(cached);

  console.log(PLUGIN_TAG + ' Detail page → ' + pageUrl);

  return fetchText(pageUrl).then(function (html) {
    if (!html) return { $: null, cards: [] };
    var $ = cheerio.load(html);
    var cards = [];

    if (isSeries && season != null && episode != null) {
      // Series: find accordion items that mention the season/episode
      // New site wraps episodes inside .episode-item with .episode-title
      var seasonStr  = 'S' + String(season).padStart(2, '0');
      var episodeStr = 'Episode-' + String(episode).padStart(2, '0');

      $('.episode-item').each(function (_, el) {
        var epTitle = $('.episode-title', el).text();
        if (epTitle.indexOf(seasonStr) === -1) return;
        $('.episode-download-item, .download-item', el).each(function (_, item) {
          if ($(item).text().indexOf(episodeStr) !== -1) cards.push(item);
        });
      });

      // Fallback: download-items on the page if no episode structure
      if (!cards.length) {
        $('.download-item').each(function (_, el) { cards.push(el); });
      }

    } else {
      // Movies: all .download-item cards
      $('.download-item').each(function (_, el) { cards.push(el); });
    }

    console.log(PLUGIN_TAG + ' ' + cards.length + ' download card(s) on page');
    var result = { $: $, cards: cards };
    if (cards.length) pageCache.set(cacheKey, result);
    return result;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Stream Builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a fully-labelled Nuvio stream object.
 *
 * Stream name (picker):
 *   🎬 4KHDHub | 4K (2160p) · WEB-DL · DV HDR H265 · DDP5.1 Atmos · 17.07GB
 *
 * Stream title (detail):
 *   Peaky Blinders: The Immortal Man (2026)
 *   📺 4K (2160p) · WEB-DL · DV HDR H265
 *   🔊 Hindi + Tamil + Telugu + English
 *   🎵 DDP5.1 Atmos
 *   💾 17.07GB  [R2 CDN]
 *   by Sanchit · @S4NCHITT · Murph's Streams
 */
function buildStream(streamUrl, info, tmdbTitle, tmdbYear, season, episode, isSeries, direct) {
  var infoLabel = buildInfoLabel(info);
  var langStr   = formatLanguages(info.languages);
  var server    = serverLabel(streamUrl);

  // ── Name ───────────────────────────────────────────────────────────────────
  var streamName = '🎬 4KHDHub | ' + infoLabel;

  // ── Title lines ────────────────────────────────────────────────────────────
  var lines = [];

  var titleLine = tmdbTitle;
  if (tmdbYear)  titleLine += ' (' + tmdbYear + ')';
  if (isSeries && season != null && episode != null) {
    titleLine += ' · S' + String(season).padStart(2, '0') + 'E' + String(episode).padStart(2, '0');
  }
  lines.push(titleLine);

  if (info.quality || info.source || info.codec) {
    var techLine = '📺 ';
    var techParts = [];
    if (info.quality) techParts.push(info.quality);
    if (info.source)  techParts.push(info.source);
    if (info.codec)   techParts.push(info.codec);
    lines.push(techLine + techParts.join(' · '));
  }

  if (langStr) lines.push('🔊 ' + langStr);
  if (info.audio) lines.push('🎵 ' + info.audio);

  var storageLine = '';
  if (info.size) storageLine += '💾 ' + info.size;
  if (server)    storageLine += (storageLine ? '  ' : '') + '[' + server + ']';
  if (storageLine) lines.push(storageLine);

  if (info.filename) lines.push('📄 ' + info.filename.slice(0, 70) + (info.filename.length > 70 ? '…' : ''));

  lines.push("by Sanchit · @S4NCHITT · Murph's Streams");

  return {
    name    : streamName,
    title   : lines.join('\n'),
    url     : streamUrl,
    quality : info.quality || 'HD',
    direct  : !!direct,
    behaviorHints: {
      notWebReady : true,
      bingeGroup  : '4khdhub',
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Quality sort score
// ─────────────────────────────────────────────────────────────────────────────

function qualitySortScore(q) {
  if (!q) return 0;
  if (/4K|2160/i.test(q)) return 2160;
  var m = q.match(/(\d+)p/i);
  return m ? parseInt(m[1]) : 100;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — getStreams
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main entry point called by the Nuvio plugin runner.
 *
 * @param {string}        tmdbId   - TMDB content ID
 * @param {string}        type     - "movie" | "tv" | "series"
 * @param {number|string} season   - Season number  (TV only)
 * @param {number|string} episode  - Episode number (TV only)
 * @returns {Promise<Array>}         Array of Nuvio-compatible stream objects
 */
function getStreams(tmdbId, type, season, episode) {
  var cacheKey = '4khd_' + tmdbId + '_' + type + '_' + season + '_' + episode;
  var hit      = streamCache.get(cacheKey);
  if (hit) { console.log(PLUGIN_TAG + ' Cache HIT: ' + cacheKey); return Promise.resolve(hit); }

  var isSeries = (type === 'tv' || type === 'series');
  var s = season  ? parseInt(season)  : null;
  var e = episode ? parseInt(episode) : null;

  console.log(PLUGIN_TAG + ' ► TMDB: ' + tmdbId + ' | ' + type + (s ? ' S' + s + 'E' + e : ''));

  return getTmdbDetails(tmdbId, type).then(function (details) {
    if (!details || !details.title) {
      console.log(PLUGIN_TAG + ' TMDB lookup failed.');
      return [];
    }

    var title = details.title;
    var year  = details.year;
    console.log(PLUGIN_TAG + ' Title: "' + title + '" (' + year + ')');

    // ── Find detail page ─────────────────────────────────────────────────────
    return searchSite(title, year).then(function (pageUrl) {
      if (!pageUrl) {
        console.log(PLUGIN_TAG + ' No page found for: ' + title);
        return [];
      }
      console.log(PLUGIN_TAG + ' Page → ' + pageUrl);

      // ── Scrape download cards ─────────────────────────────────────────────
      return scrapeDetailPage(pageUrl, isSeries, s, e).then(function (result) {
        var $ = result.$;
        var cards = result.cards;

        if (!cards.length) {
          console.log(PLUGIN_TAG + ' No download cards found.');
          return [];
        }

        // ── Parse info from each card ─────────────────────────────────────
        var cardData = cards.slice(0, 8).map(function (card) {
          return { card: card, info: parseCardInfo($, card) };
        });

        console.log(PLUGIN_TAG + ' Resolving ' + cardData.length + ' card(s) in parallel…');

        // ── Resolve all cards in parallel ─────────────────────────────────
        var resolvePromises = cardData.map(function (item) {
          return resolveCard($, item.card)
            .then(function (streamLinks) {
              return { info: item.info, streamLinks: streamLinks };
            })
            .catch(function (err) {
              console.log(PLUGIN_TAG + ' Card error: ' + err.message);
              return { info: item.info, streamLinks: [] };
            });
        });

        return Promise.all(resolvePromises).then(function (resolved) {
          var streams = [];

          resolved.forEach(function (res) {
            res.streamLinks.forEach(function (link) {
              if (!link.url || isGdrive(link.url)) return;

              // Merge extractor-returned label/size into info
              var mergedInfo = Object.assign({}, res.info);
              if (link.label && !mergedInfo.quality) {
                mergedInfo.quality = extractQuality(link.label);
              }
              if (link.size && !mergedInfo.size) {
                mergedInfo.size = link.size;
              }

              streams.push(buildStream(
                link.url, mergedInfo,
                title, year, s, e, isSeries, link.direct
              ));
            });
          });

          // Sort: 4K → 1080p → 720p → 480p
          streams.sort(function (a, b) {
            return qualitySortScore(b.quality) - qualitySortScore(a.quality);
          });

          // Deduplicate by URL
          var seen = {};
          streams = streams.filter(function (s) {
            if (seen[s.url]) return false;
            seen[s.url] = true;
            return true;
          });

          console.log(PLUGIN_TAG + ' ✔ ' + streams.length + ' stream(s) ready (' + streams.filter(function(x){return x.direct;}).length + ' direct)');
          if (streams.length) streamCache.set(cacheKey, streams);
          return streams;
        });
      });
    });
  }).catch(function (err) {
    console.error(PLUGIN_TAG + ' Fatal: ' + err.message);
    return [];
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}