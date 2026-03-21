// providers/ultimate.js
// MAXED OUT Provider (Parallel + Multi-Source + Quality Sorting)

const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36';

// ------------------ HLS PARSER ------------------

async function extractHlsVariants(url) {
    try {
        const res = await fetch(url);
        const text = await res.text();

        const lines = text.split('\n');
        const variants = [];

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('RESOLUTION=')) {
                const match = lines[i].match(/RESOLUTION=\d+x(\d+)/);
                const next = lines[i + 1];

                if (match && next && !next.startsWith('#')) {
                    variants.push({
                        quality: parseInt(match[1]),
                        url: new URL(next, url).href
                    });
                }
            }
        }

        return variants.sort((a, b) => b.quality - a.quality);

    } catch {
        return [];
    }
}

// ------------------ HELPERS ------------------

function detectQuality(url) {
    if (!url) return 720;
    if (url.includes('2160') || url.includes('4k')) return 2160;
    if (url.includes('1440')) return 1440;
    if (url.includes('1080')) return 1080;
    if (url.includes('720')) return 720;
    return 720;
}

function scoreSource(name, quality) {
    let score = quality;

    if (name.includes('Filemoon')) score += 200;
    if (name.includes('StreamWish')) score += 180;
    if (name.includes('Warez')) score += 150;
    if (name.includes('VidSrc')) score += 120;
    if (name.includes('SuperFlix')) score += 50;

    return score;
}

function dedupe(results) {
    const seen = new Set();
    return results.filter(r => {
        if (seen.has(r.url)) return false;
        seen.add(r.url);
        return true;
    });
}

// ------------------ GENERIC M3U8 EXTRACTOR ------------------

async function extractFromHtml(html, referer, name) {
    const results = [];

    const matches = [...html.matchAll(/https?:\/\/[^"' ]+\.m3u8[^"' ]*/g)];

    for (const m of matches) {
        const url = m[0];

        const variants = await extractHlsVariants(url);

        if (variants.length > 0) {
            variants.forEach(v => {
                results.push({
                    name: `${name} ${v.quality}p`,
                    url: v.url,
                    quality: v.quality,
                    headers: { Referer: referer, 'User-Agent': UA }
                });
            });
        } else {
            results.push({
                name: `${name} ${detectQuality(url)}p`,
                url,
                quality: detectQuality(url),
                headers: { Referer: referer, 'User-Agent': UA }
            });
        }
    }

    return results;
}

// ------------------ PROVIDER 1: VIDSRC ------------------

async function vidsrcProvider(tmdbId, mediaType, season, episode) {
    try {
        const url = mediaType === 'movie'
            ? `https://vidsrc.xyz/embed/movie/${tmdbId}`
            : `https://vidsrc.xyz/embed/tv/${tmdbId}/${season}/${episode}`;

        const res = await fetch(url, { headers: { 'User-Agent': UA } });
        const html = await res.text();

        return await extractFromHtml(html, url, 'VidSrc');

    } catch {
        return [];
    }
}

// ------------------ PROVIDER 2: ALT EMBEDS ------------------

async function altEmbedProvider(tmdbId, mediaType, season, episode) {
    const sources = [
        mediaType === 'movie'
            ? `https://multiembed.mov/?video_id=${tmdbId}`
            : `https://multiembed.mov/?video_id=${tmdbId}&s=${season}&e=${episode}`
    ];

    let results = [];

    await Promise.all(sources.map(async (src) => {
        try {
            const res = await fetch(src, { headers: { 'User-Agent': UA } });
            const html = await res.text();

            const extracted = await extractFromHtml(html, src, 'Embed');
            results.push(...extracted);

        } catch {}
    }));

    return results;
}

// ------------------ PROVIDER 3: SUPERFLIX ------------------

async function superflixProvider(tmdbId, mediaType, season, episode) {
    try {
        const { getStreams } = require('./superflix');
        return await getStreams(tmdbId, mediaType, season, episode);
    } catch {
        return [];
    }
}

// ------------------ MAIN ------------------

async function getStreams(tmdbId, mediaType, season = 1, episode = 1) {

    // ⚡ RUN EVERYTHING IN PARALLEL
    const [vidsrc, embed, superflix] = await Promise.all([
        vidsrcProvider(tmdbId, mediaType, season, episode),
        altEmbedProvider(tmdbId, mediaType, season, episode),
        superflixProvider(tmdbId, mediaType, season, episode)
    ]);

    let results = [
        ...vidsrc,
        ...embed,
        ...superflix
    ];

    // 🧼 Remove duplicates
    results = dedupe(results);

    // 🎯 Score + sort
    results.sort((a, b) => {
        const scoreA = scoreSource(a.name, a.quality);
        const scoreB = scoreSource(b.name, b.quality);
        return scoreB - scoreA;
    });

    return results;
}

module.exports = { getStreams };
