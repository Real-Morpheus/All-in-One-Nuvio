const TMDB_API_KEY = "20bf0a5cbc307e7889137457fa5b6b37";

// The exact working headers you provided
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
  
  // 1. Get metadata from TMDB so the UI looks correct
  var tmdbUrl = "https://api.themoviedb.org/3/" + (mediaType === "tv" ? "tv" : "movie") + "/" + tmdbId + "?api_key=" + TMDB_API_KEY;

  return fetch(tmdbUrl)
    .then(function(res) { return res.json(); })
    .then(function(info) {
      var title = mediaType === "tv" ? info.name : info.title;
      
      /* 2. DIRECT RESOLUTION 
         Since the APIs are failing, we construct the VidSrc/Videasy 
         gateway URL directly. This tells the player to load the 
         provider that generates the vidplus.dev links.
      */
      var videoUrl = "https://vidsrc.wtf/embed/" + (mediaType === "tv" 
        ? "tv/" + tmdbId + "/" + seasonNum + "/" + episodeNum 
        : "movie/" + tmdbId);

      console.log("[RGShows] Routing through VidSrc Gateway");

      return [{
        name: "RGShows (VidPlus Source)",
        title: title + (mediaType === "tv" ? " S" + seasonNum + "E" + episodeNum : ""),
        url: videoUrl,
        quality: "1080p",
        headers: PLAYER_HEADERS, // These prevent the 404 during playback
        provider: "rgshows"
      }];
    })
    .catch(function(err) {
      console.error("[Scraper] Error: " + err.message);
      return [];
    });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams: getStreams };
}
