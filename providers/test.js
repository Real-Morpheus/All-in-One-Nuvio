// Dahmer Movies Scraper for Nuvio Local Scrapers
// React Native compatible version

console.log('[DahmerMovies] Initializing Dahmer Movies scraper');

// Constants
const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const DAHMER_MOVIES_API = 'https://a.111477.xyz';
const TIMEOUT = 60000;

// Quality mapping
const Qualities = {
    Unknown: 0,
    P144: 144,
    P240: 240,
    P360: 360,
    P480: 480,
    P720: 720,
    P1080: 1080,
    P1440: 1440,
    P2160: 2160
};

// HTTP REQUEST
function makeRequest(url, options = {}) {
    return fetch(url, {
        timeout: TIMEOUT,
        headers: {
            'User-Agent': 'Mozilla/5.0',
            'Accept': '*/*',
            'Connection': 'keep-alive',
            ...options.headers
        },
        ...options
    }).then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res;
    });
}

// EPISODE SLUG
function getEpisodeSlug(season = null, episode = null) {
    if (season === null && episode === null) return ['', ''];

    return [
        season < 10 ? `0${season}` : `${season}`,
        episode < 10 ? `0${episode}` : `${episode}`
    ];
}

// QUALITY
function getIndexQuality(str) {
    const match = str?.match(/(\d{3,4})p/i);
    return match ? parseInt(match[1]) : Qualities.Unknown;
}

// TAGS
function getIndexQualityTags(str) {
    const match = str.match(/\d{3,4}[pP]\.?(.*?)\.(mkv|mp4|avi)/i);
    return match ? match[1].replace(/\./g, ' ').trim() : str;
}

// SIZE
function formatFileSize(sizeText) {
    if (!sizeText) return null;
    if (/\d+(\.\d+)?\s*(GB|MB|KB|TB)/i.test(sizeText)) return sizeText;

    const bytes = parseInt(sizeText);
    if (isNaN(bytes)) return sizeText;

    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

// ===============================
// 🔥 FIXED SELECTOR LOGIC (MAIN FIX)
// ===============================
function parseLinks(html) {
    const links = [];

    // ONLY REAL FILE LINKS
    const regex = /<a[^>]*href=["']([^"']+\.(mkv|mp4|avi))["'][^>]*>([^<]+)<\/a>/gi;

    let m;
    while ((m = regex.exec(html))) {
        links.push({
            href: m[1],
            text: m[3].trim(),
            size: null
        });
    }

    return links;
}

// MAIN SCRAPER
function invokeDahmerMovies(title, year, season = null, episode = null) {

    const encodedUrl = season === null
        ? `${DAHMER_MOVIES_API}/movies/${encodeURIComponent(title.replace(/:/g, '') + ' (' + year + ')')}/`
        : `${DAHMER_MOVIES_API}/tvs/${encodeURIComponent(title.replace(/:/g, ' -'))}/Season ${season}/`;

    return makeRequest(encodedUrl)
        .then(r => r.text())
        .then(html => {

            let paths = parseLinks(html);

            // FILTER
            let filteredPaths;

            if (season === null) {
                filteredPaths = paths.filter(p =>
                    /(1080p|2160p)/i.test(p.text)
                );
            } else {
                const [s, e] = getEpisodeSlug(season, episode);
                const reg = new RegExp(`S${s}E${e}`, 'i');
                filteredPaths = paths.filter(p => reg.test(p.text));
            }

            return filteredPaths.map(path => {

                const quality = getIndexQuality(path.text);
                const tags = getIndexQualityTags(path.text);

                let fullUrl;

                // ===========================
                // 🔥 FIXED URL BUILD LOGIC
                // ===========================
                if (path.href.startsWith('http')) {
                    fullUrl = path.href;
                } else {
                    fullUrl = DAHMER_MOVIES_API + (path.href.startsWith('/') ? path.href : '/' + path.href);
                }

                console.log("FINAL URL:", fullUrl);

                return {
                    name: "DahmerMovies",
                    title: `DahmerMovies ${tags || path.text}`,
                    url: fullUrl,
                    quality: quality,
                    size: formatFileSize(path.size),

                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                        "Referer": DAHMER_MOVIES_API + "/",
                        "Origin": DAHMER_MOVIES_API,
                        "Accept": "*/*",
                        "Accept-Encoding": "identity",
                        "Connection": "keep-alive",
                        "Range": "bytes=0-"
                    },

                    provider: "dahmermovies",
                    filename: path.text
                };
            });
        })
        .catch(err => {
            console.log("ERROR:", err.message);
            return [];
        });
}

// TMDB WRAPPER
function getStreams(tmdbId, mediaType = 'movie', seasonNum = null, episodeNum = null) {

    const tmdbUrl = `https://api.themoviedb.org/3/${mediaType === 'tv' ? 'tv' : 'movie'}/${tmdbId}?api_key=${TMDB_API_KEY}`;

    return makeRequest(tmdbUrl)
        .then(r => r.json())
        .then(data => {

            const title = mediaType === 'tv' ? data.name : data.title;
            const year = mediaType === 'tv'
                ? data.first_air_date?.substring(0, 4)
                : data.release_date?.substring(0, 4);

            return invokeDahmerMovies(
                title,
                year ? parseInt(year) : null,
                seasonNum,
                episodeNum
            );
        })
        .catch(() => []);
}

// EXPORT
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.getStreams = getStreams;
}
