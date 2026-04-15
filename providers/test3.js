// PrimeSrc Scraper for Nuvio
// Restored TMDB Key + Fixed Playback Headers

var TMDB_API_KEY = "20bf0a5cbc307e7889137457fa5b6b37";
var PRIMESRC_API = "https://primesrc.me/api/v1/";

function getStreams(id, mediaType, season, episode) {
    var type = (season && episode) ? "tv" : "movie";
    var isImdb = (typeof id === 'string' && id.indexOf('tt') === 0);
    
    // 1. Get metadata from TMDB first (Restored)
    var tmdbUrl = "https://api.themoviedb.org/3/" + (type === "tv" ? "tv/" : "movie/") + id + "?api_key=" + TMDB_API_KEY;
    if (isImdb) {
        tmdbUrl = "https://api.themoviedb.org/3/find/" + id + "?api_key=" + TMDB_API_KEY + "&external_source=imdb_id";
    }

    var ua = "Mozilla/5.0 (Linux; Android 15; ALT-NX1 Build/HONORALT-N31; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/146.0.7680.177 Mobile Safari/537.36";

    return fetch(tmdbUrl)
    .then(function(res) { return res.json(); })
    .then(function(tmdbData) {
        // Handle TMDB 'find' vs direct lookup differences
        var meta = tmdbData;
        if (isImdb) {
            meta = (tmdbData.movie_results && tmdbData.movie_results[0]) || (tmdbData.tv_results && tmdbData.tv_results[0]);
        }
        
        var title = meta ? (meta.title || meta.name) : "PrimeSrc";

        // 2. Build PrimeSrc Search URL
        var idParam = isImdb ? "&imdb=" : "&tmdb=";
        var searchUrl = PRIMESRC_API + "list_servers?type=" + type + idParam + id;
        if (type === "tv") {
            searchUrl += "&season=" + season + "&episode=" + episode;
        }

        return fetch(searchUrl, {
            headers: { "User-Agent": ua, "Referer": "https://primesrc.me/" }
        })
        .then(function(res) { return res.json(); })
        .then(function(data) {
            if (!data || !data.servers) return [];

            var fetchPromises = data.servers.map(function(s) {
                return fetch(PRIMESRC_API + "l?key=" + s.key, {
                    headers: { "User-Agent": ua, "Referer": "https://primesrc.me/" }
                })
                .then(function(lRes) { return lRes.json(); })
                .then(function(lData) {
                    if (!lData || !lData.link) return null;

                    var sUrl = lData.link;
                    var streamRef = "https://primesrc.me/";

                    // Apply the specific Referer fixes from your successful logs
                    if (sUrl.indexOf("streamta.site") !== -1) streamRef = "https://streamta.site/";
                    if (sUrl.indexOf("cloudatacdn.com") !== -1) streamRef = "https://playmogo.com/";

                    return {
                        name: "PrimeSrc: " + (s.name || "HD"),
                        title: title,
                        url: sUrl,
                        quality: "1080p",
                        headers: {
                            "User-Agent": ua,
                            "Referer": streamRef,
                            "Origin": streamRef.replace(/\/$/, ""),
                            "Accept": "*/*"
                        }
                    };
                })
                .catch(function() { return null; });
            });

            return Promise.all(fetchPromises).then(function(results) {
                var filtered = [];
                for (var i = 0; i < results.length; i++) {
                    if (results[i]) filtered.push(results[i]);
                }
                return filtered;
            });
        });
    })
    .catch(function() { 
        return []; 
    });
}

if (typeof module !== 'undefined') module.exports = { getStreams: getStreams };
