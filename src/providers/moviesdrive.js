// MoviesDrive Provider Plugin (nuvio) – uses https://badboysxs-mdr.hf.space

var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// -------------- CONFIG --------------
const TMDB_API_KEY    = "439c478a771f35c05022f9feabcca01c";

// ── New API (Stremio/Nuvio addon server – FSL & FSLv2 only) ──────────────────
//   Movie streams : GET /streams/movie/tmdb:{id}.json
//   TV streams    : GET /streams/series/tmdb:{id}:{season}:{episode}.json
//   Response      : { "streams": [ { name, title, url, ... }, ... ] }
const HF_API_BASE     = "https://badboysxs-mdr.hf.space";
const HF_STREAMS_BASE = HF_API_BASE + "/streams";

// Domain cache for MoviesDrive search (movies only)
const DOMAIN_JSON_URL = "https://himanshu8443.github.io/providers/modflix.json";
const PROVIDER_KEY    = "drive";
let moviesDriveDomain    = "";
let domainCacheTimestamp = 0;
const DOMAIN_CACHE_TTL   = 60 * 60 * 1000; // 1 hour

// -------------- UTILS --------------
function makeRequest(url, options) {
  return __async(this, null, function* () {
    const opts = __spreadProps(__spreadValues({}, options || {}), {
      headers: __spreadValues({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept":     "application/json",
      }, (options && options.headers) || {}),
    });
    const res = yield fetch(url, opts);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return res;
  });
}

// -------------- DOMAIN RESOLVER (movies only) --------------------------------
function getMoviesDriveDomain() {
  return __async(this, null, function* () {
    const now = Date.now();
    if (now - domainCacheTimestamp < DOMAIN_CACHE_TTL && moviesDriveDomain) {
      return moviesDriveDomain;
    }
    try {
      const res = yield fetch(DOMAIN_JSON_URL);
      if (res.ok) {
        const data = yield res.json();
        if (data && data[PROVIDER_KEY] && data[PROVIDER_KEY].url) {
          moviesDriveDomain    = data[PROVIDER_KEY].url.replace(/\/$/, "");
          domainCacheTimestamp = now;
          console.log(`[MoviesDrive] Domain: ${moviesDriveDomain}`);
        }
      }
    } catch (e) {
      console.error("[MoviesDrive] Failed to fetch domain:", e.message);
    }
    return moviesDriveDomain;
  });
}

// -------------- SEARCH (movies only) -----------------------------------------
function searchMoviesDrive(query) {
  return __async(this, null, function* () {
    const domain = yield getMoviesDriveDomain();
    if (!domain) return [];

    const apiUrl = `${domain}/search.php?q=${encodeURIComponent(query)}&page=1`;
    console.log(`[MoviesDrive] Search: ${apiUrl}`);

    try {
      const res  = yield makeRequest(apiUrl, {
        headers: {
          "Accept":           "*/*",
          "Accept-Language":  "en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7",
          "Referer":          `${domain}/search.html?q=${encodeURIComponent(query)}`,
          "Sec-Fetch-Dest":   "empty",
          "Sec-Fetch-Mode":   "cors",
          "Sec-Fetch-Site":   "same-origin",
          "User-Agent":       "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
        }
      });
      const data = yield res.json();
      if (data && data.hits && data.hits.length > 0) {
        return data.hits.map(hit => ({
          title:     hit.document.post_title,
          permalink: hit.document.permalink,
          imdb_id:   hit.document.imdb_id || ""
        }));
      }
    } catch (e) {
      console.error("[MoviesDrive] Search failed:", e.message);
    }
    return [];
  });
}

// -------------- STREAM FETCHER (new API) ------------------------------------
// Calls the new HF addon server which returns Stremio-format streams.
//
//  Movie  → /streams/movie/tmdb:{id}.json
//  Series → /streams/series/tmdb:{id}:{season}:{episode}.json
//
// Response: { "streams": [ { name, title, url, quality?, headers? }, ... ] }

function fetchStreamsFromAPI(mediaType, tmdbId, season, episode) {
  return __async(this, null, function* () {
    let path;
    if (mediaType === "tv") {
      const s  = season  || 1;
      const ep = episode || 1;
      path = `/streams/series/tmdb:${tmdbId}:${s}:${ep}.json`;
    } else {
      path = `/streams/movie/tmdb:${tmdbId}.json`;
    }

    const url = HF_API_BASE + path;
    console.log(`[MoviesDrive] API request: ${url}`);

    try {
      const res  = yield makeRequest(url);
      const data = yield res.json();
      // Accept both { streams: [...] } and { links: [...] } shapes
      return (data && (data.streams || data.links)) || [];
    } catch (e) {
      console.error("[MoviesDrive] API fetch failed:", e.message);
      return [];
    }
  });
}

// -------------- QUALITY HELPER -----------------------------------------------
function parseQuality(raw) {
  if (!raw) return "Unknown";
  const str = String(raw);
  // already has "p"  → "1080p"
  if (/^\d+p$/i.test(str.trim())) return str.trim();
  // bare number       → "1080p"
  if (/^\d+$/.test(str.trim())) return str.trim() + "p";
  return str;
}

// -------------- MAIN getStreams -----------------------------------------------
function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  return __async(this, null, function* () {
    console.log(`[MoviesDrive] getStreams: TMDB=${tmdbId}, type=${mediaType}, s=${seasonNum}, e=${episodeNum}`);
    try {

      // ── 1. Resolve title via TMDB (needed for display & movie search fallback) ──
      const tmdbEndpoint = mediaType === "tv" ? "tv" : "movie";
      const tmdbUrl = `https://api.themoviedb.org/3/${tmdbEndpoint}/${tmdbId}?api_key=${TMDB_API_KEY}`;
      const tmdbRes  = yield makeRequest(tmdbUrl);
      const tmdbData = yield tmdbRes.json();
      const title    = mediaType === "tv" ? tmdbData.name : tmdbData.title;
      if (!title) { console.warn("[MoviesDrive] No title from TMDB"); return []; }
      console.log(`[MoviesDrive] Title: "${title}"`);

      // ── 2. Try new API first ─────────────────────────────────────────────────
      let rawItems = yield fetchStreamsFromAPI(mediaType, tmdbId, seasonNum, episodeNum);

      // ── 3. Movie fallback: if API returned nothing, scrape MoviesDrive directly ─
      if (!rawItems.length && mediaType === "movie") {
        console.log("[MoviesDrive] API returned nothing – falling back to search");
        const searchResults = yield searchMoviesDrive(title);
        if (searchResults.length) {
          const domain  = yield getMoviesDriveDomain();
          const pageUrl = domain + searchResults[0].permalink;
          // Try the old /movie helper endpoint if the new space still exposes it
          const movieApiUrl = `${HF_API_BASE}/movie?url=${encodeURIComponent(pageUrl)}`;
          console.log(`[MoviesDrive] Fallback /movie: ${movieApiUrl}`);
          try {
            const r    = yield makeRequest(movieApiUrl);
            const d    = yield r.json();
            rawItems   = (d && (d.links || d.streams)) || [];
          } catch (e) {
            console.warn("[MoviesDrive] Fallback also failed:", e.message);
          }
        }
      }

      if (!rawItems || rawItems.length === 0) {
        console.warn("[MoviesDrive] No streams found");
        return [];
      }

      // ── 4. Normalise & map to Nuvio stream objects ───────────────────────────
      //
      // New API (Stremio shape):
      //   { name, title, url, quality?, behaviorHints?, ... }
      //
      // Old API (helper shape):
      //   { name, url, quality, stream_title }
      //
      // We handle both so the fallback path also works.

      const streams = rawItems
        .filter(item => item && item.url)
        .map(item => {
          const quality = parseQuality(item.quality);
          const name    = `MoviesDrive | ${item.name || quality}`;
          const title_  = item.title        // Stremio shape
                       || item.stream_title  // old helper shape
                       || `${title} [${quality}]`;
          return {
            name:    name,
            title:   title_,
            url:     item.url,
            quality: quality,
            headers: __spreadValues({
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }, (item.headers && typeof item.headers === "object") ? item.headers : {}),
          };
        });

      // ── 5. Sort best quality first ───────────────────────────────────────────
      streams.sort((a, b) => {
        const qA = parseInt(a.quality) || 0;
        const qB = parseInt(b.quality) || 0;
        return qB - qA;
      });

      console.log(`[MoviesDrive] Returning ${streams.length} stream(s)`);
      return streams;

    } catch (e) {
      console.error("[MoviesDrive] getStreams error:", e.message || e);
      return [];
    }
  });
}

// -------------- EXPORT -------------------------------------------------------
if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
