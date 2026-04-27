// Dahmer Movies Scraper - Direct Link Fix (No Bulk Prefix)
console.log('[DahmerMovies] Initializing Scraper');

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const DAHMER_MOVIES_API = 'https://a.111477.xyz';

async function makeRequest(url) {
    try {
        return await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
    } catch (e) { return { ok: false }; }
}

async function resolveFinalUrl(startUrl) {
    // If the URL contains the bulk redirector, extract only the part after 'u='
    let cleanUrl = startUrl;
    if (startUrl.includes('/bulk?u=')) {
        cleanUrl = decodeURIComponent(startUrl.split('u=')[1]);
    }

    try {
        const response = await fetch(cleanUrl, {
            method: 'HEAD',
            redirect: 'follow',
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer',
                'Referer': DAHMER_MOVIES_API + '/'
            }
        });
        return response.url;
    } catch (e) { return cleanUrl; }
}

function parseLinks(html) {
    const links = [];
    const rowRegex = /<tr[^>]*>(.*?)<\/tr>/gis;
    let match;
    while ((match = rowRegex.exec(html)) !== null) {
        const content = match[1];
        const linkMatch = content.match(/<a[^>]*href=["']([^"']*)["'][^>]*>([^<]*)<\/a>/i);
        if (linkMatch) {
            const href = linkMatch[1];
            const text = linkMatch[2].trim();
            if (text && href !== '../' && /\.(mkv|mp4|avi|webm)$/i.test(text)) {
                links.push({ text, href });
            }
        }
    }
    return links;
}

async function invokeDahmerMovies(title, year, season = null, episode = null) {
    const cleanTitle = title.replace(/:/g, '');
    const folderName = season === null ? `${cleanTitle} (${year})` : cleanTitle;
    const baseDir = season === null ? `/movies/` : `/tvs/`;
    const folderPath = `${baseDir}${encodeURIComponent(folderName)}/`;
    const fullDirUrl = DAHMER_MOVIES_API + folderPath;

    const response = await makeRequest(fullDirUrl);
    if (!response.ok) return [];
    
    const html = await response.text();
    const paths = parseLinks(html);

    const sortedPaths = paths.sort((a, b) => {
        const a4k = /2160p|4k/i.test(a.text);
        const b4k = /2160p|4k/i.test(b.text);
        return b4k - a4k;
    });

    const results = [];
    for (const path of sortedPaths.slice(0, 5)) {
        let finalUrl;

        // Logic to prevent doubling and strip redirectors
        if (path.href.startsWith('http')) {
            finalUrl = path.href;
        } else if (path.href.includes('/movies/') || path.href.includes('/tvs/')) {
            finalUrl = DAHMER_MOVIES_API + (path.href.startsWith('/') ? '' : '/') + path.href;
        } else {
            finalUrl = fullDirUrl + path.href;
        }

        // Clean double slashes
        finalUrl = finalUrl.replace(/([^:]\/)\/+/g, "$1");
        
        // Resolve and strip the 'bulk?u=' prefix if present
        const streamUrl = await resolveFinalUrl(finalUrl);

        results.push({
            name: "DahmerMovies",
            title: path.text,
            url: streamUrl,
            quality: /2160p|4k/i.test(path.text) ? '2160p' : '1080p',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Android) ExoPlayer',
                'Referer': DAHMER_MOVIES_API + '/',
                'Range': 'bytes=0-'
            },
            provider: "dahmermovies"
        });
    }
    return results;
}

async function getStreams(tmdbId, mediaType = 'movie', seasonNum = null, episodeNum = null) {
    try {
        const type = mediaType === 'tv' ? 'tv' : 'movie';
        const tmdbUrl = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_API_KEY}`;
        const res = await makeRequest(tmdbUrl);
        const data = await res.json();
        
        const title = mediaType === 'tv' ? data.name : data.title;
        const year = (mediaType === 'tv' ? data.first_air_date : data.release_date)?.substring(0, 4);

        if (!title) return [];
        return await invokeDahmerMovies(title, year, seasonNum, episodeNum);
    } catch (e) { return []; }
}

if (typeof module !== 'undefined') module.exports = { getStreams };
else global.getStreams = getStreams;
