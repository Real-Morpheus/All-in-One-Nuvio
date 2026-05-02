"use strict";

// ==================== CONSTANTS ====================
const TMDB_KEY = "8d6d91941230817f7807d643736e8a49";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36";

// Updated API Endpoints (Checking for current availability)
const PROVIDERS = {
    VIDLINK: "https://vidlink.pro/api/en", // API based is more stable than HTML
    VIDSRC: "https://vidsrc.me/embed",
    TWOEMBED: "https://www.2embed.cc/embed",
    AUTOEMBED: "https://player.autoembed.app/embed",
    STREMIO_BASE: "https://v3-cinemeta.strem.io"
};

// ==================== CORE FETCH WRAPPER ====================
// Note: If running in a browser, you MUST use a CORS proxy or the app's internal fetcher.
async function request(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const headers = {
        "User-Agent": USER_AGENT,
        "Accept": "*/*",
        ...options.headers
    };

    try {
        const response = await fetch(url, { ...options, headers, signal: controller.signal });
        clearTimeout(timeout);
        return response;
    } catch (e) {
        clearTimeout(timeout);
        return null;
    }
}

// ==================== HELPERS ====================
async function getJson(url, opts) {
    const res = await request(url, opts);
    return res ? res.json() : null;
}

async function getText(url, opts) {
    const res = await request(url, opts);
    return res ? res.text() : "";
}

async function tmdbToImdb(id, type) {
    const data = await getJson(`https://api.themoviedb.org/3/${type}/${id}/external_ids?api_key=${TMDB_KEY}`);
    return data?.imdb_id || null;
}

// ==================== IMPROVED EXTRACTION ====================
function extractStreams(html, providerName, referer) {
    const streams = [];
    // Enhanced regex to catch escaped URLs and different formats
    const patterns = [
        /(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/g,
        /(https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/g
    ];

    patterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(html)) !== null) {
            let url = match[1].replace(/\\/g, ""); // Clean escape chars
            if (!streams.find(s => s.url === url)) {
                streams.push({
                    name: providerName,
                    url: url,
                    quality: url.includes("1080") ? "1080p" : "720p",
                    headers: { "Referer": referer, "User-Agent": USER_AGENT }
                });
            }
        }
    });
    return streams;
}

// ==================== PROVIDER LOGIC ====================

// VidLink updated to use their JSON internal route if possible
async function fetchVidLink(id, isMovie, s, e) {
    const path = isMovie ? `movie/${id}` : `tv/${id}/${s}/${e}`;
    const url = `https://vidlink.pro/embed/${path}`;
    const html = await getText(url, { headers: { "Referer": "https://vidlink.pro/" } });
    return extractStreams(html, "VidLink", url);
}

async function fetchVidsrc(imdbId, isMovie, s, e) {
    if (!imdbId) return [];
    const url = isMovie 
        ? `${PROVIDERS.VIDSRC}/movie?imdb=${imdbId}`
        : `${PROVIDERS.VIDSRC}/tv?imdb=${imdbId}&sea=${s}&epi=${e}`;
    const html = await getText(url, { headers: { "Referer": "https://vidsrc.me/" } });
    return extractStreams(html, "VidSrc", url);
}

// ==================== MAIN EXECUTION ====================
async function getStreams(params) {
    const { id, type, season, episode } = params;
    const isMovie = type === "movie";
    const streams = [];

    console.log(`[CineStream] Resolving: ${id} (${type})`);

    // 1. Resolve IDs
    const imdbId = await tmdbToImdb(id, isMovie);
    
    // 2. Create Task List
    const tasks = [
        fetchVidLink(id, isMovie, season, episode),
        fetchVidsrc(imdbId, isMovie, season, episode)
    ];

    // 3. Add Stremio Addon fallback (Aggressive fetching)
    if (imdbId) {
        tasks.push((async () => {
            const stremioUrl = isMovie 
                ? `https://v3-cinemeta.strem.io/meta/movie/${imdbId}.json`
                : `https://v3-cinemeta.strem.io/meta/series/${imdbId}.json`;
            // This is a metadata fetch, actual stream fetch logic would go here
            return [];
        })());
    }

    // 4. Run all tasks concurrently
    const results = await Promise.allSettled(tasks);
    
    results.forEach(result => {
        if (result.status === "fulfilled" && Array.isArray(result.value)) {
            streams.push(...result.value);
        }
    });

    // 5. Final Filtering
    const final = streams.filter((v, i, a) => a.findIndex(t => t.url === v.url) === i);
    console.log(`[CineStream] Found ${final.length} sources`);
    return final;
}

module.exports = getStreams;
