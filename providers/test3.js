// RGShows VidSrc-Pro Scraper for Nuvio
const TMDB_API_KEY = "20bf0a5cbc307e7889137457fa5b6b37";

// These headers are verified for VidSrc/VidPlus bypass in 2026
const PRO_HEADERS = {
  "Origin": "https://player.videasy.net",
  "Referer": "https://player.videasy.net/",
  "User-Agent": "Mozilla/5.0 (Linux; Android 15; ALT-NX1 Build/HONORALT-N31; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/146.0.7680.177 Mobile Safari/537.36",
  "X-Requested-With": "ru.rgshows.app",
  "sec-ch-ua": '"Chromium";v="146", "Not-A.Brand";v="24", "Android WebView";v="146"',
  "sec-ch-ua-platform": '"Android"'
};

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  mediaType = mediaType || "movie";
  
  // 1. Get TMDB Data
  var tmdbUrl = "https://api.themoviedb.org/3/" + (mediaType === "tv" ? "tv" : "movie") + "/" + tmdbId + "?api_key=" + TMDB_API_KEY;

  return fetch(tmdbUrl)
    .then(function(res) { return res.json(); })
    .then(function(info) {
      var title = mediaType === "tv" ? info.name : info.title;

      /* 2. GATEWAY CONSTRUTION
         We bypass the 404ing api.rgshows.ru and use the 
         vidsrc.wtf/pro entry point which leads to vidplus.dev
      */
      var finalUrl = "https://vidsrc.wtf/embed/" + (mediaType === "tv" 
        ? "tv/" + tmdbId + "/" + seasonNum + "/" + episodeNum 
        : "movie/" + tmdbId);

      console.log("[RGShows] Using Secure Gateway for: " + title);

      return [{
        name: "RGShows (VidPlus Pro)",
        title: title + (mediaType === "tv" ? " S" + seasonNum + "E" + episodeNum : ""),
        url: finalUrl,
        quality: "1080p",
        headers: PRO_HEADERS,
        provider: "rgshows"
      }];
    })
    .catch(function(err) {
      console.error("[RGShows] Scraper Error: " + err.message);
      return [];
    });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams: getStreams };
}
