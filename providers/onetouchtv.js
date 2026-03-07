const cheerio = require('cheerio-without-node-native');

const PLAYER_BASE = "https://s1.devcorp.me/player/player.html";

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    return new Promise((resolve) => {

        const tmdbUrl = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=b030404650f279792a8d3287232358e3`;

        fetch(tmdbUrl)
        .then(res => res.json())
        .then(tmdb => {

            const title = tmdb.title || tmdb.name || tmdb.original_title;

            let playerUrl;

            if (mediaType === "movie") {
                playerUrl = `${PLAYER_BASE}?title=${encodeURIComponent(title)}`;
            } else {
                playerUrl = `${PLAYER_BASE}?title=${encodeURIComponent(title)}%20S${seasonNum}%20E${episodeNum}`;
            }

            return fetch(playerUrl);
        })
        .then(res => res.text())
        .then(html => {

            const streams = [];

            const match = html.match(/file=\[(.*?)\]/);

            if (!match) {
                resolve([]);
                return;
            }

            const servers = JSON.parse(`[${match[1]}]`);

            servers.forEach(server => {

                if (!server.file) return;

                streams.push({
                    name: "OneTouchTV",
                    title: server.title || "Server",
                    url: server.file,
                    quality: "Auto",
                    headers: {
                        Referer: "https://s1.devcorp.me/",
                        Origin: "https://s1.devcorp.me"
                    },
                    provider: "onetouchtv"
                });

            });

            resolve(streams);

        })
        .catch(() => resolve([]));

    });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.getStreams = getStreams;
}
