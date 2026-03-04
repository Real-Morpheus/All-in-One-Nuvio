const NAME = "Viu";

async function getStreams(tmdbId, type, season, episode) {
  console.log("[viu] getStreams:", tmdbId, type, season, episode);

  const s = season || 1;
  const e = episode || 1;

  const streams = [];

  const providers = [
    {
      name: "VidSrc",
      movie: `https://vidsrc.xyz/embed/movie/${tmdbId}`,
      tv: `https://vidsrc.xyz/embed/tv/${tmdbId}/${s}/${e}`,
      referer: "https://vidsrc.xyz/"
    },
    {
      name: "VidSrc.to",
      movie: `https://vidsrc.to/embed/movie/${tmdbId}`,
      tv: `https://vidsrc.to/embed/tv/${tmdbId}/${s}/${e}`,
      referer: "https://vidsrc.to/"
    },
    {
      name: "2Embed",
      movie: `https://www.2embed.cc/embed/${tmdbId}`,
      tv: `https://www.2embed.cc/embedtv/${tmdbId}&s=${s}&e=${e}`,
      referer: "https://www.2embed.cc/"
    },
    {
      name: "MultiEmbed",
      movie: `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1`,
      tv: `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1&s=${s}&e=${e}`,
      referer: "https://multiembed.mov/"
    },
    {
      name: "SuperEmbed",
      movie: `https://multiembed.mov/directstream.php?video_id=${tmdbId}&tmdb=1`,
      tv: `https://multiembed.mov/directstream.php?video_id=${tmdbId}&tmdb=1&s=${s}&e=${e}`,
      referer: "https://multiembed.mov/"
    }
  ];

  for (const p of providers) {
    streams.push({
      name: NAME,
      title: p.name,
      url: type === "movie" ? p.movie : p.tv,
      quality: "auto",
      headers: {
        Referer: p.referer,
        "User-Agent": "Mozilla/5.0"
      }
    });
  }

  return streams;
}

module.exports = { getStreams };
