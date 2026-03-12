const XDMOVIES_API = "[new.xdmovies.wtf](https://new.xdmovies.wtf)";
const TMDB_API_KEY = '439c478a771f35c05022f9feabcca01c';
const TMDB_BASE_URL = '[api.themoviedb.org](https://api.themoviedb.org/3)';

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Referer": `${XDMOVIES_API}/`,
    "x-requested-with": "XMLHttpRequest"
};

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return null;
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function extractServerName(source) {
    if (!source) return 'Unknown';
    const src = source.toLowerCase();
    if (src.includes('hubcloud')) return 'HubCloud';
    if (src.includes('pixeldrain')) return 'Pixeldrain';
    if (src.includes('streamtape')) return 'StreamTape';
    if (src.includes('hubcdn')) return 'HubCdn';
    try {
        return new URL(source).hostname.replace(/^www\./, '').split('.')[0];
    } catch {
        return 'Direct';
    }
}

function parseHTML(html) {
    // Simple HTML parsing without cheerio
    const getAttr = (tag, attr) => {
        const regex = new RegExp(`<${tag}[^>]*${attr}=["']([^"']+)["']`, 'gi');
        const matches = [];
        let match;
        while ((match = regex.exec(html)) !== null) {
            matches.push(match[1]);
        }
        return matches;
    };
    
    return {
        getLinks: () => getAttr('a', 'href'),
        getDownloadLinks: () => {
            // Extract links from download-item divs
            const downloadSection = html.match(/class="download-item"[^>]*>[\s\S]*?<\/div>/gi) || [];
            const links = [];
            downloadSection.forEach(section => {
                const hrefs = section.match(/href=["']([^"']+)["']/gi) || [];
                hrefs.forEach(h => {
                    const url = h.match(/href=["']([^"']+)["']/i);
                    if (url) links.push(url[1]);
                });
            });
            return links;
        },
        getEpisodeLinks: (season, episode) => {
            const epCode = `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
            const epRegex = new RegExp(`class="episode-card"[^>]*>[\\s\\S]*?${epCode}[\\s\\S]*?<\\/div>`, 'gi');
            const cards = html.match(epRegex) || [];
            const links = [];
            cards.forEach(card => {
                const hrefs = card.match(/href=["']([^"']+)["']/gi) || [];
                hrefs.forEach(h => {
                    const url = h.match(/href=["']([^"']+)["']/i);
                    if (url) links.push(url[1]);
                });
            });
            return links;
        }
    };
}

async function getTMDBDetails(tmdbId, mediaType) {
    const endpoint = mediaType === 'tv' ? 'tv' : 'movie';
    const url = `${TMDB_BASE_URL}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        
        const data = await response.json();
        const title = mediaType === 'tv' ? data.name : data.title;
        const releaseDate = mediaType === 'tv' ? data.first_air_date : data.release_date;
        
        return {
            title,
            year: releaseDate ? parseInt(releaseDate.split('-')[0]) : null,
            imdbId: data.external_ids?.imdb_id || null
        };
    } catch (e) {
        console.error('[XDMovies] TMDB fetch failed:', e);
        return null;
    }
}

async function resolveRedirect(url) {
    try {
        const response = await fetch(url, {
            headers: HEADERS,
            redirect: 'manual'
        });
        
        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location');
            return location ? new URL(location, url).toString() : url;
        }
        return url;
    } catch {
        return null;
    }
}

async function getStreams(tmdbId, mediaType = 'movie', season = null, episode = null) {
    try {
        // Get media info from TMDB
        const mediaInfo = await getTMDBDetails(tmdbId, mediaType);
        if (!mediaInfo?.title) {
            console.log('[XDMovies] No media info found');
            return [];
        }

        // Search XDMovies
        const searchUrl = `${XDMOVIES_API}/php/search_api.php?query=${encodeURIComponent(mediaInfo.title)}&fuzzy=true`;
        const searchResponse = await fetch(searchUrl, { headers: HEADERS });
        
        if (!searchResponse.ok) {
            console.log('[XDMovies] Search failed');
            return [];
        }

        const searchData = await searchResponse.json();
        if (!Array.isArray(searchData)) return [];

        // Find matching entry
        const matched = searchData.find(x => Number(x.tmdb_id) === Number(tmdbId));
        if (!matched?.path) {
            console.log('[XDMovies] No match found');
            return [];
        }

        // Fetch details page
        const detailsResponse = await fetch(XDMOVIES_API + matched.path, { headers: HEADERS });
        if (!detailsResponse.ok) return [];

        const html = await detailsResponse.text();
        const parser = parseHTML(html);

        // Get raw links based on media type
        let rawLinks;
        if (mediaType === 'tv' && season && episode) {
            rawLinks = parser.getEpisodeLinks(season, episode);
        } else {
            rawLinks = parser.getDownloadLinks();
        }

        if (!rawLinks.length) {
            // Fallback: try all links
            rawLinks = parser.getLinks().filter(link => 
                link.includes('download') || 
                link.includes('hubcloud') || 
                link.includes('pixeldrain')
            );
        }

        // Resolve redirects
        const resolvedUrls = await Promise.all(
            rawLinks.map(url => resolveRedirect(url))
        );
        const validUrls = resolvedUrls.filter(Boolean);

        // Build stream objects
        const streams = [];
        const seen = new Set();

        for (const url of validUrls) {
            if (seen.has(url)) continue;
            seen.add(url);

            const serverName = extractServerName(url);
            
            // Build title
            let title;
            if (mediaType === 'tv') {
                title = `${mediaInfo.title} S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
            } else {
                title = mediaInfo.year ? `${mediaInfo.title} (${mediaInfo.year})` : mediaInfo.title;
            }

            streams.push({
                name: `XDMovies`,
                title: `${serverName}\n${title}`,
                url: url,
                behaviorHints: {
                    notWebReady: true
                }
            });
        }

        return streams;

    } catch (err) {
        console.error('[XDMovies] Error:', err.message);
        return [];
    }
}

// Nuvio provider export format
module.exports = {
    name: 'XDMovies',
    getStreams
};
