// RGShows Scraper - Updated for VidPlus/Videasy Infrastructure
const TMDB_API_KEY = "20bf0a5cbc307e7889137457fa5b6b37";
const RGSHOWS_BASE = "api.rgshows.ru";

// These are the "Magic Headers" that allow the stream to play
const WORKING_HEADERS = {
  "Origin": "https://player.videasy.net",
  "Referer": "https://player.videasy.net/",
  "sec-ch-ua": '"Chromium";v="146", "Not-A.Brand";v="24", "Android WebView";v="146"',
  "sec-ch-ua-mobile": "?1",
  "sec-ch-ua-platform": '"Android"',
  "User-Agent": "Mozilla/5.0 (Linux; Android 15; ALT-NX1 Build/HONORALT-N31; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/146.0.7680.177 Mobile Safari/537.36",
  "Accept": "*/*",
  "Accept-Encoding": "identity;q=1, *;q=0"
};

function makeRequest(url, options) {
  options = options || {};
  var headers = Object.assign({}, WORKING_HEADERS); // Use the working set by default
  
  if (options.headers) {
    Object.keys(options.headers).forEach(function(k) { headers[k] = options.headers[k]; });
  }

  return fetch(url, {
    method: options.method || "GET",
    headers: headers
  }).then(function(response) {
    if (!response.ok) throw new Error("HTTP " + response.status);
    return response;
  });
}

function getTmdbInfo(tmdbId, mediaType) {
  var url = "https://api.themoviedb.org/3/" + (mediaType === "tv" ? "tv" : "movie") + "/" + tmdbId + "?api_key=" + TMDB_API_KEY;
  return makeRequest(url)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      return { 
        title: mediaType === "tv" ? data.name : data.title, 
        year: (mediaType === "tv" ? (data.first_air_date || "") : (data.release_date || "")).substring(0, 4) 
      };
    });
}

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  mediaType = mediaType || "movie";
  console.log("[RGShows] Fetching TMDB ID: " + tmdbId);

  return getTmdbInfo(tmdbId, mediaType)
    .then(function(info) {
      var url = "https://" + RGSHOWS_BASE + "/main/" + (mediaType === "movie" ? "movie/" + tmdbId : "tv/" + tmdbId + "/" + seasonNum + "/" + episodeNum);

      return makeRequest(url)
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (!data || !data.stream || !data.stream.url) {
            console.log("[RGShows] No stream URL in response");
            return [];
          }

          var streamUrl = data.stream.url;
          
          // Construct the label for the UI
          var label = (mediaType === "tv") 
            ? info.title + " S" + String(seasonNum).padStart(2, "0") + "E" + String(episodeNum).padStart(2, "0")
            : info.title + (info.year ? " (" + info.year + ")" : "");

          console.log("[RGShows] Link found, applying VidPlus headers");

          return [{
            name: "RGShows (VidPlus)",
            title: label,
            url: streamUrl,
            quality: "Auto",
            headers: WORKING_HEADERS, // Player needs these to avoid 22004
            provider: "rgshows"
          }];
        });
    })
    .catch(function(err) {
      console.error("[RGShows] Scraper Error: " + err.message);
      return [];
    });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams: getStreams };
} else {
  global.RGShowsScraperModule = { getStreams: getStreams };
}
