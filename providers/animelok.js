/**
 * Animelok - 2026 REST API Fix
 * Built for Nuvio/Stremio Providers
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
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

async function search(query) {
  try {
    // 2026 Search uses the keyword parameter with a fallback to API search
    const searchUrl = `${BASE_URL}/api/v1/animelok/search?q=${encodeURIComponent(query)}`;
    const res = await fetch(searchUrl, { headers: { "User-Agent": USER_AGENT } });
    const data = await res.json();
    
    // Map API results to the format the app expects
    return data.results ? data.results.map(i => ({ title: i.title, id: i.id, type: "tv" })) : [];
  } catch (e) {
    // Fallback to HTML scraping if API fails
    const htmlRes = await fetch(`${BASE_URL}/search?keyword=${encodeURIComponent(query)}`);
    const html = await htmlRes.text();
    const $ = cheerio.load(html);
    const results = [];
    $("a[href*='/anime/']").each((i, el) => {
      const title = $(el).find("h3, .title").text().trim();
      const href = $(el).attr("href");
      if (href && title) results.push({ title, id: href.split("/").pop(), type: "tv" });
    });
    return results;
  }
}

async function getStreams(id, type, season, episode) {
  return __async(this, null, function* () {
    let slug = id;

    // Fix: If TMDB ID is passed, we MUST get the local slug first
    if (/^\d+$/.test(id)) {
      const searchRes = yield search(id);
      if (searchRes.length > 0) slug = searchRes[0].id;
    }

    try {
      // The 2026 Endpoint: /api/v1/animelok/watch/{slug}?ep={num}
      const apiUrl = `${BASE_URL}/api/v1/animelok/watch/${slug}?ep=${episode}`;
      
      const response = yield fetch(apiUrl, {
        headers: {
          "Referer": `${BASE_URL}/watch/${slug}`,
          "User-Agent": USER_AGENT,
          "Accept": "application/json"
        }
      });

      const data = yield response.json();
      const sources = data.sources || data.servers || [];
      const streams = [];

      for (const s of sources) {
        let streamUrl = s.url || s.link;
        if (!streamUrl) continue;

        // Apply Provider-Specific Security bypasses
        let headers = { "User-Agent": USER_AGENT, "Referer": BASE_URL };

        if (streamUrl.includes("kwik.cx")) {
          // Kwik links require the exact domain referer to not 403
          headers["Referer"] = "https://kwik.cx/";
        } else if (streamUrl.includes("anvod") || streamUrl.includes("anixl")) {
          // Anvod needs the Origin to match the site
          headers["Origin"] = BASE_URL;
        }

        streams.push({
          name: `Animelok - ${s.name || "Auto"}`,
          url: streamUrl,
          type: streamUrl.includes(".m3u8") ? "hls" : "mp4",
          quality: "Auto",
          headers: headers
        });
      }

      return streams;
    } catch (e) {
      console.error("[Animelok] Failed to pull links:", e.message);
      return [];
    }
  });
}

module.exports = { search, getStreams };
