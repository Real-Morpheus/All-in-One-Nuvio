/**
 * MoviesDrive Plugin (Proxy)
 * Uses the live API at https://badboysxs-mdr.hf.space
 */
const BASE_URL = "https://badboysxs-mdr.hf.space";

const REFERER = "https://new2.moviesdrives.my/";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function extractQuality(desc) {
  const match = desc.match(/(\d{3,4})p/);
  return match ? match[1] + "p" : "Auto";
}

async function getStreams(tmdbId, mediaType = "movie", season = null, episode = null) {
  console.log(`[MoviesDrive] Fetching via API → ${mediaType} tmdb:${tmdbId}`);

  let url;
  if (mediaType === "movie") {
    url = `${BASE_URL}/stream/movie/tmdb:${tmdbId}.json`;
  } else {
    if (!season || !episode) {
      console.error("[MoviesDrive] Missing season or episode for series");
      return [];
    }
    url = `${BASE_URL}/stream/series/tmdb:${tmdbId}:${season}:${episode}.json`;
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept": "application/json"
      },
      signal: AbortSignal.timeout(15000)
    });

    if (!res.ok) {
      console.log(`[MoviesDrive] API error: ${res.status}`);
      return [];
    }

    const data = await res.json();
    const rawStreams = data.streams || [];

    return rawStreams.map(s => ({
      name: s.name || "MoviesDrive",
      title: s.description || "",
      url: s.url,
      quality: extractQuality(s.description || ""),
      headers: {
        "Referer": REFERER,
        "User-Agent": UA
      },
      provider: "moviesdrive"
    }));
  } catch (e) {
    console.error(`[MoviesDrive] Error: ${e.message}`);
    return [];
  }
}

module.exports = { getStreams };
