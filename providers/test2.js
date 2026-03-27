"use strict";

var PROVIDER_NAME = "OnlyKDrama";
var SITE_URL = "https://onlykdrama.top";
var TMDB_URL = "https://www.themoviedb.org";
var FILEPRESS_ORIGIN = "https://new2.filepress.wiki";
var DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9"
};

// --- HELPER UTILITIES ---

function mergeHeaders(base, extra) {
  return Object.assign({}, base, extra || {});
}

function fetchText(url, options) {
  var request = options || {};
  request.headers = mergeHeaders(DEFAULT_HEADERS, request.headers || {});
  return fetch(url, request).then(function (res) {
    if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
    return res.text();
  });
}

function fetchJson(url, options) {
  var request = options || {};
  request.headers = mergeHeaders(DEFAULT_HEADERS, request.headers || {});
  return fetch(url, request).then(function (res) {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  });
}

function normalizeText(text) {
  return (text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// --- NUVIO BUILDER ---

function buildStream(title, url, quality) {
  return {
    name: PROVIDER_NAME,
    title: title + " [" + (quality || "HD") + "]",
    url: url,
    // CRITICAL for Nuvio: Spoofs the origin so the video isn't blocked
    behaviorHints: {
      notWebReady: true,
      proxyHeaders: {
        "common": {
          "Referer": FILEPRESS_ORIGIN + "/",
          "Origin": FILEPRESS_ORIGIN,
          "User-Agent": DEFAULT_HEADERS["User-Agent"]
        }
      }
    }
  };
}

// --- FILEPRESS RESOLVER (Fixed for 2026) ---

function resolveFilePress(fileId, methods, index) {
  if (index >= methods.length) return Promise.resolve("");
  
  var method = methods[index];
  var headers = {
    "Content-Type": "application/json",
    "Origin": FILEPRESS_ORIGIN,
    "Referer": FILEPRESS_ORIGIN + "/file/" + fileId,
    "X-Requested-With": "XMLHttpRequest"
  };

  // OnlyKDrama/FilePress uses 'downlaod' with a typo
  var apiBase = FILEPRESS_ORIGIN + "/api/file/downlaod"; 

  return fetchJson(apiBase + "/", {
    method: "POST",
    headers: headers,
    body: JSON.stringify({ id: fileId, method: method, captchaValue: "" })
  }).then(function (step1) {
    if (!step1 || !step1.data) return resolveFilePress(fileId, methods, index + 1);

    return fetchJson(apiBase + "2/", {
      method: "POST",
      headers: headers,
      body: JSON.stringify({ id: step1.data, method: method, captchaValue: "" })
    }).then(function (step2) {
      // Check data, url, or redirect fields
      var finalUrl = step2.data || step2.url || step2.redirect || "";
      if (Array.isArray(finalUrl)) finalUrl = finalUrl[0];

      if (finalUrl && finalUrl.startsWith("http")) return finalUrl;
      return resolveFilePress(fileId, methods, index + 1);
    });
  }).catch(function() {
    return resolveFilePress(fileId, methods, index + 1);
  });
}

// --- PAGE SCRAPERS ---

function extractFilePressLinks(html) {
  var regex = /https:\/\/new2\.filepress\.wiki\/file\/([A-Za-z0-9]+)/gi;
  var links = [];
  var match;
  while ((match = regex.exec(html))) {
    links.push({ id: match[1], full: match[0] });
  }
  return links;
}

// --- MAIN ENTRY POINT ---

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    // 1. Get Info from TMDB
    const tmdbHtml = await fetchText(`${TMDB_URL}/${mediaType === "movie" ? "movie" : "tv"}/${tmdbId}`);
    const titleMatch = tmdbHtml.match(/<title>(.*?) \(/i) || tmdbHtml.match(/<title>(.*?) -/i);
    const title = titleMatch ? titleMatch[1].trim() : "";
    
    // 2. Search OnlyKDrama
    const searchUrl = `${SITE_URL}/?s=${encodeURIComponent(title)}`;
    const searchHtml = await fetchText(searchUrl);
    
    // 3. Find the best matching post URL
    const slug = normalizeText(title).replace(/\s+/g, "-");
    const postRegex = new RegExp(`href="(https://onlykdrama\\.top/(movies|drama)/[^"]*${slug}[^"]*)"`, "i");
    const postMatch = searchHtml.match(postRegex);
    const postUrl = postMatch ? postMatch[1] : null;

    if (!postUrl) return [];

    // 4. Fetch the post page to find FilePress links
    const postHtml = await fetchText(postUrl);
    const fpLinks = extractFilePressLinks(postHtml);

    if (fpLinks.length === 0) return [];

    // 5. For TV Shows, try to find the specific episode
    let targetFileId = fpLinks[0].id; 
    if (mediaType !== "movie") {
      const epPattern = new RegExp(`S0?${season}E0?${episode}`, "i");
      const epMatch = fpLinks.find(l => epPattern.test(postHtml.substring(postHtml.indexOf(l.full) - 100, postHtml.indexOf(l.full) + 100)));
      if (epMatch) targetFileId = epMatch.id;
    }

    // 6. Resolve to a direct video link
    const finalLink = await resolveFilePress(targetFileId, ["indexDownlaod", "cloudDownlaod"], 0);
    
    if (!finalLink) return [];
    
    return [buildStream(title, finalLink, "HD")];

  } catch (err) {
    console.error("OnlyKDrama Error:", err);
    return [];
  }
}

module.exports = { getStreams };
