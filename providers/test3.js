// PrimeSrc Scraper for Nuvio - Direct Link Fix
const PRIMESRC_BASE = "https://primesrc.me/api/v1/";
const PRIMESRC_SITE = "https://primesrc.me";

function getStreams(id, mediaType, season, episode) {
    var type = (season && episode) ? "tv" : "movie";
    var url = PRIMESRC_BASE + "list_servers?type=" + type;

    // Handle IMDB or TMDB
    if (typeof id === 'string' && id.startsWith('tt')) {
        url += "&imdb=" + id;
    } else {
        url += "&tmdb=" + id;
    }

    if (type === "tv") {
        url += "&season=" + season + "&episode=" + episode;
    }

    var headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": PRIMESRC_SITE + "/"
    };

    return fetch(url, { headers: headers })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (!data || !data.servers) return [];

        // Map through servers and attempt to resolve direct links
        var promises = data.servers.map(function(server) {
            return fetch(PRIMESRC_BASE + "l?key=" + server.key, { headers: headers })
            .then(function(res) { return res.json(); })
            .then(function(linkData) {
                if (!linkData || !linkData.link) return null;

                var finalUrl = linkData.link;

                // FIX: If the link is an embed (contains /e/ or /embed/), 
                // ExoPlayer will throw error 23003. 
                // We must provide the Referer so the player can 'handshake' the file.
                return {
                    name: "PrimeSrc - " + (server.name || "Direct"),
                    url: finalUrl,
                    quality: "1080p",
                    headers: {
                        "Referer": PRIMESRC_SITE + "/",
                        "User-Agent": "Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36",
                        "Origin": PRIMESRC_SITE
                    },
                    // This flag tells Nuvio to treat it as a video, not a page
                    isDirect: true, 
                    provider: "primesrc"
                };
            })
            .catch(function() { return null; });
        });

        return Promise.all(promises).then(function(results) {
            return results.filter(function(s) { return s !== null; });
        });
    })
    .catch(function() { return []; });
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { getStreams: getStreams };
} else {
    global.getStreams = getStreams;
}
