// MoviesDrive Provider Plugin (nuvio) – Accurate Season & Type Matching

var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop)) __defNormalProp(a, prop, b[prop]);
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
    var fulfilled = (value) => { try { step(generator.next(value)); } catch (e) { reject(e); } };
    var rejected = (value) => { try { step(generator.throw(value)); } catch (e) { reject(e); } };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// -------------- CONFIG --------------
const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const DOMAIN_JSON_URL = "https://himanshu8443.github.io/providers/modflix.json";
const PROVIDER_KEY = "drive";
const HF_API_BASE = "https://badboysxs-md.hf.space";
const HF_MOVIE_API = HF_API_BASE + "/movie";
const HF_SERIES_API = HF_API_BASE + "/series";

let moviesDriveDomain = "";
let domainCacheTimestamp = 0;
const DOMAIN_CACHE_TTL = 60 * 60 * 1000;

// -------------- UTILS --------------
function makeRequest(url, options = {}) {
  return __async(this, null, function* () {
    const defaultHeaders = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept": "application/json",
    };
    const opts = __spreadProps(__spreadValues({}, options), {
      headers: __spreadValues(__spreadValues({}, defaultHeaders), options.headers || {}),
    });
    const res = yield fetch(url, opts);
    if (!res.ok) throw new Error(`HTTP \( {res.status}: \){res.statusText}`);
    return res;
  });
}

function extractSeason(title) {
  const patterns = [
    /(?:Season|S)\s*(\d+)/i,
    /S0?(\d{1,2})/i,
    /\(S(\d+)\)/i,
  ];
  for (const p of patterns) {
    const m = title.match(p);
    if (m) return parseInt(m[1]);
  }
  return -1;
}

function isSeriesTitle(title) {
  return /season|complete web series|full season|s\d{1,2}|episode|web series/i.test(title);
}

// -------------- DOMAIN RESOLVER --------------
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
        if (data?.[PROVIDER_KEY]?.url) {
          moviesDriveDomain = data[PROVIDER_KEY].url.replace(/\/$/, "");
          domainCacheTimestamp = now;
        }
      }
    } catch (e) {
      console.error("[MoviesDrive] Domain fetch failed:", e.message);
    }
    return moviesDriveDomain;
  });
}

// -------------- SEARCH --------------
function searchMoviesDrive(query) {
  return __async(this, null, function* () {
    const domain = yield getMoviesDriveDomain();
    if (!domain) return [];

    const apiUrl = `\( {domain}/search.php?q= \){encodeURIComponent(query)}&page=1`;

    const searchHeaders = {
      "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36",
      "Accept": "*/*",
      "Referer": `\( {domain}/search.html?q= \){encodeURIComponent(query)}`,
    };

    try {
      const res = yield makeRequest(apiUrl, { headers: searchHeaders });
      const data = yield res.json();
      if (data?.hits?.length > 0) {
        return data.hits.map(hit => ({
          title: hit.document.post_title,
          permalink: hit.document.permalink,
          imdb_id: hit.document.imdb_id || "",
        }));
      }
    } catch (e) {
      console.error("[MoviesDrive] Search failed:", e);
    }
    return [];
  });
}

// -------------- MAIN getStreams --------------
function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  return __async(this, null, function* () {
    console.log(`[MoviesDrive] getStreams: TMDB=\( {tmdbId}, type= \){mediaType}, S=\( {seasonNum}, E= \){episodeNum}`);

    try {
      // 1. Get TMDB Info
      const tmdbUrl = `https://api.themoviedb.org/3/\( {mediaType}/ \){tmdbId}?api_key=${TMDB_API_KEY}`;
      const tmdbRes = yield makeRequest(tmdbUrl);
      const tmdbData = yield tmdbRes.json();

      const originalTitle = mediaType === "tv" ? tmdbData.name : tmdbData.title;
      const year = (mediaType === "tv" ? tmdbData.first_air_date : tmdbData.release_date)?.substring(0, 4) || "";

      if (!originalTitle) return [];

      const domain = yield getMoviesDriveDomain();
      if (!domain) return [];

      // 2. Smart Search Query
      let searchQuery = originalTitle;
      if (mediaType === "tv" && seasonNum) {
        searchQuery = `\( {originalTitle} Season \){seasonNum}`;
      }

      let results = yield searchMoviesDrive(searchQuery);

      // Fallback search without season
      if (results.length === 0 && mediaType === "tv") {
        results = yield searchMoviesDrive(originalTitle);
      }

      if (results.length === 0) return [];

      // 3. Smart Selection Logic (Most Important Part)
      let selected = null;

      if (mediaType === "tv") {
        // Prefer results that look like series
        const seriesResults = results.filter(r => isSeriesTitle(r.title));

        if (seriesResults.length > 0) {
          const targetSeason = seasonNum || 1;

          // Best match: Exact season + recent upload
          selected = seriesResults.find(r => extractSeason(r.title) === targetSeason);

          // If exact season not found, take the first series result (usually complete or latest)
          if (!selected) {
            selected = seriesResults[0];
          }
        } else {
          selected = results[0]; // fallback
        }
      } 
      else {
        // For Movies → Prefer non-series results + year match
        selected = results.find(r => 
          !isSeriesTitle(r.title) && 
          (year && r.title.includes(year) || r.imdb_id)
        ) || results[0];
      }

      if (!selected) return [];

      console.log(`[MoviesDrive] Selected → ${selected.title}`);

      const pageUrl = domain + selected.permalink;

      // 4. Auto detect endpoint based on selected title (Extra Safety)
      const isSeriesContent = isSeriesTitle(selected.title) || mediaType === "tv";

      let rawLinks = [];

      if (!isSeriesContent) {
        // Movie
        const movieUrl = `\( {HF_MOVIE_API}?url= \){encodeURIComponent(pageUrl)}`;
        const res = yield makeRequest(movieUrl);
        const data = yield res.json();
        rawLinks = data?.links || [];
      } else {
        // Series
        const seriesUrl = `\( {HF_SERIES_API}?url= \){encodeURIComponent(pageUrl)}`;
        const res = yield makeRequest(seriesUrl);
        const data = yield res.json();

        if (data?.episodes) {
          const targetS = seasonNum || 1;
          const targetE = episodeNum || 1;

          const episode = data.episodes.find(ep => 
            Number(ep.season) === targetS && Number(ep.episode) === targetE
          );

          rawLinks = episode?.links || [];
        }
      }

      if (!rawLinks || rawLinks.length === 0) return [];

      // 5. Build Streams
      const streams = rawLinks.map(link => ({
        name: `MoviesDrive ${link.name || "Direct"}`,
        title: link.stream_title || `\( {originalTitle} - \){link.quality || "?"}p`,
        url: link.url,
        type: "direct",
        quality: link.quality ? `${link.quality}p` : "Unknown",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer": pageUrl,
        },
      }));

      streams.sort((a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0));

      console.log(`[MoviesDrive] Returning ${streams.length} streams`);
      return streams;

    } catch (e) {
      console.error("[MoviesDrive] Error:", e.message);
      return [];
    }
  });
}

// Export
if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
