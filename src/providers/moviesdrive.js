// MoviesDrive Scraper for Nuvio Local Scrapers
// Exact logic ported from scraper.py - fast and minimal

const cheerio = require('cheerio-without-node-native');

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

const TMDB_API_KEY = '439c478a771f35c05022f9feabcca01c';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// Fixed base URL as in scraper.py (no dynamic domain overhead for speed)
const BASE_URL = 'https://new2.moviesdrives.my/';
const SEARCH_API = 'https://new2.moviesdrives.my/search.php';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
};

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

function urlJoin(base, path) {
    if (!path) return base;
    if (path.startsWith('http')) return path;
    return base.replace(/\/$/, '') + '/' + path.replace(/^\//, '');
}

function sizeToBytes(sizeStr) {
    if (!sizeStr) return 0;
    const match = sizeStr.match(/([\d.]+)\s*(GB|MB|KB)/i);
    if (!match) return 0;
    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    if (unit === 'GB') return value * 1024 ** 3;
    if (unit === 'MB') return value * 1024 ** 2;
    if (unit === 'KB') return value * 1024;
    return 0;
}

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return 'Unknown';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function extractServerName(source) {
    if (!source) return 'MoviesDrive';
    if (/hubcloud/i.test(source)) return 'HubCloud';
    if (/gdflix/i.test(source)) return 'GDFlix';
    return source.split(/[.\s]/)[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. SEARCH (exact as scraper.py)
// ─────────────────────────────────────────────────────────────────────────────

async function search(query, page = 1) {
    const params = new URLSearchParams({ q: query, page: page.toString() });
    const url = `${SEARCH_API}?${params.toString()}`;
    
    try {
        const response = await fetch(url, { headers: HEADERS });
        if (!response.ok) return [];
        const data = await response.json();
        return data.hits || [];
    } catch (err) {
        console.error(`[MoviesDrive] Search error: ${err.message}`);
        return [];
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. SELECT BEST MATCH (heuristic from scraper.py)
// ─────────────────────────────────────────────────────────────────────────────

function selectBestMatch(hits, query, season = null) {
    if (!hits || hits.length === 0) return null;
    
    for (const hit of hits) {
        const title = hit.document.post_title.toLowerCase();
        
        // Filter by season if provided
        if (season) {
            const seasonStr = `season ${season}`;
            const seasonStrShort = `s${String(season).padStart(2, '0')}`;
            if (!title.includes(seasonStr) && !title.includes(seasonStrShort)) {
                continue;
            }
        }
        
        if (title.includes(query.toLowerCase())) {
            return hit.document;
        }
    }
    
    return hits[0]?.document || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. GET MOVIE PAGE LINKS (extract hubcloud/gdflix/search-recover links)
// ─────────────────────────────────────────────────────────────────────────────

async function getMoviePageLinks(permalink, season = null, episode = null) {
    const url = urlJoin(BASE_URL, permalink);
    
    try {
        const response = await fetch(url, { headers: HEADERS });
        if (!response.ok) return [];
        const html = await response.text();
        const $ = cheerio.load(html);
        
        const links = [];
        
        $('a[href]').each((_, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim();
            
            // Skip ZIP and PACK links (exact from scraper.py)
            const lowerText = text.toLowerCase();
            if (lowerText.includes('zip') || lowerText.includes('pack') || lowerText.includes('complete')) {
                return;
            }
            
            // Only keep links containing these domains
            if (!href.includes('hubcloud') && !href.includes('gdflix') && !href.includes('search-recover')) {
                return;
            }
            
            // Episode filtering (exact logic from scraper.py)
            if (episode) {
                let epMatch = text.match(/E(?:pisode)?\s*(\d+)/i);
                if (!epMatch) {
                    const parent = $(el).parent();
                    const parentText = parent.text();
                    epMatch = parentText.match(/E(?:pisode)?\s*(\d+)/i);
                }
                
                if (epMatch) {
                    if (parseInt(epMatch[1]) !== parseInt(episode)) {
                        return;
                    }
                } else {
                    // No episode info found but episode was requested -> skip
                    return;
                }
            }
            
            // Extract quality
            const qualityMatch = text.match(/(480p|720p|1080p|2160p|4k)/i);
            const quality = qualityMatch ? qualityMatch[0].toLowerCase() : 'Unknown';
            
            // Extract size from brackets
            const sizeMatch = text.match(/\[(.*?)\]/);
            const size = sizeMatch ? sizeMatch[1] : 'Unknown';
            
            links.push({
                quality: quality,
                size: size,
                sizeBytes: sizeToBytes(size),
                text: text,
                url: href
            });
        });
        
        return links;
    } catch (err) {
        console.error(`[MoviesDrive] Error fetching movie page: ${err.message}`);
        return [];
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. BYPASS HUB CLOUD (handle search-recover.php links)
// ─────────────────────────────────────────────────────────────────────────────

async function bypassHubcloud(url) {
    try {
        // Only process search-recover links
        if (!url.includes('search-recover.php')) {
            return [url];
        }
        
        const parsed = new URL(url);
        const params = parsed.searchParams;
        const fromAc = params.get('from_ac');
        const qEncoded = params.get('q');
        
        if (!fromAc || !qEncoded) {
            return [url];
        }
        
        // Decode base64 q parameter
        let qDecoded;
        try {
            qDecoded = Buffer.from(qEncoded, 'base64').toString('utf-8');
        } catch (e) {
            qDecoded = qEncoded;
        }
        
        const apiUrl = `https://hubcloud.foo/drive/search-recover.php?api=search&q=${encodeURIComponent(qDecoded)}&page=1&from_ac=${fromAc}`;
        const response = await fetch(apiUrl, {
            headers: {
                ...HEADERS,
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) return [url];
        const data = await response.json();
        const hits = data.hits || [];
        const urls = hits.map(hit => hit.url).filter(Boolean);
        
        return urls.length ? urls : [url];
    } catch (err) {
        console.error(`[MoviesDrive] Bypass error: ${err.message}`);
        return [url];
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. GET FINAL LINK (extract direct download from generator page)
// ─────────────────────────────────────────────────────────────────────────────

async function getFinalLink(driveUrl) {
    try {
        // Fetch the drive page
        const driveResponse = await fetch(driveUrl, { headers: HEADERS });
        if (!driveResponse.ok) return [];
        const driveHtml = await driveResponse.text();
        const $ = cheerio.load(driveHtml);
        
        // Find the generate link (id="download" or hubrouting/generate/gamerxyt)
        let genLink = $('#download').attr('href');
        if (!genLink) {
            const genTag = $('a[href*="hubrouting"], a[href*="generate"], a[href*="gamerxyt"]').first();
            genLink = genTag.attr('href');
        }
        
        if (!genLink) return [];
        
        // Ensure absolute URL
        const genUrl = genLink.startsWith('http') ? genLink : urlJoin(driveUrl, genLink);
        
        // Fetch the generator page
        const genResponse = await fetch(genUrl, { headers: HEADERS });
        if (!genResponse.ok) return [];
        const genHtml = await genResponse.text();
        const $gen = cheerio.load(genHtml);
        
        const finalLinks = [];
        $gen('a[href]').each((_, el) => {
            const text = $gen(el).text().trim();
            if (text.includes('Download [')) {
                finalLinks.push({
                    name: text,
                    url: $gen(el).attr('href')
                });
            }
        });
        
        return finalLinks;
    } catch (err) {
        console.error(`[MoviesDrive] Final link error: ${err.message}`);
        return [];
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. TMDB HELPERS (for Nuvio integration)
// ─────────────────────────────────────────────────────────────────────────────

async function getTMDBDetails(tmdbId, mediaType) {
    const endpoint = mediaType === 'tv' ? 'tv' : 'movie';
    const url = `${TMDB_BASE_URL}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;
    
    const res = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': HEADERS['User-Agent'] }
    });
    
    if (!res.ok) throw new Error(`TMDB ${res.status}`);
    const data = await res.json();
    
    const title = mediaType === 'tv' ? data.name : data.title;
    const releaseDate = mediaType === 'tv' ? data.first_air_date : data.release_date;
    const year = releaseDate ? parseInt(releaseDate.split('-')[0], 10) : null;
    
    return {
        title,
        year,
        imdbId: data.external_ids?.imdb_id || null
    };
}

function normalizeTitle(title) {
    if (!title) return '';
    return title.toLowerCase()
        .replace(/\b(the|a|an)\b/g, '')
        .replace(/[:\-_]/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/[^\w\s]/g, '')
        .trim();
}

function titleSimilarity(t1, t2) {
    const n1 = normalizeTitle(t1);
    const n2 = normalizeTitle(t2);
    if (n1 === n2) return 1.0;
    if (n1.includes(n2) || n2.includes(n1)) return 0.9;
    
    const words1 = n1.split(/\s+/).filter(w => w.length > 2);
    const words2 = n2.split(/\s+/).filter(w => w.length > 2);
    const set1 = new Set(words1);
    const set2 = new Set(words2);
    if (set1.size === 0 || set2.size === 0) return 0;
    
    const intersection = [...set1].filter(w => set2.has(w)).length;
    const union = new Set([...set1, ...set2]).size;
    return intersection / union;
}

function findBestMatch(mediaInfo, results, season) {
    let best = null;
    let bestScore = 0;
    
    for (const result of results) {
        let score = titleSimilarity(mediaInfo.title, result.title);
        
        if (mediaInfo.year && result.year) {
            const diff = Math.abs(mediaInfo.year - result.year);
            if (diff === 0) score += 0.2;
            else if (diff <= 1) score += 0.1;
            else if (diff > 5) score -= 0.3;
        }
        
        if (season) {
            const titleLower = result.title.toLowerCase();
            if (titleLower.includes(`season ${season}`) || titleLower.includes(`s${season}`)) {
                score += 0.3;
            } else {
                score -= 0.2;
            }
        }
        
        if (score > bestScore && score > 0.3) {
            bestScore = score;
            best = result;
        }
    }
    
    return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. MAIN ENTRY POINT (Nuvio interface)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get streams from MoviesDrive
 * @param {string} tmdbId - TMDB ID
 * @param {'movie'|'tv'} mediaType - Type of media
 * @param {number|null} season - Season number (for TV)
 * @param {number|null} episode - Episode number (for TV)
 * @returns {Promise<Array>} Array of stream objects
 */
async function getStreams(tmdbId, mediaType = 'movie', season = null, episode = null) {
    console.log(`[MoviesDrive] getStreams: ${tmdbId} | ${mediaType} | S${season}E${episode}`);
    
    try {
        // Get media info from TMDB
        const mediaInfo = await getTMDBDetails(tmdbId, mediaType);
        if (!mediaInfo.title) {
            console.log('[MoviesDrive] No title from TMDB');
            return [];
        }
        
        console.log(`[MoviesDrive] TMDB: "${mediaInfo.title}" (${mediaInfo.year})`);
        
        // Build search query (use IMDB ID if available for precise matching)
        const searchQuery = mediaInfo.imdbId || mediaInfo.title;
        let hits = await search(searchQuery);
        
        // Fallback to title search if IMDB search returned nothing
        if (!hits.length && mediaInfo.imdbId) {
            hits = await search(mediaInfo.title);
        }
        
        if (!hits.length) {
            console.log('[MoviesDrive] No search results');
            return [];
        }
        
        // Filter by exact IMDB ID if available
        if (mediaInfo.imdbId && hits.length) {
            const filtered = hits.filter(h => h.document.imdb_id === mediaInfo.imdbId);
            if (filtered.length) hits = filtered;
        }
        
        // Select best match using heuristic
        const bestDoc = selectBestMatch(hits, mediaInfo.title, season);
        if (!bestDoc) {
            console.log('[MoviesDrive] No best match found');
            return [];
        }
        
        console.log(`[MoviesDrive] Selected: "${bestDoc.post_title}" -> ${bestDoc.permalink}`);
        
        // Get download links from the movie/series page
        const pageLinks = await getMoviePageLinks(bestDoc.permalink, season, episode);
        
        if (!pageLinks.length) {
            console.log('[MoviesDrive] No direct download links found on page');
            return [];
        }
        
        // Process each link: bypass hubcloud, then get final download links
        const allStreams = [];
        
        for (const pageLink of pageLinks) {
            const driveUrls = await bypassHubcloud(pageLink.url);
            
            for (const driveUrl of driveUrls) {
                const finalLinks = await getFinalLink(driveUrl);
                
                for (const finalLink of finalLinks) {
                    allStreams.push({
                        name: `MoviesDrive ${extractServerName(pageLink.text)}`,
                        title: mediaType === 'tv' && season && episode
                            ? `${mediaInfo.title} S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
                            : mediaInfo.year ? `${mediaInfo.title} (${mediaInfo.year})` : mediaInfo.title,
                        url: finalLink.url,
                        quality: pageLink.quality,
                        size: formatBytes(pageLink.sizeBytes),
                        headers: { ...HEADERS },
                        provider: 'MoviesDrive'
                    });
                }
            }
        }
        
        // Remove duplicates by URL
        const seen = new Set();
        const uniqueStreams = allStreams.filter(s => {
            if (seen.has(s.url)) return false;
            seen.add(s.url);
            return true;
        });
        
        // Sort by quality (4k > 1080p > 720p > ...)
        const qualityOrder = { '2160p': 5, '4k': 5, '1080p': 4, '720p': 3, '480p': 2, '360p': 1, 'unknown': 0 };
        uniqueStreams.sort((a, b) => (qualityOrder[a.quality?.toLowerCase()] || 0) - (qualityOrder[b.quality?.toLowerCase()] || 0)).reverse();
        
        console.log(`[MoviesDrive] Returning ${uniqueStreams.length} streams`);
        return uniqueStreams;
        
    } catch (err) {
        console.error(`[MoviesDrive] Error: ${err.message}`);
        return [];
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.getStreams = getStreams;
}
