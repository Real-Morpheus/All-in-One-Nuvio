// PrimeSrc Scraper for Nuvio
// Uses the official /api/v1/list_servers endpoint

const PRIMESRC_BASE = "https://primesrc.me/api/v1/";
const PRIMESRC_SITE = "https://primesrc.me";

function getStreams(id, mediaType, season, episode) {
    // 1. Build the correct URL based on the documentation
    var type = (season && episode) ? "tv" : "movie";
    var url = PRIMESRC_BASE + "list_servers?type=" + type;

    // Use imdb param if it starts with 'tt', otherwise use tmdb
    if (typeof id === 'string' && id.startsWith('tt')) {
        url += "&imdb=" + id;
    } else {
        url += "&tmdb=" + id;
    }

    if (type === "tv") {
        url += "&season=" + season + "&episode=" + episode;
    }

    console.log("[PrimeSrc] Fetching from: " + url);

    // 2. Execute the request
    return fetch(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": PRIMESRC_SITE + "/"
        }
    })
    .then(function(response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
    })
    .then(function(data) {
        // The API returns an object with a 'servers' array
        if (!data || !data.servers || !Array.isArray(data.servers)) {
            console.log("[PrimeSrc] No servers found in response.");
            return [];
        }

        // 3. Map servers to Nuvio format
        // NOTE: The Info API provides server names. 
        // To get a direct video link, we usually point to the embed URL 
        // because the API documentation doesn't list a "direct file" endpoint.
        return data.servers.map(function(server) {
            // Build the embed URL for the specific server
            var embedUrl = PRIMESRC_SITE + "/embed/" + type + "?";
            if (typeof id === 'string' && id.startsWith('tt')) {
                embedUrl += "imdb=" + id;
            } else {
                embedUrl += "tmdb=" + id;
            }

            if (type === "tv") {
                embedUrl += "&season=" + season + "&episode=" + episode;
            }
            
            // Whitelist just this server for this specific result
            embedUrl += "&whitelistServers=" + encodeURIComponent(server.name);

            return {
                name: "PrimeSrc - " + server.name,
                url: embedUrl, // Nuvio handles embed URLs
                quality: "Auto",
                headers: { "Referer": PRIMESRC_SITE },
                provider: "primesrc"
            };
        });
    })
    .catch(function(error) {
        console.error("[PrimeSrc] Scraper Error: " + error.message);
        return [];
    });
}

// Export for Nuvio environment
if (typeof module !== "undefined" && module.exports) {
    module.exports = { getStreams: getStreams };
} else {
    global.getStreams = getStreams;
}
