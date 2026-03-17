const BASE_URL = "https://animepahe.si";

async function fetchStream(title, episode) {
    try {
        // 1. Search anime
        let searchRes = await fetch(`${BASE_URL}/api?m=search&q=${encodeURIComponent(title)}`);
        let searchJson = await searchRes.json();

        if (!searchJson.data || searchJson.data.length === 0) return null;

        let animeId = searchJson.data[0].id;

        // 2. Get episode list
        let epRes = await fetch(`${BASE_URL}/api?m=release&id=${animeId}&sort=episode_asc`);
        let epJson = await epRes.json();

        let epData = epJson.data.find(e => e.episode == episode);
        if (!epData) return null;

        // 3. Get session page (contains kwik links)
        let sessionRes = await fetch(`${BASE_URL}/play/${epData.session}`);
        let sessionHtml = await sessionRes.text();

        // 4. Extract kwik link
        let kwikMatch = sessionHtml.match(/https:\/\/kwik\.[^"]+/);
        if (!kwikMatch) return null;

        let kwikUrl = kwikMatch[0];

        // 5. Open kwik page
        let kwikRes = await fetch(kwikUrl);
        let kwikHtml = await kwikRes.text();

        // 6. Extract m3u8
        let m3u8Match = kwikHtml.match(/https?:\/\/[^"]+\.m3u8[^"]*/);
        if (!m3u8Match) return null;

        return {
            stream: m3u8Match[0],
            referer: kwikUrl
        };

    } catch (e) {
        return null;
    }
}

function getStreams(tmdbId, mediaType, season, episode, title) {
    return new Promise(async (resolve) => {

        let result = await fetchStream(title, episode);

        if (!result) {
            resolve([]);
            return;
        }

        resolve([{
            name: "AnimePahe",
            url: result.stream,
            type: "hls",
            headers: {
                "Referer": result.referer,
                "User-Agent": "Mozilla/5.0"
            }
        }]);
    });
}
