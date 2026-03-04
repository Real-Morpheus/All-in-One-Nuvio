const PROVIDER_NAME = "Domty";

const HEADERS = {
  "User-Agent": "Mozilla/5.0",
  "Accept-Language": "en-US,en;q=0.9"
};

async function httpGet(url, referer) {
  const res = await fetch(url, {
    headers: {
      ...HEADERS,
      ...(referer ? { Referer: referer } : {})
    }
  });

  if (!res.ok) throw new Error("HTTP " + res.status);
  return await res.text();
}

function extractLinks(html) {

  const links = new Set();

  const patterns = [
    /(https?:\/\/[^"' ]+\.m3u8[^"' ]*)/gi,
    /(https?:\/\/[^"' ]+\.mp4[^"' ]*)/gi,
    /(https?:\/\/[^"' ]+\/embed\/[^"' ]*)/gi,
    /(https?:\/\/[^"' ]+\/player[^"' ]*)/gi
  ];

  patterns.forEach(r => {
    let m;
    while ((m = r.exec(html)) !== null) {
      links.add(m[1]);
    }
  });

  return [...links];
}

function extractIframes(html) {

  const frames = [];
  const re = /<iframe[^>]+src=["']([^"']+)["']/gi;

  let m;

  while ((m = re.exec(html)) !== null) {
    if (m[1].startsWith("http")) frames.push(m[1]);
  }

  return frames;
}

async function getFromPage(url) {

  try {

    const html = await httpGet(url);

    let links = extractLinks(html);

    if (links.length) return links;

    const frames = extractIframes(html);

    for (const f of frames.slice(0, 5)) {
      try {
        const inner = await httpGet(f, url);
        links = links.concat(extractLinks(inner));
      } catch {}
    }

    return links;

  } catch {
    return [];
  }
}

const SOURCES = [
  "https://wecima.movie",
  "https://mycima.cc",
  "https://akwam.to",
  "https://faselhd.watch"
];

async function searchSite(base, query) {

  try {

    const url = `${base}/search/${encodeURIComponent(query)}`;

    const html = await httpGet(url, base);

    const results = [];

    const re = /<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*>(.*?)<\/a>/gi;

    let m;

    while ((m = re.exec(html)) !== null) {

      const link = m[1];
      const text = m[2].replace(/<[^>]+>/g, "").trim();

      if (text && link.includes(base))
        results.push(link);
    }

    return results.slice(0, 3);

  } catch {
    return [];
  }
}

async function getStreams(tmdbId, type, season, episode) {

  console.log("[DOMTY] Start", tmdbId);

  const streams = [];

  const query =
    type === "tv"
      ? `${tmdbId} season ${season} episode ${episode}`
      : tmdbId;

  for (const site of SOURCES) {

    const results = await searchSite(site, query);

    for (const r of results) {

      const links = await getFromPage(r);

      links.forEach(l => {
        streams.push({
          name: "Domty",
          url: l,
          quality: "HD",
          headers: { Referer: r }
        });
      });
    }
  }

  return streams;
}

module.exports = {
  name: PROVIDER_NAME,
  getStreams
};
