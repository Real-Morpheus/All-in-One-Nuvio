// CineStream - Nuvio Provider (Optimized)
// Based on CloudStream extension by megix / SaurabhKaperwan
"use strict";

// ==================== CONSTANTS ====================
const VIDSRC_API    = "https://api.rgshows.ru";
const VIDLINK_API   = "https://vidlink.pro";
const TWOEMBED_API  = "https://2embed.cc";
const AUTOEMBED_API = "https://player.autoembed.app";
const VIDFAST_API   = "https://vidfast.pro";
const VIDSTACK_API  = "https://api.smashystream.top/api/v1";
const VIDSTACK_BASE = "https://smashyplayer.top";
const PLAYIMDB_API  = "https://streamimdb.me";
const VIDSRCCC_API  = "https://vidsrc.cc";
const HEXA_API      = "https://theemoviedb.hexa.su";
const MAPPLE_API    = "https://mapple.uk";
const PULP_API      = "https://api.pulp.watch/v1";
const STREAMVIX_API = "https://streamvix.hayd.uk";
const NOTORRENT_API = "https://addon-osvh.onrender.com";
const MULTIDEC_API  = "https://enc-dec.app/api";
const TMDB_KEY      = "8d6d91941230817f7807d643736e8a49";
const USER_AGENT    = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (Chrome)";
const YFLIX_SERVERS = [
  "https://yflix.to",
  "https://myflixer.bz",
  "https://1moviesz.to",
  "https://sflix.fi",
  "https://flixtor.mov",
  "https://bflix.la",
  "https://myflixer.fi",
  "https://hurawatch.la"
];

// ==================== FETCH WITH TIMEOUT ====================
async function fetchTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error(`Timeout ${timeoutMs}ms: ${url}`);
    throw err;
  }
}

async function httpGet(url, headers = {}) {
  const res = await fetchTimeout(url, {
    headers: { "User-Agent": USER_AGENT, ...headers }
  });
  return res;
}

async function safeText(url, headers = {}) {
  try {
    const res = await httpGet(url, headers);
    return await res.text();
  } catch { return ""; }
}

async function safeJson(url, headers = {}) {
  try {
    const res = await httpGet(url, headers);
    return await res.json();
  } catch { return null; }
}

async function safePost(url, bodyObj, headers = {}) {
  try {
    const res = await fetchTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT, ...headers },
      body: JSON.stringify(bodyObj)
    });
    return await res.json();
  } catch { return null; }
}

// ==================== UTILS ====================
function reFind(str, pattern) {
  const m = new RegExp(pattern).exec(str);
  return m ? m[1] : null;
}
function reFindAll(str, pattern) {
  const re = new RegExp(pattern, "g");
  const out = [];
  let m;
  while ((m = re.exec(str)) !== null) out.push(m);
  return out;
}
function parseQuality(s) {
  if (!s) return "Auto";
  s = String(s).toLowerCase();
  if (s.includes("4k") || s.includes("2160")) return "4K";
  if (s.includes("1080")) return "1080p";
  if (s.includes("720")) return "720p";
  if (s.includes("480")) return "480p";
  return "Auto";
}
function mkStream(name, title, url, quality, referer) {
  return {
    name: name,
    title: title || name,
    url: url,
    quality: parseQuality(quality),
    headers: { Referer: referer || "", "User-Agent": USER_AGENT }
  };
}
function dedupStreams(arr) {
  const seen = new Set();
  return arr.filter(s => {
    if (!s || !s.url) return false;
    if (seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
}

// ==================== EXTRACT FROM HTML ====================
function extractFromHtml(html, sourceName, referer) {
  if (!html) return [];
  const streams = [];
  const seenUrls = new Set();

  function add(url, label) {
    let cleanUrl = url.replace(/\\/g, "");
    if (!cleanUrl || seenUrls.has(cleanUrl)) return;
    seenUrls.add(cleanUrl);
    streams.push(mkStream(sourceName, `${sourceName} [${label || "Auto"}]`, cleanUrl, label || "Auto", referer));
  }

  // "file":"https://...m3u8"
  reFindAll(html, '"file"\\s*:\\s*"(https?://[^"]+\\.m3u8[^"]*)"').forEach(m => add(m[1], "Auto"));
  // src="https://...m3u8"
  reFindAll(html, 'src="(https?://[^"]+\\.m3u8[^"]*)"').forEach(m => add(m[1], "Auto"));
  // raw m3u8 url
  reFindAll(html, '(https?://[^"\'\\s<>]+\\.m3u8(?:[^"\'\\s<>]*)?)').forEach(m => add(m[1], "Auto"));
  // mp4 with label
  reFindAll(html, '"file"\\s*:\\s*"(https?://[^"]+\\.mp4[^"]*)"[^}]*"label"\\s*:\\s*"([^"]+)"').forEach(m => add(m[1], m[2]));
  // plain mp4
  reFindAll(html, '"file"\\s*:\\s*"(https?://[^"]+\\.mp4[^"]*)"').forEach(m => add(m[1], parseQuality(m[1])));
  // sources array
  const srcArr = reFind(html, '"sources"\\s*:\\s*(\\[[^\\]]+\\])');
  if (srcArr) {
    try {
      JSON.parse(srcArr).forEach(s => {
        const u = s.file || s.url || s.src;
        if (u) add(u, s.label || s.quality || "Auto");
      });
    } catch(e) {}
  }
  return streams;
}

// ==================== TMDB TO IMDB ====================
async function tmdbToImdb(tmdbId, isMovie) {
  const type = isMovie ? "movie" : "tv";
  const data = await safeJson(`https://api.themoviedb.org/3/${type}/${tmdbId}/external_ids?api_key=${TMDB_KEY}`);
  return data ? (data.imdb_id || null) : null;
}

// ==================== STREMIO ADDON HELPER ====================
async function stremioStreams(name, baseUrl, imdbId, season, episode, callback) {
  if (!imdbId || !baseUrl) return;
  const path = (season != null)
    ? `/stream/series/${imdbId}%3A${season}%3A${episode}.json`
    : `/stream/movie/${imdbId}.json`;
  const data = await safeJson(baseUrl.replace(/\/$/, "") + path);
  if (!data || !data.streams) return;
  data.streams.forEach(s => {
    if (!s.url) return;
    const q = parseQuality(s.name || "");
    callback(mkStream(name, `${name} [${q}]`, s.url, q,
      (s.behaviorHints?.headers?.Referer) || baseUrl));
  });
}

// ==================== SOURCE IMPLEMENTATIONS ====================
async function srcVidSrc(imdbId, season, episode, callback) {
  if (!imdbId) return;
  const url = (season != null)
    ? `${VIDSRC_API}/api/v2/embed/tv?imdb_id=${imdbId}&season=${season}&episode=${episode}`
    : `${VIDSRC_API}/api/v2/embed/movie?imdb_id=${imdbId}`;
  const data = await safeJson(url);
  if (!data) return;
  const sources = data.result?.sources || data.sources || [];
  sources.forEach(s => {
    if (s.url) callback(mkStream("VidSrc", `VidSrc [${s.quality || "Auto"}]`, s.url, s.quality || "Auto", `${VIDSRC_API}/`));
  });
}

async function srcVidLink(tmdbId, season, episode, callback) {
  if (!tmdbId) return;
  const url = (season != null)
    ? `${VIDLINK_API}/tv/${tmdbId}/${season}/${episode}`
    : `${VIDLINK_API}/movie/${tmdbId}`;
  const html = await safeText(url);
  extractFromHtml(html, "VidLink", url).forEach(callback);
}

async function src2Embed(imdbId, season, episode, callback) {
  if (!imdbId) return;
  const url = (season != null)
    ? `${TWOEMBED_API}/embed/tv?imdb=${imdbId}&s=${season}&e=${episode}`
    : `${TWOEMBED_API}/embed/movie?imdb=${imdbId}`;
  const html = await safeText(url);
  extractFromHtml(html, "2Embed", url).forEach(callback);
}

async function srcAutoEmbed(imdbId, season, episode, callback) {
  if (!imdbId) return;
  const url = (season != null)
    ? `${AUTOEMBED_API}/embed/tv/${imdbId}/${season}/${episode}`
    : `${AUTOEMBED_API}/embed/movie/${imdbId}`;
  const html = await safeText(url);
  extractFromHtml(html, "AutoEmbed", url).forEach(callback);
}

async function srcVidFast(tmdbId, season, episode, callback) {
  if (!tmdbId) return;
  const url = (season != null)
    ? `${VIDFAST_API}/tv/${tmdbId}/${season}/${episode}`
    : `${VIDFAST_API}/movie/${tmdbId}`;
  const html = await safeText(url);
  extractFromHtml(html, "VidFast", url).forEach(callback);
}

async function srcVidsrcCC(imdbId, season, episode, callback) {
  if (!imdbId) return;
  const url = (season != null)
    ? `${VIDSRCCC_API}/embed/tv/${imdbId}/${season}-${episode}`
    : `${VIDSRCCC_API}/embed/movie/${imdbId}`;
  const html = await safeText(url);
  extractFromHtml(html, "VidsrcCC", url).forEach(callback);
}

async function srcPlayImdb(imdbId, season, episode, callback) {
  if (!imdbId) return;
  const url = (season != null)
    ? `${PLAYIMDB_API}/tv/${imdbId}/${season}/${episode}`
    : `${PLAYIMDB_API}/movie/${imdbId}`;
  const html = await safeText(url);
  extractFromHtml(html, "PlayImdb", url).forEach(callback);
}

async function srcVidStack(imdbId, season, episode, callback) {
  if (!imdbId) return;
  const encData = await safeJson(`${MULTIDEC_API}/enc-vidstack`);
  if (!encData?.result?.token) return;
  const token = encData.result.token;
  const uid = encData.result.user_id;
  const url = (season != null)
    ? `${VIDSTACK_API}/videosmashyi/${imdbId}/${season}/${episode}?token=${token}&user_id=${uid}`
    : `${VIDSTACK_API}/videosmashyi/${imdbId}?token=${token}&user_id=${uid}`;
  const data = await safeJson(url, { Referer: VIDSTACK_BASE });
  if (!data?.data) return;
  const parts = String(data.data).split("/#");
  if (parts.length < 2) return;
  const host = parts[0];
  const id = parts[1];
  const enc = await safeText(`${host}/api/v1/video?id=${id}`, { Referer: VIDSTACK_BASE });
  if (!enc) return;
  const dec = await safePost(`${MULTIDEC_API}/dec-vidstack`, { text: enc, type: "1" });
  const m3u8 = dec?.result?.source;
  if (m3u8) callback(mkStream("VidStack", "VidStack [SmashyStream 1080p]", m3u8, "1080p", VIDSTACK_BASE));
}

async function srcHexa(tmdbId, season, episode, callback) {
  if (!tmdbId) return;
  const url = (season != null)
    ? `${HEXA_API}/tv/${tmdbId}/${season}/${episode}`
    : `${HEXA_API}/movie/${tmdbId}`;
  const html = await safeText(url);
  extractFromHtml(html, "Hexa", url).forEach(callback);
}

async function srcMapple(tmdbId, season, episode, callback) {
  if (!tmdbId) return;
  const url = (season != null)
    ? `${MAPPLE_API}/tv/${tmdbId}/${season}/${episode}`
    : `${MAPPLE_API}/movie/${tmdbId}`;
  const html = await safeText(url);
  extractFromHtml(html, "Mapple", url).forEach(callback);
}

async function srcPulp(tmdbId, season, episode, callback) {
  if (!tmdbId) return;
  const url = (season != null)
    ? `${PULP_API}/tv/${tmdbId}?season=${season}&episode=${episode}`
    : `${PULP_API}/movie/${tmdbId}`;
  const data = await safeJson(url);
  if (!data) return;
  const sources = data.sources || data.streams || [];
  sources.forEach(s => {
    const u = s.url || s.file || s.src;
    if (u) callback(mkStream("Pulp", `Pulp [${s.quality || s.label || "Auto"}]`, u, s.quality || s.label || "Auto", `${PULP_API}/`));
  });
}

async function srcStreamvix(imdbId, season, episode, callback) {
  await stremioStreams("Streamvix", STREAMVIX_API, imdbId, season, episode, callback);
}
async function srcNotorrent(imdbId, season, episode, callback) {
  await stremioStreams("NoTorrent", NOTORRENT_API, imdbId, season, episode, callback);
}

async function srcYflixOne(baseUrl, tmdbId, season, episode, callback) {
  const url = (season != null)
    ? `${baseUrl}/tv/${tmdbId}/${season}/${episode}`
    : `${baseUrl}/movie/${tmdbId}`;
  const tag = baseUrl.replace("https://", "").split(".")[0];
  const html = await safeText(url, { Referer: `${baseUrl}/` });
  extractFromHtml(html, "Yflix", url).forEach(s => {
    s.title = `⌜Yflix⌝ [${tag}] ${s.quality || "Auto"}`;
    callback(s);
  });
}
async function srcYflix(tmdbId, season, episode, callback) {
  if (!tmdbId) return;
  const promises = YFLIX_SERVERS.map(srv => srcYflixOne(srv, tmdbId, season, episode, callback).catch(() => {}));
  await Promise.all(promises);
}

// ==================== CONCURRENCY LIMITER ====================
async function runLimited(tasks, limit) {
  let i = 0;
  async function next() {
    if (i >= tasks.length) return;
    const fn = tasks[i++];
    await fn().catch(() => {});
    await next();
  }
  const workers = [];
  for (let w = 0; w < Math.min(limit, tasks.length); w++) workers.push(next());
  await Promise.all(workers);
}

// ==================== MAIN getStreams (FLEXIBLE) ====================
async function getStreams(arg1, arg2, arg3, arg4) {
  let tmdbId, mediaType, season, episode;

  // Parameter fleksibel: objek atau positional
  if (arg1 && typeof arg1 === "object" && !Array.isArray(arg1)) {
    tmdbId = arg1.id || arg1.tmdb_id || arg1.tmdbId;
    mediaType = arg1.type || arg1.mediaType || "movie";
    season = arg1.season;
    episode = arg1.episode;
  } else {
    tmdbId = arg1;
    mediaType = arg2 || "movie";
    season = arg3;
    episode = arg4;
  }

  const isMovie = (mediaType !== "tv");
  console.log(`[CineStream] id=${tmdbId} type=${mediaType} ${isMovie ? "" : `S${season}E${episode}`}`);

  const streams = [];
  function addStream(s) { if (s && s.url) streams.push(s); }

  try {
    const imdbId = await tmdbToImdb(tmdbId, isMovie);
    console.log(`[CineStream] imdbId=${imdbId || "none"}`);

    const tasks = [];

    // Embed players (need imdbId)
    if (imdbId) {
      tasks.push(() => srcVidSrc(imdbId, season, episode, addStream));
      tasks.push(() => src2Embed(imdbId, season, episode, addStream));
      tasks.push(() => srcAutoEmbed(imdbId, season, episode, addStream));
      tasks.push(() => srcVidsrcCC(imdbId, season, episode, addStream));
      tasks.push(() => srcPlayImdb(imdbId, season, episode, addStream));
      tasks.push(() => srcVidStack(imdbId, season, episode, addStream));
      tasks.push(() => srcStreamvix(imdbId, season, episode, addStream));
      tasks.push(() => srcNotorrent(imdbId, season, episode, addStream));
    }

    // Direct players (need tmdbId)
    tasks.push(() => srcVidLink(tmdbId, season, episode, addStream));
    tasks.push(() => srcVidFast(tmdbId, season, episode, addStream));
    tasks.push(() => srcHexa(tmdbId, season, episode, addStream));
    tasks.push(() => srcMapple(tmdbId, season, episode, addStream));
    tasks.push(() => srcPulp(tmdbId, season, episode, addStream));
    tasks.push(() => srcYflix(tmdbId, season, episode, addStream));

    console.log(`[CineStream] Running ${tasks.length} sources (concurrency=5)...`);
    await runLimited(tasks, 5);

    const result = dedupStreams(streams);
    console.log(`[CineStream] Done — ${result.length} stream(s)`);
    return result;
  } catch (err) {
    console.error(`[CineStream] Fatal: ${err.message || err}`);
    return [];
  }
}

// Ekspor langsung fungsi getStreams (terbaik untuk Nuvio)
module.exports = getStreams;
