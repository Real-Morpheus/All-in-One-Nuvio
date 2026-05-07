/**
 * MoviesDrive FSL/FSLv2 – Nuvio Plugin
 * Scrapes MoviesDrive via HubCloud / GDFlix.
 */
const cheerio = require('cheerio');

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────
const GITHUB_URLS_JSON = "https://raw.githubusercontent.com/SaurabhKaperwan/Utils/refs/heads/main/urls.json";
const CINEMETA_BASE    = "https://v3-cinemeta.strem.io";
const DEFAULT_MD_URL   = "https://new2.moviesdrives.my";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9"
};

const MAX_REDIRECTS = 7;
const FUZZY_THRESHOLD = 58;

// Dynamic URL cache
let dynUrls = {};
let dynFetched = false;

// ─────────────────────────────────────────────
// UTILITY HELPERS
// ─────────────────────────────────────────────
function origin(url) {
  const u = new URL(url);
  return u.origin;
}

function qualityLabel(str) {
  if (!str) return "?";
  const m = str.match(/(\d{3,4})p/i);
  if (m) return m[1] + "p";
  const lo = str.toLowerCase();
  if (lo.includes('8k'))  return '4320p';
  if (lo.includes('4k'))  return '2160p';
  if (lo.includes('2k'))  return '1440p';
  if (lo.includes('1080'))return '1080p';
  if (lo.includes('720')) return '720p';
  return "?";
}

const LANG_PATTERNS = [
  ["Hindi",     /\bhin(di)?\b/i],
  ["English",   /\beng(lish)?\b/i],
  ["Tamil",     /\btam(il)?\b/i],
  ["Telugu",    /\btel(ugu)?\b/i],
  ["Malayalam", /\bmal(ayalam)?\b/i],
  ["Kannada",   /\bkan(nada)?\b/i],
  ["Bengali",   /\bben(gali)?\b/i],
  ["Punjabi",   /\bpun(jabi)?\b/i],
  ["Dual Audio",/\bdual\b/i],
  ["Multi",     /\bmulti\b/i]
];

function audioLangs(filename) {
  const lo = filename.toLowerCase();
  const found = LANG_PATTERNS.filter(([_, re]) => re.test(lo)).map(([name]) => name);
  return found.length ? found.join(" + ") : "Unknown";
}

function streamDescription(filename, size, server) {
  const q = qualityLabel(filename);
  const au = audioLangs(filename);
  const sz = size.trim() || "?";
  const name = `🎬 MoviesDrive | ${server}`;
  const desc = `📁 ${filename}\n🎞 ${q}  📦 ${sz}  🎵 ${au}`;
  return { name, desc };
}

// Simple token-set ratio (0-100) for fuzzy matching
function tokenSetRatio(a, b) {
  const toks = s => new Set(s.replace(/[^\w\s]/g, '').toLowerCase().split(/\s+/).filter(Boolean));
  const setA = toks(a);
  const setB = toks(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  const intersection = [...setA].filter(x => setB.has(x)).length;
  return Math.round((intersection / Math.min(setA.size, setB.size)) * 100);
}

// ─────────────────────────────────────────────
// DYNAMIC URL FETCH
// ─────────────────────────────────────────────
async function fetchDynamicUrls() {
  if (dynFetched) return dynUrls;
  try {
    const res = await fetch(GITHUB_URLS_JSON, { signal: AbortSignal.timeout(5000) });
    dynUrls = await res.json();
    dynFetched = true;
    console.log('Dynamic URLs loaded:', Object.keys(dynUrls));
  } catch (e) {
    console.warn('Could not load dynamic URLs:', e);
  }
  return dynUrls;
}

async function dynBase(source, fallback) {
  const urls = await fetchDynamicUrls();
  return urls[source] || fallback;
}

// ─────────────────────────────────────────────
// CINEMETA META RESOLUTION
// ─────────────────────────────────────────────
async function cinemetaMeta(session, type, id) {
  try {
    const res = await fetch(`${CINEMETA_BASE}/meta/${type}/${id}.json`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.meta;
  } catch (e) {
    console.warn(`Cinemeta error (${type}/${id}):`, e);
    return null;
  }
}

async function resolveId(session, type, rawId) {
  // rawId is always the numeric TMDB ID from getStreams
  const tmdbId = `tmdb:${rawId}`;
  const meta = await cinemetaMeta(session, type, tmdbId);
  return { meta };
}

// ─────────────────────────────────────────────
// MOVIESDRIVE SEARCH
// ─────────────────────────────────────────────
async function mdSearch(session, query, base, page = 1) {
  const url = `${base}/search.php?q=${encodeURIComponent(query)}&page=${page}`;
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    const raw = await res.text();
    const data = JSON.parse(raw);
    return (data.hits || []).map(hit => {
      const doc = hit.document || {};
      return {
        title: doc.post_title || "",
        url: base + (doc.permalink || ""),
        poster: doc.post_thumbnail || ""
      };
    });
  } catch (e) {
    console.error('MD search error:', e);
    return [];
  }
}

function pickBest(results, target, year) {
  if (!results.length) return null;
  const clean = target.replace(/\W+/g, ' ').trim().toLowerCase();
  let bestScore = -1, bestItem = null;
  for (const r of results) {
    const t = r.title.replace(/\W+/g, ' ').trim().toLowerCase();
    let score = tokenSetRatio(clean, t);
    if (year && r.title.includes(year)) score = Math.min(score + 12, 100);
    if (score > bestScore) {
      bestScore = score;
      bestItem = r;
    }
  }
  console.log(`Best match (${bestScore}%): ${bestItem?.title}`);
  if (bestScore < FUZZY_THRESHOLD) {
    console.warn(`Match score too low (${bestScore} < ${FUZZY_THRESHOLD}), skipping`);
    return null;
  }
  return bestItem;
}

// ─────────────────────────────────────────────
// SOURCE COLLECTORS (MoviesDrive pages)
// ─────────────────────────────────────────────
const SRC_RE = /hubcloud|gdflix|gdlink/i;

async function innerLinks(session, btnHref) {
  try {
    const res = await fetch(btnHref, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    const html = await res.text();
    const $ = cheerio.load(html);
    const links = [];
    $('a[href]').each((i, el) => {
      const href = $(el).attr('href');
      if (SRC_RE.test(href)) links.push(href);
    });
    return links;
  } catch (e) {
    console.debug('innerLinks error:', e);
    return [];
  }
}

async function collectMovieSources(session, pageUrl) {
  const res = await fetch(pageUrl, { headers: HEADERS, signal: AbortSignal.timeout(12000) });
  const html = await res.text();
  const $ = cheerio.load(html);
  const buttons = $('h5 > a').toArray();
  console.log('Movie page: found', buttons.length, 'quality buttons');
  const tasks = buttons.map(btn => innerLinks(session, $(btn).attr('href')));
  const results = await Promise.allSettled(tasks);
  const sources = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) sources.push(...r.value);
  }
  return sources;
}

function seasonFromContext(btn, $) {
  let node = $(btn).parent()[0]; // <h5>
  let prev = node.previousElementSibling;
  for (let i = 0; i < 6 && prev; i++) {
    const txt = $(prev).text().trim();
    const m = txt.match(/(?:season|S(?:eason)?)\s*(\d+)/i);
    if (m) return parseInt(m[1]);
    prev = prev.previousElementSibling;
  }
  return 0; // unknown → accept all
}

function findEpSpans($) {
  const epPat = /\bEp(?:isode)?\s*0*(\d+)\b/i;
  return $('span').toArray().filter(el => epPat.test($(el).text()));
}

async function parseEpisodePage($, season, episode) {
  const epSpans = findEpSpans($);
  const epNumPat = /\bEp(?:isode)?\s*0*(\d+)\b/i;
  const sources = [];

  // Strategy A: span-based
  if (epSpans.length) {
    console.log(`    Episode page: ${epSpans.length} ep-spans (Strategy A)`);
    for (const span of epSpans) {
      const epMatch = $(span).text().match(epNumPat);
      if (!epMatch) continue;
      const epNum = parseInt(epMatch[1]);
      if (epNum !== episode) continue;
      const row = $(span).parent()[0];
      let sibling = row?.nextElementSibling;
      while (sibling) {
        const txt = $(sibling).text().toLowerCase();
        if (!/(hubcloud|gdflix|gdlink)/.test(txt)) break;
        const a = $(sibling).find('a[href]');
        if (a.length && SRC_RE.test(a.attr('href'))) {
          sources.push(a.attr('href'));
          console.log(`    A: Ep${epNum.toString().padStart(2,'0')} → ${a.attr('href').substring(0,70)}`);
        }
        sibling = sibling.nextElementSibling;
      }
    }
    if (sources.length) return sources;
  }

  // Strategy B: sequential anchors
  const epAnchors = $('a[href]').toArray().filter(a => SRC_RE.test($(a).attr('href')));
  console.log(`    Episode page: ${epAnchors.length} hub/gdflix anchors (Strategy B)`);
  if (epAnchors.length) {
    const idx = episode - 1;
    if (idx >= 0 && idx < epAnchors.length) {
      sources.push($(epAnchors[idx]).attr('href'));
      console.log(`    B: Ep${episode.toString().padStart(2,'0')} → ${$(epAnchors[idx]).attr('href').substring(0,70)}`);
    } else {
      console.warn(`    B: episode ${episode} out of range (${epAnchors.length} anchors)`);
    }
  }
  return sources;
}

async function collectEpisodeSources(session, pageUrl, season, episode) {
  const res = await fetch(pageUrl, { headers: HEADERS, signal: AbortSignal.timeout(12000) });
  const html = await res.text();
  const $ = cheerio.load(html);

  const allButtons = $('h5 > a').toArray()
    .filter(btn => !$(btn).text().toLowerCase().includes('zip'));
  console.log(`Series page: ${allButtons.length} quality buttons (S${season}E${episode})`);

  const matching = allButtons.filter(btn => {
    const detected = seasonFromContext(btn, $);
    return detected === 0 || detected === season;
  });
  console.log(`After season filter: ${matching.length} button(s)`);

  const sources = [];
  const tasks = matching.map(async btn => {
    const href = $(btn).attr('href');
    if (!href) return [];
    const epRes = await fetch(href, { headers: HEADERS, signal: AbortSignal.timeout(12000) });
    const epHtml = await epRes.text();
    const $ep = cheerio.load(epHtml);
    return await parseEpisodePage($ep, season, episode);
  });
  const results = await Promise.allSettled(tasks);
  for (const r of results) {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) sources.push(...r.value);
  }
  // deduplicate
  return [...new Set(sources)];
}

// ─────────────────────────────────────────────
// HUBCLOUD EXTRACTOR (FSL/FSLv2 only)
// ─────────────────────────────────────────────
async function extractHubcloud(session, url) {
  const streams = [];
  try {
    let base = origin(url);
    const src = url.includes('hubcloud') ? 'hubcloud' : 'vcloud';
    const liveBase = await dynBase(src, base);
    url = url.replace(base, liveBase);
    base = liveBase;

    // Step 1: get intermediate link
    const res1 = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    const html = await res1.text();
    const $ = cheerio.load(html);
    let mid = '';
    if (url.includes('/video/')) {
      const el = $('div.vd > center > a');
      mid = el.attr('href') || '';
    } else {
      const script = $('script').toArray().find(el => $(el).html()?.includes("var url = '"));
      if (script) {
        const match = $(script).html().match(/var url = '([^']+)'/);
        mid = match ? match[1] : '';
      }
    }
    if (!mid) {
      console.debug('HubCloud: no intermediate link for', url);
      return streams;
    }
    if (!mid.startsWith('http')) mid = base + mid;

    // Step 2: load download page
    const res2 = await fetch(mid, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    const html2 = await res2.text();
    const $2 = cheerio.load(html2);
    const filename = $2('div.card-header').text().trim() || '';
    const size = $2('i#size').text().trim() || '';

    // Step 3: ONLY FSL / FSLv2 buttons
    $2('h2 a.btn').each((i, btn) => {
      const label = $(btn).text().trim();
      const href = $(btn).attr('href')?.trim();
      if (!href) return;
      if (label.includes('FSL Server')) {
        streams.push({ server: 'FSL', url: href, filename, size });
        console.log(`  ✓ HubCloud FSL  → ${href.substring(0,80)}`);
      } else if (/FSL\s*[Vv]2|FSLv2/i.test(label)) {
        streams.push({ server: 'FSLv2', url: href, filename, size });
        console.log(`  ✓ HubCloud FSLv2 → ${href.substring(0,80)}`);
      } else {
        console.debug(`  ✗ HubCloud skip  [${label}]`);
      }
    });
  } catch (e) {
    console.error('HubCloud error:', e);
  }
  return streams;
}

// ─────────────────────────────────────────────
// GDFLIX EXTRACTOR (FSL V2 only)
// ─────────────────────────────────────────────
async function extractGdflix(session, url) {
  const streams = [];
  try {
    let base = origin(url);
    const liveBase = await dynBase('gdflix', base);
    url = url.replace(base, liveBase);

    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    const html = await res.text();
    const $ = cheerio.load(html);

    let filename = '', size = '';
    $('li.list-group-item').each((i, el) => {
      const text = $(el).text().trim();
      if (text.startsWith('Name')) filename = text.replace(/^Name\s*:\s*/, '').trim();
      else if (text.startsWith('Size')) size = text.replace(/^Size\s*:\s*/, '').trim();
    });

    $('div.text-center a[href]').each((i, a) => {
      const label = $(a).text().trim();
      const href = $(a).attr('href')?.trim();
      if (!href) return;
      if (/FSL\s*V2|FSLv2|FSLV2/i.test(label)) {
        streams.push({ server: 'FSLv2', url: href, filename, size });
        console.log(`  ✓ GDFlix FSLv2 → ${href.substring(0,80)}`);
      } else {
        console.debug(`  ✗ GDFlix skip  [${label}]`);
      }
    });
  } catch (e) {
    console.error('GDFlix error:', e);
  }
  return streams;
}

// ─────────────────────────────────────────────
// MASTER STREAM RESOLVER – EXPORTED FUNCTION
// ─────────────────────────────────────────────
async function getStreams(tmdbId, mediaType = "movie", season = null, episode = null) {
  console.log(`[MoviesDrive] Fetching streams for TMDB ID: ${tmdbId}, Type: ${mediaType}`);
  const type = mediaType;

  // 0. Warm up dynamic URLs
  await fetchDynamicUrls();

  // 1. Resolve title via Cinemeta
  const { meta } = await resolveId(null, type, tmdbId);
  if (!meta) {
    console.warn(`No Cinemeta meta for ${type}/${tmdbId}`);
    return [];
  }
  const title = meta.name || meta.title || "";
  const year = String(meta.year || (meta.releaseInfo || "").slice(0,4) || "").trim();
  if (!title) return [];

  console.log(`▶ Searching for: ${title} (${year}) [${type}]`);

  // 2. Get live MovieDrive base URL
  const mdBase = await dynBase('moviesdrive', DEFAULT_MD_URL);

  // 3. Search MoviesDrive
  let query = year ? `${title} ${year}` : title;
  let results = await mdSearch(null, query, mdBase);
  if (!results.length && year) {
    results = await mdSearch(null, title, mdBase);
  }
  const match = pickBest(results, title, year);
  if (!match) {
    console.warn(`No usable match for '${title}'`);
    return [];
  }
  console.log(`✔ Selected: ${match.title}  →  ${match.url}`);

  // 4. Collect source URLs
  let sources;
  if (type === "series" && season !== null && season > 0) {
    sources = await collectEpisodeSources(null, match.url, season, episode);
  } else {
    sources = await collectMovieSources(null, match.url);
  }
  if (!sources.length) {
    console.warn('No sources found on page:', match.url);
    return [];
  }
  console.log(`Found ${sources.length} raw source URL(s) to extract`);

  // 5. Extract FSL/FSLv2
  const extractTasks = sources.map(src => {
    if (SRC_RE.test(src)) {
      if (/hubcloud|vcloud/i.test(src)) return extractHubcloud(null, src);
      else return extractGdflix(null, src);
    }
    return [];
  });
  const resultsNested = await Promise.allSettled(extractTasks);
  const rawStreams = [];
  for (const r of resultsNested) {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) rawStreams.push(...r.value);
  }

  // 6. Deduplicate by URL
  const seen = new Set();
  const unique = rawStreams.filter(s => {
    if (seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
  console.log(`Total FSL/FSLv2 streams found: ${unique.length}`);

  // 7. Build final stream objects (like dooflix)
  return unique.map(s => {
    const { name, desc } = streamDescription(s.filename, s.size, s.server);
    return {
      name: name,
      title: desc,
      url: s.url,
      quality: qualityLabel(s.filename),
      headers: {
        "Referer": "https://new2.moviesdrives.my/",   // common referer
        "User-Agent": HEADERS["User-Agent"]
      },
      provider: "moviesdrive"
    };
  });
}

module.exports = { getStreams };
