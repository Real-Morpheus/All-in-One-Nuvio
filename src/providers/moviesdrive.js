/**
 * MoviesDrive – Nuvio Provider  (src/providers/moviesdrive.js)
 * ─────────────────────────────────────────────────────────────
 * Scrapes MoviesDrive via HubCloud / GDFlix for FSL & FSLv2 streams.
 *
 * ✔  async/await is safe here — the build script transpiles this file
 *    to Hermes-compatible generator functions before deployment.
 *
 * API contract (Nuvio):
 *   getStreams(tmdbId, mediaType, season, episode)
 *     tmdbId     – TMDB numeric ID, e.g. "550"
 *     mediaType  – "movie" | "tv"          ← NOTE: "tv", NOT "series"
 *     season     – number | null
 *     episode    – number | null
 */

// ── Constants ─────────────────────────────────────────────────────────────────
const GITHUB_URLS_JSON = "https://raw.githubusercontent.com/SaurabhKaperwan/Utils/refs/heads/main/urls.json";
const CINEMETA_BASE    = "https://v3-cinemeta.strem.io";
const DEFAULT_MD_URL   = "https://new2.moviesdrives.my";

const HEADERS = {
  "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept":          "text/html,application/xhtml+xml,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9"
};

const FUZZY_THRESHOLD = 58;
const SRC_RE          = /hubcloud|gdflix|gdlink/i;

// ── Dynamic URL cache ─────────────────────────────────────────────────────────
let _dynUrls    = {};
let _dynFetched = false;

async function fetchDynamicUrls() {
  if (_dynFetched) return _dynUrls;
  try {
    const res = await fetch(GITHUB_URLS_JSON, { signal: AbortSignal.timeout(5000) });
    _dynUrls    = await res.json();
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

function qualityLabel(str) {
  if (!str) return "?";
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
  ["Hindi",      /\bhin(di)?\b/i],
  ["English",    /\beng(lish)?\b/i],
  ["Tamil",      /\btam(il)?\b/i],
  ["Telugu",     /\btel(ugu)?\b/i],
  ["Malayalam",  /\bmal(ayalam)?\b/i],
  ["Kannada",    /\bkan(nada)?\b/i],
  ["Bengali",    /\bben(gali)?\b/i],
  ["Punjabi",    /\bpun(jabi)?\b/i],
  ["Dual Audio", /\bdual\b/i],
  ["Multi",      /\bmulti\b/i]
];

function audioLangs(filename) {
  if (!filename) return "Unknown";
  const found = LANG_PATTERNS
    .filter(function(p) { return p[1].test(filename); })
    .map(function(p) { return p[0]; });
  return found.length ? found.join(" + ") : "Unknown";
}

function buildStreamMeta(filename, size, server) {
  const q  = qualityLabel(filename);
  const au = audioLangs(filename);
  const sz = (size || "").trim() || "?";
  return {
    name:  "\uD83C\uDFAC MoviesDrive | " + server,
    title: "\uD83D\uDCC1 " + filename + "\n\uD83C\uDF9E " + q + "  \uD83D\uDCE6 " + sz + "  \uD83C\uDFB5 " + au
  };
}

function tokenSetRatio(a, b) {
  function toks(s) {
    return new Set(
      s.replace(/[^\w\s]/g, " ").toLowerCase().split(/\s+/).filter(Boolean)
    );
  }
  const setA = toks(a);
  const setB = toks(b);
  if (!setA.size || !setB.size) return 0;
  let inter = 0;
  setA.forEach(function(x) { if (setB.has(x)) inter++; });
  return Math.round((inter / Math.min(setA.size, setB.size)) * 100);
}

function parseHTML(html) {
  return new DOMParser().parseFromString(html, "text/html");
}

// ── Cinemeta ──────────────────────────────────────────────────────────────────
async function cinemetaMeta(type, id) {
  try {
    const res = await fetch(CINEMETA_BASE + "/meta/" + type + "/" + id + ".json", {
      headers: HEADERS,
      signal:  AbortSignal.timeout(6000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.meta || null;
  } catch (e) {
    console.warn("[MoviesDrive] Cinemeta error (" + type + "/" + id + "):", e.message);
    return null;
  }
}

// ── MoviesDrive search ────────────────────────────────────────────────────────
async function mdSearch(query, base, page) {
  if (!page) page = 1;
  const url = base + "/search.php?q=" + encodeURIComponent(query) + "&page=" + page;
  try {
    const res  = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    const data = JSON.parse(await res.text());
    return (data.hits || []).map(function(hit) {
      const doc = hit.document || {};
      return {
        title:  doc.post_title    || "",
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
  let bestScore = -1;
  let bestItem  = null;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const t = r.title.replace(/\W+/g, " ").trim().toLowerCase();
    let score = tokenSetRatio(clean, t);
    if (year && r.title.includes(year)) score = Math.min(score + 12, 100);
    if (score > bestScore) { bestScore = score; bestItem = r; }
  }
  console.log("[MoviesDrive] Best match (" + bestScore + "%): " + (bestItem ? bestItem.title : "none"));
  if (bestScore < FUZZY_THRESHOLD) {
    console.warn("[MoviesDrive] Score too low (" + bestScore + " < " + FUZZY_THRESHOLD + "), skipping");
    return null;
  }
  return bestItem;
}

// ── Source collection ─────────────────────────────────────────────────────────
async function innerLinks(btnHref) {
  try {
    const res   = await fetch(btnHref, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    const doc   = parseHTML(await res.text());
    const links = [];
    doc.querySelectorAll("a[href]").forEach(function(a) {
      const href = a.getAttribute("href");
      if (href && SRC_RE.test(href)) links.push(href);
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
  console.log("[MoviesDrive] Movie page: " + buttons.length + " quality buttons");

  const settled = await Promise.allSettled(
    buttons.map(function(btn) { return innerLinks(btn.getAttribute("href")); })
  );
  const sources = [];
  for (let i = 0; i < settled.length; i++) {
    if (settled[i].status === "fulfilled") {
      settled[i].value.forEach(function(s) { sources.push(s); });
    }
  }
  return sources;
}

function seasonFromContext(btn) {
  let prev = btn.parentElement ? btn.parentElement.previousElementSibling : null;
  for (let i = 0; i < 6 && prev; i++) {
    const m = prev.textContent.trim().match(/(?:season|S(?:eason)?)\s*(\d+)/i);
    if (m) return parseInt(m[1]);
    prev = prev.previousElementSibling;
  }
  return 0; // unknown → accept all seasons
}

async function parseEpisodePage(html, season, episode) {
  const doc     = parseHTML(html);
  const epPat   = /\bEp(?:isode)?\s*0*(\d+)\b/i;
  const epSpans = Array.from(doc.querySelectorAll("span")).filter(function(s) {
    return epPat.test(s.textContent);
  });
  const sources = [];

  // Strategy A: span-based episode markers
  if (epSpans.length) {
    for (let i = 0; i < epSpans.length; i++) {
      const span = epSpans[i];
      const m = span.textContent.match(epPat);
      if (!m || parseInt(m[1]) !== episode) continue;
      let sib = span.parentElement ? span.parentElement.nextElementSibling : null;
      while (sib) {
        if (!/(hubcloud|gdflix|gdlink)/.test(sib.textContent.toLowerCase())) break;
        const a = sib.querySelector("a[href]");
        if (a) {
          const href = a.getAttribute("href");
          if (href && SRC_RE.test(href)) sources.push(href);
        }
        sib = sib.nextElementSibling;
      }
    }
    if (sources.length) return sources;
  }

  // Strategy B: sequential anchors (index = episode - 1)
  const anchors = Array.from(doc.querySelectorAll("a[href]")).filter(function(a) {
    return SRC_RE.test(a.getAttribute("href"));
  });
  const idx = episode - 1;
  if (idx >= 0 && idx < anchors.length) {
    sources.push(anchors[idx].getAttribute("href"));
  } else {
    console.warn("[MoviesDrive] Ep" + episode + " out of range (" + anchors.length + " anchors)");
  }
  return sources;
}

async function collectEpisodeSources(pageUrl, season, episode) {
  const res     = await fetch(pageUrl, { headers: HEADERS, signal: AbortSignal.timeout(12000) });
  const doc     = parseHTML(await res.text());
  const allBtns = Array.from(doc.querySelectorAll("h5 > a")).filter(function(btn) {
    return !btn.textContent.toLowerCase().includes("zip");
  });

  const matching = allBtns.filter(function(btn) {
    const detected = seasonFromContext(btn);
    return detected === 0 || detected === season;
  });
  console.log("[MoviesDrive] S" + season + "E" + episode + ": " + matching.length + " button(s) after season filter");

  const settled = await Promise.allSettled(
    matching.map(async function(btn) {
      const href = btn.getAttribute("href");
      if (!href) return [];
      const res2 = await fetch(href, { headers: HEADERS, signal: AbortSignal.timeout(12000) });
      return parseEpisodePage(await res2.text(), season, episode);
    })
  );

  const sources = [];
  for (let i = 0; i < settled.length; i++) {
    if (settled[i].status === "fulfilled") {
      settled[i].value.forEach(function(s) { sources.push(s); });
    }
  }
  return [...new Set(sources)];
}

// ── HubCloud extractor ────────────────────────────────────────────────────────
async function extractHubcloud(rawUrl) {
  const streams = [];
  try {
    let base       = getOrigin(rawUrl);
    const srcKey   = rawUrl.includes("hubcloud") ? "hubcloud" : "vcloud";
    const liveBase = await dynBase(srcKey, base);
    let url        = rawUrl.replace(base, liveBase);
    base           = liveBase;

    // Step 1 – get intermediate link
    const res1 = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    const doc1 = parseHTML(await res1.text());
    let mid    = "";

    if (url.includes("/video/")) {
      const el = doc1.querySelector("div.vd > center > a");
      mid = el ? (el.getAttribute("href") || "") : "";
    } else {
      const scripts = doc1.querySelectorAll("script");
      for (let i = 0; i < scripts.length; i++) {
        const m = scripts[i].textContent.match(/var url = '([^']+)'/);
        if (m) { mid = m[1]; break; }
      }
    }

    if (!mid) {
      console.debug("[MoviesDrive] HubCloud: no intermediate link for", url);
      return streams;
    }
    if (!mid.startsWith("http")) mid = base + mid;

    // Step 2 – download page with FSL buttons
    const res2   = await fetch(mid, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    const doc2   = parseHTML(await res2.text());
    const hdrEl  = doc2.querySelector("div.card-header");
    const sizeEl = doc2.querySelector("i#size");
    const filename = hdrEl  ? hdrEl.textContent.trim()  : "";
    const size     = sizeEl ? sizeEl.textContent.trim()  : "";

    doc2.querySelectorAll("h2 a.btn").forEach(function(btn) {
      const label = btn.textContent.trim();
      const href  = btn.getAttribute("href");
      if (!href) return;
      const h = href.trim();
      if (label.includes("FSL Server")) {
        streams.push({ server: "FSL", url: h, filename: filename, size: size });
        console.log("  \u2713 HubCloud FSL  \u2192 " + h.substring(0, 80));
      } else if (/FSL\s*[Vv]2|FSLv2/i.test(label)) {
        streams.push({ server: "FSLv2", url: h, filename: filename, size: size });
        console.log("  \u2713 HubCloud FSLv2 \u2192 " + h.substring(0, 80));
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
    const url      = rawUrl.replace(getOrigin(rawUrl), liveBase);

    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    const doc = parseHTML(await res.text());

    let filename = "";
    let size     = "";
    doc.querySelectorAll("li.list-group-item").forEach(function(li) {
      const txt = li.textContent.trim();
      if (txt.startsWith("Name"))      filename = txt.replace(/^Name\s*:\s*/, "").trim();
      else if (txt.startsWith("Size")) size     = txt.replace(/^Size\s*:\s*/, "").trim();
    });

    doc.querySelectorAll("div.text-center a[href]").forEach(function(a) {
      const label = a.textContent.trim();
      const href  = a.getAttribute("href");
      if (!href) return;
      if (/FSL\s*V2|FSLv2|FSLV2/i.test(label)) {
        streams.push({ server: "FSLv2", url: href.trim(), filename: filename, size: size });
        console.log("  \u2713 GDFlix FSLv2 \u2192 " + href.substring(0, 80));
      }
    });
  } catch (e) {
    console.error("[MoviesDrive] GDFlix error:", e.message);
  }
  return streams;
}

// ── Main entry point ──────────────────────────────────────────────────────────
/**
 * @param {string}      tmdbId    – TMDB numeric ID
 * @param {string}      mediaType – "movie" | "tv"
 * @param {number|null} season
 * @param {number|null} episode
 * @returns {Promise<Array>}
 */
async function getStreams(tmdbId, mediaType, season, episode) {
  console.log("[MoviesDrive] getStreams \u2192 id=" + tmdbId + " type=" + mediaType + " S=" + season + " E=" + episode);

  // 1. Warm dynamic URL cache
  await fetchDynamicUrls();

  // 2. Map Nuvio's "tv" → Cinemeta's "series"
  const cineType = (mediaType === "tv") ? "series" : "movie";

  // 3. Resolve title via Cinemeta
  const meta = await cinemetaMeta(cineType, "tmdb:" + tmdbId);
  if (!meta) {
    console.warn("[MoviesDrive] No Cinemeta meta for " + cineType + "/" + tmdbId);
    return [];
  }

  const title = ((meta.name || meta.title) || "").trim();
  const year  = String(meta.year || (meta.releaseInfo || "").slice(0, 4) || "").trim();
  if (!title) return [];
  console.log("[MoviesDrive] Resolved: \"" + title + "\" (" + year + ")");

  // 4. Live base URL for MoviesDrive
  const mdBase = await dynBase("moviesdrive", DEFAULT_MD_URL);

  // 5. Search (with year first, then without as fallback)
  let results = await mdSearch(year ? title + " " + year : title, mdBase);
  if (!results.length && year) results = await mdSearch(title, mdBase);

  const match = pickBest(results, title, year);
  if (!match) {
    console.warn("[MoviesDrive] No usable match for \"" + title + "\"");
    return [];
  }
  console.log("[MoviesDrive] Selected: \"" + match.title + "\" \u2192 " + match.url);

  // 6. Collect source URLs from the matched page
  let sourceUrls;
  if (mediaType === "tv" && season > 0) {
    sourceUrls = await collectEpisodeSources(match.url, season, episode);
  } else {
    sourceUrls = await collectMovieSources(match.url);
  }

  if (!sourceUrls.length) {
    console.warn("[MoviesDrive] No source URLs on page:", match.url);
    return [];
  }
  console.log("[MoviesDrive] " + sourceUrls.length + " raw source URL(s) to extract");

  // 7. Extract FSL / FSLv2 playback links
  const extractSettled = await Promise.allSettled(
    sourceUrls.map(function(src) {
      if (!SRC_RE.test(src)) return Promise.resolve([]);
      return /hubcloud|vcloud/i.test(src) ? extractHubcloud(src) : extractGdflix(src);
    })
  );

  const raw = [];
  for (let i = 0; i < extractSettled.length; i++) {
    if (extractSettled[i].status === "fulfilled") {
      extractSettled[i].value.forEach(function(s) { raw.push(s); });
    }
  }

  // 8. Deduplicate by URL
  const seen   = new Set();
  const unique = raw.filter(function(s) {
    if (seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
  console.log("[MoviesDrive] Final stream count: " + unique.length);

  // 9. Map to Nuvio stream objects
  return unique.map(function(s) {
    const sm = buildStreamMeta(s.filename, s.size, s.server);
    return {
      name:    sm.name,
      title:   sm.title,
      url:     s.url,
      quality: qualityLabel(s.filename),
      headers: {
        Referer:      DEFAULT_MD_URL + "/",
        "User-Agent": HEADERS["User-Agent"]
      }
    };
  });
}

// ── Export (React Native + Node compatible) ───────────────────────────────────
if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
