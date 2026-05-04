// Moviesdrive Scraper for Nuvio Local Scrapers
// React Native compatible version — fixed to match working Kotlin source

const cheerio = require('cheerio-without-node-native');

// TMDB API Configuration
const TMDB_API_KEY = '439c478a771f35c05022f9feabcca01c';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// Moviesdrive Configuration
let MAIN_URL = "https://moviesdrive.forum";
// FIX #1: Correct repo (SaurabhKaperwan/Utils) and correct JSON key (moviesdrive lowercase)
const DOMAINS_URL = "https://raw.githubusercontent.com/SaurabhKaperwan/Utils/refs/heads/main/urls.json";
const DOMAIN_CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours
let domainCacheTimestamp = 0;

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
    "Referer": `${MAIN_URL}/`,
};

// =================================================================================
// UTILITY FUNCTIONS
// =================================================================================

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return 'Unknown';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function extractServerName(source) {
    if (!source) return 'Unknown';
    const src = source.trim();
    if (/HubCloud/i.test(src)) {
        if (/FSL.*V2/i.test(src)) return 'HubCloud FSLv2 Server';
        if (/FSL/i.test(src)) return 'HubCloud FSL Server';
        if (/Mega/i.test(src)) return 'HubCloud Mega Server';
        if (/S3/i.test(src)) return 'HubCloud S3 Server';
        if (/Buzz/i.test(src)) return 'HubCloud BuzzServer';
        if (/10\s*Gbps/i.test(src)) return 'HubCloud 10Gbps';
        return 'HubCloud';
    }
    if (/GDFlix/i.test(src)) return src.replace(/^GDFlix\s*/, 'GDFlix ').trim();
    if (/Pixeldrain/i.test(src)) return 'Pixeldrain';
    if (/StreamTape/i.test(src)) return 'StreamTape';
    if (/HubCdn/i.test(src)) return 'HubCdn';
    if (/HbLinks/i.test(src)) return 'HbLinks';
    if (/Hubstream/i.test(src)) return 'Hubstream';
    return src.replace(/^www\./i, '').split(/[.\s]/)[0];
}

function rot13(value) {
    return value.replace(/[a-zA-Z]/g, function (c) {
        return String.fromCharCode((c <= "Z" ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26);
    });
}

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
function atob(value) {
    if (!value) return '';
    let input = String(value).replace(/=+$/, '');
    let output = '';
    let bc = 0, bs, buffer, idx = 0;
    while ((buffer = input.charAt(idx++))) {
        buffer = BASE64_CHARS.indexOf(buffer);
        if (~buffer) {
            bs = bc % 4 ? bs * 64 + buffer : buffer;
            if (bc++ % 4) output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
        }
    }
    return output;
}

function btoa(value) {
    if (value == null) return '';
    let str = String(value), output = '', i = 0;
    while (i < str.length) {
        const chr1 = str.charCodeAt(i++), chr2 = str.charCodeAt(i++), chr3 = str.charCodeAt(i++);
        const enc1 = chr1 >> 2;
        const enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
        let enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
        let enc4 = chr3 & 63;
        if (isNaN(chr2)) { enc3 = 64; enc4 = 64; } else if (isNaN(chr3)) { enc4 = 64; }
        output += BASE64_CHARS.charAt(enc1) + BASE64_CHARS.charAt(enc2) +
                  BASE64_CHARS.charAt(enc3) + BASE64_CHARS.charAt(enc4);
    }
    return output;
}

function cleanTitle(title) {
    const parts = title.split(/[.\-_]/);
    const qualityTags = ["WEBRip","WEB-DL","WEB","BluRay","HDRip","DVDRip","HDTV","CAM","TS","R5","DVDScr","BRRip","BDRip","DVD","PDTV","HD"];
    const audioTags   = ["AAC","AC3","DTS","MP3","FLAC","DD5","EAC3","Atmos"];
    const subTags     = ["ESub","ESubs","Subs","MultiSub","NoSub","EnglishSub","HindiSub"];
    const codecTags   = ["x264","x265","H264","HEVC","AVC"];
    const startIndex  = parts.findIndex(p => qualityTags.some(t => p.toLowerCase().includes(t.toLowerCase())));
    const endIndex    = parts.findLastIndex(p =>
        subTags.some(t => p.toLowerCase().includes(t.toLowerCase())) ||
        audioTags.some(t => p.toLowerCase().includes(t.toLowerCase())) ||
        codecTags.some(t => p.toLowerCase().includes(t.toLowerCase()))
    );
    if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) return parts.slice(startIndex, endIndex + 1).join(".");
    if (startIndex !== -1) return parts.slice(startIndex).join(".");
    return parts.slice(-3).join(".");
}

// FIX #2: Global getIndexQuality — matches Kotlin exactly (handles 8k/4k/2k too)
function getIndexQuality(str) {
    if (!str) return 0;
    const resMatch = str.match(/(\d{3,4})[pP]/);
    if (resMatch) return parseInt(resMatch[1]);
    const lower = str.toLowerCase();
    if (lower.includes('8k')) return 4320;
    if (lower.includes('4k')) return 2160;
    if (lower.includes('2k')) return 1440;
    return 0; // Unknown
}

// FIX #3: getBaseUrl helper — matches Kotlin's getBaseUrl()
function getBaseUrl(url) {
    try {
        const u = new URL(url);
        return `${u.protocol}//${u.host}`;
    } catch(e) {
        return url;
    }
}

// FIX #4: resolveFinalUrl — matches Kotlin's resolveFinalUrl(), follows HEAD redirects up to 7 times
async function resolveFinalUrl(startUrl) {
    let currentUrl = startUrl;
    for (let i = 0; i < 7; i++) {
        try {
            const res = await fetch(currentUrl, { method: 'HEAD', redirect: 'manual' });
            if (res.status >= 300 && res.status < 400) {
                const location = res.headers.get('location');
                if (!location) break;
                currentUrl = location;
            } else {
                break;
            }
        } catch(e) {
            return null;
        }
    }
    return currentUrl;
}

// Helper: convert size string to bytes
function toBytes(size) {
    if (!size) return 0;
    const m = size.match(/([\d.]+)\s*(GB|MB|KB)/i);
    if (!m) return 0;
    const v = parseFloat(m[1]);
    if (m[2].toUpperCase() === 'GB') return v * 1024 ** 3;
    if (m[2].toUpperCase() === 'MB') return v * 1024 ** 2;
    return v * 1024;
}

// =================================================================================
// DOMAIN MANAGEMENT
// =================================================================================

function fetchAndUpdateDomain() {
    const now = Date.now();
    if (now - domainCacheTimestamp < DOMAIN_CACHE_TTL) return Promise.resolve();

    console.log('[Moviesdrive] Fetching latest domain...');
    return fetch(DOMAINS_URL, {
        method: 'GET',
        headers: { 'User-Agent': 'Mozilla/5.0' }
    }).then(function(response) {
        if (response.ok) {
            return response.json().then(function(data) {
                // FIX #1 continued: key is lowercase "moviesdrive"
                if (data && data.moviesdrive) {
                    const newDomain = data.moviesdrive;
                    if (newDomain !== MAIN_URL) {
                        console.log(`[Moviesdrive] Updating domain from ${MAIN_URL} to ${newDomain}`);
                        MAIN_URL = newDomain;
                        HEADERS.Referer = `${MAIN_URL}/`;
                    }
                    domainCacheTimestamp = now;
                }
            });
        }
    }).catch(function(error) {
        console.error(`[Moviesdrive] Failed to fetch latest domains: ${error.message}`);
    });
}

function getCurrentDomain() {
    return fetchAndUpdateDomain().then(function() {
        return MAIN_URL;
    });
}

// =================================================================================
// EXTRACTORS (aligned with Kotlin Extractors.kt)
// =================================================================================

function pixelDrainExtractor(link) {
    return Promise.resolve().then(() => {
        const match = link.match(/(?:file|u)\/([A-Za-z0-9]+)/);
        const fileId = match ? match[1] : link.split('/').pop();
        if (!fileId) return [{ source: 'Pixeldrain', quality: 0, url: link }];

        const infoUrl = `https://pixeldrain.com/api/file/${fileId}/info`;
        return fetch(infoUrl, { headers: HEADERS })
            .then(r => r.json())
            .then(info => {
                const name = info?.name || '';
                const size = info?.size || 0;
                const quality = getIndexQuality(name);
                return [{
                    source: 'Pixeldrain',
                    quality,
                    url: `https://pixeldrain.com/api/file/${fileId}?download`,
                    name,
                    size,
                }];
            })
            .catch(() => [{
                source: 'Pixeldrain',
                quality: 0,
                url: `https://pixeldrain.com/api/file/${fileId}?download`,
            }]);
    }).catch(() => [{ source: 'Pixeldrain', quality: 0, url: link }]);
}

function streamTapeExtractor(link) {
    const url = new URL(link);
    url.hostname = 'streamtape.com';
    const normalizedLink = url.toString();

    return fetch(normalizedLink, { headers: HEADERS })
        .then(res => res.text())
        .then(data => {
            const match = data.match(/document\.getElementById\('videolink'\)\.innerHTML = (.*?);/);
            if (match && match[1]) {
                const urlPartMatch = match[1].match(/'(\/\/streamtape\.com\/get_video[^']+)'/);
                if (urlPartMatch) return [{ source: 'StreamTape', quality: 0, url: 'https:' + urlPartMatch[1] }];
            }
            const simple = data.match(/'(\/\/streamtape\.com\/get_video[^']+)'/);
            if (simple) return [{ source: 'StreamTape', quality: 0, url: 'https:' + simple[1] }];
            return [];
        })
        .catch(() => []);
}

function hubStreamExtractor(url, referer) {
    return fetch(url, { headers: { ...HEADERS, Referer: referer } })
        .then(() => [{ source: 'Hubstream', quality: 0, url }])
        .catch(() => []);
}

function hbLinksExtractor(url, referer) {
    return fetch(url, { headers: { ...HEADERS, Referer: referer } })
        .then(r => r.text())
        .then(data => {
            const $ = cheerio.load(data);
            const links = $('h3 a, div.entry-content p a').map((_, el) => $(el).attr('href')).get();
            return Promise.all(links.map(l => loadExtractor(l, url)))
                .then(results => results.flat());
        })
        .catch(() => []);
}

function hubCdnExtractor(url, referer) {
    return fetch(url, { headers: { ...HEADERS, Referer: referer } })
        .then(r => r.text())
        .then(data => {
            const m = data.match(/r=([A-Za-z0-9+/=]+)/);
            if (m) {
                const decoded = atob(m[1]);
                const m3u8 = decoded.substring(decoded.lastIndexOf('link=') + 5);
                return [{ source: 'HubCdn', quality: 0, url: m3u8 }];
            }
            return [];
        })
        .catch(() => []);
}

function hubDriveExtractor(url, referer) {
    return fetch(url, { headers: { ...HEADERS, Referer: referer } })
        .then(r => r.text())
        .then(data => {
            const $ = cheerio.load(data);
            const href = $('.btn.btn-primary.btn-user.btn-success1.m-1').attr('href');
            return href ? loadExtractor(href, url) : [];
        })
        .catch(() => []);
}

// FIX #5: HubCloud extractor — fully rewritten to match Kotlin HubCloud.getUrl()
async function hubCloudExtractor(url, referer) {
    try {
        let baseUrl = getBaseUrl(url);

        // Fetch latest hubcloud base URL from utils JSON
        try {
            const dynamicUrls = await fetch(DOMAINS_URL).then(r => r.json());
            const key = url.toLowerCase().includes('hubcloud') ? 'hubcloud' : 'vcloud';
            const latestBase = dynamicUrls?.[key];
            if (latestBase && latestBase !== baseUrl) {
                url = url.replace(baseUrl, latestBase);
                baseUrl = latestBase;
            }
        } catch(e) { /* use existing baseUrl */ }

        // Step 1: Get the intermediate link — matches Kotlin's /video/ vs script-tag logic
        const firstRes = await fetch(url, { headers: { ...HEADERS, Referer: referer || MAIN_URL } });
        const firstHtml = await firstRes.text();
        const $first = cheerio.load(firstHtml);

        let link = '';
        if (url.includes('/video/')) {
            // Kotlin: doc.selectFirst("div.vd > center > a")?.attr("href")
            link = $first('div.vd > center > a').attr('href') || '';
        } else {
            // Kotlin: script tag containing "var url = '...'"
            let scriptContent = '';
            $first('script').each((_, el) => {
                const html = $first(el).html() || '';
                if (html.includes('var url')) scriptContent = html;
            });
            const m = scriptContent.match(/var url = '([^']*)'/);
            link = m ? m[1] : '';
        }

        if (!link) return [];

        // Kotlin: if(!link.startsWith("https://")) link = baseUrl + link
        if (!link.startsWith('https://')) link = baseUrl + link;

        // Step 2: Fetch the final download page
        const docRes = await fetch(link, { headers: { ...HEADERS, Referer: url } });
        const docHtml = await docRes.text();
        const $doc = cheerio.load(docHtml);

        const header = $doc('div.card-header').text().trim();
        const size   = $doc('i#size').text().trim();
        const quality = getIndexQuality(header);
        const label  = [header ? `[${cleanTitle(header)}]` : '', size ? `[${size}]` : ''].join('');
        const sizeBytes = toBytes(size);

        const links = [];

        // Kotlin: document.select("h2 a.btn")  ← was "a.btn[href]" in old JS
        const buttons = $doc('h2 a.btn').get();

        for (const el of buttons) {
            const btnLink = $doc(el).attr('href') || '';
            const text    = $doc(el).text();

            if (!btnLink) continue;

            if (text.includes('FSL Server')) {
                links.push({ source: `HubCloud [FSL Server] ${label}`, quality, url: btnLink, size: sizeBytes, fileName: header });
            }
            else if (text.includes('FSLv2') || text.includes('FSL V2')) {
                links.push({ source: `HubCloud [FSLv2 Server] ${label}`, quality, url: btnLink, size: sizeBytes, fileName: header });
            }
            // FIX #5a: Mega Server — was missing in old JS
            else if (text.includes('Mega Server')) {
                links.push({ source: `HubCloud [Mega Server] ${label}`, quality, url: btnLink, size: sizeBytes, fileName: header });
            }
            else if (text.includes('Download File')) {
                links.push({ source: `HubCloud ${label}`, quality, url: btnLink, size: sizeBytes, fileName: header });
            }
            // FIX #5b: BuzzServer — read hx-redirect from RESPONSE HEADER, not from Location URL
            else if (text.includes('BuzzServer')) {
                try {
                    const buzzRes = await fetch(`${btnLink}/download`, {
                        headers: { ...HEADERS, Referer: btnLink },
                        redirect: 'manual'
                    });
                    // Kotlin: app.get(..., allowRedirects=false).headers["hx-redirect"]
                    const dlink = buzzRes.headers.get('hx-redirect') || '';
                    if (dlink) {
                        links.push({ source: `HubCloud [BuzzServer] ${label}`, quality, url: getBaseUrl(btnLink) + dlink, size: sizeBytes, fileName: header });
                    }
                } catch(e) { /* skip */ }
            }
            else if (btnLink.includes('pixeldra')) {
                // Kotlin: if link contains "download" use as-is, else build API URL
                const pdBase = getBaseUrl(btnLink);
                const finalPd = btnLink.toLowerCase().includes('download')
                    ? btnLink
                    : `${pdBase}/api/file/${btnLink.split('/').pop()}?download`;
                links.push({ source: `HubCloud [Pixeldrain] ${label}`, quality, url: finalPd, size: sizeBytes, fileName: header });
            }
            // Kotlin: text.contains("Server : 10Gbps")
            else if (text.includes('10Gbps')) {
                let redirectUrl = await resolveFinalUrl(btnLink);
                if (redirectUrl) {
                    if (redirectUrl.includes('link=')) redirectUrl = redirectUrl.split('link=').pop();
                    links.push({ source: `HubCloud [10Gbps] ${label}`, quality, url: redirectUrl, size: sizeBytes, fileName: header });
                }
            }
        }

        return links;
    } catch(e) {
        console.error('[HubCloud] extraction failed:', e.message);
        return [];
    }
}

// FIX #6: GDFlix extractor — rewritten to match Kotlin GDFlix.getUrl()
async function gdFlixExtractor(url, referer = null) {
    const links = [];
    try {
        // Fetch latest gdflix base URL
        let baseUrl = getBaseUrl(url);
        try {
            const dynamicUrls = await fetch(DOMAINS_URL).then(r => r.json());
            const latestBase = dynamicUrls?.gdflix;
            if (latestBase && latestBase !== baseUrl) {
                url = url.replace(baseUrl, latestBase);
                baseUrl = latestBase;
            }
        } catch(e) { /* use existing */ }

        const page = await fetch(url, { headers: HEADERS }).then(r => r.text());
        const $ = cheerio.load(page);

        // Kotlin: document.select("ul > li.list-group-item:contains(Name)").text().substringAfter("Name : ")
        const fileName = $('li:contains("Name")').text().replace(/.*Name\s*:\s*/, '').trim();
        const fileSizeText = $('li:contains("Size")').text().replace(/.*Size\s*:\s*/, '').trim();
        const quality   = getIndexQuality(fileName);
        const sizeBytes = toBytes(fileSizeText);

        // Kotlin: document.select("div.text-center a")
        const anchors = $('div.text-center a[href]').get();

        for (const a of anchors) {
            const el   = $(a);
            // Kotlin: val text = anchor.select("a").text() — that selects 'a' inside 'a' which is empty,
            // so effectively text is blank in Kotlin for nested; we use anchor.text() directly which is correct
            const text = el.text().trim();
            const href = el.attr('href') || '';

            if (!href) continue;

            // FIX #6a: FSL V2 — was missing
            if (text.includes('FSL V2')) {
                links.push({ source: 'GDFlix [FSL V2]', quality, url: href, size: sizeBytes, fileName });
            }
            // FIX #6b: DIRECT DL / DIRECT SERVER — was missing
            else if (text.includes('DIRECT DL') || text.includes('DIRECT SERVER')) {
                links.push({ source: 'GDFlix [Direct]', quality, url: href, size: sizeBytes, fileName });
            }
            // FIX #6c: CLOUD DOWNLOAD [R2] — was missing
            else if (text.includes('CLOUD DOWNLOAD')) {
                links.push({ source: 'GDFlix [Cloud]', quality, url: href, size: sizeBytes, fileName });
            }
            // FIX #6d: FAST CLOUD — was missing
            else if (text.includes('FAST CLOUD')) {
                try {
                    const dlink = await fetch(baseUrl + href)
                        .then(r => r.text())
                        .then(h => cheerio.load(h)('div.card-body a').attr('href') || '');
                    if (dlink) links.push({ source: 'GDFlix [FAST CLOUD]', quality, url: dlink, size: sizeBytes, fileName });
                } catch(e) { /* skip */ }
            }
            else if (href.includes('pixeldra')) {
                const pdBase = getBaseUrl(href);
                const finalPd = href.toLowerCase().includes('download')
                    ? href
                    : `${pdBase}/api/file/${href.split('/').pop()}?download`;
                links.push({ source: 'GDFlix [Pixeldrain]', quality, url: finalPd, size: sizeBytes, fileName });
            }
            else if (text.includes('Instant DL') || text.includes('Instant')) {
                try {
                    const r = await fetch(href, { redirect: 'manual' });
                    const loc = r.headers.get('location') || '';
                    if (loc) {
                        const instantLink = loc.includes('url=') ? loc.split('url=').pop() : loc;
                        links.push({ source: 'GDFlix [Instant]', quality, url: instantLink, size: sizeBytes, fileName });
                    }
                } catch(e) { /* skip */ }
            }
            // FIX #6e: GoFile — match Kotlin's ".row .row a" selector
            else if (text.includes('GoFile') || text.toLowerCase().includes('gofile')) {
                try {
                    const goDoc = await fetch(href).then(r => r.text());
                    const $go = cheerio.load(goDoc);
                    const goAnchors = $go('.row .row a[href]').get();
                    for (const ga of goAnchors) {
                        const gaHref = $go(ga).attr('href') || '';
                        if (gaHref.includes('gofile')) {
                            const goLinks = await goFileExtractor(gaHref);
                            links.push(...goLinks.map(l => ({ ...l, quality, size: l.size || sizeBytes, fileName })));
                        }
                    }
                } catch(e) { /* skip */ }
            }
        }

        // FIX #6f: CF backup links — was missing entirely
        // Kotlin: CFType(newUrl.replace("file", "wfile")) — fetches ?type=1 and ?type=2
        try {
            const wfileUrl = url.replace('file', 'wfile');
            for (const t of ['1', '2']) {
                const typeDoc = await fetch(`${wfileUrl}?type=${t}`).then(r => r.text());
                const $t = cheerio.load(typeDoc);
                const cfBtns = $t('a.btn-success').get();
                for (const btn of cfBtns) {
                    const cfHref = $t(btn).attr('href');
                    if (!cfHref) continue;
                    const redirectUrl = await resolveFinalUrl(cfHref);
                    if (redirectUrl) {
                        links.push({ source: 'GDFlix [CF]', quality, url: redirectUrl, size: sizeBytes, fileName });
                    }
                }
            }
        } catch(e) { /* CF backup optional */ }

    } catch(e) {
        console.error('[GDFlix] extraction failed:', e.message);
    }

    return links;
}

async function goFileExtractor(url) {
    const links = [];
    try {
        const id = url.match(/(?:\?c=|\/d\/)([a-zA-Z0-9-]+)/)?.[1];
        if (!id) return [];

        const acc = await fetch('https://api.gofile.io/accounts', { method: 'POST' }).then(r => r.json());
        const token = acc?.data?.token;
        if (!token) return [];

        const js = await fetch('https://gofile.io/dist/js/global.js').then(r => r.text());
        const wt = js.match(/appdata\.wt\s*=\s*["']([^"']+)/)?.[1];
        if (!wt) return [];

        const data = await fetch(`https://api.gofile.io/contents/${id}?wt=${wt}`, {
            headers: { Authorization: `Bearer ${token}` }
        }).then(r => r.json());

        const files = Object.values(data.data.children);
        const file = files[0];
        if (!file) return [];

        const size = file.size;
        const sizeFormatted = size < 1024 ** 3
            ? `${(size / 1024 ** 2).toFixed(2)} MB`
            : `${(size / 1024 ** 3).toFixed(2)} GB`;

        links.push({
            source: 'GoFile',
            quality: getIndexQuality(file.name),
            url: file.link,
            size,
            fileName: file.name,
            headers: { Cookie: `accountToken=${token}` },
            label: `GoFile [${sizeFormatted}]`
        });
    } catch(e) { /* skip */ }
    return links;
}

/**
 * Main extractor dispatcher — matches Kotlin's loadExtractor flow.
 */
function loadExtractor(url, referer = MAIN_URL) {
    let hostname;
    try { hostname = new URL(url).hostname; }
    catch(e) { return Promise.resolve([]); }

    if (hostname.includes('gdflix') || hostname.includes('gdlink')) return gdFlixExtractor(url, referer);
    if (hostname.includes('gofile'))     return goFileExtractor(url);
    if (hostname.includes('hubcloud'))   return hubCloudExtractor(url, referer);
    if (hostname.includes('hubdrive'))   return hubDriveExtractor(url, referer);
    if (hostname.includes('hubcdn'))     return hubCdnExtractor(url, referer);
    if (hostname.includes('hblinks'))    return hbLinksExtractor(url, referer);
    if (hostname.includes('hubstream'))  return hubStreamExtractor(url, referer);
    if (hostname.includes('pixeldrain')) return pixelDrainExtractor(url);
    if (hostname.includes('streamtape')) return streamTapeExtractor(url);
    if (hostname.includes('hdstream4u')) return Promise.resolve([{ source: 'HdStream4u', quality: 0, url }]);
    if (hostname.includes('linkrit'))    return Promise.resolve([]);
    if (hostname.includes('google.') || hostname.includes('ampproject.org') ||
        hostname.includes('gstatic.')  || hostname.includes('doubleclick.') ||
        hostname.includes('ddl2')) {
        console.warn('[Moviesdrive] Blocked redirect host:', hostname);
        return Promise.resolve([]);
    }
    return Promise.resolve([{ source: hostname.replace(/^www\./, ''), quality: 0, url }]);
}

// =================================================================================
// MAIN PROVIDER LOGIC (aligned with MoviesDriveProvider.kt)
// =================================================================================

/**
 * Search for media on Moviesdrive.
 * FIX #2: Use /search.php (matching Kotlin) instead of /searchapi.php
 */
function search(query, page = 1) {
    return getCurrentDomain()
        .then(currentDomain => {
            // Kotlin: app.get("$mainUrl/search.php?q=$query&page=$page")
            const apiUrl = `${currentDomain}/search.php?q=${encodeURIComponent(query)}&page=${page}`;
            console.log(`[Moviesdrive] Searching: ${apiUrl}`);
            return fetch(apiUrl, { headers: HEADERS });
        })
        .then(res => res.json())
        .then(json => {
            if (!json?.hits?.length) {
                console.log('[Moviesdrive] No results');
                return [];
            }
            return json.hits.map(hit => {
                const doc = hit.document;
                const permalink = doc.permalink || '';
                return {
                    title: doc.post_title || doc.postTitle || '',
                    url: permalink.startsWith('http')
                        ? permalink
                        : `${MAIN_URL}${permalink.startsWith('/') ? '' : '/'}${permalink}`,
                    poster: doc.post_thumbnail || doc.postThumbnail || null,
                    year: (() => {
                        const m = (doc.post_title || '').match(/\b(19|20)\d{2}\b/);
                        return m ? Number(m[0]) : null;
                    })(),
                    imdbId: doc.imdb_id || null
                };
            });
        })
        .catch(e => {
            console.error('[Moviesdrive] Search error:', e.message);
            return [];
        });
}

/**
 * Fetches the media page and extracts all hoster links.
 * FIX #7: TV series logic completely rewritten to match Kotlin MoviesDriveProvider.load()
 */
async function getDownloadLinks(mediaUrl, season, episode) {
    const currentDomain = await getCurrentDomain();
    HEADERS.Referer = `${currentDomain}/`;

    const response = await fetch(mediaUrl, { headers: HEADERS });
    const data = await response.text();
    const $ = cheerio.load(data);

    const typeRaw = $('h1.post-title, title').first().text();
    const isMovie = !( typeRaw.match(/Season|Episode|Series/i) );

    if (isMovie) {
        // =====================
        // MOVIE FLOW (unchanged — matches Kotlin)
        // =====================
        // Kotlin: document.select("h5 > a") — direct children only
        const links = $('h5 > a')
            .map((_, el) => $(el).attr('href'))
            .get()
            .filter(Boolean);

        console.log(`[Moviesdrive] Found ${links.length} h5 links (movie)`);

        const hosterRegex = /hubcloud|gdflix|gdlink/i;

        const extractMdrive = async (url) => {
            try {
                const html = await fetch(url, { headers: { 'User-Agent': HEADERS['User-Agent'] } }).then(r => r.text());
                const $$ = cheerio.load(html);
                return $$('a[href]')
                    .map((_, el) => $$(el).attr('href'))
                    .get()
                    .filter(href => href && hosterRegex.test(href));
            } catch(e) {
                console.error('[Moviesdrive] Error extracting links:', e.message);
                return [];
            }
        };

        const allResults = await Promise.all(
            links.map(async url => {
                const extracted = await extractMdrive(url);
                return Promise.all(extracted.map(serverUrl =>
                    loadExtractor(serverUrl, mediaUrl).catch(() => [])
                ));
            })
        );

        const flat = allResults.flat(2);
        const seen = new Set();
        const finalLinks = flat.filter(link => {
            if (!link?.url || seen.has(link.url)) return false;
            seen.add(link.url);
            return true;
        });

        console.log(`[Moviesdrive] Final movie streams: ${finalLinks.length}`);
        return { finalLinks, isMovie: true };

    } else {
        // =====================
        // TV SERIES FLOW — FIX #7: fully rewritten to match Kotlin
        // =====================
        // Kotlin: buttons = document.select("h5 > a").filter { !text.contains("Zip") }
        const buttons = $('h5 > a')
            .filter((_, el) => !$(el).text().toLowerCase().includes('zip'))
            .get();

        const episodesMap = {}; // key: "season_episode" → [urls]

        for (const button of buttons) {
            // Kotlin: titleElement = button.parent()?.previousElementSibling()
            // button.parent() is the h5, previousElementSibling is the element before that h5
            const mainTitle = $(button).parent().prev().text() || '';

            // Kotlin: Regex("""(?:Season |S)(\d+)""").find(mainTitle)
            const seasonMatch = mainTitle.match(/(?:Season\s*|S)(\d+)/i);
            const realSeason = seasonMatch ? parseInt(seasonMatch[1]) : 0;

            // Only process pages for the requested season
            if (realSeason !== season) continue;

            const episodeLink = $(button).attr('href');
            if (!episodeLink) continue;

            try {
                const epHtml = await fetch(episodeLink, { headers: HEADERS }).then(r => r.text());
                const $ep = cheerio.load(epHtml);

                // Kotlin: var elements = doc.select("span:matches((?i)(Ep))")
                //         if(elements.isEmpty()) elements = doc.select("a:matches((?i)(HubCloud|GDFlix))")
                let elements = $ep('span').filter((_, el) => /\bEp\b/i.test($ep(el).text())).get();
                const isSpanMode = elements.length > 0;

                if (!isSpanMode) {
                    elements = $ep('a').filter((_, el) => {
                        const href = $ep(el).attr('href') || '';
                        return /hubcloud|gdflix/i.test(href);
                    }).get();
                }

                let e = 1;

                for (const element of elements) {
                    if (isSpanMode) {
                        // Kotlin: e = Regex("""Ep(\d{2})""").find(element.toString())?.get(1)?.toInt() ?: e
                        const spanHtml = $ep(element).toString(); // outer HTML
                        const epNumMatch = spanHtml.match(/Ep(\d{1,2})/i);
                        if (epNumMatch) e = parseInt(epNumMatch[1]);

                        // Kotlin: var hTag = titleTag?.nextElementSibling()
                        // titleTag = element.parent() (the span's container tag)
                        let hTag = $ep(element).parent().next();

                        // Kotlin: while(hTag != null && hTag.text().contains("HubCloud|gdflix|gdlink"))
                        while (hTag.length && hTag.prop('tagName')?.toUpperCase() !== 'HR') {
                            const hText = hTag.text();
                            if (!/hubcloud|gdflix|gdlink/i.test(hText)) break;

                            const aTag = hTag.find('a').first();
                            const epUrl = aTag.attr('href') || '';
                            if (epUrl) {
                                const key = `${realSeason}_${e}`;
                                episodesMap[key] = episodesMap[key] || [];
                                episodesMap[key].push(epUrl);
                            }
                            hTag = hTag.next();
                        }
                        e++;
                    } else {
                        // Kotlin: else branch — direct <a> link
                        const epUrl = $ep(element).attr('href') || '';
                        if (epUrl) {
                            const key = `${realSeason}_${e}`;
                            episodesMap[key] = episodesMap[key] || [];
                            episodesMap[key].push(epUrl);
                            e++;
                        }
                    }
                }
            } catch(err) {
                console.error(`[Moviesdrive] Error processing episode page ${episodeLink}:`, err.message);
            }
        }

        const episodeKey = `${season}_${episode}`;
        const episodeUrls = episodesMap[episodeKey] || [];

        if (episodeUrls.length === 0) {
            console.error(`[Moviesdrive] No links found for S${season}E${episode}`);
            return { finalLinks: [], isMovie: false };
        }

        console.log(`[Moviesdrive] Found ${episodeUrls.length} raw URLs for S${season}E${episode}`);

        const allExtracted = await Promise.all(
            episodeUrls.map(serverUrl =>
                loadExtractor(serverUrl, mediaUrl).catch(e => {
                    console.error(`[Moviesdrive] Failed extractor ${serverUrl}:`, e.message);
                    return [];
                })
            )
        );

        const flat = allExtracted.flat();
        const seen = new Set();
        const finalLinks = flat.filter(link => {
            if (!link?.url || seen.has(link.url)) return false;
            seen.add(link.url);
            return true;
        });

        console.log(`[Moviesdrive] Final episode streams: ${finalLinks.length}`);
        return { finalLinks, isMovie: false };
    }
}

// =================================================================================
// TMDB + TITLE MATCHING (unchanged)
// =================================================================================

function getTMDBDetails(tmdbId, mediaType) {
    const endpoint = mediaType === 'tv' ? 'tv' : 'movie';
    const url = `${TMDB_BASE_URL}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;

    return fetch(url, {
        headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    }).then(function(response) {
        if (!response.ok) throw new Error(`TMDB API error: ${response.status}`);
        return response.json();
    }).then(function(data) {
        const title       = mediaType === 'tv' ? data.name : data.title;
        const releaseDate = mediaType === 'tv' ? data.first_air_date : data.release_date;
        const year        = releaseDate ? parseInt(releaseDate.split('-')[0]) : null;
        return { title, year, imdbId: data.external_ids?.imdb_id || null };
    });
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

function calculateTitleSimilarity(title1, title2) {
    const norm1 = normalizeTitle(title1);
    const norm2 = normalizeTitle(title2);
    if (norm1 === norm2) return 1.0;
    if (norm1.includes(norm2) || norm2.includes(norm1)) return 0.9;
    const words1 = new Set(norm1.split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(norm2.split(/\s+/).filter(w => w.length > 2));
    if (words1.size === 0 || words2.size === 0) return 0;
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    return intersection.size / union.size;
}

function findBestTitleMatch(mediaInfo, searchResults, mediaType, season) {
    if (!searchResults?.length) return null;
    let bestMatch = null, bestScore = 0;

    for (const result of searchResults) {
        let score = calculateTitleSimilarity(mediaInfo.title, result.title);
        if (mediaInfo.year && result.year) {
            const diff = Math.abs(mediaInfo.year - result.year);
            if (diff === 0) score += 0.2;
            else if (diff <= 1) score += 0.1;
            else if (diff > 5) score -= 0.3;
        }
        if (mediaType === 'tv' && season) {
            const lower = result.title.toLowerCase();
            const hasSeason = lower.includes(`season ${season}`) ||
                lower.includes(`s${season}`) ||
                lower.includes(`season ${String(season).padStart(2, '0')}`);
            score += hasSeason ? 0.3 : -0.2;
        }
        if (result.title.toLowerCase().includes('2160p') || result.title.toLowerCase().includes('4k')) score += 0.05;
        if (score > bestScore && score > 0.3) { bestScore = score; bestMatch = result; }
    }

    if (bestMatch) console.log(`[Moviesdrive] Best match: "${bestMatch.title}" (score: ${bestScore.toFixed(2)})`);
    return bestMatch;
}

/**
 * Main entry point for Nuvio integration.
 */
function getStreams(tmdbId, mediaType = 'movie', season = null, episode = null) {
    console.log(`[Moviesdrive] Fetching streams for TMDB ID: ${tmdbId}, Type: ${mediaType}${mediaType === 'tv' ? `, S:${season}E:${episode}` : ''}`);

    return getTMDBDetails(tmdbId, mediaType).then(function(mediaInfo) {
        if (!mediaInfo.title) throw new Error('Could not extract title from TMDB response');
        console.log(`[Moviesdrive] TMDB Info: "${mediaInfo.title}" (${mediaInfo.year || 'N/A'})`);

        // Search by title — matching Kotlin which searches by query string, not imdb_id
        const searchQuery = mediaType === 'tv' && season
            ? `${mediaInfo.title} Season ${season}`
            : mediaInfo.title;
        console.log(`[Moviesdrive] Searching for: "${searchQuery}"`);

        return search(searchQuery).then(function(searchResults) {
            if (searchResults.length === 0) {
                console.log('[Moviesdrive] No search results found');
                return [];
            }

            const bestMatch = findBestTitleMatch(mediaInfo, searchResults, mediaType, season);
            const selectedMedia = bestMatch || searchResults[0];
            console.log(`[Moviesdrive] Selected: "${selectedMedia.title}" (${selectedMedia.url})`);

            return getDownloadLinks(selectedMedia.url, season, episode).then(function(result) {
                const { finalLinks } = result;

                const streams = finalLinks
                    .filter(link => link && link.url)
                    .map(function(link) {
                        let mediaTitle;
                        if (link.fileName && link.fileName !== 'Unknown') {
                            mediaTitle = link.fileName;
                        } else if (mediaType === 'tv' && season && episode) {
                            mediaTitle = `${mediaInfo.title} S${String(season).padStart(2,'0')}E${String(episode).padStart(2,'0')}`;
                        } else if (mediaInfo.year) {
                            mediaTitle = `${mediaInfo.title} (${mediaInfo.year})`;
                        } else {
                            mediaTitle = mediaInfo.title;
                        }

                        const formattedSize = formatBytes(link.size);
                        const serverName    = extractServerName(link.source);

                        let qualityStr = 'Unknown';
                        if (link.quality >= 2160) qualityStr = '2160p';
                        else if (link.quality >= 1440) qualityStr = '1440p';
                        else if (link.quality >= 1080) qualityStr = '1080p';
                        else if (link.quality >= 720)  qualityStr = '720p';
                        else if (link.quality >= 480)  qualityStr = '480p';
                        else if (link.quality >= 360)  qualityStr = '360p';
                        else if (link.quality > 0)     qualityStr = '240p';

                        return {
                            name: `Moviesdrive ${serverName}`,
                            title: mediaTitle,
                            url: link.url,
                            quality: qualityStr,
                            size: formattedSize,
                            headers: HEADERS,
                            provider: 'Moviesdrive'
                        };
                    });

                const qualityOrder = { '2160p':5, '1440p':4, '1080p':3, '720p':2, '480p':1, '360p':0, '240p':-1, 'Unknown':-2 };
                streams.sort((a, b) => (qualityOrder[b.quality] ?? -3) - (qualityOrder[a.quality] ?? -3));

                console.log(`[Moviesdrive] Found ${streams.length} streams`);
                return streams;
            });
        });
    }).catch(function(error) {
        console.error(`[Moviesdrive] Scraping error: ${error.message}`);
        return [];
    });
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.getStreams = { getStreams };
}
