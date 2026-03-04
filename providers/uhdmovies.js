console.log('[UHDMovies] Initializing UHDMovies scraper');

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const BASE = "https://uhdmovies.zip";
const TIMEOUT = 60000;

function makeRequest(url, options = {}) {
    return fetch(url, {
        timeout: TIMEOUT,
        headers: {
            'User-Agent': 'Mozilla/5.0',
            'Accept': '*/*',
            ...options.headers
        },
        ...options
    }).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r;
    });
}

function searchUHD(title, year) {
    const query = encodeURIComponent(title + " " + year);
    const url = `${BASE}/?s=${query}`;

    console.log("[UHDMovies] Search:", url);

    return makeRequest(url)
        .then(r => r.text())
        .then(html => {

            const results = [];

            const regex = /<a href="([^"]+)"[^>]*rel="bookmark"/g;
            let m;

            while ((m = regex.exec(html)) !== null) {
                results.push(m[1]);
            }

            return results;
        });
}

function extractStreams(pageUrl) {

    console.log("[UHDMovies] Extract page:", pageUrl);

    return makeRequest(pageUrl)
        .then(r => r.text())
        .then(html => {

            const streams = [];

            const regex = /(https?:\/\/[^"' ]+\.(mkv|mp4))/gi;
            let m;

            while ((m = regex.exec(html)) !== null) {

                const url = m[1];

                let quality = "Unknown";

                if (url.includes("2160")) quality = "2160p";
                else if (url.includes("1080")) quality = "1080p";
                else if (url.includes("720")) quality = "720p";

                streams.push({
                    name: "UHDMovies",
                    title: "UHDMovies " + quality,
                    url: url,
                    quality: quality,
                    provider: "uhdmovies"
                });
            }

            return streams;
        });
}

function invokeUHD(title, year) {

    return searchUHD(title, year)
        .then(results => {

            if (!results.length) return [];

            return extractStreams(results[0]);
        });
}

function getStreams(tmdbId, mediaType = 'movie', season = null, episode = null) {

    console.log(`[UHDMovies] Fetching TMDB ${tmdbId}`);

    const tmdbUrl = `https://api.themoviedb.org/3/${mediaType === 'tv' ? 'tv' : 'movie'}/${tmdbId}?api_key=${TMDB_API_KEY}`;

    return makeRequest(tmdbUrl)
        .then(r => r.json())
        .then(tmdb => {

            const title = mediaType === 'tv' ? tmdb.name : tmdb.title;
            const year = mediaType === 'tv'
                ? tmdb.first_air_date?.substring(0,4)
                : tmdb.release_date?.substring(0,4);

            if (!title) return [];

            console.log("[UHDMovies] TMDB:", title, year);

            return invokeUHD(title, year);
        })
        .catch(err => {
            console.log("[UHDMovies] Error", err);
            return [];
        });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.getStreams = getStreams;
}
