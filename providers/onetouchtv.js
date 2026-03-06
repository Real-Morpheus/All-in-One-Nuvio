async function getStreams(tmdbId, mediaType, season, episode) {

    try {

        const API = "https://api.themoviedb.org/3/";
        const KEY = "8d6d91784c04f98f6e241852615c441b";

        const metaRes = await fetch(
            API + (mediaType === "tv" ? "tv/" : "movie/") + tmdbId +
            "?api_key=" + KEY + "&language=en-US"
        );

        const meta = await metaRes.json();

        const title = meta.title || meta.name;
        if (!title) return [];

        const searchRes = await fetch(
            "https://movix.blog/search?q=" + encodeURIComponent(title)
        );

        const searchHtml = await searchRes.text();

        const match =
            searchHtml.match(/href="\/movie\/([^"]+)"/i) ||
            searchHtml.match(/href="\/watch\/([^"]+)"/i);

        if (!match) return [];

        const movieUrl = "https://movix.blog/movie/" + match[1];

        const movieRes = await fetch(movieUrl, {
            headers: {
                "Referer": "https://movix.blog/",
                "User-Agent": "Mozilla/5.0"
            }
        });

        const movieHtml = await movieRes.text();

        // extract iframe
        const iframeMatch = movieHtml.match(/<iframe[^>]+src="([^"]+)"/i);
        if (!iframeMatch) return [];

        const iframeUrl = iframeMatch[1];

        const iframeRes = await fetch(iframeUrl, {
            headers: {
                "Referer": movieUrl,
                "User-Agent": "Mozilla/5.0"
            }
        });

        const iframeHtml = await iframeRes.text();

        // extract stream
        const streamMatch =
            iframeHtml.match(/(https?:\/\/[^"' ]+\.m3u8[^"' ]*)/) ||
            iframeHtml.match(/(https?:\/\/[^"' ]+\.mp4[^"' ]*)/);

        if (!streamMatch) return [];

        const streamUrl = streamMatch[1];

        return [
            {
                name: "Movix",
                title: "Movix HD",
                url: streamUrl,
                quality: "1080p",
                source: "Movix",
                headers: {
                    Referer: iframeUrl,
                    "User-Agent": "Mozilla/5.0"
                }
            }
        ];

    } catch (err) {
        return [];
    }

}

module.exports = { getStreams };
