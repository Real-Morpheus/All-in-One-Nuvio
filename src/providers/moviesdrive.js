// MoviesDrive Scraper — TURBO EDITION
// Zero sequential waits · All parallel · Cached · Timeout-guarded
// Domain: https://new2.moviesdrives.my

const cheerio = require('cheerio-without-node-native');

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const TMDB_API_KEY   = '439c478a771f35c05022f9feabcca01c';
const TMDB_BASE_URL  = 'https://api.themoviedb.org/3';
let   MAIN_URL       = 'https://new2.moviesdrives.my';
const UTILS_URL      = 'https://raw.githubusercontent.com/SaurabhKaperwan/Utils/refs/heads/main/urls.json';
const DOMAINS_URL    = 'https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/domains.json';
const HOSTER_RE      = /hubcloud|gdflix|gdlink/i;

// ─── TIMEOUTS (ms) ───────────────────────────────────────────────────────────
const T_PAGE      = 8000;
const T_EXTRACTOR = 7000;
const T_DOMAIN    = 3000;
const T_TMDB      = 5000;

// ─── HEADERS ─────────────────────────────────────────────────────────────────
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';
const getHeaders = (referer) => ({
    'User-Agent': UA,
    'Referer': `${referer || MAIN_URL}/`,
});

// ─── RUNTIME CACHES ──────────────────────────────────────────────────────────
let domainCacheTs  = 0;
const DOMAIN_TTL   = 4 * 60 * 60 * 1000;
const utilsCache   = {};
let   utilsCacheTs = 0;
const pageCache    = new Map();
const PAGE_TTL     = 10 * 60 * 1000;

// ─── FETCH HELPERS ───────────────────────────────────────────────────────────

function fetchT(url, opts, ms) {
    ms = ms || T_PAGE;
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function() { ctrl.abort(); }, ms) : null;
    var signal = ctrl ? ctrl.signal : undefined;
    return fetch(url, Object.assign({}, opts, { signal: signal }))
        .finally(function() { if (timer) clearTimeout(timer); })
        .catch(function() { return null; });
}

async function fetchText(url, opts, ms) {
    var res = await fetchT(url, opts, ms || T_PAGE);
    if (!res || !res.ok) return '';
    return res.text().catch(function() { return ''; });
}

async function cachedFetchText(url, opts, ms) {
    var now = Date.now();
    var cached = pageCache.get(url);
    if (cached && (now - cached.ts) < PAGE_TTL) return cached.html;
    var html = await fetchText(url, opts, ms || T_PAGE);
    if (html) pageCache.set(url, { html: html, ts: now });
    return html;
}

// ─── UTILS ───────────────────────────────────────────────────────────────────

function getBaseUrl(url) {
    try { var u = new URL(url); return u.protocol + '//' + u.host; } catch(_) { return url; }
}

function getIndexQuality(str) {
    if (!str) return 0;
    var m = str.match(/(\d{3,4})[pP]/);
    if (m) return parseInt(m[1], 10);
    var l = str.toLowerCase();
    if (l.includes('8k')) return 4320;
    if (l.includes('4k')) return 2160;
    if (l.includes('2k')) return 1440;
    return 0;
}

function sizeToBytes(s) {
    if (!s) return 0;
    var m = s.match(/([\d.]+)\s*(GB|MB|KB)/i);
    if (!m) return 0;
    var v = parseFloat(m[1]);
    return m[2].toUpperCase() === 'GB' ? v * 1073741824 :
           m[2].toUpperCase() === 'MB' ? v * 1048576 : v * 1024;
}

function formatBytes(b) {
    if (!b) return 'Unknown';
    var k = 1024, s = ['B','KB','MB','GB','TB'], i = Math.floor(Math.log(b) / Math.log(k));
    return (b / Math.pow(k, i)).toFixed(1) + ' ' + s[i];
}

function cleanTitle(title) {
    var parts = title.split(/[.\-_]/);
    var qualityTags = ['WEBRip','WEB-DL','WEB','BluRay','HDRip','DVDRip','HDTV','CAM','TS','BRRip','BDRip','DVD','PDTV','HD'];
    var otherTags   = ['AAC','AC3','DTS','MP3','ESub','ESubs','Subs','x264','x265','H264','HEVC','AVC'];
    var si = parts.findIndex(function(p) { return qualityTags.some(function(t) { return p.toLowerCase().includes(t.toLowerCase()); }); });
    var ei = parts.findLastIndex(function(p) { return otherTags.some(function(t) { return p.toLowerCase().includes(t.toLowerCase()); }); });
    if (si !== -1 && ei >= si) return parts.slice(si, ei + 1).join('.');
    if (si !== -1) return parts.slice(si).join('.');
    return parts.slice(-3).join('.');
}

function extractServerName(s) {
    if (!s) return 'Unknown';
    if (/HubCloud/i.test(s)) {
        if (/FSL\s*V2/i.test(s)) return 'HubCloud FSLv2';
        if (/FSL/i.test(s))      return 'HubCloud FSL';
        if (/Buzz/i.test(s))     return 'HubCloud Buzz';
        if (/10\s*Gbps/i.test(s)) return 'HubCloud 10Gbps';
        return 'HubCloud';
    }
    if (/GDFlix/i.test(s)) {
        if (/Direct/i.test(s))   return 'GDFlix Direct';
        if (/Instant/i.test(s))  return 'GDFlix Instant';
        if (/Cloud/i.test(s))    return 'GDFlix Cloud';
        return 'GDFlix';
    }
    if (/Pixeldrain/i.test(s)) return 'Pixeldrain';
    if (/StreamTape/i.test(s)) return 'StreamTape';
    return s.replace(/^www\./i,'').split(/[.\s]/)[0];
}

var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
function atob(v) {
    if (!v) return '';
    var input = String(v).replace(/=+$/, ''), out = '', bc = 0, bs, buf, idx = 0;
    while ((buf = input.charAt(idx++))) {
        buf = B64.indexOf(buf);
        if (~buf) { bs = bc % 4 ? bs * 64 + buf : buf; if (bc++ % 4) out += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6))); }
    }
    return out;
}

// ─── DOMAIN / UTILS CACHE ────────────────────────────────────────────────────

async function fetchUtilsOnce() {
    var now = Date.now();
    if ((now - utilsCacheTs) < DOMAIN_TTL) return;
    try {
        var res = await fetchT(UTILS_URL, { headers: { 'User-Agent': UA } }, T_DOMAIN);
        if (res && res.ok) {
            var d = await res.json().catch(function() { return {}; });
            Object.assign(utilsCache, d);
            utilsCacheTs = now;
        }
    } catch(_) {}
}

async function getLatestBaseUrl(fallback, key) {
    await fetchUtilsOnce();
    var v = utilsCache[key];
    return (v && v.trim()) ? v.trim() : fallback;
}

var _domainPromise = null;
async function ensureDomain() {
    var now = Date.now();
    if ((now - domainCacheTs) < DOMAIN_TTL) return;
    if (_domainPromise) return _domainPromise;
    _domainPromise = (async function() {
        try {
            await fetchUtilsOnce();
            var nd = utilsCache['moviesdrive'];
            if (nd && nd.trim()) MAIN_URL = nd.trim();
        } catch(_) {}
        if (MAIN_URL === 'https://new2.moviesdrives.my') {
            try {
                var r = await fetchT(DOMAINS_URL, { headers: { 'User-Agent': UA } }, T_DOMAIN);
                if (r && r.ok) {
                    var d = await r.json().catch(function() { return {}; });
                    if (d['Moviesdrive']) MAIN_URL = d['Moviesdrive'].trim();
                }
            } catch(_) {}
        }
        domainCacheTs = Date.now();
        _domainPromise = null;
    })();
    return _domainPromise;
}

// ─── EXTRACTORS ──────────────────────────────────────────────────────────────

async function pixelDrainExtractor(link) {
    try {
        var m = link.match(/(?:file|u)\/([A-Za-z0-9]+)/);
        var fileId = m ? m[1] : link.split('/').pop();
        if (!fileId) return [];
        var base = getBaseUrl(link);
        var directUrl = link.toLowerCase().includes('download') ? link : (base + '/api/file/' + fileId + '?download');
        return [{ source: 'Pixeldrain', quality: getIndexQuality(link), url: directUrl }];
    } catch(_) { return []; }
}

async function streamTapeExtractor(link) {
    try {
        var u = new URL(link); u.hostname = 'streamtape.com';
        var html = await fetchText(u.toString(), { headers: getHeaders() }, T_EXTRACTOR);
        if (!html) return [];
        var m1 = html.match(/document\.getElementById\('videolink'\)\.innerHTML = (.*?);/);
        if (m1) { var p = m1[1].match(/'(\/\/streamtape\.com\/get_video[^']+)'/); if (p) return [{ source: 'StreamTape', quality: 0, url: 'https:' + p[1] }]; }
        var m2 = html.match(/'(\/\/streamtape\.com\/get_video[^']+)'/);
        if (m2) return [{ source: 'StreamTape', quality: 0, url: 'https:' + m2[1] }];
        return [];
    } catch(_) { return []; }
}

async function hubCloudExtractor(url, referer) {
    try {
        var base = getBaseUrl(url);
        var latestBase = await getLatestBaseUrl(base, url.includes('hubcloud') ? 'hubcloud' : 'vcloud');
        var currentUrl = (base !== latestBase) ? url.replace(base, latestBase) : url;
        base = getBaseUrl(currentUrl);

        var html = await cachedFetchText(currentUrl, { headers: getHeaders(referer || MAIN_URL) });
        if (!html) return [];
        var $ = cheerio.load(html);

        var link = '';
        if (/\/video\//i.test(currentUrl)) {
            link = $('div.vd > center > a').attr('href') || '';
        } else {
            var sm = html.match(/var url = '([^']*)'/);
            link = sm ? sm[1] : '';
        }
        if (!link) return [];
        if (!link.startsWith('http')) link = base + link;

        var docHtml = await fetchText(link, { headers: getHeaders(currentUrl) }, T_EXTRACTOR);
        if (!docHtml) return [];
        var $d = cheerio.load(docHtml);

        var header  = $d('div.card-header').text().trim();
        var size    = $d('i#size').text().trim();
        var quality = getIndexQuality(header);
        var sizeB   = sizeToBytes(size);
        var extras  = [cleanTitle(header), size].filter(Boolean).map(function(s) { return '[' + s + ']'; }).join('');

        var links = [];
        var btns  = $d('h2 a.btn, a.btn[href]').get();

        await Promise.all(btns.map(async function(el) {
            var href = $d(el).attr('href') || '';
            var text = $d(el).text().trim();
            if (/telegram/i.test(text) || /telegram/i.test(href)) return;

            function push(server, u) {
                links.push({ source: 'HubCloud' + server + ' ' + extras, quality: quality, url: u || href, size: sizeB, fileName: header });
            }

            if      (text.includes('FSL Server'))                          push(' [FSL Server]');
            else if (text.includes('FSLv2') || text.includes('FSL V2'))    push(' [FSLv2]');
            else if (text.includes('Mega Server'))                         push(' [Mega]');
            else if (text.includes('Download File'))                       push('');
            else if (text.includes('BuzzServer')) {
                try {
                    var r = await fetchT(href + '/download', { method: 'GET', headers: getHeaders(href), redirect: 'manual' }, 5000);
                    var hx = r && r.headers.get('hx-redirect');
                    if (hx) push(' [BuzzServer]', getBaseUrl(href) + hx);
                } catch(_) {}
            } else if (href.includes('pixeldra')) {
                var px = await pixelDrainExtractor(href);
                px.forEach(function(l) { links.push(Object.assign({}, l, { quality: l.quality || quality, size: l.size || sizeB, fileName: header })); });
            } else if (text.includes('10Gbps') || text.includes('Server : 10Gbps')) {
                var cur = href;
                for (var i = 0; i < 5; i++) {
                    var rr = await fetchT(cur, { redirect: 'manual' }, 3000);
                    if (!rr || rr.status < 300 || rr.status >= 400) break;
                    var loc = rr.headers.get('location') || '';
                    if (loc.includes('link=')) { cur = loc.split('link=')[1]; break; }
                    if (!loc) break;
                    cur = loc.startsWith('http') ? loc : new URL(loc, cur).toString();
                }
                if (cur !== href) push(' [10Gbps]', cur);
            }
        }));

        return links;
    } catch(e) {
        console.error('[HubCloud] error:', e.message);
        return [];
    }
}

async function gdFlixExtractor(url, referer) {
    var links = [];
    try {
        var base = getBaseUrl(url);
        var latestBase = await getLatestBaseUrl(base, 'gdflix');
        var currentUrl = (base !== latestBase) ? url.replace(base, latestBase) : url;
        base = getBaseUrl(currentUrl);

        var html = await cachedFetchText(currentUrl, { headers: getHeaders(referer || MAIN_URL) });
        if (!html) return [];
        var $ = cheerio.load(html);

        var fileName = $('ul > li.list-group-item:contains(Name)').text().replace('Name :', '').trim();
        var fileSize = $('ul > li.list-group-item:contains(Size)').text().replace('Size :', '').trim();
        var quality  = getIndexQuality(fileName);
        var sizeB    = sizeToBytes(fileSize);

        function push(server, u) {
            links.push({ source: 'GDFlix' + server + ' ' + fileName + '[' + fileSize + ']', quality: quality, url: u, size: sizeB, fileName: fileName });
        }

        var anchors = $('div.text-center a').get();

        await Promise.all(anchors.map(async function(el) {
            var href = $(el).attr('href') || '';
            var text = $(el).text().trim();

            if      (text.includes('FSL V2'))                                      push(' [FSL V2]', href);
            else if (text.includes('DIRECT DL') || text.includes('DIRECT SERVER')) push(' [Direct]', href);
            else if (text.includes('CLOUD DOWNLOAD'))                              push(' [Cloud]', href);
            else if (text.includes('FAST CLOUD')) {
                try {
                    var fh = await fetchText(base + href, { headers: getHeaders() }, T_EXTRACTOR);
                    var $f = cheerio.load(fh || '');
                    var dl = $f('div.card-body a').attr('href');
                    if (dl) push(' [Fast Cloud]', dl);
                } catch(_) {}
            } else if (href.includes('pixeldra')) {
                var px = await pixelDrainExtractor(href);
                px.forEach(function(l) { links.push(Object.assign({}, l, { quality: quality, size: sizeB, fileName: fileName })); });
            } else if (text.includes('Instant DL')) {
                try {
                    var ir = await fetchT(href, { redirect: 'manual', headers: getHeaders() }, 4000);
                    var loc = (ir && ir.headers.get('location')) || '';
                    var fu  = loc.includes('url=') ? loc.split('url=')[1] : loc;
                    if (fu) push(' [Instant]', fu);
                } catch(_) {}
            } else if (text.includes('GoFile')) {
                try {
                    var gh = await fetchText(href, { headers: getHeaders() }, T_EXTRACTOR);
                    var $g = cheerio.load(gh || '');
                    var gls = $g('.row .row a').map(function(_, a) { return $g(a).attr('href'); }).get().filter(function(h) { return h && h.includes('gofile'); });
                    var gf  = await Promise.all(gls.map(function(gl) { return goFileExtractor(gl).catch(function() { return []; }); }));
                    gf.flat().forEach(function(l) { links.push(Object.assign({}, l, { quality: l.quality || quality, size: l.size || sizeB, fileName: fileName })); });
                } catch(_) {}
            }
        }));

        // CF backup — both types in parallel
        try {
            var wfile = currentUrl.replace('file', 'wfile');
            var cfAll = await Promise.all(['1','2'].map(async function(t) {
                var ch = await fetchText(wfile + '?type=' + t, { headers: getHeaders() }, 4000);
                var $c = cheerio.load(ch || '');
                return $c('a.btn-success').map(function(_, a) { return $c(a).attr('href'); }).get().filter(Boolean);
            }));
            await Promise.all(cfAll.flat().map(async function(src) {
                var cur = src;
                for (var i = 0; i < 5; i++) {
                    var r = await fetchT(cur, { redirect: 'manual' }, 3000);
                    if (!r || r.status < 300 || r.status >= 400) break;
                    var loc = r.headers.get('location') || '';
                    if (!loc) break;
                    cur = loc.startsWith('http') ? loc : new URL(loc, cur).toString();
                }
                if (cur) push(' [CF]', cur);
            }));
        } catch(_) {}
    } catch(e) {
        console.error('[GDFlix] error:', e.message);
    }
    return links;
}

async function goFileExtractor(url) {
    try {
        var idM = url.match(/(?:\?c=|\/d\/)([a-zA-Z0-9-]+)/);
        var id  = idM ? idM[1] : null;
        if (!id) return [];
        var results = await Promise.all([
            fetchT('https://api.gofile.io/accounts', { method: 'POST' }, 4000).then(function(r) { return r && r.ok ? r.json() : null; }).catch(function() { return null; }),
            fetchText('https://gofile.io/dist/js/global.js', {}, 4000),
        ]);
        var acc = results[0], js = results[1];
        var token = acc && acc.data && acc.data.token;
        var wtm   = js && js.match(/appdata\.wt\s*=\s*["']([^"']+)/);
        var wt    = wtm ? wtm[1] : null;
        if (!token || !wt) return [];
        var data = await fetchT('https://api.gofile.io/contents/' + id + '?wt=' + wt, { headers: { Authorization: 'Bearer ' + token } }, 4000)
            .then(function(r) { return r && r.ok ? r.json() : null; }).catch(function() { return null; });
        var files = Object.values((data && data.data && data.data.children) || {});
        if (!files.length) return [];
        var file = files[0];
        return [{ source: 'GoFile', quality: getIndexQuality(file.name), url: file.link, size: file.size || 0, fileName: file.name, headers: { Cookie: 'accountToken=' + token } }];
    } catch(_) { return []; }
}

async function loadExtractor(url, referer) {
    referer = referer || MAIN_URL;
    var host;
    try { host = new URL(url).hostname; } catch(_) { return []; }
    if (/google\.|ampproject\.org|gstatic\.|doubleclick\.|ddl2|linkrit/i.test(host)) return [];
    if (host.includes('hubcloud') || host.includes('vcloud')) return hubCloudExtractor(url, referer);
    if (host.includes('gdflix')   || host.includes('gdlink')) return gdFlixExtractor(url, referer);
    if (host.includes('gofile'))     return goFileExtractor(url);
    if (host.includes('pixeldrain')) return pixelDrainExtractor(url);
    if (host.includes('streamtape')) return streamTapeExtractor(url);
    return [{ source: host.replace(/^www\./, ''), quality: 0, url: url }];
}

// ─── PROVIDER ────────────────────────────────────────────────────────────────

async function search(query, page) {
    page = page || 1;
    var url = MAIN_URL + '/search.php?q=' + encodeURIComponent(query) + '&page=' + page;
    var res = await fetchT(url, { headers: getHeaders() }, T_PAGE);
    if (!res || !res.ok) return [];
    try {
        var json = await res.json();
        if (!json || !json.hits || !json.hits.length) return [];
        return json.hits.map(function(h) { return h.document; }).map(function(doc) {
            var m = doc.post_title.match(/\b(19|20)\d{2}\b/);
            return {
                title:  doc.post_title,
                url:    doc.permalink.startsWith('http') ? doc.permalink : MAIN_URL + (doc.permalink.startsWith('/') ? '' : '/') + doc.permalink,
                poster: doc.post_thumbnail || null,
                year:   m ? +m[0] : null,
                imdbId: doc.imdb_id || null,
            };
        });
    } catch(_) { return []; }
}

async function extractHosterLinks(pageUrl) {
    var html = await cachedFetchText(pageUrl, { headers: { 'User-Agent': UA } }, T_PAGE);
    if (!html) return [];
    var $ = cheerio.load(html);
    return $('a[href]').map(function(_, el) { return $(el).attr('href'); }).get().filter(function(h) { return h && HOSTER_RE.test(h); });
}

async function getDownloadLinks(mediaUrl, season, episode) {
    var html = await fetchText(mediaUrl, { headers: getHeaders() }, T_PAGE);
    if (!html) return { finalLinks: [], isMovie: true };
    var $ = cheerio.load(html);

    var rawTitle = $('title').text();
    var isMovie  = !(/Episode|season\s*\d+|series/i.test(rawTitle));

    if (isMovie) {
        var h5Links = $('h5 > a').map(function(_, el) { return $(el).attr('href'); }).get().filter(Boolean);

        // ALL intermediate pages in parallel
        var serverUrlsNested = await Promise.all(h5Links.map(extractHosterLinks));
        var serverUrls = Array.from(new Set(serverUrlsNested.reduce(function(a, b) { return a.concat(b); }, [])));

        // ALL extractors in parallel
        var extracted = await Promise.all(serverUrls.map(function(u) { return loadExtractor(u, mediaUrl).catch(function() { return []; }); }));
        var flat = extracted.reduce(function(a, b) { return a.concat(b); }, []);
        var seen = new Set();
        return { finalLinks: flat.filter(function(l) { return l && l.url && !seen.has(l.url) && seen.add(l.url); }), isMovie: true };
    }

    // ── TV SERIES ──
    var seasonRE  = new RegExp('(?:Season|S)\\s*0?' + season + '\\b', 'i');
    var episodeRE = new RegExp('Ep\\s*0?' + episode + '\\b', 'i');

    var singleEpUrls = [];
    $('h5').each(function(_, h5el) {
        if (!seasonRE.test($(h5el).text())) return;
        $(h5el).nextAll('h5').each(function(_, nx) {
            var a = $(nx).find('a[href]');
            if (a.length && /single\s*episode/i.test(a.text()) && !/zip/i.test(a.text())) {
                var href = a.attr('href');
                if (href && !singleEpUrls.includes(href)) singleEpUrls.push(href);
            }
        });
    });

    if (!singleEpUrls.length) return { finalLinks: [], isMovie: false };

    // ALL single-ep pages in parallel
    var epHtmls = await Promise.all(singleEpUrls.map(function(u) { return cachedFetchText(u, { headers: getHeaders() }, T_PAGE); }));

    var episodeHosterUrls = new Set();
    epHtmls.forEach(function(epHtml) {
        if (!epHtml) return;
        var $e = cheerio.load(epHtml);
        var elements = $e('span').filter(function(_, el) { return /\bEp\b/i.test($e(el).text()); }).get();
        if (!elements.length) elements = $e('a').filter(function(_, el) { return HOSTER_RE.test($e(el).attr('href') || ''); }).get();

        var e = 1;
        elements.forEach(function(el) {
            if ($e(el).prop('tagName') === 'SPAN') {
                var epM = /Ep(\d{2})/i.exec($e(el).toString());
                if (epM) e = parseInt(epM[1], 10);
                if (e !== episode) { e++; return; }
                var next = $e(el).parent().next();
                while (next && next.length && next.prop('tagName') !== 'HR') {
                    var href = next.find('a').attr('href') || '';
                    if (HOSTER_RE.test(href)) episodeHosterUrls.add(href);
                    next = next.next();
                }
                e++;
            } else {
                if (e === episode) {
                    var href = $e(el).attr('href') || '';
                    if (HOSTER_RE.test(href)) episodeHosterUrls.add(href);
                }
                e++;
            }
        });
    });

    if (!episodeHosterUrls.size) return { finalLinks: [], isMovie: false };

    var tvResults = await Promise.all(Array.from(episodeHosterUrls).map(function(u) { return loadExtractor(u, singleEpUrls[0]).catch(function() { return []; }); }));
    var tvFlat    = tvResults.reduce(function(a, b) { return a.concat(b); }, []);
    var seenTv    = new Set();
    return { finalLinks: tvFlat.filter(function(l) { return l && l.url && !seenTv.has(l.url) && seenTv.add(l.url); }), isMovie: false };
}

async function getTMDBDetails(tmdbId, mediaType) {
    var ep  = mediaType === 'tv' ? 'tv' : 'movie';
    var url = TMDB_BASE_URL + '/' + ep + '/' + tmdbId + '?api_key=' + TMDB_API_KEY + '&append_to_response=external_ids';
    var res = await fetchT(url, { headers: { Accept: 'application/json', 'User-Agent': UA } }, T_TMDB);
    if (!res || !res.ok) throw new Error('TMDB ' + (res && res.status));
    var d  = await res.json();
    var title = mediaType === 'tv' ? d.name : d.title;
    var rd    = mediaType === 'tv' ? d.first_air_date : d.release_date;
    return { title: title, year: rd ? parseInt(rd.split('-')[0], 10) : null, imdbId: (d.external_ids && d.external_ids.imdb_id) || null };
}

function normalizeTitle(t) {
    if (!t) return '';
    return t.toLowerCase().replace(/\b(the|a|an)\b/g,'').replace(/[:\-_]/g,' ').replace(/\s+/g,' ').replace(/[^\w\s]/g,'').trim();
}
function titleSimilarity(a, b) {
    var n1 = normalizeTitle(a), n2 = normalizeTitle(b);
    if (n1 === n2) return 1;
    if (n1.includes(n2) || n2.includes(n1)) return 0.9;
    var w1 = new Set(n1.split(/\s+/).filter(function(w) { return w.length > 2; }));
    var w2 = new Set(n2.split(/\s+/).filter(function(w) { return w.length > 2; }));
    if (!w1.size || !w2.size) return 0;
    var inter = Array.from(w1).filter(function(w) { return w2.has(w); }).length;
    return inter / new Set([...w1, ...w2]).size;
}
function findBestMatch(info, results, mediaType, season) {
    var best = null, bestScore = 0;
    results.forEach(function(r) {
        var s = titleSimilarity(info.title, r.title);
        if (info.year && r.year) {
            var d = Math.abs(info.year - r.year);
            s += d === 0 ? 0.2 : d <= 1 ? 0.1 : d > 5 ? -0.3 : 0;
        }
        if (mediaType === 'tv' && season) {
            var tl = r.title.toLowerCase();
            s += (tl.includes('season ' + season) || tl.includes('s' + season)) ? 0.3 : -0.2;
        }
        if (s > bestScore && s > 0.3) { bestScore = s; best = r; }
    });
    return best;
}

// ─── MAIN ENTRY ──────────────────────────────────────────────────────────────

async function getStreams(tmdbId, mediaType, season, episode) {
    mediaType = mediaType || 'movie';
    console.log('[MoviesDrive] ' + tmdbId + ' ' + mediaType + (mediaType === 'tv' ? ' S' + season + 'E' + episode : ''));

    try {
        // TMDB + domain check fire simultaneously
        var results0 = await Promise.all([
            getTMDBDetails(tmdbId, mediaType),
            ensureDomain(),
        ]);
        var mediaInfo = results0[0];
        if (!mediaInfo.title) throw new Error('No TMDB title');

        // Search: IMDB ID + title queries fire simultaneously
        var queries = mediaInfo.imdbId ? [mediaInfo.imdbId, mediaInfo.title] : [mediaInfo.title];
        var searchResults = await Promise.all(queries.map(function(q) { return search(q).catch(function() { return []; }); }));
        var primaryResults  = searchResults[0] || [];
        var fallbackResults = searchResults[1] || [];

        var results = primaryResults.length ? primaryResults : fallbackResults;
        if (mediaInfo.imdbId && results.length) {
            var filtered = results.filter(function(r) { return r.imdbId === mediaInfo.imdbId; });
            if (filtered.length) results = filtered;
        }
        if (!results.length && fallbackResults.length) results = fallbackResults;
        if (!results.length) { console.log('[MoviesDrive] No results'); return []; }

        var selected = findBestMatch(mediaInfo, results, mediaType, season) || results[0];
        console.log('[MoviesDrive] → ' + selected.title + ' ' + selected.url);

        var dlResult = await getDownloadLinks(selected.url, season, episode);
        var finalLinks = dlResult.finalLinks;
        if (!finalLinks.length) return [];

        var QORD = { '2160p':6,'1440p':5,'1080p':4,'720p':3,'480p':2,'360p':1,'240p':0,'Unknown':-1 };

        var streams = finalLinks
            .filter(function(l) { return l && l.url; })
            .map(function(l) {
                var q  = l.quality;
                var qs = q >= 2160 ? '2160p' : q >= 1440 ? '1440p' : q >= 1080 ? '1080p' :
                         q >= 720  ? '720p'  : q >= 480  ? '480p'  : q >= 360  ? '360p'  :
                         q > 0     ? '240p'  : 'Unknown';
                var title = (l.fileName && l.fileName !== 'Unknown') ? l.fileName
                    : mediaType === 'tv' && season && episode
                        ? mediaInfo.title + ' S' + String(season).padStart(2,'0') + 'E' + String(episode).padStart(2,'0')
                        : mediaInfo.year ? mediaInfo.title + ' (' + mediaInfo.year + ')' : mediaInfo.title;
                return { name: 'MoviesDrive ' + extractServerName(l.source), title: title, url: l.url, quality: qs, size: formatBytes(l.size), headers: l.headers || getHeaders(), provider: 'MoviesDrive' };
            })
            .sort(function(a, b) { return ((QORD[b.quality] !== undefined ? QORD[b.quality] : -2)) - ((QORD[a.quality] !== undefined ? QORD[a.quality] : -2)); });

        console.log('[MoviesDrive] ' + streams.length + ' streams');
        return streams;
    } catch(e) {
        console.error('[MoviesDrive] Fatal:', e.message);
        return [];
    }
}

// ─── EXPORTS ─────────────────────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.getStreams = getStreams;
}
