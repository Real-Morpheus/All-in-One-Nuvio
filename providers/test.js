// Dahmer Movies Scraper for Nuvio Local Scrapers
// React Native compatible version

console.log('[DahmerMovies] Initializing Dahmer Movies scraper');

// Constants
const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const DAHMER_MOVIES_API = 'https://a.111477.xyz';
const TIMEOUT = 60000; // 60 seconds

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

// Helper function to make HTTP requests
function makeRequest(url, options = {}) {
    const requestOptions = {
        timeout: TIMEOUT,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Connection': 'keep-alive',
            ...options.headers
        },
        ...options
    };

    return fetch(url, requestOptions).then(function(response) {
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response;
    });
}

// Utility functions
function getEpisodeSlug(season = null, episode = null) {
    if (season === null && episode === null) {
        return ['', ''];
    }
    const seasonSlug = season < 10 ? `0${season}` : `${season}`;
    const episodeSlug = episode < 10 ? `0${episode}` : `${episode}`;
    return [seasonSlug, episodeSlug];
}

function getIndexQuality(str) {
    if (!str) return Qualities.Unknown;
    const match = str.match(/(\d{3,4})[pP]/);
    return match ? parseInt(match[1]) : Qualities.Unknown;
}

function getQualityWithCodecs(str) {
    if (!str) return 'Unknown';
    const qualityMatch = str.match(/(\d{3,4})[pP]/);
    const baseQuality = qualityMatch ? `${qualityMatch[1]}p` : 'Unknown';
    const codecs = [];
    const lowerStr = str.toLowerCase();
    
    if (lowerStr.includes('dv') || lowerStr.includes('dolby vision')) codecs.push('DV');
    if (lowerStr.includes('hdr10+')) codecs.push('HDR10+');
    else if (lowerStr.includes('hdr10') || lowerStr.includes('hdr')) codecs.push('HDR');
    if (lowerStr.includes('remux')) codecs.push('REMUX');
    if (lowerStr.includes('imax')) codecs.push('IMAX');
    
    return codecs.length > 0 ? `${baseQuality} | ${codecs.join(' | ')}` : baseQuality;
}

function getIndexQualityTags(str, fullTag = false) {
    if (!str) return '';
    if (fullTag) {
        const match = str.match(/(.*)\.(?:mkv|mp4|avi)/i);
        return match ? match[1].trim() : str;
    } else {
        const match = str.match(/\d{3,4}[pP]\.?(.*?)\.(mkv|mp4|avi)/i);
        return match ? match[1].replace(/\./g, ' ').trim() : str;
    }
}

function formatFileSize(sizeText) {
    if (!sizeText) return null;
    if (/\d+(\.\d+)?\s*(GB|MB|KB|TB)/i.test(sizeText)) return sizeText;
    const bytes = parseInt(sizeText);
    if (isNaN(bytes)) return sizeText;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

function parseLinks(html) {
    const links = [];
    const rowRegex = /<tr[^>]*>(.*?)<\/tr>/gis;
    let rowMatch;

    while ((rowMatch = rowRegex.exec(html)) !== null) {
        const rowContent = rowMatch[1];
        const linkMatch = rowContent.match(/<a[^>]*href=["']([^"']*)["'][^>]*>([^<]*)<\/a>/i);
        if (!linkMatch) continue;

        const href = linkMatch[1];
        const text = linkMatch[2].trim();
        if (!text || href === '../' || text === '../') continue;

        let size = null;
        const sizeMatch1 = rowContent.match(/<td[^>]*data-sort=["']?(\d+)["']?[^>]*>(\d+)<\/td>/i);
        if (sizeMatch1) size = sizeMatch1[2];
        if (!size) {
            const sizeMatch2 = rowContent.match(/<td[^>]*class=["']filesize["'][^>]*[^>]*>([^<]+)<\/td>/i);
            if (sizeMatch2) size = sizeMatch2[1].trim();
        }
        links.push({ text, href, size });
    }
    return links;
}

// Main Scraper Function
function invokeDahmerMovies(title, year, season = null, episode = null) {
    const folderName = season === null 
        ? `${title.replace(/:/g, '')} (${year})`
        : `${title.replace(/:/g, ' -')}`;

    const encodedPath = season === null 
        ? `movies/${encodeURIComponent(folderName)}/`
        : `tvs/${encodeURIComponent(folderName)}/Season ${season}/`;
    
    const finalRequestUrl = `${DAHMER_MOVIES_API}/${encodedPath}`;
    
    return makeRequest(finalRequestUrl).then(res => res.text()).then(html => {
        const paths = parseLinks(html);
        let filteredPaths;
        
        if (season === null) {
            filteredPaths = paths.filter(path => /(1080p|2160p)/i.test(path.text));
        } else {
            const [seasonSlug, episodeSlug] = getEpisodeSlug(season, episode);
            const episodePattern = new RegExp(`S${seasonSlug}E${episodeSlug}`, 'i');
            filteredPaths = paths.filter(path => episodePattern.test(path.text));
        }
        
        return filteredPaths.map(path => {
            const qualityWithCodecs = getQualityWithCodecs(path.text);
            const tags = getIndexQualityTags(path.text);
            
            let fullUrl;
            // FIX: Avoid double encoding % by checking if href is already encoded
            if (path.href.startsWith('http')) {
                fullUrl = path.href.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
            } else {
                const baseUrl = finalRequestUrl.endsWith('/') ? finalRequestUrl : finalRequestUrl + '/';
                // If the href already contains %, don't encode it again to prevent %25
                let fileName = path.href;
                if (!fileName.includes('%')) {
                    fileName = encodeURIComponent(fileName)
                        .replace(/\(/g, '%28')
                        .replace(/\)/g, '%29');
                }
                fullUrl = baseUrl + fileName;
            }
            
            return {
                name: "DahmerMovies",
                title: `DahmerMovies ${tags || path.text}`,
                url: fullUrl,
                quality: qualityWithCodecs,
                size: formatFileSize(path.size),
                headers: {},
                provider: "dahmermovies",
                filename: path.text
            };
        });
    }).catch(err => {
        console.log(`[DahmerMovies] Error: ${err.message}`);
        return [];
    });
}

function getStreams(tmdbId, mediaType = 'movie', seasonNum = null, episodeNum = null) {
    const tmdbUrl = `https://api.themoviedb.org/3/${mediaType === 'tv' ? 'tv' : 'movie'}/${tmdbId}?api_key=${TMDB_API_KEY}`;
    return makeRequest(tmdbUrl).then(res => res.json()).then(tmdbData => {
        const title = mediaType === 'tv' ? tmdbData.name : tmdbData.title;
        const year = mediaType === 'tv' ? tmdbData.first_air_date?.substring(0, 4) : tmdbData.release_date?.substring(0, 4);
        return invokeDahmerMovies(title, year ? parseInt(year) : null, seasonNum, episodeNum);
    }).catch(err => []);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.getStreams = getStreams;
}
