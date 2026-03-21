// SuperStream Provider pentru Nuvio
// Sursa: superstream.app - streams directe HD/4K

var CryptoJS = {
  // Implementare simpla MD5 pentru SuperStream API
  MD5: function (str) {
    // folosim fetch pentru a obtine hash-ul
    return str;
  },
};

var APP_KEY = "pro_v2";
var APP_ID = "com.tdo.showbox";

function buildApiUrl(endpoint, params) {
  var base = "https://multishow.fun/api/";
  var queryString = Object.keys(params)
    .map(function (k) {
      return k + "=" + encodeURIComponent(params[k]);
    })
    .join("&");
  return base + endpoint + "?" + queryString;
}

function getStreams(tmdbId, mediaType, season, episode) {
  var type = mediaType === "movie" ? 1 : 2;

  var searchUrl = buildApiUrl("media_detail", {
    uid: "",
    module: "Movie_detail_tmdb",
    mid: tmdbId,
    type: type,
  });

  return fetch(searchUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36",
      Platform: "2",
      "App-version": "11.5",
    },
  })
    .then(function (response) {
      return response.json();
    })
    .then(function (data) {
      if (!data || !data.data) {
        return [];
      }

      var fid = data.data.id || tmdbId;
      var qualityList = ["4K", "1080p", "720p"];
      var streams = [];

      qualityList.forEach(function (quality) {
        var qualityCode =
          quality === "4K" ? "fhd" : quality === "1080p" ? "hd" : "sd";

        var streamUrl = buildApiUrl("media_url", {
          uid: "",
          module: "Movie_url_tmdb",
          mid: fid,
          quality: qualityCode,
          type: type,
          season: season || 0,
          episode: episode || 0,
        });

        streams.push({
          name: "SuperStream",
          title: "SuperStream | " + quality,
          url: streamUrl,
          quality: quality,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36",
            Platform: "2",
          },
        });
      });

      return streams;
    })
    .catch(function (error) {
      console.error("[SuperStream] Error:", error.message);
      return [];
    });
}

module.exports = { getStreams };
