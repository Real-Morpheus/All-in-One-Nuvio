// PrimeSrc Scraper for Nuvio
// Restored to the working fetch version with specific Android TV playback fixes

var TMDB_API_KEY = "20bf0a5cbc307e7889137457fa5b6b37";
var PRIMESRC_BASE = "https://primesrc.me/api/v1/";

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    var type = (seasonNum && episodeNum) ? "tv" : "movie";
    var isImdb = (typeof tmdbId === 'string' && tmdbId.indexOf('tt') === 0);
    
    // 1. Build Search URL
    var searchUrl = PRIMESRC_BASE + "list_servers?type=" + type;
    if (isImdb) {
        searchUrl += "&imdb=" + tmdbId;
    } else {
        searchUrl += "&tmdb=" + tmdbId;
    }

    if (type === "tv") {
        searchUrl += "&season=" + seasonNum + "&episode=" + episodeNum;
    }

    // Exact User-Agent from your working logs
    var ua = "Mozilla/5.0 (Linux; Android 15; ALT-NX1 Build/HONORALT-N31; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/146.0.7680.177 Mobile Safari/537.36";

    return fetch(searchUrl, {
        headers: { "User-Agent": ua, "Referer": "https://primesrc.me/" }
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (!data || !data.servers) return [];

        var results = [];
        var promises = data.servers.map(function(s) {
            return fetch(PRIMESRC_BASE + "l?key=" + s.key, {
                headers: { "User-Agent": ua, "Referer": "https://primesrc.me/" }
            })
            .then(function(res) { return res.json(); })
            .then(function(ld) {
                if (!ld || !ld.link) return null;

                var finalUrl = ld.link;
                var streamRef = "https://primesrc.me/";

                // --- HEADER FIXES FOR 23003 ERROR ---
                if (finalUrl.indexOf("streamta.site") !== -1) {
                    streamRef = "https://streamta.site/";
                } else if (finalUrl.indexOf("cloudatacdn.com") !== -1) {
                    streamRef = "https://playmogo.com/";
                }

                return {
                    name: "PrimeSrc - " + (s.name || "HD"),
                    url: finalUrl,
                    quality: "1080p",
                    headers: {
                        "User-Agent": ua,
                        "Referer": streamRef,
                        "Origin": streamRef.replace(/\/$/, ""),
                        "Accept": "*/*",
                        "Accept-Encoding": "identity;q=1, *;q=0"
                    }
                };
            })
            .catch(function() { return null; });
        });

        return Promise.all(promises).then(function(all) {
            return all.filter(function(item) { return item !== null; });
        });
    })
    .catch(function() { return []; });
}

if (typeof module !== 'undefined') module.exports = { getStreams: getStreams };
