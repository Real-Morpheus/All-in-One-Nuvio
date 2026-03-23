/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                      MovieBox — Nuvio Stream Plugin                         ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  Source     › https://themoviebox.org                                       ║
 * ║  Author     › Sanchit  |  TG: @S4NCHITT                                     ║
 * ║  Project    › Murph's Streams                                                ║
 * ║  Manifest   › https://badboysxs-morpheus.hf.space/manifest.json             ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  Platforms  › Hindi · Tamil · Telugu · English (auto-detected)              ║
 * ║  Supports   › Movies & Series  (360p / 480p / 720p / 1080p / Auto)          ║
 * ║  Search     › Parallel multi-query with Hindi-priority scoring              ║
 * ║  Headers    › Inline behaviorHints.headers (no proxy required)              ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * ── Proxy note ──────────────────────────────────────────────────────────────────
 * The original Stremio addon (index.js) routes MovieBox streams through:
 *   • /proxy?url=...   for HLS (.m3u8) — rewrites segment URLs
 *   • /mb-stream?url=  for direct MP4/MKV — Range request passthrough
 *
 * Nuvio handles HLS natively and passes behaviorHints.headers to the player,
 * so no proxy server is needed here. We embed the required headers directly
 * into each stream object. The player receives them and sends them with every
 * segment request automatically.
 * ────────────────────────────────────────────────────────────────────────────────
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const TMDB_API_KEY = '439c478a771f35c05022f9feabcca01c';
const MB_BASE      = 'https://themoviebox.org';
const PLUGIN_TAG   = '[MovieBox]';

/**
 * Headers required by MovieBox's CDN for every video/segment request.
 * Embedded into behaviorHints.headers so Nuvio passes them to the player.
 */
const MB_STREAM_HEADERS = {
  'User-Agent'     : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0',
  'Referer'        : 'https://themoviebox.org/',
  'Origin'         : 'https://themoviebox.org',
  'Accept'         : 'video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Fetch-Dest' : 'video',
  'Sec-Fetch-Mode' : 'cors',
  'Sec-Fetch-Site' : 'cross-site',
  'Connection'     : 'keep-alive',
};

const HTML_HEADERS = {
  'User-Agent'                : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0',
  'Accept'                    : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language'           : 'en-US,en;q=0.9',
  'Upgrade-Insecure-Requests' : '1',
};

const API_HEADERS = {
  'User-Agent'     : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0',
  'Accept'         : 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'X-Client-Info'  : JSON.stringify({ timezone: 'Asia/Kolkata' }),
  'Sec-Fetch-Dest' : 'empty',
  'Sec-Fetch-Mode' : 'cors',
  'Sec-Fetch-Site' : 'same-origin',
  'Pragma'         : 'no-cache',
  'Cache-Control'  : 'no-cache',
};

// ─────────────────────────────────────────────────────────────────────────────
// Simple LRU Cache
// ─────────────────────────────────────────────────────────────────────────────

function LRUCache(max, ttlMs) {
  this.max   = max;
  this.ttl   = ttlMs;
  this.data  = {};
  this.order = [];
}
LRUCache.prototype.get = function (k) {
  var e = this.data[k];
  if (!e) return undefined;
  if (Date.now() - e.ts > this.ttl) { delete this.data[k]; return undefined; }
  return e.v;
};
LRUCache.prototype.set = function (k, v) {
  if (this.data[k]) { this.data[k] = { v: v, ts: Date.now() }; return; }
  if (this.order.length >= this.max) { delete this.data[this.order.shift()]; }
  this.order.push(k);
  this.data[k] = { v: v, ts: Date.now() };
};

var streamCache = new LRUCache(200, 30 * 60 * 1000);   // 30 min
var metaCache   = new LRUCache(500, 24 * 60 * 60 * 1000); // 24 hr
var searchCache = new LRUCache(300, 15 * 60 * 1000);   // 15 min

// ─────────────────────────────────────────────────────────────────────────────
// Nuxt SSR Data Extractor
// MovieBox renders via Nuxt — all content lives in __NUXT_DATA__ JSON blob
// ─────────────────────────────────────────────────────────────────────────────

function extractNuxtData(html) {
  var idx = html.indexOf('__NUXT_DATA__');
  if (idx === -1) return null;
  var start = html.indexOf('[', idx);
  var end   = html.indexOf('</script>', idx);
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(html.substring(start, end)); }
  catch (e) { return null; }
}

function resolveNuxt(data, idx, depth) {
  depth = depth || 0;
  if (depth > 15 || idx < 0 || idx >= data.length) return null;
  var item = data[idx];

  if (Array.isArray(item)) {
    if (item.length === 2 && (item[0] === 'ShallowReactive' || item[0] === 'Reactive')) {
      return resolveNuxt(data, item[1], depth + 1);
    }
    return item.map(function (v) {
      return typeof v === 'number' ? resolveNuxt(data, v, depth + 1) : v;
    });
  }

  if (item && typeof item === 'object') {
    var obj = {};
    Object.keys(item).forEach(function (k) {
      var v = item[k];
      obj[k] = typeof v === 'number' ? resolveNuxt(data, v, depth + 1) : v;
    });
    return obj;
  }

  return item;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP Helper
// ─────────────────────────────────────────────────────────────────────────────

function fetchText(url, extraHeaders) {
  return fetch(url, {
    headers  : Object.assign({}, HTML_HEADERS, extraHeaders || {}),
    redirect : 'follow',
  })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
      return res.text();
    });
}

function fetchJson(url, extraHeaders) {
  return fetch(url, {
    headers  : Object.assign({}, API_HEADERS, extraHeaders || {}),
    redirect : 'follow',
  })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
      return res.json();
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// TMDB Lookup
// ─────────────────────────────────────────────────────────────────────────────

function getTmdbDetails(tmdbId, type) {
  var cacheKey = 'mb_meta_' + tmdbId + '_' + type;
  var hit = metaCache.get(cacheKey);
  if (hit) return Promise.resolve(hit);

  var isTv = (type === 'tv' || type === 'series');
  var url  = 'https://api.themoviedb.org/3/' + (isTv ? 'tv' : 'movie') + '/' + tmdbId + '?api_key=' + TMDB_API_KEY;
  console.log(PLUGIN_TAG + ' TMDB → ' + url);

  return fetchJson(url, { 'Accept': 'application/json' }).then(function (d) {
    if (!d) return null;
    var title   = isTv ? d.name  : d.title;
    var dateStr = isTv ? d.first_air_date : d.release_date;
    var year    = dateStr ? dateStr.slice(0, 4) : '';
    var result  = { title: title || null, year: year, isTv: isTv };
    if (title) metaCache.set(cacheKey, result);
    return result;
  }).catch(function (err) {
    console.log(PLUGIN_TAG + ' TMDB error: ' + err.message);
    return null;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Search
// ─────────────────────────────────────────────────────────────────────────────

function search(query) {
  var cached = searchCache.get(query);
  if (cached) return Promise.resolve(cached);

  console.log(PLUGIN_TAG + ' Search: "' + query + '"');
  var url = new URL(MB_BASE + '/newWeb/searchResult');
  url.searchParams.set('keyword', query);

  return fetchText(url.toString()).then(function (html) {
    var data = extractNuxtData(html);
    if (!data) { console.log(PLUGIN_TAG + ' No Nuxt data in search'); return []; }

    var itemsIndices = null;
    for (var i = 0; i < data.length; i++) {
      var item = data[i];
      if (item && typeof item === 'object' && 'pager' in item && 'items' in item) {
        var ref = item.items;
        itemsIndices = typeof ref === 'number' ? data[ref] : ref;
        break;
      }
    }
    if (!itemsIndices || !Array.isArray(itemsIndices)) return [];

    var results = [];
    for (var j = 0; j < itemsIndices.length; j++) {
      var resolved = resolveNuxt(data, itemsIndices[j]);
      if (!resolved || typeof resolved !== 'object') continue;

      results.push({
        subject_id   : resolved.subjectId,
        title        : resolved.title || '',
        subject_type : resolved.subjectType,  // 1 = TV, 2 = Movie
        detail_path  : resolved.detailPath,
        release_date : resolved.releaseDate,
        language     : resolved.language || resolved.lang || resolved.dubbed_lang || resolved.original_language || null,
      });
    }

    console.log(PLUGIN_TAG + ' Search "' + query + '" → ' + results.length + ' result(s)');
    if (results.length) searchCache.set(query, results);
    return results;
  }).catch(function (err) {
    console.log(PLUGIN_TAG + ' Search error for "' + query + '": ' + err.message);
    return [];
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Scoring & Language Helpers
// ─────────────────────────────────────────────────────────────────────────────

function normalizeTitle(str) {
  return (str || '')
    .toLowerCase()
    .replace(/\[.*?\]/g, ' ')
    .replace(/\(.*?\)/g, ' ')
    .replace(/\s*-\s*(part|volume|chapter|episode)\s*\d+/gi, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreResult(result, targetTitle, targetYear) {
  var normTarget = normalizeTitle(targetTitle);
  var normResult = normalizeTitle(result.title || '');
  var resultYear = (result.release_date || '').slice(0, 4);

  if (!normTarget || !normResult) return 0;
  if (normResult === normTarget) return 90;
  if (normResult.indexOf(normTarget) !== -1 || normTarget.indexOf(normResult) !== -1) return 70;

  var wordsTarget = normTarget.split(' ').filter(function (w) { return w.length > 2; });
  var wordsResult = normResult.split(' ').filter(function (w) { return w.length > 2; });
  if (!wordsTarget.length || !wordsResult.length) return 0;

  var matches = wordsTarget.filter(function (w) { return wordsResult.indexOf(w) !== -1; }).length;
  var overlap  = matches / Math.max(wordsTarget.length, wordsResult.length);
  var s = Math.round(overlap * 50);

  if (targetYear && resultYear && targetYear === resultYear) s += 30;
  return s;
}

function isHindi(result) {
  return (result.language && result.language.toLowerCase().includes('hindi')) ||
         (result.title || '').toLowerCase().includes('hindi');
}

function hasHindiTag(title) {
  return (title || '').toLowerCase().includes('[hindi]');
}

function getLanguageFromTitle(title) {
  var lower = (title || '').toLowerCase();
  if (/\[hindi\]|\(hindi\)| hindi /.test(lower))     return 'Hindi';
  if (/\[tamil\]|\(tamil\)| tamil /.test(lower))     return 'Tamil';
  if (/\[telugu\]|\(telugu\)| telugu /.test(lower))  return 'Telugu';
  if (/\[english\]|\(english\)| english /.test(lower)) return 'English';
  if (/\[original\]|\(original\)| original /.test(lower)) return 'Original';
  return 'Original';
}

// ─────────────────────────────────────────────────────────────────────────────
// pickBest — Parallel multi-query search with Hindi-priority scoring
// Mirrors the Python API pick_best() logic exactly
// ─────────────────────────────────────────────────────────────────────────────

function pickBest(title, year) {
  var queries = [
    title + ' Hindi',
    year ? title + ' ' + year + ' Hindi' : null,
    title,
    year ? title + ' ' + year : null,
  ].filter(Boolean);

  console.log(PLUGIN_TAG + ' Parallel search: ' + queries.map(function (q) { return '"' + q + '"'; }).join(', '));

  return Promise.all(queries.map(function (q) {
    return search(q).catch(function () { return []; });
  })).then(function (allResults) {

    var allValid   = [];
    var allHindi   = [];
    var bestNonHindi = { result: null, score: 0 };

    allResults.forEach(function (results) {
      var valid = results.filter(function (r) { return r.subject_type === 1 || r.subject_type === 2; });
      allValid = allValid.concat(valid);

      valid.forEach(function (r) {
        if (!isHindi(r)) {
          var s = scoreResult(r, title, year);
          if (s > bestNonHindi.score) bestNonHindi = { result: r, score: s };
        }
      });

      allHindi = allHindi.concat(valid.filter(isHindi));
    });

    // ── Exact-title Hindi retry if no Hindi found ──────────────────────────
    var hindiRetry = Promise.resolve();
    if (bestNonHindi.result && bestNonHindi.score >= 60 && !allHindi.length) {
      var exactHindiQuery = bestNonHindi.result.title + ' Hindi';
      console.log(PLUGIN_TAG + ' Fallback Hindi query: "' + exactHindiQuery + '"');
      hindiRetry = search(exactHindiQuery).catch(function () { return []; }).then(function (extra) {
        var valid = extra.filter(function (r) { return r.subject_type === 1 || r.subject_type === 2; });
        allValid = allValid.concat(valid);
        allHindi = allHindi.concat(valid.filter(isHindi));
      });
    }

    return hindiRetry.then(function () {
      var picked        = null;
      var isHindiResult = false;

      // ── Pick best Hindi (threshold ≥ 20) ──────────────────────────────────
      if (allHindi.length) {
        var bestHindiScore = 0;
        allHindi.forEach(function (r) {
          var s = scoreResult(r, title, year);
          console.log(PLUGIN_TAG + ' Hindi candidate: "' + r.title + '" score=' + s);
          if (s > bestHindiScore) { bestHindiScore = s; picked = r; }
        });
        if (picked && bestHindiScore >= 20) {
          console.log(PLUGIN_TAG + ' Best Hindi: "' + picked.title + '" score=' + bestHindiScore);
          isHindiResult = true;
        } else {
          console.log(PLUGIN_TAG + ' Hindi score too low (' + bestHindiScore + '), falling back');
          picked = null;
        }
      }

      // ── Fallback: best overall (threshold ≥ 30) ───────────────────────────
      if (!picked) {
        var bestOverallScore = 0;
        allValid.forEach(function (r) {
          var s = scoreResult(r, title, year);
          console.log(PLUGIN_TAG + ' Overall candidate: "' + r.title + '" score=' + s);
          if (s > bestOverallScore) { bestOverallScore = s; picked = r; }
        });
        if (picked && bestOverallScore >= 30) {
          console.log(PLUGIN_TAG + ' Best overall: "' + picked.title + '" score=' + bestOverallScore);
          isHindiResult = hasHindiTag(picked.title);
        } else {
          console.log(PLUGIN_TAG + ' No suitable result found');
          return { picked: null, isHindiResult: false };
        }
      }

      return { picked: picked, isHindiResult: isHindiResult };
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Raw Stream Fetch
// ─────────────────────────────────────────────────────────────────────────────

function getStreamsRaw(subjectId, detailPath, se, ep) {
  var url = new URL(MB_BASE + '/wefeed-h5api-bff/subject/play');
  url.searchParams.set('subjectId',  String(subjectId));
  url.searchParams.set('se',         String(se  != null ? se  : 0));
  url.searchParams.set('ep',         String(ep  != null ? ep  : 0));
  url.searchParams.set('detailPath', detailPath);

  var referer = MB_BASE + '/movies/' + detailPath + '?id=' + subjectId + '&type=/movie/detail&detailSe=&detailEp=&lang=en';

  return fetchJson(url.toString(), { Referer: referer }).then(function (data) {
    if (!data)            throw new Error('No response data');
    if (data.code !== 0)  throw new Error(data.message || 'API error code ' + data.code);
    return (data.data && data.data.streams) ? data.data.streams : [];
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Stream Formatter + Builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert raw resolution value to a clean label.
 */
function resolutionToLabel(res) {
  if (!res && res !== 0) return 'Auto';
  if (typeof res === 'number') return res + 'p';
  var m = String(res).match(/(\d+)/);
  return m ? m[1] + 'p' : String(res);
}

function qualitySortScore(label) {
  var m = (label || '').match(/(\d+)/);
  if (m) return parseInt(m[1]);
  if (label === 'Auto') return 9999;
  return 0;
}

/**
 * Build a Nuvio-compatible stream object from a raw MovieBox stream entry.
 *
 * ── No proxy needed ─────────────────────────────────────────────────────────
 * Nuvio passes behaviorHints.headers to the media player for every request
 * (including HLS segment fetches). This is equivalent to what the Stremio addon
 * achieves by routing through /proxy — the headers are sent with every chunk.
 *
 * Stream name:  📺 MovieBox | 1080p | Hindi
 * Stream title: Peaky Blinders (2026) · S01E01
 *               📺 1080p  🔊 Hindi  🎵 DDP5.1  💾 1.2GB
 *               by Sanchit · @S4NCHITT · Murph's Streams
 */
function buildStream(rawStream, tmdbTitle, tmdbYear, langLabel, mediaType, seasonNum, episodeNum) {
  var quality = resolutionToLabel(rawStream.resolutions);
  var rawUrl  = rawStream.url || '';

  // ── Stream name (picker row) ───────────────────────────────────────────────
  var streamName = '📺 MovieBox | ' + quality + ' | ' + langLabel;

  // ── Stream title (detail lines) ────────────────────────────────────────────
  var lines = [];

  // Line 1: content title + year + episode
  var titleLine = tmdbTitle;
  if (tmdbYear)  titleLine += ' (' + tmdbYear + ')';
  if (mediaType === 'tv' && seasonNum != null && episodeNum != null) {
    titleLine += ' · S' + String(seasonNum).padStart(2, '0') + 'E' + String(episodeNum).padStart(2, '0');
  }
  lines.push(titleLine);

  // Line 2: quality + language
  var techLine = '📺 ' + quality + '  🔊 ' + langLabel;
  if (rawStream.codecName) techLine += '  🎞 ' + rawStream.codecName;
  if (rawStream.format)    techLine += '  [' + rawStream.format + ']';
  lines.push(techLine);

  // Line 3: size + duration
  var sizeLine = '';
  if (rawStream.size) {
    var sizeMb = Math.round((Number(rawStream.size) / 1024 / 1024) * 10) / 10;
    sizeLine += '💾 ' + sizeMb + ' MB';
  }
  if (rawStream.duration) {
    var mins = Math.round(rawStream.duration / 60);
    sizeLine += (sizeLine ? '  ' : '') + '⏱ ' + mins + 'min';
  }
  if (sizeLine) lines.push(sizeLine);

  lines.push("by Sanchit · @S4NCHITT · Murph's Streams");

  return {
    name  : streamName,
    title : lines.join('\n'),
    url   : rawUrl,
    quality: quality,
    // ── behaviorHints.headers ──────────────────────────────────────────────
    // These replace the /proxy wrapper used in the Stremio addon.
    // Nuvio's player sends these headers with every HTTP request for this
    // stream, including HLS segment fetches — no proxy server needed.
    behaviorHints: {
      headers     : MB_STREAM_HEADERS,
      bingeGroup  : 'moviebox-' + langLabel.toLowerCase(),
      notWebReady : false,
    },
    subtitles: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — getStreams
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main entry point called by the Nuvio plugin runner.
 *
 * @param {string}        tmdbId     - TMDB content ID
 * @param {string}        type       - "movie" | "tv" | "series"
 * @param {number|string} season     - Season number  (TV only)
 * @param {number|string} episode    - Episode number (TV only)
 * @returns {Promise<Array>}           Array of Nuvio-compatible stream objects
 */
function getStreams(tmdbId, type, season, episode) {
  var cacheKey = 'mb_' + tmdbId + '_' + type + '_' + season + '_' + episode;
  var hit      = streamCache.get(cacheKey);
  if (hit) { console.log(PLUGIN_TAG + ' Cache HIT: ' + cacheKey); return Promise.resolve(hit); }

  var mediaType  = (type === 'series') ? 'tv' : (type || 'movie');
  var seasonNum  = season  ? parseInt(season)  : (mediaType === 'tv' ? 1 : null);
  var episodeNum = episode ? parseInt(episode) : (mediaType === 'tv' ? 1 : null);

  console.log(PLUGIN_TAG + ' ► TMDB: ' + tmdbId + ' | ' + mediaType + (seasonNum ? ' S' + seasonNum + 'E' + episodeNum : ''));

  return getTmdbDetails(tmdbId, mediaType).then(function (details) {
    if (!details || !details.title) {
      console.log(PLUGIN_TAG + ' TMDB lookup failed.'); return [];
    }

    var title = details.title;
    var year  = details.year;
    console.log(PLUGIN_TAG + ' Title: "' + title + '" (' + year + ')');

    // ── Step 1: Parallel multi-query search with scoring ─────────────────────
    return pickBest(title, year).then(function (result) {
      var picked        = result.picked;
      var isHindiResult = result.isHindiResult;

      if (!picked) { console.log(PLUGIN_TAG + ' No match found.'); return []; }
      console.log(PLUGIN_TAG + ' Picked: "' + picked.title + '" (id=' + picked.subject_id + ')');

      // ── Step 2: Language label ───────────────────────────────────────────
      var langLabel;
      if (isHindiResult || hasHindiTag(picked.title)) {
        langLabel = 'Hindi';
      } else {
        langLabel = getLanguageFromTitle(picked.title);
      }
      console.log(PLUGIN_TAG + ' Language: ' + langLabel);

      // ── Step 3: se/ep parameters ─────────────────────────────────────────
      // We trust the mediaType from TMDB — no need to call getDetail()
      // (saves one full HTTP round-trip, mirrors v4.0 optimisation)
      var se = (mediaType === 'tv') ? seasonNum  : 0;
      var ep = (mediaType === 'tv') ? episodeNum : 0;

      // ── Step 4: Fetch raw streams ─────────────────────────────────────────
      return getStreamsRaw(picked.subject_id, picked.detail_path, se, ep).then(function (rawStreams) {
        if (!rawStreams.length) {
          console.log(PLUGIN_TAG + ' No streams returned by API.'); return [];
        }

        console.log(PLUGIN_TAG + ' ' + rawStreams.length + ' raw stream(s) from API');

        // ── Step 5: Sort descending by resolution, build stream objects ───────
        var sorted = rawStreams.slice().sort(function (a, b) {
          return Number(b.resolutions || 0) - Number(a.resolutions || 0);
        });

        var streams = sorted.map(function (s) {
          return buildStream(s, title, year, langLabel, mediaType, seasonNum, episodeNum);
        }).filter(function (s) { return !!s.url; });

        console.log(PLUGIN_TAG + ' ✔ ' + streams.length + ' stream(s) ready');
        if (streams.length) streamCache.set(cacheKey, streams);
        return streams;

      }).catch(function (err) {
        console.log(PLUGIN_TAG + ' getStreamsRaw error: ' + err.message);
        return [];
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