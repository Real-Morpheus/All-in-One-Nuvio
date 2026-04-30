/**
 * brazucaplay - Built from src/brazucaplay/
 * Updated: 2026-05-01 (English Audio Support Added)
 */
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
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

// src/utils/ua.js
var require_ua = __commonJS({
  "src/utils/ua.js"(exports2, module2) {
    var UA_POOL = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36"
    ];
    function getRandomUA() {
      const index = Math.floor(Math.random() * UA_POOL.length);
      return UA_POOL[index];
    }
    module2.exports = { getRandomUA, UA_POOL };
  }
});

// src/utils/http.js
var require_http = __commonJS({
  "src/utils/http.js"(exports2, module2) {
    var { getRandomUA } = require_ua();
    var DEFAULT_CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    var sessionUA = null;
    function setSessionUA2(ua) {
      sessionUA = ua;
    }
    function getSessionUA() {
      return sessionUA || DEFAULT_CHROME_UA;
    }
    function getStealthHeaders() {
      return {
        "User-Agent": getSessionUA(),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "Accept-Language": "es-US,es;q=0.9,en-US;q=0.8,en;q=0.7,es-419;q=0.6",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1"
      };
    }
    var DEFAULT_UA = getSessionUA();
    var MOBILE_UA = getSessionUA();
    function request(url, options) {
      return __async(this, null, function* () {
        var opt = options || {};
        var currentUA = opt.headers && opt.headers["User-Agent"] ? opt.headers["User-Agent"] : getSessionUA();
        var headers = Object.assign({
          "User-Agent": currentUA,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
        }, opt.headers);
        try {
          var fetchOptions = Object.assign({
            redirect: opt.redirect || "follow"
          }, opt, {
            headers
          });
          var response = yield fetch(url, fetchOptions);
          return response;
        } catch (error) {
          console.error("[HTTP] Error: " + error.message);
          throw error;
        }
      });
    }
    function fetchHtml(url, options) {
      return __async(this, null, function* () {
        var res = yield request(url, options);
        return yield res.text();
      });
    }
    function fetchJson2(url, options) {
      return __async(this, null, function* () {
        var res = yield request(url, options);
        return yield res.json();
      });
    }
    module2.exports = { request, fetchHtml, fetchJson: fetchJson2, getSessionUA, setSessionUA: setSessionUA2, getStealthHeaders, DEFAULT_UA, MOBILE_UA };
  }
});

// src/utils/m3u8.js
var require_m3u8 = __commonJS({
  "src/utils/m3u8.js"(exports2, module2) {
    var { getSessionUA } = require_http();
    function getQualityFromHeight(height) {
      if (!height) return "1080p";
      const h = parseInt(height);
      if (h >= 2160) return "4K";
      if (h >= 1440) return "1440p";
      if (h >= 1080) return "1080p";
      if (h >= 720) return "720p";
      if (h >= 480) return "480p";
      return "360p";
    }
    function parseBestQuality(content, url = "") {
      let bestHeight = 0;
      if (content) {
        const lines = content.split("\n");
        for (const line of lines) {
          if (line.includes("RESOLUTION=")) {
            const match = line.match(/RESOLUTION=\d+x(\d+)/i);
            if (match) {
              const height = parseInt(match[1]);
              if (height > bestHeight) bestHeight = height;
            }
          }
        }
      }
      let quality = "1080p";
      if (bestHeight > 0) quality = getQualityFromHeight(bestHeight);
      return { quality, isReal: bestHeight > 0 };
    }
    function validateStream(stream, signal = null) {
      return __async(this, null, function* () {
        if (!stream || !stream.url) return stream;
        try {
          const response = yield fetch(stream.url, { method: "GET", headers: { "User-Agent": getSessionUA() }, signal });
          if (!response.ok) return __spreadProps(__spreadValues({}, stream), { verified: false });
          const text = yield response.text();
          const info = parseBestQuality(text, stream.url);
          return __spreadValues(__spreadValues({}, stream), { verified: true, quality: info.quality, isReal: info.isReal });
        } catch (e) {
          return __spreadProps(__spreadValues({}, stream), { verified: false });
        }
      });
    }
    module2.exports = { validateStream, getQualityFromHeight };
  }
});

// src/utils/sorting.js
var sorting_exports = {};
__export(sorting_exports, { sortStreamsByQuality: () => sortStreamsByQuality });
function sortStreamsByQuality(streams) {
  if (!Array.isArray(streams)) return [];
  const QUALITY_SCORE = { "4K": 100, "1440p": 90, "1080p": 80, "720p": 70, "480p": 60, "360p": 50 };
  return [...streams].sort((a, b) => (QUALITY_SCORE[b.quality] || 0) - (QUALITY_SCORE[a.quality] || 0));
}
var init_sorting = __esm({ "src/utils/sorting.js"() {} });

// src/utils/mirrors.js
var require_mirrors = __commonJS({
  "src/utils/mirrors.js"(exports2, module2) {
    function isMirror(url, groupName) { return false; } // Simplified for brevity
    module2.exports = { isMirror };
  }
});

// src/utils/engine.js
var require_engine = __commonJS({
  "src/utils/engine.js"(exports2, module2) {
    var { validateStream } = require_m3u8();
    var { sortStreamsByQuality: sortStreamsByQuality2 } = (init_sorting(), __toCommonJS(sorting_exports));
    
    function normalizeLanguage(lang) {
      const l = (lang || "").toLowerCase();
      if (l.includes("lat") || l.includes("esp") || l.includes("cas")) return "Latino";
      if (l.includes("sub") || l.includes("vose")) return "Subtitulado";
      if (l.includes("eng") || l.includes("en-us") || l === "en" || l.includes("original")) return "Inglés";
      return "Latino";
    }

    function finalizeStreams2(streams, providerName, mediaTitle) {
      return __async(this, null, function* () {
        if (!Array.isArray(streams) || streams.length === 0) return [];
        const sorted = sortStreamsByQuality2(streams);
        const processed = [];
        for (const s of sorted) {
          const rawLang = normalizeLanguage(s.audio || s.lang || "Latino");
          const l = rawLang.toLowerCase();
          
          // UPDATED: Now allows English/Inglés in addition to Latino/Español
          const isAllowed = l.includes("latino") || l.includes("español") || l.includes("inglés") || l.includes("english");
          
          if (!isAllowed) continue;

          processed.push({
            name: `${providerName} - ${s.quality || "HD"}`,
            title: `${rawLang} - ${s.serverName || "Server"}`,
            url: s.url,
            quality: s.quality,
            language: rawLang,
            headers: s.headers
          });
        }
        return processed;
      });
    }
    module2.exports = { finalizeStreams: finalizeStreams2, normalizeLanguage };
  }
});

// src/brazucaplay/index.js
var { fetchJson, setSessionUA } = require_http();
var { finalizeStreams } = require_engine();
var API_DEC = "https://enc-dec.app/api/dec-videasy";
var TMDB_API_KEY = "d131017ccc6e5462a81c9304d21476de";
var TMDB_BASE_URL = "https://api.themoviedb.org/3";
var SERVERS = { "Gekko": { url: "https://api2.videasy.net/cuevana/sources-with-title", label: "Cuevana" } };
var CINEBY_HEADERS = {
  "Accept": "*/*",
  "Origin": "https://cineby.sc",
  "Referer": "https://cineby.sc/",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"
};

function getStreams(tmdbId, mediaType = "movie", season = null, episode = null) {
  return __async(this, null, function* () {
    try {
      setSessionUA(CINEBY_HEADERS["User-Agent"]);
      const tmdbUrl = `${TMDB_BASE_URL}/${mediaType === "tv" ? "tv" : "movie"}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;
      const tmdbData = yield fetchJson(tmdbUrl);
      const title = tmdbData.title || tmdbData.name;
      const year = (tmdbData.release_date || tmdbData.first_air_date || "").split("-")[0];
      const doubleEncTitle = encodeURIComponent(encodeURIComponent(title));
      const imdbId = tmdbData.external_ids?.imdb_id || "";

      const serverPromises = Object.entries(SERVERS).map(([serverId, config]) => __async(this, null, function* () {
        try {
          let searchUrl = `${config.url}?title=${doubleEncTitle}&mediaType=${mediaType === "tv" ? "tv" : "movie"}&year=${year}&tmdbId=${tmdbId}&imdbId=${imdbId}`;
          if (mediaType === "tv") searchUrl += `&episodeId=${episode || 1}&seasonId=${season || 1}`;
          
          const encryptedRes = yield fetch(searchUrl, { headers: CINEBY_HEADERS });
          const encryptedText = yield encryptedRes.text();
          if (!encryptedText || encryptedText.length < 20) return [];

          const decRes = yield fetch(API_DEC, {
            method: "POST",
            headers: { "Content-Type": "application/json", "User-Agent": CINEBY_HEADERS["User-Agent"] },
            body: JSON.stringify({ text: encryptedText, id: String(tmdbId) })
          });
          const decData = yield decRes.json();
          const mediaData = decData.result || decData;

          const localResults = [];
          if (mediaData && mediaData.sources) {
            for (const source of mediaData.sources) {
              if (source.url) {
                localResults.push({
                  serverName: config.label,
                  // UPDATED: Dynamically use source audio if it exists, otherwise default to Latino
                  audio: source.audio || source.language || "Latino",
                  quality: (source.quality || "1080p").toUpperCase(),
                  url: source.url,
                  headers: CINEBY_HEADERS
                });
              }
            }
          }
          return localResults;
        } catch (err) { return []; }
      }));

      const allResults = yield Promise.all(serverPromises);
      return finalizeStreams(allResults.flat(), "BrazucaPlay", title);
    } catch (error) { return []; }
  });
}

module.exports = { getStreams };
