console.log("[DOMTY] Provider Loaded");

const SITES = [
  "https://mycima.horse",
  "https://fajer.show",
  "https://ak.sv",
  "https://cimawbas.org"
];

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
  Accept: "*/*"
};

function request(url, headers = {}) {
  return fetch(url, { headers: { ...HEADERS, ...headers } }).then(r => r.text());
}

// search site for movie title
function search(site, title) {
  const url = `${site}/?s=${encodeURIComponent(title)}`;
  return request(url).then(html => {
    const match = html.match(/<a href="([^"]+)"[^>]*>(.*?)<\/a>/i);
    return match ? match[1] : null;
  });
}

// get iframe player URL from page
function findPlayer(html) {
  const match = html.match(/<iframe[^>]+src="([^"]+)"/i);
  return match ? match[1] : null;
}

// get actual video link from player page
function findStream(html) {
  const m3u8 = html.match(/https?:\/\/[^"' ]+\.m3u8/i);
  if (m3u8) return m3u8[0];
  const mp4 = html.match(/https?:\/\/[^"' ]+\.mp4/i);
  if (mp4) return mp4[0];
  return null;
}

function scrapePage(url) {
  return request(url).then(html => {
    const iframe = findPlayer(html);
    if (!iframe) return null;
    return request(iframe, { Referer: url }).then(playerHtml => findStream(playerHtml));
  });
}

// try all sites until one gives a stream
function trySites(title) {
  let index = 0;
  function next() {
    if (index >= SITES.length) return Promise.resolve(null);
    const site = SITES[index++];
    return search(site, title)
      .then(url => url ? scrapePage(url) : next())
      .then(stream => stream ? stream : next())
      .catch(next);
  }
  return next();
}

// main function Nuvio calls
function getStreams(tmdbId, mediaType = "movie") {
  console.log("[DOMTY] Fetching streams for TMDB ID:", tmdbId);
  // Use TMDB API to get the title
  return fetch(`https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=1`)
    .then(r => r.json())
    .then(data => data.title || data.name || tmdbId)
    .then(title => trySites(title))
    .then(stream => {
      if (!stream) return { sources: [], subtitles: [] };
      return { sources: [{ url: stream, quality: "HD", type: stream.includes(".m3u8") ? "hls" : "mp4" }], subtitles: [] };
    });
}

module.exports = { getStreams };
