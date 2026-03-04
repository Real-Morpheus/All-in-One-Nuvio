const PROVIDER_NAME = "DOMTY";

async function getStreams(tmdbId, mediaType, season, episode) {

  const streams = [];

  const url =
    mediaType === "movie"
      ? `https://vidsrc.to/embed/movie/${tmdbId}`
      : `https://vidsrc.to/embed/tv/${tmdbId}/${season}/${episode}`;

  streams.push({
    name: PROVIDER_NAME,
    title: "Auto",
    url: url
  });

  return streams;
}

module.exports = { getStreams };
