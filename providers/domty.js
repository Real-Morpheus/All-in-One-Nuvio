const TMDB = "https://api.themoviedb.org/3";
const API = "439c478a771f35c05022f9feabcca01c";

var DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
  Accept: "*/*",
  "Accept-Language": "en,en-US;q=0.9"
};

function httpGet(url, extra) {
  return fetch(url, {
    headers: { ...DEFAULT_HEADERS, ...(extra || {}) }
  }).then(r => {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.text();
  });
}

function getTitle(tmdbId, mediaType) {
  const url =
    TMDB +
    "/" +
    (mediaType === "tv" ? "tv" : "movie") +
    "/" +
    tmdbId +
    "?api_key=" +
    API;

  return fetch(url)
    .then(r => r.json())
    .then(j => (mediaType === "tv" ? j.name : j.title));
}

function extractDirectSources(html) {
  const out = [];

  const re =
    /(https?:\/\/[^"' ]+(m3u8|mp4)[^"' ]*)/gi;

  let m;

  while ((m = re.exec(html))) {
    if (!out.includes(m[1])) out.push(m[1]);
  }

  return out;
}

function extractIframes(html) {
  const list = [];
  const re = /<iframe[^>]+src=["']([^"']+)/gi;

  let m;

  while ((m = re.exec(html))) {
    if (m[1].startsWith("http")) list.push(m[1]);
  }

  return list;
}

function normalizeQuality(u) {
  if (!u) return "HD";
  if (u.includes("2160")) return "4K";
  if (u.includes("1080")) return "1080p";
  if (u.includes("720")) return "720p";
  if (u.includes("480")) return "480p";
  return "HD";
}

function makeStream(name, url, referer) {
  return {
    url: url,
    quality: normalizeQuality(url),
    type: url.includes(".m3u8")
      ? "application/x-mpegURL"
      : "video/mp4",
    headers: {
      Referer: referer,
      Origin: referer,
      "User-Agent": DEFAULT_HEADERS["User-Agent"]
    }
  };
}

function fetchStreamsFromPage(name, pageUrl, base) {
  return httpGet(pageUrl, { Referer: base }).then(html => {
    const streams = [];

    extractDirectSources(html).forEach(u =>
      streams.push(makeStream(name, u, pageUrl))
    );

    if (streams.length) return streams;

    const iframes = extractIframes(html);

    return Promise.all(
      iframes.slice(0, 3).map(src =>
        httpGet(src, { Referer: pageUrl })
          .then(h =>
            extractDirectSources(h).map(u =>
              makeStream(name, u, src)
            )
          )
          .catch(() => [])
      )
    ).then(r => r.flat());
  });
}

function searchSite(name, base, query) {
  const url = base + "/?s=" + encodeURIComponent(query);

  return httpGet(url, { Referer: base })
    .then(html => {
      const items = [];

      const re = /href=["'](https?:\/\/[^"']+)["']/gi;

      let m;

      while ((m = re.exec(html))) {
        if (m[1].includes(base))
          items.push(m[1]);
      }

      return items.slice(0, 3);
    })
    .catch(() => []);
}

var SOURCES = [
  { id: "cima", base: "https://cimawbas.org" },
  { id: "egybest", base: "https://egybest.la" },
  { id: "mycima", base: "https://mycima.horse" }
];

function getStreams(tmdbId, mediaType, season, episode) {
  console.log("[DOMTY] start", tmdbId);

  return getTitle(tmdbId, mediaType).then(title => {
    if (!title) return [];

    console.log("[DOMTY] searching for", title);

    const tasks = SOURCES.map(s =>
      searchSite(s.id, s.base, title)
        .then(results => {
          if (!results.length) return [];
          return fetchStreamsFromPage(s.id, results[0], s.base);
        })
        .catch(() => [])
    );

    return Promise.all(tasks).then(r => {
      const all = r.flat();

      const seen = new Set();

      return all.filter(s => {
        if (seen.has(s.url)) return false;
        seen.add(s.url);
        return true;
      });
    });
  });
}

module.exports = { getStreams };
