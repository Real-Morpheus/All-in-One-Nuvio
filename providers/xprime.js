export default {
  id: "xprime",
  name: "Xprime",
  rank: 140,
  supported: ["movie", "tv"],

  async search({ tmdbId, type, season, episode }) {
    try {
      // Fetch turnstile token
      const tokenRes = await fetch("https://enc-dec.app/api/enc-xprime");
      const tokenJson = await tokenRes.json();
      const token = tokenJson.result;

      let url;
      if (type === "movie") {
        url = `https://backend.xprime.tv/rage?id=${tmdbId}&turnstile=${token}`;
      } else {
        url = `https://backend.xprime.tv/rage?id=${tmdbId}&season=${season}&episode=${episode}&turnstile=${token}`;
      }

      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Referer: "https://xprime.tv/",
          Origin: "https://xprime.tv"
        }
      });

      const data = await res.json();
      if (!data || !data.streams) return [];

      // Map streams to Nuvio format
      return data.streams.map(stream => ({
        provider: "xprime",
        name: "Xprime",
        title: stream.quality || "Stream",
        url: stream.url,
        headers: {
          Referer: "https://xprime.tv/",
          Origin: "https://xprime.tv",
          "User-Agent": "Mozilla/5.0"
        }
      }));
    } catch (err) {
      console.error("Xprime error", err);
      return [];
    }
  }
};
