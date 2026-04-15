const TMDB_API_KEY = "20bf0a5cbc307e7889137457fa5b6b37";
const XPRIME_BACKEND = "https://backend.xprime.tv";

const DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://xprime.stream/",
  "Origin": "https://xprime.stream",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "cross-site"
};

async function getStreams(tmdbId, mediaType = "movie", seasonNum = 1, episodeNum = 1) {
  try {
    // 1. Get Movie/TV info from TMDB
    const tmdbRes = await fetch(`https://api.themoviedb.org/3/${mediaType === "tv" ? "tv" : "movie"}/${tmdbId}?api_key=${TMDB_API_KEY}`);
    if (!tmdbRes.ok) throw new Error("TMDB lookup failed");
    const tmdbData = await tmdbRes.json();
    
    const title = mediaType === "tv" ? tmdbData.name : tmdbData.title;

    // 2. Call the XPrime Backend
    // Note: Some backends prefer 'id' without the 't' prefix for TV shows, others require it.
    // We'll stick to the numeric ID first.
    const params = new URLSearchParams({
      id: tmdbId,
      type: mediaType,
      name: title
    });

    if (mediaType === "tv") {
      params.append("season", seasonNum.toString());
      params.append("episode", episodeNum.toString());
    }

    const backendUrl = `${XPRIME_BACKEND}/primebox?${params.toString()}`;
    
    const response = await fetch(backendUrl, {
      method: "GET",
      headers: DEFAULT_HEADERS
    });

    if (!response.ok) {
      console.log(`[xprime] Backend returned status: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const streams = [];

    // 3. Extract and Format for ExoPlayer
    // The backend might return an array or an object with a 'streams' property
    const results = Array.isArray(data) ? data : (data.streams || (data.url ? [data] : []));

    results.forEach(src => {
      if (src.url) {
        streams.push({
          name: `XPrime: ${src.quality || "HD"}`,
          url: src.url,
          quality: src.quality || "Auto",
          headers: DEFAULT_HEADERS, // ExoPlayer needs these to bypass 403 errors
          subtitles: (src.subtitles || []).map(s => ({
            url: s.url || s.file,
            lang: s.label || s.language || "English"
          }))
        });
      }
    });

    return streams;

  } catch (err) {
    console.error("[xprime] Critical Error:", err.message);
    return [];
  }
}

if (typeof module !== "undefined") module.exports = { getStreams };
