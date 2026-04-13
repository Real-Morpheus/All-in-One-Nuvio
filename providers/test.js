// Dahmer Movies Scraper - Parallel Search Edition
// Fixed for: High-speed retrieval on Send Help, Zootopia 2, Peaky Blinders

console.log('[DahmerMovies] Initializing Parallel Scraper');

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const DAHMER_MOVIES_API = 'https://a.111477.xyz';
const TIMEOUT = 10000; 

async function makeRequest(url) {
    return fetch(url, {
        timeout: TIMEOUT,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
    }).then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res;
    });
}

function parseLinks(html) {
    const links = [];
    const linkRegex = /<a[^>]*href=["']([^"']*)["'][^>]*>([^<]*)<\/a>/gi;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
        const href = match[1];
        const text = match[2].trim();
        if (!text || href === '../' || href.includes('?C=') || text.toLowerCase().includes('parent directory')) continue;
        links.push({ text, href });
    }
    return links;
}

async function invokeDahmerMovies(title, year, season = null, episode = null) {
    const pathType = season === null ? 'movies' : 'tvs';
    const cleanTitle = title.replace(/:/g, '');
    
    // Create all possible variations
    const folderVariations = [];
    if (season === null) {
        folderVariations.push(`${cleanTitle} (${year})`);
        folderVariations.push(`${cleanTitle.replace(/ /g, '.')}.${year}`);
        folderVariations.push(cleanTitle);
    } else {
        folderVariations.push(cleanTitle);
        folderVariations.push(`${cleanTitle} -`);
        folderVariations.push(cleanTitle.replace(/ /g, '.'));
    }

    // Map variations to actual URL strings
    const urlRequests = folderVariations.map(folder => {
        const encodedFolder = encodeURIComponent(folder).replace(/\(/g, '%28').replace(/\)/g, '%29');
        let baseUrl = `${DAHMER_MOVIES_API}/${pathType}/${encodedFolder}/`;
        if (season !== null) {
            const sSlug = season < 10 ? `0${season}` : season;
            baseUrl += `Season%20${sSlug}/`;
        }
        return baseUrl;
    });

    // Strategy: Run all requests at once. Take the first one that returns valid HTML.
    const results = await Promise.allSettled(urlRequests.map(url => 
        makeRequest(url).then(async res => ({ url, html: await res.text() }))
    ));

    // Find the first successful result that actually has links
    const successfulMatch = results.find(r => 
        r.status === 'fulfilled' && r.value.html && r.value.html.includes('<a')
    );

    if (!successfulMatch) return [];

    const { url: finalBaseUrl, html } = successfulMatch.value;
    const paths = parseLinks(html);
    
    let filteredPaths = (season !== null) 
        ? paths.filter(p => {
            const s = season < 10 ? `0${season}` : `${season}`;
            const e = episode < 10 ? `0${episode}` : `${episode}`;
            const epPattern = new RegExp(`(S${s}E${e}|${season}x${e}|[\\s\\.\\-_]${e}[\\s\\.\\-_]|^${e}\\s)`, 'i');
            return epPattern.test(p.text) || epPattern.test(p.href);
          })
        : paths.filter(p => /\.(mkv|mp4|avi)$/i.test(p.href));

    return filteredPaths.map(path => {
        const resolvedUrl = new URL(path.href, finalBaseUrl).href;
        const finalUrl = decodeURIComponent(resolvedUrl)
            .replace(/ /g, '%20')
            .replace(/\(/g, '%28')
            .replace(/\)/g, '%29');

        const t = path.text.toLowerCase();
        let quality = 'HD';
        if (t.includes('2160') || t.includes('4k')) quality = '2160p';
        else if (t.includes('1440')) quality = '1440p';
        else if (t.includes('1080')) quality = '1080p';
        else if (t.includes('720')) quality = '720p';

        return {
            name: "DahmerMovies",
            title: `DahmerMovies ${path.text}`,
            url: finalUrl,
            quality: quality,
            provider: "dahmermovies",
            filename: path.text
        };
    });
}

async function getStreams(tmdbId, mediaType = 'movie', seasonNum = null, episodeNum = null) {
    try {
        const tmdbUrl = `https://api.themoviedb.org/3/${mediaType === 'tv' ? 'tv' : 'movie'}/${tmdbId}?api_key=${TMDB_API_KEY}`;
        const res = await makeRequest(tmdbUrl);
        const data = await res.json();
        const title = mediaType === 'tv' ? data.name : data.title;
        const year = (mediaType === 'tv' ? data.first_air_date : data.release_date)?.substring(0, 4);
        return await invokeDahmerMovies(title, year ? parseInt(year) : null, seasonNum, episodeNum);
    } catch (e) { return []; }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.getStreams = getStreams;
}
