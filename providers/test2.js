// VidKing Provider (Cineby backend source)

const TMDB_API_KEY = "YOUR_TMDB_KEY";

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Referer": "https://www.vidking.net/"
    }
  });
  return await res.text();
}

async function imdbToTmdb(imdbId) {
  const url = `https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
  const res = await fetch(url);
  const json = await res.json();

  if (json.movie_results?.length) {
    return { type: "movie", id: json.movie_results[0].id };
  }
  if (json.tv_results?.length) {
    return { type: "tv", id: json.tv_results[0].id };
  }
  return null;
}

async function extractStream(embedUrl) {
  const html = await fetchText(embedUrl);

  const patterns = [
    /https?:\/\/[^"' ]+\.m3u8[^"' ]*/i,
    /https?:\/\/[^"' ]+\.mp4[^"' ]*/i,
    /file:\s*"(https?:\/\/[^"]+)"/i,
  ];

  for (const p of patterns) {
    const match = html.match(p);
    if (match) return match[1] || match[0];
  }

  return null;
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    let embedUrl;

    if (mediaType === "movie") {
      embedUrl = `https://www.vidking.net/embed/movie/${tmdbId}`;
    } else {
      embedUrl = `https://www.vidking.net/embed/tv/${tmdbId}/${season}/${episode}`;
    }

    const streamUrl = await extractStream(embedUrl);

    if (!streamUrl) return [];

    return [
      {
        name: "VidKing",
        title: "Auto",
        url: streamUrl,
        quality: streamUrl.includes("1080") ? "1080p" : "HD",
        headers: {
          "Referer": "https://www.vidking.net/",
          "User-Agent": "Mozilla/5.0"
        }
      }
    ];

  } catch (e) {
    console.log("Error:", e);
    return [];
  }
}

module.exports = { getStreams };
