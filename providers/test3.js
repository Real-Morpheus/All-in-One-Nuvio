const TMDB_API_KEY = "20bf0a5cbc307e7889137457fa5b6b37";
const RGSHOWS_BASE = "api.rgshows.ru";

// Headers needed to talk to the API
const API_HEADERS = {
  "Referer": "https://rgshows.ru/",
  "Origin": "https://rgshows.ru",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
};

// Headers needed for the Player to work with VidPlus
const PLAYER_HEADERS = {
  "Origin": "https://player.videasy.net",
  "Referer": "https://player.videasy.net/",
  "sec-ch-ua": '"Chromium";v="146", "Not-A.Brand";v="24", "Android WebView";v="146"',
  "sec-ch-ua-mobile": "?1",
  "sec-ch-ua-platform": '"Android"',
  "User-Agent": "Mozilla/5.0 (Linux; Android 15; ALT-NX1 Build/HONORALT-N31; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/146.0.7680.177 Mobile Safari/537.36"
};

function makeRequest(url, headers) {
  return fetch(url, {
    method: "GET",
    headers: headers || API_HEADERS
  }).then(function(response) {
    if (!response.ok) throw new Error("HTTP " + response.status);
    return response.json();
  });
}

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  mediaType = mediaType || "movie";
  console.log("[RGShows] Starting fetch for ID: " + tmdbId);

  var tmdbUrl = "https://api.themoviedb.org/3/" + (mediaType === "tv" ? "tv" : "movie") + "/" + tmdbId + "?api_key=" + TMDB_API_KEY;

  return makeRequest(tmdbUrl, {}) // TMDB doesn't need special headers
    .then(function(tmdbData) {
      var title = mediaType === "tv" ? tmdbData.name : tmdbData.title;
      var path = mediaType === "movie" ? "/movie/" + tmdbId : "/tv/" + tmdbId + "/" + seasonNum + "/" + episodeNum;
      var apiUrl = "https://" + RGSHOWS_BASE + "/main" + path;

      console.log("[RGShows] Requesting API: " + apiUrl);

      return makeRequest(apiUrl, API_HEADERS)
        .then(function(data) {
          if (!data || !data.stream || !data.stream.url) {
            console.log("[RGShows] API returned success but no stream URL");
            return [];
          }

          var streamUrl = data.stream.url;
          console.log("[RGShows] Successfully found URL: " + streamUrl.substring(0, 30) + "...");

          var label = (mediaType === "tv") 
            ? title + " S" + String(seasonNum).padStart(2, "0") + "E" + String(episodeNum).padStart(2, "0")
            : title;

          return [{
            name: "RGShows (Hybrid)",
            title: label,
            url: streamUrl,
            quality: "Auto",
            headers: PLAYER_HEADERS, // Pass the VidPlus headers to the player
            provider: "rgshows"
          }];
        });
    })
    .catch(function(err) {
      console.error("[RGShows] Critical Error: " + err.message);
      return [];
    });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams: getStreams };
}
