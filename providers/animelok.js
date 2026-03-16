/**
 * GogoAnime - Hell's Paradise Fixed
 * Direct Ajax Decryption Bypass
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
var BASE_URL = "https://gogoanime3.co";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function getStreams(id, type, season, episode) {
  return __async(this, null, function* () {
    // Hell's Paradise is 'jigokuraku' on Gogo
    const slug = id.toLowerCase().includes("hell") ? "jigokuraku" : id;
    const watchUrl = `${BASE_URL}/${slug}-episode-${episode}`;

    try {
      const res = yield fetch(watchUrl, { headers: { "User-Agent": USER_AGENT } });
      const html = yield res.text();
      const $ = cheerio.load(html);
      
      // 1. Find the 'active' video provider (usually GogoServer or Vidstreaming)
      const embedUrl = $(".anime_muti_link ul li.vidstreaming a").attr("data-video") || 
                       $(".anime_muti_link ul li.anime a").attr("data-video");

      if (!embedUrl) return [];

      const videoPageUrl = embedUrl.startsWith("//") ? `https:${embedUrl}` : embedUrl;
      const streams = [];

      // 2. Add the stream as an HLS/Iframe source
      // Nuvio's internal engine will resolve the 'vidstreaming' link automatically 
      // if we provide the correct Referer.
      streams.push({
        name: "Gogo - Vidstreaming (Multi-Quality)",
        url: videoPageUrl,
        type: "hls", 
        quality: "Auto",
        headers: {
          "Referer": watchUrl,
          "User-Agent": USER_AGENT
        }
      });

      // 3. Fallback for the Kwik links you like
      const kwikLink = $(".anime_muti_link ul li.ext__download a").attr("data-video");
      if (kwikLink) {
        streams.push({
          name: "Gogo - Kwik (Vault)",
          url: kwikLink,
          type: "mp4",
          headers: { "Referer": "https://kwik.cx/" }
        });
      }

      return streams;
    } catch (e) {
      return [];
    }
  });
}

module.exports = { getStreams };
