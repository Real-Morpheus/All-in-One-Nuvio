/**
 * MoviesDrive – Nuvio Plugin
 * Scrapes MoviesDrive via HubCloud / GDFlix for FSL/FSLv2 streams.
 *
 * Compatible with: Nuvio plugin API (getStreams export)
 * Dependencies: none (uses built-in fetch + DOMParser)
 */

// ── Constants ────────────────────────────────────────────────────────────────
const GITHUB_URLS_JSON = "https://raw.githubusercontent.com/SaurabhKaperwan/Utils/refs/heads/main/urls.json";
const CINEMETA_BASE    = "https://v3-cinemeta.strem.io";
const DEFAULT_MD_URL   = "https://new2.moviesdrives.my";

const HEADERS = {
  "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept":          "text/html,application/xhtml+xml,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9"
};

const FUZZY_THRESHOLD = 58;
const SRC_RE = /hubcloud|gdflix|gdlink/i;

// ── Plugin Manifest ───────────────────────────────────────────────────────────
const MANIFEST = {
  id:          "community.moviesdrive",
  name:        "MoviesDrive",
  version:     "1.0.0",
  description: "Streams movies and TV series from MoviesDrive via HubCloud / GDFlix (FSL & FSLv2 servers).",
  logo:        "https://new2.moviesdrives.my/favicon.ico",
  tags:        ["movies", "series", "hindi", "dubbed", "4k"],
  external:    false,
  types:       ["movie", "series"],
  catalogs:    []
};

// ── Dynamic URL cache ─────────────────────────────────────────────────────────
let _dynUrls   = {};
let _dynFetched = false;

async function fetchDynamicUrls() {
  if (_dynFetched) return _dynUrls;
  try {
    const res  = await fetch(GITHUB_URLS_JSON, { signal: AbortSignal.timeout(5000) });
    _dynUrls   = await res.json();
    _dynFetched = true;
    console.log("[MoviesDrive] Dynamic URLs loaded:", Object.keys(_dynUrls));
  } catch (e) {
    console.warn("[MoviesDrive] Could not load dynamic URLs:", e.message);
  }
  return _dynUrls;
}

async function dynBase(key, fallback) {
  const urls = await fetchDynamicUrls();
  return urls[key] || fallback;
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function getOrigin(url) {
  return new URL(url).origin;
}

function qualityLabel(str = "") {
  const m = str.match(/(\d{3,4})p/i);
  if (m) return m[1] + "p";
  const lo = str.toLowerCase();
  if (lo.includes("8k"))   return "4320p";
  if (lo.includes("4k"))   return "2160p";
  if (lo.includes("2k"))   return "1440p";
  if (lo.includes("1080")) return "1080p";
  if (lo.includes("720"))  return "720p";
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
  ["Dual Audio", /\bdual\b/i],
  ["Multi",     /\bmulti\b/i]
];

function audioLangs(filename = "") {
  const found = LANG_PATTERNS
    .filter(([, re]) => re.test(filename))
    .map(([name]) => name);
  return found.length ? found.join(" + ") : "Unknown";
}

function buildStreamMeta(filename, size, server) {
  const q  = qualityLabel(filename);
  const au = audioLangs(filename);
  const sz = size?.trim() || "?";
  return {
    name:  `🎬 MoviesDrive | ${server}`,
    title: `📁 ${filename}\n🎞 ${q}  📦 ${sz}  🎵 ${au}`
  };
}

function tokenSetRatio(a, b) {
  const toks = s => new Set(
    s.replace(/[^\w\s]/g, " ").toLowerCase().split(/\s+/).filter(Boolean)
  );
  const setA = toks(a);
  const setB = toks(b);
  if (!setA.size || !setB.size) return 0;
  const inter = [...setA].filter(x => setB.has(x)).length;
  return Math.round((inter / Math.min(setA.size, setB.size)) * 100);
}

function parseHTML(html) {
  return new DOMParser().parseFromString(html, "text/html");
}

// ── Cinemeta ──────────────────────────────────────────────────────────────────
async function cinemetaMeta(type, id) {
  try {
    const res  = await fetch(`${CINEMETA_BASE}/meta/${type}/${id}.json`, {
      headers: HEADERS,
      signal:  AbortSignal.timeout(6000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.meta || null;
  } catch (e) {
    console.warn(`[MoviesDrive] Cinemeta error (${type}/${id}):`, e.message);
    return null;
  }
}

// ── MoviesDrive search ────────────────────────────────────────────────────────
async function mdSearch(query, base, page = 1) {
  const url = `${base}/search.php?q=${encodeURIComponent(query)}&page=${page}`;
  try {
    const res  = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    const data = JSON.parse(await res.text());
    return (data.hits || []).map(hit => {
      const doc = hit.document || {};
      return {
        title:  doc.post_title   || "",
        url:    base + (doc.permalink || ""),
        poster: doc.post_thumbnail || ""
      };
    });
  } catch (e) {
    console.error("[MoviesDrive] Search error:", e.message);
    return [];
  }
}

function pickBest(results, target, year) {
  if (!results.length) return null;
  const clean = target.replace(/\W+/g, " ").trim().toLowerCase();
  let bestScore = -1, bestItem = null;
  for (const r of results) {
    const t = r.title.replace(/\W+/g, " ").trim().toLowerCase();
    let score = tokenSetRatio(clean, t);
    if (year && r.title.includes(year)) score = Math.min(score + 12, 100);
    if (score > bestScore) { bestScore = score; bestItem = r; }
  }
  console.log(`[MoviesDrive] Best match (${bestScore}%): ${bestItem?.title}`);
  if (bestScore < FUZZY_THRESHOLD) {
    console.warn(`[MoviesDrive] Match score too low (${bestScore} < ${FUZZY_THRESHOLD}), skipping`);
    return null;
  }
  return bestItem;
}

// ── Source collection ─────────────────────────────────────────────────────────
async function innerLinks(btnHref) {
  try {
    const res  = await fetch(btnHref, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    const doc  = parseHTML(await res.text());
    const links = [];
    doc.querySelectorAll("a[href]").forEach(a => {
      const href = a.getAttribute("href");
      if (SRC_RE.test(href)) links.push(href);
    });
    return links;
  } catch (e) {
    console.debug("[MoviesDrive] innerLinks error:", e.message);
    return [];
  }
}

async function collectMovieSources(pageUrl) {
  const res     = await fetch(pageUrl, { headers: HEADERS, signal: AbortSignal.timeout(12000) });
  const doc     = parseHTML(await res.text());
  const buttons = Array.from(doc.querySelectorAll("h5 > a"));
  console.log(`[MoviesDrive] Movie page: ${buttons.length} quality buttons`);

  const results = await Promise.allSettled(
    buttons.map(btn => innerLinks(btn.getAttribute("href")))
  );
  const sources = [];
  for (const r of results) {
    if (r.status === "fulfilled") sources.push(...r.value);
  }
  return sources;
}

function seasonFromContext(btn) {
  let prev = btn.parentElement?.previousElementSibling;
  for (let i = 0; i < 6 && prev; i++) {
    const m = prev.textContent.trim().match(/(?:season|S(?:eason)?)\s*(\d+)/i);
    if (m) return parseInt(m[1]);
    prev = prev.previousElementSibling;
  }
  return 0;
}

async function parseEpisodePage(html, season, episode) {
  const doc     = parseHTML(html);
  const epPat   = /\bEp(?:isode)?\s*0*(\d+)\b/i;
  const epSpans = Array.from(doc.querySelectorAll("span")).filter(s => epPat.test(s.textContent));
  const sources = [];

  // Strategy A: span-based
  if (epSpans.length) {
    for (const span of epSpans) {
      const m = span.textContent.match(epPat);
      if (!m || parseInt(m[1]) !== episode) continue;
      let sib = span.parentElement?.nextElementSibling;
      while (sib) {
        const txt = sib.textContent.toLowerCase();
        if (!/(hubcloud|gdflix|gdlink)/.test(txt)) break;
        const a = sib.querySelector("a[href]");
        if (a && SRC_RE.test(a.getAttribute("href"))) {
          sources.push(a.getAttribute("href"));
        }
        sib = sib.nextElementSibling;
      }
    }
    if (sources.length) return sources;
  }

  // Strategy B: sequential anchors
  const anchors = Array.from(doc.querySelectorAll("a[href]"))
    .filter(a => SRC_RE.test(a.getAttribute("href")));
  const idx = episode - 1;
  if (idx >= 0 && idx < anchors.length) {
    sources.push(anchors[idx].getAttribute("href"));
  } else {
    console.warn(`[MoviesDrive] Ep${episode} out of range (${anchors.length} anchors)`);
  }
  return sources;
}

async function collectEpisodeSources(pageUrl, season, episode) {
  const res    = await fetch(pageUrl, { headers: HEADERS, signal: AbortSignal.timeout(12000) });
  const doc    = parseHTML(await res.text());
  const allBtns = Array.from(doc.querySelectorAll("h5 > a"))
    .filter(btn => !btn.textContent.toLowerCase().includes("zip"));

  const matching = allBtns.filter(btn => {
    const detected = seasonFromContext(btn);
    return detected === 0 || detected === season;
  });
  console.log(`[MoviesDrive] S${season}E${episode}: ${matching.length} button(s) after season filter`);

  const results = await Promise.allSettled(
    matching.map(async btn => {
      const href = btn.getAttribute("href");
      if (!href) return [];
      const res2 = await fetch(href, { headers: HEADERS, signal: AbortSignal.timeout(12000) });
      return parseEpisodePage(await res2.text(), season, episode);
    })
  );

  const sources = [];
  for (const r of results) {
    if (r.status === "fulfilled") sources.push(...r.value);
  }
  return [...new Set(sources)];
}

// ── HubCloud extractor ────────────────────────────────────────────────────────
async function extractHubcloud(rawUrl) {
  const streams = [];
  try {
    let base    = getOrigin(rawUrl);
    const srcKey = rawUrl.includes("hubcloud") ? "hubcloud" : "vcloud";
    const liveBase = await dynBase(srcKey, base);
    let url = rawUrl.replace(base, liveBase);
    base    = liveBase;

    // Step 1: intermediate link
    const res1 = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    const doc1 = parseHTML(await res1.text());
    let mid = "";

    if (url.includes("/video/")) {
      mid = doc1.querySelector("div.vd > center > a")?.getAttribute("href") || "";
    } else {
      for (const script of doc1.querySelectorAll("script")) {
        const m = script.textContent.match(/var url = '([^']+)'/);
        if (m) { mid = m[1]; break; }
      }
    }

    if (!mid) return streams;
    if (!mid.startsWith("http")) mid = base + mid;

    // Step 2: download page
    const res2 = await fetch(mid, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    const doc2 = parseHTML(await res2.text());
    const filename = doc2.querySelector("div.card-header")?.textContent.trim() || "";
    const size     = doc2.querySelector("i#size")?.textContent.trim() || "";

    doc2.querySelectorAll("h2 a.btn").forEach(btn => {
      const label = btn.textContent.trim();
      const href  = btn.getAttribute("href")?.trim();
      if (!href) return;
      if (label.includes("FSL Server")) {
        streams.push({ server: "FSL", url: href, filename, size });
      } else if (/FSL\s*[Vv]2|FSLv2/i.test(label)) {
        streams.push({ server: "FSLv2", url: href, filename, size });
      }
    });
  } catch (e) {
    console.error("[MoviesDrive] HubCloud error:", e.message);
  }
  return streams;
}

// ── GDFlix extractor ──────────────────────────────────────────────────────────
async function extractGdflix(rawUrl) {
  const streams = [];
  try {
    const liveBase = await dynBase("gdflix", getOrigin(rawUrl));
    const url = rawUrl.replace(getOrigin(rawUrl), liveBase);

    const res  = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    const doc  = parseHTML(await res.text());

    let filename = "", size = "";
    doc.querySelectorAll("li.list-group-item").forEach(li => {
      const txt = li.textContent.trim();
      if (txt.startsWith("Name")) filename = txt.replace(/^Name\s*:\s*/, "").trim();
      else if (txt.startsWith("Size")) size = txt.replace(/^Size\s*:\s*/, "").trim();
    });

    doc.querySelectorAll("div.text-center a[href]").forEach(a => {
      const label = a.textContent.trim();
      const href  = a.getAttribute("href")?.trim();
      if (!href) return;
      if (/FSL\s*V2|FSLv2|FSLV2/i.test(label)) {
        streams.push({ server: "FSLv2", url: href, filename, size });
      }
    });
  } catch (e) {
    console.error("[MoviesDrive] GDFlix error:", e.message);
  }
  return streams;
}

// ── Main getStreams (Nuvio entry point) ───────────────────────────────────────
/**
 * Called by Nuvio for each stream request.
 *
 * @param {string}      id        - TMDB numeric ID
 * @param {string}      type      - "movie" | "series"
 * @param {number|null} season    - Season number (series only)
 * @param {number|null} episode   - Episode number (series only)
 * @returns {Promise<Array>}      - Array of Nuvio stream objects
 */
async function getStreams(id, type = "movie", season = null, episode = null) {
  console.log(`[MoviesDrive] getStreams → id=${id} type=${type} S=${season} E=${episode}`);

  // 1. Warm dynamic URLs (non-blocking race)
  await fetchDynamicUrls();

  // 2. Resolve title via Cinemeta
  const meta = await cinemetaMeta(type, `tmdb:${id}`);
  if (!meta) {
    console.warn(`[MoviesDrive] No Cinemeta meta for ${type}/${id}`);
    return [];
  }

  const title = (meta.name || meta.title || "").trim();
  const year  = String(meta.year || (meta.releaseInfo || "").slice(0, 4) || "").trim();
  if (!title) return [];
  console.log(`[MoviesDrive] Resolved: "${title}" (${year})`);

  // 3. Live base URL
  const mdBase = await dynBase("moviesdrive", DEFAULT_MD_URL);

  // 4. Search (with year fallback)
  let results = await mdSearch(year ? `${title} ${year}` : title, mdBase);
  if (!results.length && year) results = await mdSearch(title, mdBase);

  const match = pickBest(results, title, year);
  if (!match) {
    console.warn(`[MoviesDrive] No usable match for "${title}"`);
    return [];
  }
  console.log(`[MoviesDrive] Selected: "${match.title}" → ${match.url}`);

  // 5. Collect source URLs from the content page
  let sourceUrls;
  if (type === "series" && season > 0) {
    sourceUrls = await collectEpisodeSources(match.url, season, episode);
  } else {
    sourceUrls = await collectMovieSources(match.url);
  }

  if (!sourceUrls.length) {
    console.warn("[MoviesDrive] No source URLs found on page:", match.url);
    return [];
  }
  console.log(`[MoviesDrive] ${sourceUrls.length} raw source URL(s) to extract`);

  // 6. Extract FSL / FSLv2 links
  const extractResults = await Promise.allSettled(
    sourceUrls.map(src => {
      if (!SRC_RE.test(src)) return Promise.resolve([]);
      return /hubcloud|vcloud/i.test(src) ? extractHubcloud(src) : extractGdflix(src);
    })
  );

  const raw = [];
  for (const r of extractResults) {
    if (r.status === "fulfilled") raw.push(...r.value);
  }

  // 7. Deduplicate by URL
  const seen   = new Set();
  const unique = raw.filter(s => !seen.has(s.url) && seen.add(s.url));
  console.log(`[MoviesDrive] Final stream count: ${unique.length}`);

  // 8. Map to Nuvio stream objects
  return unique.map(s => {
    const meta = buildStreamMeta(s.filename, s.size, s.server);
    return {
      name:     meta.name,
      title:    meta.title,
      url:      s.url,
      quality:  qualityLabel(s.filename),
      headers:  {
        Referer:      `${DEFAULT_MD_URL}/`,
        "User-Agent": HEADERS["User-Agent"]
      },
      provider: "moviesdrive"
    };
  });
}

// ── Exports ───────────────────────────────────────────────────────────────────
module.exports = { MANIFEST, getStreams };
