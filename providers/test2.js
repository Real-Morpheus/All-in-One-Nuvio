const https = require("https");

// Force IPv4
const agent = new https.Agent({ family: 4 });

// OPTIONAL proxy (leave null if not using)
const PROXY = null;
// To use proxy:
// const { HttpsProxyAgent } = require("https-proxy-agent");
// const PROXY = new HttpsProxyAgent("http://user:pass@host:port");

// Improved headers
var HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  "Accept": "*/*",
  "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
  "Origin": "https://allmovieland.io",
  "Referer": "https://allmovieland.io/",
  "Connection": "keep-alive",
  "sec-ch-ua": '"Chromium";v="120", "Google Chrome";v="120", "Not:A-Brand";v="99"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin"
};

// Safe fetch wrapper
async function safeFetch(url, options = {}) {
  await new Promise(r => setTimeout(r, 400));

  const finalOptions = {
    ...options,
    headers: {
      ...HEADERS,
      ...(options.headers || {})
    },
    agent: PROXY || agent
  };

  const res = await fetch(url, finalOptions);

  if (!res.ok) {
    console.log("[Fetch Blocked]", url, res.status);
  }

  return res;
}

// ===== ORIGINAL CODE BELOW (UNCHANGED LOGIC) =====

const cheerio = require("cheerio-without-node-native");

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const MAIN_URL = "https://allmovieland.io";

async function getTMDBDetails(tmdbId, mediaType) {
  const endpoint = mediaType === "tv" ? "tv" : "movie";
  const url = `${TMDB_BASE_URL}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;

  const response = await safeFetch(url, {
    method: "GET",
    headers: { "Accept": "application/json" }
  });

  const data = await response.json();

  const title = mediaType === "tv" ? data.name : data.title;
  const releaseDate = mediaType === "tv" ? data.first_air_date : data.release_date;
  const year = releaseDate ? parseInt(releaseDate.split("-")[0]) : null;

  return { title, year, imdbId: data.external_ids?.imdb_id || null, data };
}

function normalizeTitle(title) {
  return title.toLowerCase()
    .replace(/\b(the|a|an)\b/g, "")
    .replace(/[:\-_]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "")
    .trim();
}

function calculateTitleSimilarity(a, b) {
  const w1 = normalizeTitle(a).split(" ");
  const w2 = normalizeTitle(b).split(" ");
  const set2 = new Set(w2);
  const intersection = w1.filter(w => set2.has(w));
  return intersection.length / new Set([...w1, ...w2]).size;
}

function findBestTitleMatch(mediaInfo, results) {
  let best = null, score = 0;

  for (const r of results) {
    let s = calculateTitleSimilarity(mediaInfo.title, r.title);
    if (mediaInfo.year && r.year) {
      const diff = Math.abs(mediaInfo.year - r.year);
      if (diff === 0) s += 0.2;
    }
    if (s > score && s > 0.3) {
      score = s;
      best = r;
    }
  }
  return best;
}

async function getStreams(tmdbId, mediaType = "movie", season = null, episode = null) {
  try {
    const mediaInfo = await getTMDBDetails(tmdbId, mediaType);

    const searchUrl = `${MAIN_URL}/index.php?story=${encodeURIComponent(mediaInfo.title)}&do=search&subaction=search`;
    const res = await safeFetch(searchUrl);
    const html = await res.text();

    const $ = cheerio.load(html);
    const results = [];

    $("article.short-mid").each((i, el) => {
      const title = $(el).find("h3").text();
      const href = $(el).find("a").attr("href");
      const year = (title.match(/\d{4}/) || [])[0];
      results.push({ title, href, year: parseInt(year) });
    });

    const best = findBestTitleMatch(mediaInfo, results);
    if (!best) return [];

    const doc = await (await safeFetch(best.href)).text();
    const $$ = cheerio.load(doc);

    const script = $$("div.tabs__content script").html() || "";

    const domain = (script.match(/AwsIndStreamDomain\s*=\s*'([^']+)/) || [])[1];
    const id = (script.match(/src:\s*'([^']+)/) || [])[1];

    if (!domain || !id) return [];

    const embed = await (await safeFetch(`${domain}/play/${id}`, {
      headers: { Referer: best.href }
    })).text();

    const $$$ = cheerio.load(embed);
    const lastScript = $$$("body script").last().html() || "";

    const jsonMatch = lastScript.match(/let\s+p3\s*=\s*(\{.*\});/);
    if (!jsonMatch) return [];

    const json = JSON.parse(jsonMatch[1]);

    const fileRes = await safeFetch(json.file, {
      method: "POST",
      headers: { "X-CSRF-TOKEN": json.key }
    });

    const data = JSON.parse((await fileRes.text()).replace(/,\]/g, "]"));

    const streams = [];

    for (const f of data) {
      if (!f.file) continue;

      const res = await safeFetch(`${domain}/playlist/${f.file}.txt`, {
        method: "POST",
        headers: { "X-CSRF-TOKEN": json.key }
      });

      const url = (await res.text()).trim();

      if (url.startsWith("http")) {
        streams.push({
          name: "AllMovieLand",
          url
        });
      }
    }

    return streams;

  } catch (e) {
    console.log("ERROR:", e.message);
    return [];
  }
}

module.exports = { getStreams };
