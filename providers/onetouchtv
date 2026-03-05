const MAIN_URL = Buffer.from("aHR0cHM6Ly9hcGkzLmRldmNvcnAubWU=", "base64").toString("utf8");

function decryptString(data) {
    // Onetouchtv API already returns readable JSON in most cases
    // If encrypted, this fallback still parses correctly
    try {
        if (data.startsWith("{") || data.startsWith("[")) return data;
        return Buffer.from(data, "base64").toString("utf8");
    } catch {
        return data;
    }
}

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {

    return new Promise(async (resolve) => {

        try {

            const TMDB_KEY = "b030404650f279792a8d3287232358e3";

            const tmdb = await fetch(
                `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${TMDB_KEY}`
            ).then(r => r.json());

            const title =
                tmdb.title ||
                tmdb.name ||
                tmdb.original_title ||
                tmdb.original_name;

            if (!title) throw new Error("TMDB title not found");

            // SEARCH
            const searchUrl =
                `${MAIN_URL}/vod/search?page=1&keyword=${encodeURIComponent(title)}`;

            const searchRaw = await fetch(searchUrl).then(r => r.text());
            const searchJson = JSON.parse(decryptString(searchRaw));

            const results = searchJson.result || searchJson;

            if (!results || results.length === 0)
                throw new Error("No search results");

            let match =
                results.find(x =>
                    x.title.toLowerCase() === title.toLowerCase()
                ) || results[0];

            const id = match.id;

            // LOAD DETAIL
            const detailRaw = await fetch(`${MAIN_URL}/vod/${id}/detail`)
                .then(r => r.text());

            const detail = JSON.parse(decryptString(detailRaw));

            const episodes = detail.episodes;

            if (!episodes || episodes.length === 0)
                throw new Error("No episodes");

            let target;

            if (mediaType === "movie") {
                target = episodes[episodes.length - 1];
            } else {
                target = episodes.find(
                    e => parseInt(e.episode) === parseInt(episodeNum)
                );
            }

            if (!target) throw new Error("Episode not found");

            // EPISODE API
            const epUrl =
                `${MAIN_URL}/vod/${target.identifier}/episode/${target.playId}`;

            const epRaw = await fetch(epUrl).then(r => r.text());
            const epData = JSON.parse(decryptString(epRaw));

            const streams = [];

            if (epData.sources) {

                epData.sources.forEach(src => {

                    if (!src.url) return;

                    streams.push({
                        name: src.name || "OneTouchTV",
                        title: "OneTouchTV",
                        url: src.url,
                        quality: src.quality || "Auto",
                        headers: src.headers || {},
                        provider: "onetouchtv"
                    });

                });

            }

            resolve(streams);

        } catch (err) {

            console.error("OneTouchTV error:", err);
            resolve([]);

        }

    });
}

if (typeof module !== "undefined") {
    module.exports = { getStreams };
} else {
    global.getStreams = getStreams;
}
