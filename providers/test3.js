// PrimeSrc Scraper for Nuvio 
// Simplified for Hermes Engine compatibility

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    return new Promise(function(resolve, reject) {
        var isImdb = (typeof tmdbId === 'string' && tmdbId.indexOf('tt') === 0);
        var type = (seasonNum && episodeNum) ? "tv" : "movie";
        
        // Use the official endpoint from your docs
        var searchUrl = "https://primesrc.me/api/v1/list_servers?type=" + type;
        searchUrl += isImdb ? ("&imdb=" + tmdbId) : ("&tmdb=" + tmdbId);
        
        if (type === "tv") {
            searchUrl += "&season=" + seasonNum + "&episode=" + episodeNum;
        }

        var userAgent = "Mozilla/5.0 (Linux; Android 15; ALT-NX1) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/146.0.0.0 Mobile Safari/537.36";

        fetch(searchUrl, {
            headers: { "User-Agent": userAgent, "Referer": "https://primesrc.me/" }
        })
        .then(function(response) { 
            return response.json(); 
        })
        .then(function(data) {
            if (!data || !data.servers || data.servers.length === 0) {
                resolve([]);
                return;
            }

            var results = [];
            var pending = data.servers.length;

            data.servers.forEach(function(server) {
                var linkUrl = "https://primesrc.me/api/v1/l?key=" + server.key;
                
                fetch(linkUrl, {
                    headers: { "User-Agent": userAgent, "Referer": "https://primesrc.me/" }
                })
                .then(function(res) { return res.json(); })
                .then(function(ld) {
                    if (ld && ld.link) {
                        var streamUrl = ld.link;
                        var ref = "https://primesrc.me/";
                        
                        // Apply the exact headers from your logs
                        if (streamUrl.indexOf("streamta.site") !== -1) ref = "https://streamta.site/";
                        if (streamUrl.indexOf("cloudatacdn.com") !== -1) ref = "https://playmogo.com/";

                        results.push({
                            name: "PrimeSrc: " + server.name,
                            url: streamUrl,
                            quality: "1080p",
                            headers: {
                                "User-Agent": userAgent,
                                "Referer": ref,
                                "Origin": ref.replace(/\/$/, ""),
                                "Accept": "*/*"
                            }
                        });
                    }
                })
                .catch(function(e) { /* ignore single server error */ })
                .finally(function() {
                    pending--;
                    if (pending === 0) resolve(results);
                });
            });
        })
        .catch(function(err) {
            console.error("[PrimeSrc] Error: " + err.message);
            resolve([]);
        });
    });
}

if (typeof module !== 'undefined') {
    module.exports = { getStreams: getStreams };
}
