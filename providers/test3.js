function getStreams(tmdbId, mediaType) {
  return new Promise((resolve) => {

    let streams = [];

    fetch("https://api.themoviedb.org/3/movie/" + tmdbId)
      .then(res => res.json())
      .then(data => {

        let title = data.title;

        return fetch("https://cinedoze.tv/?s=" + encodeURIComponent(title));
      })
      .then(res => res.text())
      .then(html => {

        let match = html.match(/href="(https:\/\/cinedoze\.tv\/[^"]+)"/);

        if (!match) return resolve([]);

        return fetch(match[1]);
      })
      .then(res => res ? res.text() : null)
      .then(html => {

        if (!html) return resolve([]);

        let linkMatches = html.match(/https:\/\/cinedoze\.tv\/links\/[^\s"]+/g) || [];

        if (linkMatches.length === 0) return resolve([]);

        let promises = linkMatches.map(linkUrl => {

          let quality = "Auto";
          if (linkUrl.includes("4k")) quality = "4K";
          else if (linkUrl.includes("1080")) quality = "1080p";
          else if (linkUrl.includes("720")) quality = "720p";

          return fetch(linkUrl)
            .then(res => res.text())
            .then(page => {

              let links = page.match(/https?:\/\/[^\s"<]+/g) || [];

              links.forEach(link => {

                if (
                  link.includes("hubcloud") ||
                  link.includes("gdflix") ||
                  link.includes("filepress")
                ) {
                  streams.push({
                    name: "Cinedoze",
                    title: link.split('/')[2] + " - " + quality,
                    url: link,
                    quality: quality,
                    provider: "cinedoze"
                  });
                }

              });

            });

        });

        return Promise.all(promises);
      })
      .then(() => resolve(streams))
      .catch(() => resolve([]));

  });
}

module.exports = { getStreams };
