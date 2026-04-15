const PRIMESRC_BASE = "https://primesrc.me/api/v1/";
const PRIMESRC_SITE = "https://primesrc.me";

function getStreams(id, mediaType, season, episode) {
    var type = (season && episode) ? "tv" : "movie";
    var url = PRIMESRC_BASE + "list_servers?type=" + type;

    if (typeof id === 'string' && id.indexOf('tt') === 0) {
        url += "&imdb=" + id;
    } else {
        url += "&tmdb=" + id;
    }

    if (type === "tv") {
        url += "&season=" + season + "&episode=" + episode;
    }

    var ua = "Mozilla/5.0 (Linux; Android 15; ALT-NX1 Build/HONORALT-N31; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/146.0.7680.177 Mobile Safari/537.36";

    return fetch(url, {
        headers: {
            "User-Agent": ua,
            "Referer": PRIMESRC_SITE + "/"
        }
    })
    .then(function(response) {
        return response.json();
    })
    .then(function(data) {
        if (!data || !data.servers) return [];

        return data.servers.map(function(s) {
            // Using a simple check to find the key
            var k = s.key;
            if(!k) k = s.id;

            var playbackUrl = PRIMESRC_BASE + "l?key=" + k;
            
            // Apply the headers you provided for Voe and Streamtape
            // We use a simple if/else to keep the fetch stable
            var ref = "https://primesrc.me/";
            var org = "https://primesrc.me";

            if (s.name == "Voe") {
                ref = "https://marissasharecareer.com/";
                org = "https://marissasharecareer.com";
            }
            if (s.name == "Streamtape") {
                ref = "https://streamta.site/";
                org = "https://streamta.site";
            }

            return {
                name: "PrimeSrc - " + s.name,
                url: playbackUrl,
                quality: "1080p",
                headers: { 
                    "User-Agent": ua,
                    "Referer": ref,
                    "Origin": org,
                    "Accept": "*/*",
                    "Accept-Encoding": "identity;q=1, *;q=0",
                    "sec-ch-ua-platform": "Android",
                    "sec-ch-ua-mobile": "?1"
                }
            };
        });
    })
    .catch(function(error) {
        return [];
    });
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { getStreams: getStreams };
} else {
    global.getStreams = getStreams;
}
