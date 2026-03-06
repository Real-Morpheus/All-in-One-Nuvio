const cheerio = require('cheerio-without-node-native');

const BASE_URL = "https://uhdmovies.ink";

const WORKING_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': BASE_URL
};

function searchUHDMovies(query) {
  const url = BASE_URL + "/?s=" + encodeURIComponent(query);

  return fetch(url, { headers: WORKING_HEADERS })
    .then(res => res.text())
    .then(html => {
      const $ = cheerio.load(html);
      const results = [];

      $("article a").each((i, el) => {
        const title = $(el).text().trim();
        const link = $(el).attr("href");

        if (link && title) {
          results.push({
            title,
            url: link
          });
        }
      });

      return results;
    })
    .catch(() => []);
}

function extractStreams(pageUrl) {
  return fetch(pageUrl, { headers: WORKING_HEADERS })
    .then(res => res.text())
    .then(html => {

      const streams = [];
      const regex = /(https?:\/\/[^"' ]+\.m3u8)/g;

      let match;

      while ((match = regex.exec(html)) !== null) {
        streams.push({
          name: "UHDMovies Server",
          title: "UHDMovies Stream",
          url: match[1],
          quality: "HD",
          size: "Unknown",
          headers: WORKING_HEADERS,
          provider: "uhdmovies"
        });
      }

      return streams;
    })
    .catch(() => []);
}

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {

  return new Promise((resolve) => {

    const query = tmdbId;

    searchUHDMovies(query)
      .then(results => {

        if (!results.length) {
          resolve([]);
          return;
        }

        const page = results[0].url;

        extractStreams(page)
          .then(streams => resolve(streams))
          .catch(() => resolve([]));

      })
      .catch(() => resolve([]));
  });

}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
