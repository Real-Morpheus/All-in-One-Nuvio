var __create = Object.create;
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __getProtoOf = Object.getPrototypeOf;
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
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
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

// src/fuegocine/http.js
var import_axios = __toESM(require("axios"));
var HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
};
function get(_0) {
  return __async(this, arguments, function* (url, extraHeaders = {}, timeout = 15e3) {
    const { data } = yield import_axios.default.get(url, {
      headers: __spreadValues(__spreadValues({}, HEADERS), extraHeaders),
      timeout
    });
    return data;
  });
}

// src/fuegocine/extractor.js
function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : r & 3 | 8;
    return v.toString(16);
  });
}
function decodeUrl(url) {
  const b64Match = url.match(/[?&]r=([A-Za-z0-9+/=]+)/);
  if (b64Match) {
    try {
      return atob(b64Match[1]);
    } catch (e) {
      return url;
    }
  }
  const linkMatch = url.match(/[?&]link=([^&]+)/);
  if (linkMatch) {
    try {
      return decodeURIComponent(linkMatch[1]);
    } catch (e) {
      return url;
    }
  }
  const driveMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (driveMatch) {
    const uuid = generateUUID();
    return `https://drive.usercontent.google.com/download?id=${driveMatch[1]}&export=download&confirm=t&uuid=${uuid}`;
  }
  return url;
}
function extractLinks(html) {
  var _a, _b;
  const links = [];
  const match = html.match(/const\s+_SV_LINKS\s*=\s*\[([\s\S]*?)\]\s*;?\s*<\/script>/);
  if (!match) return links;
  const block = match[1];
  const entries = block.split(/\},?\s*\{/).map((e, i, arr) => {
    if (i === 0) return "{" + e.replace(/^\s*\{?/, "{");
    if (i === arr.length - 1) return "{" + e.replace(/\}?\s*$/, "") + "}";
    return "{" + e + "}";
  });
  for (const entry of entries) {
    try {
      const lang = (entry.match(/lang\s*:\s*["']([^"']+)["']/) || [])[1] || "";
      const name = ((_b = (_a = (entry.match(/name\s*:\s*["']([^"']+)["']/) || [])[1]) == null ? void 0 : _a.replace(/&#9989;/g, "")) == null ? void 0 : _b.replace(/&amp;/g, "&")) || "";
      const quality = (entry.match(/quality\s*:\s*["']([^"']+)["']/) || [])[1] || "";
      const rawUrl = (entry.match(/url\s*:\s*["']([^"']+)["']/) || [])[1] || "";
      if (!rawUrl) continue;
      links.push({ name, lang, quality, url: decodeUrl(rawUrl), rawUrl });
    } catch (e) {
    }
  }
  return links;
}
function resolveTurboVid(embedUrl) {
  return __async(this, null, function* () {
    var _a;
    try {
      const html = yield get(embedUrl, { Referer: "https://www.fuegocine.com/" });
      const hashMatch = html.match(/data-hash="([^"]+\.m3u8[^"]*)"/);
      if (!hashMatch) return embedUrl;
      const masterUrl = hashMatch[1];
      const m3u8 = yield get(masterUrl, { Referer: "https://turbovidhls.com/" });
      const streams = [];
      const lines = m3u8.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const inf = lines[i].match(/^#EXT-X-STREAM-INF:.*BANDWIDTH=(\d+)/);
        if (inf && ((_a = lines[i + 1]) == null ? void 0 : _a.trim())) {
          streams.push({ bandwidth: parseInt(inf[1]), url: lines[i + 1].trim() });
        }
      }
      if (!streams.length) return masterUrl;
      streams.sort((a, b) => b.bandwidth - a.bandwidth);
      return streams[0].url;
    } catch (e) {
      return embedUrl;
    }
  });
}
function resolveVidNest(embedUrl) {
  return __async(this, null, function* () {
    try {
      const html = yield get(embedUrl, { Referer: "https://www.fuegocine.com/" });
      const match = html.match(/sources\s*:\s*\[\s*\{[^}]*file\s*:\s*"([^"]+\.mp4[^"]*)"/);
      return match ? match[1] : embedUrl;
    } catch (e) {
      return embedUrl;
    }
  });
}
var BLOCKED_DOMAINS = ["goodstream.one", "unlimplay.com"];
function resolveLinks(links) {
  return __async(this, null, function* () {
    const resolved = [];
    for (const link of links) {
      if (BLOCKED_DOMAINS.some((d) => link.url.includes(d))) continue;
      if (link.url.includes("turbovidhls.com") || link.url.includes("turbovid")) {
        const url = yield resolveTurboVid(link.url);
        resolved.push(__spreadProps(__spreadValues({}, link), { url, embedUrl: link.url }));
      } else if (link.url.includes("vidnest.io") && link.url.includes("/embed-")) {
        const url = yield resolveVidNest(link.url);
        resolved.push(__spreadProps(__spreadValues({}, link), { url, embedUrl: link.url }));
      } else {
        resolved.push(link);
      }
    }
    return resolved;
  });
}

// src/fuegocine/index.js
var TMDB_KEY = "2dca580c2a14b55200e784d157207b4d";
var TMDB_BASE = "https://api.themoviedb.org/3";
var SEARCH_BASE = "https://www.fuegocine.com/feeds/posts/default?alt=json&max-results=10&q=";
function getTmdbInfo(tmdbId, mediaType) {
  return __async(this, null, function* () {
    const type = mediaType === "movie" ? "movie" : "tv";
    const data = yield get(`${TMDB_BASE}/${type}/${tmdbId}?api_key=${TMDB_KEY}&language=en-LA`);
    const title = type === "movie" ? data.title || data.original_title : data.name || data.original_name;
    const year = (type === "movie" ? data.release_date || "" : data.first_air_date || "").slice(0, 4);
    return { title, year };
  });
}
function searchFuegocine(title, season, episode) {
  return __async(this, null, function* () {
    var _a;
    const epStr = episode ? String(episode).padStart(2, "0") : null;
    const query = season ? `${title} ${season}x${epStr}` : title;
    const data = yield get(SEARCH_BASE + encodeURIComponent(query));
    const entries = ((_a = data.feed) == null ? void 0 : _a.entry) || [];
    let results = entries.map((e) => {
      var _a2, _b, _c;
      return {
        title: ((_a2 = e.title) == null ? void 0 : _a2.$t) || "",
        url: ((_c = (_b = e.link) == null ? void 0 : _b.find((l) => l.rel === "alternate")) == null ? void 0 : _c.href) || ""
      };
    }).filter((e) => e.url);
    if (season) {
      const pattern = episode ? new RegExp(`${season}x0*${episode}\\b`, "i") : new RegExp(`${season}x\\d+`, "i");
      results = results.filter((c) => pattern.test(c.title));
    }
    return results;
  });
}
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    try {
      const { title, year } = yield getTmdbInfo(tmdbId, mediaType);
      if (!title) return [];
      console.log(`[FuegoCine] Buscando: ${title}${year ? ` (${year})` : ""}`);
      const candidates = yield searchFuegocine(title, season, episode);
      if (!candidates.length) {
        console.log("[FuegoCine] Sin resultados");
        return [];
      }
      const allStreams = [];
      for (const candidate of candidates) {
        const html = yield get(candidate.url);
        const links = yield resolveLinks(extractLinks(html));
        for (const link of links) {
          allStreams.push({
            name: "FuegoCine",
            title: `[${link.lang.toUpperCase()}] ${link.name} (${link.quality})`,
            url: link.url,
            quality: link.quality,
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              "Referer": "https://www.fuegocine.com/"
            }
          });
        }
      }
      console.log(`[FuegoCine] ${allStreams.length} stream(s) encontrados`);
      return allStreams;
    } catch (err) {
      console.error("[FuegoCine] Error:", err.message);
      return [];
    }
  });
}
module.exports = { getStreams };
