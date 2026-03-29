// Dahmer Movies Scraper for Nuvio Local Scrapers
// React Native compatible version

console.log('[DahmerMovies] Initializing Dahmer Movies scraper');

// Constants
const TMDB_API_KEY = "8ab2887a5c9ac2a523356811180f5166";
const DAHMER_MOVIES_API = 'https://a.111477.xyz';
const PROXY_HOST = 'https://p.111477.xyz';
const HEADERS_JSON_URL = 'https://raw.githubusercontent.com/Anshu78780/json/refs/heads/main/hs.json';
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

// Cache for remote headers/cookies
let remoteHeadersCache = null;

// Fetch headers/cookies from GitHub JSON
function fetchRemoteHeaders() {
    if (remoteHeadersCache) {
        return Promise.resolve(remoteHeadersCache);
    }

    console.log('[DahmerMovies] Fetching remote headers from GitHub...');
    return fetch(HEADERS_JSON_URL, { timeout: TIMEOUT })
        .then(res => {
            if (!res.ok) throw new Error(`Failed to fetch headers JSON: ${res.status}`);
            return res.json();
        })
        .then(data => {
            remoteHeadersCache = data;
            console.log('[DahmerMovies] Remote headers loaded successfully');
            return data;
        })
        .catch(err => {
            console.log(`[DahmerMovies] Could not fetch remote headers: ${err.message}`);
            return null;
        });
}

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
        if (!response.ok && response.status !== 302) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response;
    });
}

// Resolve a direct file URL through p.111477.xyz/bulk to get the final stream URL
// Sends exact headers/cookies as seen in browser network tab
function resolveStreamUrl(fileUrl, remoteHeaders) {
    console.log(`[DahmerMovies] Resolving stream URL via proxy for: ${fileUrl}`);

    // Build cookie string: start from remote JSON, override cf_clearance if present
    let cookieString = '';
    if (remoteHeaders && remoteHeaders.cookies) {
        // Parse existing cookies
        const cookieMap = {};
        remoteHeaders.cookies.split(';').forEach(part => {
            const idx = part.indexOf('=');
            if (idx !== -1) {
                const key = part.substring(0, idx).trim();
                const val = part.substring(idx + 1).trim();
                cookieMap[key] = val;
            }
        });

        // If there's a newer cf_clearance in remoteHeaders (top-level), override
        if (remoteHeaders.cf_clearance) {
            cookieMap['cf_clearance'] = remoteHeaders.cf_clearance;
        }

        cookieString = Object.entries(cookieMap)
            .map(([k, v]) => `${k}=${v}`)
            .join('; ');
    }

    // Construct the proxy bulk URL
    // Scheme: GET https://p.111477.xyz/bulk
    // with 'u' query param = original file URL on a.111477.xyz
    const proxyUrl = `${PROXY_HOST}/bulk?u=${encodeURIComponent(fileUrl)}`;

    const requestHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:148.0) Gecko/20100101 Firefox/148.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Pragma': 'no-cache',
        'Referer': 'https://a.111477.xyz/',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-site',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'Priority': 'u=0, i',
        ...(cookieString ? { 'Cookie': cookieString } : {})
    };

    console.log(`[DahmerMovies] Proxy request URL: ${proxyUrl}`);

    return fetch(proxyUrl, {
        method: 'GET',
        headers: requestHeaders,
        redirect: 'manual', // Do NOT follow redirect — we want the Location header
        timeout: TIMEOUT
    }).then(response => {
        console.log(`[DahmerMovies] Proxy response status: ${response.status}`);

        // Extract Location header from the 302 redirect
        const location = response.headers.get('location') || response.headers.get('Location');
        if (location) {
            console.log(`[DahmerMovies] Resolved stream URL: ${location}`);
            return location;
        }

        // If no location header, try to return the response URL (some fetch implementations follow and expose it)
        if (response.url && response.url !== proxyUrl) {
            console.log(`[DahmerMovies] Using response.url as stream URL: ${response.url}`);
            return response.url;
        }

        console.log('[DahmerMovies] No redirect location found, falling back to original URL');
        return fileUrl;
    }).catch(err => {
        console.log(`[DahmerMovies] Proxy resolution failed: ${err.message}, using original URL`);
        return fileUrl;
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

// Extract quality with codec information
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
    
    if (codecs.length > 0) {
        return `${baseQuality} | ${codecs.join(' | ')}`;
    }
    
    return baseQuality;
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

function encodeUrl(url) {
    try {
        return encodeURI(url);
    } catch (e) {
        return url;
    }
}

function decode(input) {
    try {
        return decodeURIComponent(input);
    } catch (e) {
        return input;
    }
}

// Format file size from bytes to human readable format
function formatFileSize(sizeText) {
    if (!sizeText) return null;
    
    if (/\d+(\.\d+)?\s*(GB|MB|KB|TB)/i.test(sizeText)) {
        return sizeText;
    }
    
    const bytes = parseInt(sizeText);
    if (isNaN(bytes)) return sizeText;
    
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';
    
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = (bytes / Math.pow(1024, i)).toFixed(2);
    
    return `${size} ${sizes[i]}`;
}

// Parse HTML using basic string manipulation (React Native compatible)
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
        if (sizeMatch1) {
            size = sizeMatch1[2];
        }

        if (!size) {
            const sizeMatch2 = rowContent.match(/<td[^>]*class=["']filesize["'][^>]*[^>]*>([^<]+)<\/td>/i);
            if (sizeMatch2) {
                size = sizeMatch2[1].trim();
            }
        }

        if (!size) {
            const sizeMatch3 = rowContent.match(/<\/a><\/td>\s*<td[^>]*>([^<]+(?:GB|MB|KB|B|\d+\s*(?:GB|MB|KB|B)))<\/td>/i);
            if (sizeMatch3) {
                size = sizeMatch3[1].trim();
            }
        }

        if (!size) {
            const sizeMatch4 = rowContent.match(/(\d+(?:\.\d+)?\s*(?:GB|MB|KB|B|bytes?))/i);
            if (sizeMatch4) {
                size = sizeMatch4[1].trim();
            }
        }

        links.push({ text, href, size });
    }
    
    if (links.length === 0) {
        const linkRegex = /<a[^>]*href=["']([^"']*)["'][^>]*>([^<]*)<\/a>/gi;
        let match;
        
        while ((match = linkRegex.exec(html)) !== null) {
            const href = match[1];
            const text = match[2].trim();
            if (text && href && href !== '../' && text !== '../') {
                links.push({ text, href, size: null });
            }
        }
    }
    
    return links;
}

// Main Dahmer Movies fetcher function
function invokeDahmerMovies(title, year, season = null, episode = null) {
    console.log(`[DahmerMovies] Searching for: ${title} (${year})${season ? ` Season ${season}` : ''}${episode ? ` Episode ${episode}` : ''}`);
    
    const encodedUrl = season === null 
        ? `${DAHMER_MOVIES_API}/movies/${encodeURIComponent(title.replace(/:/g, '') + ' (' + year + ')')}/`
        : `${DAHMER_MOVIES_API}/tvs/${encodeURIComponent(title.replace(/:/g, ' -'))}/Season ${season}/`;
    
    console.log(`[DahmerMovies] Fetching from: ${encodedUrl}`);

    // Fetch remote headers and directory listing in parallel
    return Promise.all([
        fetchRemoteHeaders(),
        makeRequest(encodedUrl).then(r => r.text())
    ]).then(function([remoteHeaders, html]) {
        console.log(`[DahmerMovies] Response length: ${html.length}`);
        
        const paths = parseLinks(html);
        console.log(`[DahmerMovies] Found ${paths.length} total links`);
        
        let filteredPaths;
        if (season === null) {
            filteredPaths = paths.filter(path => 
                /(1080p|2160p)/i.test(path.text)
            );
            console.log(`[DahmerMovies] Filtered to ${filteredPaths.length} movie links (1080p/2160p only)`);
        } else {
            const [seasonSlug, episodeSlug] = getEpisodeSlug(season, episode);
            const episodePattern = new RegExp(`S${seasonSlug}E${episodeSlug}`, 'i');
            filteredPaths = paths.filter(path => 
                episodePattern.test(path.text)
            );
            console.log(`[DahmerMovies] Filtered to ${filteredPaths.length} TV episode links (S${seasonSlug}E${episodeSlug})`);
        }
        
        if (filteredPaths.length === 0) {
            console.log('[DahmerMovies] No matching content found');
            return [];
        }
        
        // Build direct file URLs first
        const rawResults = filteredPaths.map(path => {
            const quality = getIndexQuality(path.text);
            const qualityWithCodecs = getQualityWithCodecs(path.text);
            const tags = getIndexQualityTags(path.text);
            
            let directUrl;
            if (path.href.startsWith('http')) {
                try {
                    const url = new URL(path.href);
                    directUrl = `${url.protocol}//${url.host}${url.pathname}`;
                } catch (error) {
                    directUrl = path.href.replace(/ /g, '%20');
                }
            } else {
                const baseUrl = encodedUrl.endsWith('/') ? encodedUrl : encodedUrl + '/';
                const relativePath = path.href.startsWith('/') ? path.href.substring(1) : path.href;
                const encodedFilename = encodeURIComponent(relativePath);
                directUrl = baseUrl + encodedFilename;
            }
            
            return {
                name: "DahmerMovies",
                title: `DahmerMovies ${tags || path.text}`,
                directUrl,
                quality: qualityWithCodecs,
                size: formatFileSize(path.size),
                headers: {},
                provider: "dahmermovies",
                filename: path.text
            };
        });

        // Resolve all stream URLs through the proxy (p.111477.xyz/bulk)
        // Extract Location header from the 302 response as the final stream URL
        return Promise.all(
            rawResults.map(item =>
                resolveStreamUrl(item.directUrl, remoteHeaders).then(finalUrl => ({
                    name: item.name,
                    title: item.title,
                    url: finalUrl,       // Final resolved CDN stream URL
                    quality: item.quality,
                    size: item.size,
                    headers: item.headers,
                    provider: item.provider,
                    filename: item.filename
                }))
            )
        );
        
    }).then(function(results) {
        // Sort by quality (highest first)
        results.sort((a, b) => {
            const qualityA = getIndexQuality(a.filename);
            const qualityB = getIndexQuality(b.filename);
            return qualityB - qualityA;
        });
        
        console.log(`[DahmerMovies] Successfully processed ${results.length} streams`);
        return results;
        
    }).catch(function(error) {
        if (error.name === 'AbortError') {
            console.log('[DahmerMovies] Request timeout - server took too long to respond');
        } else {
            console.log(`[DahmerMovies] Error: ${error.message}`);
        }
        return [];
    });
}

// Main function to get streams for TMDB content
function getStreams(tmdbId, mediaType = 'movie', seasonNum = null, episodeNum = null) {
    console.log(`[DahmerMovies] Fetching streams for TMDB ID: ${tmdbId}, Type: ${mediaType}${seasonNum ? `, S${seasonNum}E${episodeNum}` : ''}`);

    const tmdbUrl = `https://api.themoviedb.org/3/${mediaType === 'tv' ? 'tv' : 'movie'}/${tmdbId}?api_key=${TMDB_API_KEY}`;
    return makeRequest(tmdbUrl).then(function(tmdbResponse) {
        return tmdbResponse.json();
    }).then(function(tmdbData) {
        const title = mediaType === 'tv' ? tmdbData.name : tmdbData.title;
        const year = mediaType === 'tv' ? tmdbData.first_air_date?.substring(0, 4) : tmdbData.release_date?.substring(0, 4);

        if (!title) {
            throw new Error('Could not extract title from TMDB response');
        }

        console.log(`[DahmerMovies] TMDB Info: "${title}" (${year})`);

        return invokeDahmerMovies(
            title,
            year ? parseInt(year) : null,
            seasonNum,
            episodeNum
        );
        
    }).catch(function(error) {
        console.error(`[DahmerMovies] Error in getStreams: ${error.message}`);
        return [];
    });
}

// Export the main function
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.getStreams = getStreams;
}
