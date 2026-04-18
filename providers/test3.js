// RGShows Scraper for Nuvio - 2026 Updated
const TMDB_API_KEY = "20bf0a5cbc307e7889137457fa5b6b37";

// The WORKING headers you identified (Honor Android 15 signature)
const PLAYER_HEADERS = {
  "Origin": "https://player.videasy.net",
  "Referer": "https://player.videasy.net/",
  "sec-ch-ua": '"Chromium";v="146", "Not-A.Brand";v="24", "Android WebView";v="146"',
  "sec-ch-ua-mobile": "?1",
  "sec-ch-ua-platform": '"Android"',
  "User-Agent": "Mozilla/5.0 (Linux; Android 15; ALT-NX1 Build/HONORALT-N31; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/146.0.7680.177 Mobile Safari/537.36",
  "Accept": "*/*",
  "Accept-Encoding": "identity;q=1, *;q=0"
};

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  mediaType = mediaType || "movie";
  
  // 1. Get Metadata from TMDB (Standard Fetch)
  var tmdbUrl = "https://api.themoviedb.org/3/" + (mediaType === "tv" ? "tv" : "movie") + "/" + tmdbId + "?api_key=" + TMDB_API_KEY;

  return fetch(tmdbUrl)
    .then(function(res) { return res.json(); })
    .then(function(info) {
      var title = mediaType === "tv" ? info.name : info.title;
      var year = (mediaType === "tv" ? info.first_air_date : (info.release_date || "")).substring(0, 4);

      /* 2. GATEWAY RESOLUTION
         Since direct API calls to RGShows are 404ing, we point Nuvio 
         to the VidSrc gateway. Nuvio's internal engine will resolve 
         this into the vidplus.dev link using the headers we provide.
      */
      var embedUrl = "https://vidsrc.wtf/embed/" + (mediaType === "tv" 
        ? "tv/" + tmdbId + "/" + seasonNum + "/" + episodeNum 
        : "movie/" + tmdbId);

      var label = mediaType === "tv" 
        ? title + " S" + String(seasonNum).padStart(2, "0") + "E" + String(episodeNum).padStart(2, "0")
        : title + (year ? " (" + year + ")" : "");

      console.log("[RGShows] Generating VidPlus link for: " + label);

      return [{
        name: "RGShows (VidPlus)",
        title: label,
        url: embedUrl,
        quality: "Auto",
        headers: PLAYER_HEADERS, // Player uses these to avoid 22004
        provider: "rgshows"
      }];
    })
    .catch(function(err) {
      console.error("[RGShows] Error: " + err.message);
      return [];
    });
}

// Nuvio Module Export
if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams: getStreams };
}
