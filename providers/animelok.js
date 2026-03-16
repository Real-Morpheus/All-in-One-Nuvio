/**
 * Animelok Provider - Session-Pinned Version (2026)
 * Optimized for Hell's Paradise / Nuvio
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

async function getStreams(id, type, season, episode) {
  return __async(this, null, function* () {
    try {
      // Step 1: Initialize Session
      const initRes = yield fetch(BASE_URL, { headers: { "User-Agent": USER_AGENT } });
      const baseCookie = initRes.headers.get("set-cookie") || "";

      // Step 2: Visit Hell's Paradise Watch Page
      const watchUrl = `${BASE_URL}/watch/${id}?ep=${episode}`;
      const pageRes = yield fetch(watchUrl, { 
        headers: { 
          "User-Agent": USER_AGENT, 
          "Cookie": baseCookie,
          "Referer": BASE_URL 
        } 
      });
      
      const html = yield pageRes.text();
      const sessionCookie = pageRes.headers.get("set-cookie") || baseCookie;

      // Extract the Hidden API Keys
      const csrfToken = html.match(/"csrf-token"\s*content="([^"]+)"/)?.[1] || "";
      const internalId = html.match(/data-id="(\d+)"/)?.[1];

      if (!internalId) return [];

      // Step 3: Hit the AJAX source with the FULL session identity
      const apiUrl = `${BASE_URL}/api/source/${internalId}`;
      const response = yield fetch(apiUrl, {
        method: "POST",
        headers: {
          "User-Agent": USER_AGENT,
          "Referer": watchUrl,
          "X-CSRF-TOKEN": csrfToken,
          "X-Requested-With": "XMLHttpRequest",
          "Cookie": sessionCookie,
          "Accept": "application/json",
          "Content-Type": "application/x-www-form-urlencoded"
        }
      });

      const data = yield response.json();
      const servers = data.servers || data.data?.servers || [];
      const streams = [];

      for (const s of servers) {
        let streamUrl = s.url || s.link;
        if (!streamUrl) continue;

        streams.push({
          name: `Animelok: ${s.name || "Main"}`,
          url: streamUrl,
          type: streamUrl.includes(".m3u8") ? "hls" : "mp4",
          headers: { 
            "User-Agent": USER_AGENT, 
            "Referer": "https://kwik.cx/", // Spoofing the Kwik referer directly
            "Origin": BASE_URL 
          }
        });
      }

      return streams;
    } catch (e) {
      return [];
    }
  });
}

module.exports = { getStreams };
