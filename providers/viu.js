const NAME = "viu";

async function extractStream(url) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Referer": "https://vidsrc.to/"
      }
    });

    const html = await res.text();

    const match =
      html.match(/file:\s*"(https:[^"]+\.m3u8[^"]*)"/) ||
      html.match(/"(https:[^"]+\.m3u8[^"]*)"/);

    if (!match) return null;

    return match[1];
  } catch (err) {
    console.log("[viu] extract error:", err.message);
    return null;
  }
}

async function getStreams(tmdbId, type, season, episode) {
  console.log("[viu] getStreams:", tmdbId, type, season, episode);

  try {
    let embed;

    if (type === "movie") {
      embed = `https://vidsrc.to/embed/movie/${tmdbId}`;
    } else {
      const s = season || 1;
      const e = episode || 1;
      embed = `https://vidsrc.to/embed/tv/${tmdbId}/${s}/${e}`;
    }

    const stream = await extractStream(embed);

    if (!stream) {
      console.log("[viu] no stream found");
      return [];
    }

    return [
      {
        name: NAME,
        title: "VidSrc",
        url: stream,
        quality: "auto",
        headers: {
          Referer: "https://vidsrc.to/",
          "User-Agent": "Mozilla/5.0"
        }
      }
    ];
  } catch (err) {
    console.log("[viu] error:", err.message);
    return [];
  }
}

module.exports = { getStreams };
