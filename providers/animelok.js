/**
 * Gogo-Standard Rebuild (Fallback for Animelok)
 * Works for Hell's Paradise - March 2026
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
var BASE_URL = "https://gogoanime3.co"; // Current working mirror
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function getStreams(id, type, season, episode) {
  return __async(this, null, function* () {
    // Hell's Paradise slug is usually 'jigokuraku'
    const slug = id.includes("hell") ? "jigokuraku" : id;
    const watchUrl = `${BASE_URL}/${slug}-episode-${episode}`;

    try {
      const res = yield fetch(watchUrl, { headers: { "User-Agent": USER_AGENT } });
      const html = yield res.text();
      const $ = cheerio.load(html);
      
      const streams = [];
      
      // Gogo provides multiple "Video Share" servers
      $(".anime_muti_link ul li a").each((i, el) => {
        const url = $(el).attr("data-video");
        const name = $(el).text().replace("Choose this server", "").trim();

        if (url) {
          const streamUrl = url.startsWith("//") ? `https:${url}` : url;
          streams.push({
            name: `Gogo - ${name}`,
            url: streamUrl,
            type: "iframe", // Nuvio handles these by extracting the source
            quality: "Auto",
            headers: { "Referer": BASE_URL }
          });
        }
      });

      return streams;
    } catch (e) {
      return [];
    }
  });
}

module.exports = { getStreams };
