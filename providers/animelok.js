/**
 * Animelok - Ultimate 2026 "Deep Scrape" Provider
 * Features: CSRF Token Injection, Session Sync, Multi-CDN Header Support
 */
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => { try { step(generator.next(value)); } catch (e) { reject(e); } };
    var rejected = (value) => { try { step(generator.throw(value)); } catch (e) { reject(e); } };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

var cheerio = require("cheerio-without-node-native");
var BASE_URL = "https://animelok.site";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function search(query) {
  try {
    const searchUrl = `${BASE_URL}/search?keyword=${encodeURIComponent(query)}`;
    const res = await fetch(searchUrl, { headers: { "User-Agent": USER_AGENT } });
    const html = await res.text();
    const $ = cheerio.load(html);
    const results = [];

    // Target modern 2026 anime card selectors
    $("a[href*='/anime/']").each((i, el) => {
      const title = $(el).find("h3, .title, .font-bold").first().text().trim();
      const href = $(el).attr("href");
      if (href && title) {
        const id = href.split("/").pop().split("?")[0];
        results.push({ title, id, type: "tv" });
      }
    });
    return results;
  } catch (e) { return []; }
}

async function getStreams(id, type, season, episode) {
  return __async(this, null, function* () {
    let slug = id;
    // Map TMDB ID to local Slug if necessary
    if (/^\d+$/.test(id)) {
      const searchRes = yield search(id);
      if (searchRes.length > 0) slug = searchRes[0].id;
    }

    try {
      const watchUrl = `${BASE_URL}/watch/${slug}?ep=${episode}`;
      
      // STEP 1: Establish Session & Scrape the CSRF Token
      // This is the "Key" that stops links from disappearing
      const pageRes = yield fetch(watchUrl, { 
        headers: { "User-Agent": USER_AGENT, "Referer": BASE_URL } 
      });
      const html = yield pageRes.text();
      
      // Look for the CSRF token in meta tags or script variables
      const csrfToken = html.match(/"csrf-token"\s*content="([^"]+)"/)?.[1] || 
                        html.match(/token\s*:\s*"([^"]+)"/)?.[1] || "";

      // Look for the internal Episode ID (some APIs prefer this over the number)
      const internalEpId = html.match(/data-id="(\d+)"/)?.[1];

      // STEP 2: Fetch streams using the verified Token
      const apiUrl = internalEpId 
        ? `${BASE_URL}/api/source/${internalEpId}`
        : `${BASE_URL}/api/anime/${slug}/episodes/${episode}`;

      const response = yield fetch(apiUrl, {
        headers: {
          "User-Agent": USER_AGENT,
          "Referer": watchUrl,
          "X-CSRF-TOKEN": csrfToken,
          "X-Requested-With": "XMLHttpRequest",
          "Accept": "application/json"
        }
      });

      const data = yield response.json();
      const rawServers = data.servers || data.episode?.servers || [];
      const streams = [];

      for (const s of rawServers) {
        let streamUrl = s.url || s.link;
        if (!streamUrl) continue;

        // Apply specialized headers for the CDN domains you found
        let headers = { 
            "User-Agent": USER_AGENT, 
            "Referer": BASE_URL,
            "Origin": BASE_URL 
        };

        // Kwik requires a specific referer or it 403s
        if (streamUrl.includes("kwik.cx")) {
            headers["Referer"] = "https://kwik.cx/";
        }

        streams.push({
          name: `Animelok - ${s.name || "Server"}`,
          url: streamUrl,
          type: streamUrl.includes(".m3u8") ? "hls" : "mp4",
          quality: "Auto",
          headers: headers
        });
      }

      return streams;
    } catch (e) {
      console.error("[Animelok] Stream Fetch Failed:", e.message);
      return [];
    }
  });
}

module.exports = { search, getStreams };
