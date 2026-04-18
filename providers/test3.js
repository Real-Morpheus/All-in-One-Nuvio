const TMDB_API_KEY = "20bf0a5cbc307e7889137457fa5b6b37";

// The EXACT working headers you provided
const WORKING_HEADERS = {
  "Origin": "https://player.videasy.net",
  "Referer": "https://player.videasy.net/",
  "sec-ch-ua": '"Chromium";v="146", "Not-A.Brand";v="24", "Android WebView";v="146"',
  "sec-ch-ua-mobile": "?1",
  "sec-ch-ua-platform": '"Android"',
  "User-Agent": "Mozilla/5.0 (Linux; Android 15; ALT-NX1 Build/HONORALT-N31; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/146.0.7680.177 Mobile Safari/537.36",
  "Accept": "*/*"
};

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  mediaType = mediaType || "movie";
  
  // 1. Get TMDB info for the UI
  var tmdbUrl = "https://api.themoviedb.org/3/" + (mediaType === "tv" ? "tv" : "movie") + "/" + tmdbId + "?api_key=" + TMDB_API_KEY;

  return fetch(tmdbUrl)
    .then(function(res) { return res.json(); })
    .then(function(info) {
      var title = mediaType === "tv" ? info.name : info.title;

      /* 2. THE FIX: TARGET THE PLAYER GATEWAY
         We avoid the 404ing API and the protected vidsrc.wtf/api.
         We send the player to the videasy.net gateway which is 
         the system that generates the vidplus.dev .m3u8 links.
      */
      var playerUrl = "https://player.videasy.net/v1/embed/" + (mediaType === "tv" 
        ? "tv/" + tmdbId + "/" + seasonNum + "/" + episodeNum 
        : "movie/" + tmdbId);

      return [{
        name: "VidPlus (Videasy)",
        title: title + (mediaType === "tv" ? " S" + seasonNum + "E" + episodeNum : ""),
        url: playerUrl,
        quality: "Auto",
        headers: WORKING_HEADERS, // Player needs these to avoid 22004
        provider: "rgshows"
      }];
    })
    .catch(function(err) {
      console.error("[RGShows] Fetch Error: " + err.message);
      return [];
    });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams: getStreams };
}
