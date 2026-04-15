// PrimeSrc Scraper for Nuvio
// Logic: Restored to basic fetching loops

var PRIMESRC_API = "https://primesrc.me/api/v1/";

function getStreams(id, mediaType, season, episode) {
    var type = (season && episode) ? "tv" : "movie";
    var isImdb = (typeof id === 'string' && id.indexOf('tt') === 0);
    
    var searchUrl = PRIMESRC_API + "list_servers?type=" + type;
    if (isImdb) {
        searchUrl += "&imdb=" + id;
    } else {
        searchUrl += "&tmdb=" + id;
    }
    
    if (type === "tv") {
        searchUrl += "&season=" + season + "&episode=" + episode;
    }

    var ua = "Mozilla/5.0 (Linux; Android 15; ALT-NX1 Build/HONORALT-N31; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/146.0.7680.177 Mobile Safari/537.36";

    return fetch(searchUrl, {
        headers: { "User-Agent": ua, "Referer": "https://primesrc.me/" }
    })
    .then(function(res) { 
        return res.json(); 
    })
    .then(function(data) {
        if (!data || !data.servers) return [];

        var results = [];
        var servers = data.servers;

        // Using a basic for-loop for maximum stability in Nuvio
        var fetchAll = [];
        for (var i = 0; i < servers.length; i++) {
            var s = servers[i];
            var p = fetch(PRIMESRC_API + "l?key=" + s.key, {
                headers: { "User-Agent": ua, "Referer": "https://primesrc.me/" }
            })
            .then(function(lRes) { return lRes.json(); })
            .then(function(lData) {
                if (!lData || !lData.link) return null;

                var finalUrl = lData.link;
                var streamRef = "https://primesrc.me/";

                // Apply referer fixes from your successful logs
                if (finalUrl.indexOf("streamta.site") !== -1) streamRef = "https://streamta.site/";
                if (finalUrl.indexOf("cloudatacdn.com") !== -1) streamRef = "https://playmogo.com/";

                return {
                    name: "PrimeSrc: " + (s.name || "HD"),
                    url: finalUrl,
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
            
            fetchAll.push(p);
        }

        return Promise.all(fetchAll).then(function(items) {
            var filtered = [];
            for (var j = 0; j < items.length; j++) {
                if (items[j]) filtered.push(items[j]);
            }
            return filtered;
        });
    })
    .catch(function() { 
        return []; 
    });
}

if (typeof module !== 'undefined') module.exports = { getStreams: getStreams };
