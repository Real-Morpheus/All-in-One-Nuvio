console.log("[DOMTY] Provider loaded");

// ─────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────

const TMDB_API = "https://api.themoviedb.org/3/";
const TMDB_KEY = "439c478a771f35c05022f9feabcca01c";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
  Accept: "*/*",
};

const SITES = [
  "https://cimawbas.org",
  "https://mycima.horse",
  "https://ak.sv",
  "https://fajer.show",
  "https://larozavideo.net",
];

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

function request(url, headers = {}) {
  return fetch(url, { headers: { ...HEADERS, ...headers } }).then((r) => {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.text();
  });
}

function findStreams(html) {
  const links = [];
  const regex = /(https?:\/\/[^"' ]+\.(m3u8|mp4)[^"' ]*)/gi;
  let m;

  while ((m = regex.exec(html)) !== null) {
    if (!links.includes(m[1])) links.push(m[1]);
  }

  return links;
}

function findIframes(html) {
  const frames = [];
  const re = /<iframe[^>]+src=["']([^"']+)["']/gi;
  let m;

  while ((m = re.exec(html)) !== null) {
    frames.push(m[1]);
  }

  return frames;
}

function qualityFromUrl(url) {
  if (url.includes("2160")) return "4K";
  if (url.includes("1080")) return "1080p";
  if (url.includes("720")) return "720p";
  return "HD";
}

// ─────────────────────────────────────────
// RESOLVE STREAM PAGE
// ─────────────────────────────────────────

function resolvePage(site, pageUrl) {
  console.log("[DOMTY] Opening page:", pageUrl);

  return request(pageUrl, { Referer: site })
    .then((html) => {
      let streams = findStreams(html);

      if (streams.length) return streams.map((s) => makeStream(site, s, pageUrl));

      const iframes = findIframes(html);

      return Promise.all(
        iframes.slice(0, 4).map((frame) => {
          let url = frame;

          if (url.startsWith("//")) url = "https:" + url;
          if (url.startsWith("/")) url = site + url;

          return request(url, { Referer: pageUrl })
            .then((iframeHtml) => {
              return findStreams(iframeHtml).map((s) =>
                makeStream(site, s, url)
              );
            })
            .catch(() => []);
        })
      ).then((r) => r.flat());
    })
    .catch(() => []);
}

function makeStream(name, url, referer) {
  return {
    name: name.replace("https://", ""),
    title: qualityFromUrl(url),
    url: url,
    quality: qualityFromUrl(url),
    headers: {
      Referer: referer,
      "User-Agent": HEADERS["User-Agent"],
    },
  };
}

// ─────────────────────────────────────────
// SEARCH SITE
// ─────────────────────────────────────────

function searchSite(site, title) {
  const searchUrl = site + "/?s=" + encodeURIComponent(title);

  console.log("[DOMTY] Searching:", searchUrl);

  return request(searchUrl, { Referer: site })
    .then((html) => {
      const results = [];
      const re = /<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*>(.*?)<\/a>/gi;
      let m;

      while ((m = re.exec(html)) !== null) {
        if (m[2] && m[2].toLowerCase().includes(title.toLowerCase())) {
          results.push(m[1]);
        }
      }

      return results.slice(0, 3);
    })
    .catch(() => []);
}

// ─────────────────────────────────────────
// GET TMDB TITLE
// ─────────────────────────────────────────

function getTitle(tmdbId, type) {
  const url =
    TMDB_API +
    (type === "tv" ? "tv/" : "movie/") +
    tmdbId +
    "?api_key=" +
    TMDB_KEY;

  return fetch(url)
    .then((r) => r.json())
    .then((data) => {
      return type === "tv" ? data.name : data.title;
    });
}

// ─────────────────────────────────────────
// MAIN ENTRY
// ─────────────────────────────────────────

function getStreams(tmdbId, mediaType, season, episode) {
  console.log("[DOMTY] getStreams:", tmdbId, mediaType);

  return getTitle(tmdbId, mediaType).then((title) => {
    console.log("[DOMTY] Title:", title);

    const searches = SITES.map((site) =>
      searchSite(site, title).then((results) => {
        if (!results.length) return [];

        return resolvePage(site, results[0]);
      })
    );

    return Promise.all(searches).then((all) => {
      const streams = all.flat();

      const unique = [];
      const seen = {};

      streams.forEach((s) => {
        if (!seen[s.url]) {
          seen[s.url] = true;
          unique.push(s);
        }
      });

      console.log("[DOMTY] Streams found:", unique.length);

      return unique;
    });
  });
}

module.exports = { getStreams };
