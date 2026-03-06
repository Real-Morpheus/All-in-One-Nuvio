const BASE = "https://movix.blog";
const TMDB = "https://api.themoviedb.org/3/";
const KEY = "8d6d91784c04f98f6e241852615c441b";

async function getStreams(tmdbId, mediaType, season, episode) {

    try {

        // ───────── TMDB metadata ─────────
        const metaRes = await fetch(
            TMDB + (mediaType === "tv" ? "tv/" : "movie/") +
            tmdbId +
            "?api_key=" + KEY + "&language=en-US"
        );

        const meta = await metaRes.json();

        const title = meta.title || meta.name;
        if (!title) return [];

        // ───────── Search Movix ─────────
        const searchRes = await fetch(
            BASE + "/search?q=" + encodeURIComponent(title),
            {
                headers: {
                    "User-Agent": "Mozilla/5.0"
                }
            }
        );

        const html = await searchRes.text();

        const linkMatch =
            html.match(/href="\/movie\/([^"]+)"/i) ||
            html.match(/href="\/watch\/([^"]+)"/i);

        if (!linkMatch) return [];

        const movieUrl = BASE + "/movie/" + linkMatch[1];

        // ───────── Open movie page ─────────
        const pageRes = await fetch(movieUrl, {
            headers: {
                "Referer": BASE,
                "User-Agent": "Mozilla/5.0"
            }
        });

        const pageHtml = await pageRes.text();

        // ───────── Extract iframes ─────────
        const iframeRegex = /<iframe[^>]+src="([^"]+)"/gi;

        let iframe;
        let streams = [];

        while ((iframe = iframeRegex.exec(pageHtml)) !== null) {

            const iframeUrl = iframe[1];

            try {

                const playerRes = await fetch(iframeUrl, {
                    headers: {
                        "Referer": movieUrl,
                        "User-Agent": "Mozilla/5.0"
                    }
                });

                const playerHtml = await playerRes.text();

                // ───────── Extract streams ─────────
                const streamRegex =
                    /(https?:\/\/[^"' ]+\.m3u8[^"' ]*)|(https?:\/\/[^"' ]+\.mp4[^"' ]*)/gi;

                let match;

                while ((match = streamRegex.exec(playerHtml)) !== null) {

                    const streamUrl = match[1] || match[2];

                    streams.push({
                        name: "Movix",
                        title: "Movix Server",
                        url: streamUrl,
                        quality: "HD",
                        source: "Movix",
                        headers: {
                            Referer: iframeUrl,
                            "User-Agent": "Mozilla/5.0"
                        }
                    });

                }

            } catch (err) {}

        }

        return streams;

    } catch (err) {

        return [];

    }

}

module.exports = { getStreams };
