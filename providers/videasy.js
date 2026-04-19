// VideoEasy Scraper - Neon/Yoru Focused
const TMDB_API_KEY = '1c29a5198ee1854bd5eb45dbe8d17d92';
const DECRYPT_API = 'https://enc-dec.app/api/dec-videasy';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Origin': 'https://player.videasy.net',
  'Referer': 'https://player.videasy.net/'
};

const SERVERS = {
  'Neon': { url: 'https://api.videasy.net/myflixerzupcloud/sources-with-title' },
  'Yoru': { url: 'https://api.videasy.net/cdn/sources-with-title', moviesOnly: true },
  'Cypher': { url: 'https://api.videasy.net/moviebox/sources-with-title' },
  'Raze': { url: 'https://api.videasy.net/superflix/sources-with-title' }
};

function getStreams(tmdbId, mediaType, season, episode) {
  const type = mediaType === 'tv' ? 'tv' : 'movie';
  const tmdbUrl = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;

  return fetch(tmdbUrl)
    .then(res => res.json())
    .then(data => {
      const details = {
        id: tmdbId.toString(),
        title: data.title || data.name,
        year: (data.release_date || data.first_air_date || '').split('-')[0],
        imdbId: data.external_ids ? data.external_ids.imdb_id : '',
        type: type
      };

      console.log(`[VideoEasy] Searching for: ${details.title} (${details.year})`);

      const promises = Object.keys(SERVERS).map(name => {
        const config = SERVERS[name];
        if (details.type === 'tv' && config.moviesOnly) return Promise.resolve([]);

        // Construct URL manually to ensure exact parameter order
        let url = `${config.url}?title=${encodeURIComponent(details.title)}&mediaType=${details.type}&year=${details.year}&tmdbId=${details.id}&imdbId=${details.imdbId}`;
        
        if (details.type === 'tv') {
          url += `&seasonId=${season}&episodeId=${episode}`;
        }

        return fetch(url, { headers: HEADERS })
          .then(res => res.text())
          .then(encryptedText => {
            if (!encryptedText || encryptedText.includes('Not Found')) return [];
            
            // Send to decryption
            return fetch(DECRYPT_API, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: encryptedText, id: details.id })
            })
            .then(dRes => dRes.json())
            .then(decrypted => {
              const resData = decrypted.result || decrypted;
              if (!resData || !resData.sources) return [];

              return resData.sources.map(s => ({
                name: `VIDEASY ${name}`,
                url: s.url,
                quality: s.quality || 'Auto',
                headers: {
                  'Referer': 'https://player.videasy.net/',
                  'Origin': 'https://player.videasy.net',
                  'User-Agent': HEADERS['User-Agent']
                }
              }));
            });
          })
          .catch(err => {
            console.log(`[VideoEasy] ${name} failed:`, err.message);
            return [];
          });
      });

      return Promise.all(promises).then(results => {
        const flat = results.flat();
        const seen = new Set();
        return flat.filter(item => seen.has(item.url) ? false : seen.add(item.url));
      });
    })
    .catch(err => {
      console.error("[VideoEasy] TMDB Fetch Error:", err.message);
      return [];
    });
}

if (typeof module !== 'undefined') module.exports = { getStreams };
