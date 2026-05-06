// MoviesDrive Provider Plugin (nuvio)
// Searches MoviesDrive directly, picks the correct page, uses /movie or /series endpoint

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

// --------------- CONFIG ---------------
const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const DOMAIN_JSON_URL = "https://himanshu8443.github.io/providers/modflix.json";
const PROVIDER_KEY = "drive";
const HF_API_BASE = "https://badboysxs-md.hf.space";   // <-- your HF space URL
const HF_MOVIE_API = HF_API_BASE + "/movie";
const HF_SERIES_API = HF_API_BASE + "/series";
let moviesDriveDomain = "";
let domainCacheTimestamp = 0;
const DOMAIN_CACHE_TTL = 60 * 60 * 1000;

// --------------- UTILS ---------------
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
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  });
}

// Extract season number from title (e.g., "Season 2" → 2, "S02" → 2)
function extractSeason(title) {
  const m = title.match(/Season\s*(\d+)/i);
  if (m) return parseInt(m[1]);
  const alt = title.match(/\bS(\d{2})\b/i);
  if (alt) return parseInt(alt[1]);
  return -1;
}

// Detect if title is a series (contains "Season", "Complete Web Series", "Episode", "S0x")
function isSeries(title) {
  return /season|complete web series|episode|s\d{2}/i.test(title);
}

// --------------- DOMAIN RESOLVER ---------------
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
          moviesDriveDomain = data[PROVIDER_KEY].url.replace(/\/$/, "");
          domainCacheTimestamp = now;
        }
      }
    } catch (e) {
      console.error("[MoviesDrive] Domain fetch error:", e);
    }
    return moviesDriveDomain;
  });
}

// --------------- SEARCH (MoviesDrive native) ---------------
function searchMoviesDrive(query) {
  return __async(this, null, function* () {
    const domain = yield getMoviesDriveDomain();
    if (!domain) return [];

    const url = `${domain}/search.php?q=${encodeURIComponent(query)}&page=1`;
    const headers = {
      "Accept": "*/*",
      "Accept-Encoding": "gzip, deflate, br",
      "Accept-Language": "en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7",
      "Cookie": "_ga=GA1.1.625399613.1778035100; _ga_YLNESKK47K=GS2.1.s1778047448$o2$g1$t1778047466$j42$l0$h0",
      "Referer": `${domain}/search.html?q=${encodeURIComponent(query)}`,
      "Sec-Ch-Ua": "\"Not-A.Brand\";v=\"99\", \"Chromium\";v=\"124\"",
      "Sec-Ch-Ua-Mobile": "?1",
      "Sec-Ch-Ua-Platform": "\"Android\"",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36"
    };
    try {
      const res = yield makeRequest(url, { headers });
      const data = yield res.json();
      if (data && data.hits && data.hits.length > 0) {
        return data.hits.map(hit => ({
          title: hit.document.post_title,
          permalink: hit.document.permalink,
        }));
      }
    } catch (e) {
      console.error("[MoviesDrive] Search error:", e);
    }
    return [];
  });
}

// --------------- MAIN getStreams ---------------
function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  return __async(this, null, function* () {
    try {
      // 1. TMDB metadata
      const tmdbUrl = `https://api.themoviedb.org/3/${mediaType === "tv" ? "tv" : "movie"}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;
      const tmdbRes = yield makeRequest(tmdbUrl);
      const tmdbData = yield tmdbRes.json();
      const title = mediaType === "tv" ? tmdbData.name : tmdbData.title;
      const year = (mediaType === "tv" ? tmdbData.first_air_date : tmdbData.release_date)?.substring(0, 4) || "";
      if (!title) return [];

      // 2. Build search query: for series include season, for movies just title
      let query;
      if (mediaType === "tv") {
        // Example: "Daredevil Season 2" – no episode number in the search!
        query = `${title} Season ${seasonNum || 1}`;
      } else {
        query = title;
      }
      let results = yield searchMoviesDrive(query);

      // Fallback: if no results with season, search without season
      if (results.length === 0 && mediaType === "tv") {
        results = yield searchMoviesDrive(title);
      }
      if (results.length === 0) return [];

      // 3. Pick the correct result
      let selected;
      if (mediaType === "movie") {
        // Prefer non-series results, then year matching
        const movies = results.filter(r => !isSeries(r.title));
        if (movies.length > 0) {
          selected = movies.find(r => year && r.title.includes(year)) || movies[0];
        } else {
          selected = results.find(r => year && r.title.includes(year)) || results[0];
        }
      } else {
        // TV: pick series results that match the season
        const seriesResults = results.filter(r => isSeries(r.title));
        const targetSeason = seasonNum || 1;
        selected = seriesResults.find(r => extractSeason(r.title) === targetSeason);
        if (!selected && seriesResults.length > 0) {
          // Fallback: any series result (maybe season not in title)
          selected = seriesResults[0];
        }
        if (!selected) selected = results[0]; // last resort
      }
      if (!selected) return [];
      console.log("[MoviesDrive] Selected:", selected.title);

      const domain = yield getMoviesDriveDomain();
      if (!domain) return [];
      const pageUrl = domain + selected.permalink;

      // 4. Call the appropriate HF endpoint
      let rawLinks = [];
      if (mediaType === "movie") {
        const movieUrl = `${HF_MOVIE_API}?url=${encodeURIComponent(pageUrl)}`;
        const movieRes = yield makeRequest(movieUrl);
        const movieData = yield movieRes.json();
        if (movieData && movieData.links) rawLinks = movieData.links;
      } else {
        const seriesUrl = `${HF_SERIES_API}?url=${encodeURIComponent(pageUrl)}`;
        const seriesRes = yield makeRequest(seriesUrl);
        const seriesData = yield seriesRes.json();
        if (seriesData && seriesData.episodes) {
          const s = seasonNum || 1;
          const epNum = episodeNum || 1;
          const episode = seriesData.episodes.find(e => e.season == s && e.episode == epNum);
          if (episode && episode.links) rawLinks = episode.links;
        }
      }
      if (!rawLinks || rawLinks.length === 0) return [];

      // 5. Build streams using the API's stream_title
      return rawLinks.map(link => ({
        name: `MoviesDrive ${link.name || "Direct"}`,
        title: link.stream_title || `${title} - ${link.quality || "?"}p`,
        url: link.url,
        type: "direct",
        quality: link.quality ? `${link.quality}p` : "Unknown",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer": pageUrl,
        },
      })).sort((a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0));
    } catch (e) {
      console.error("[MoviesDrive] getStreams error:", e);
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
