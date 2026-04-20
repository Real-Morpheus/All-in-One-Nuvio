// =============================================================
// Provider Nuvio : Nakios.art (VF / VOSTFR / MULTI)
// Version : 3.5.0
// Auto-détection via bundle JS de nakios.online (comme movix)
// =============================================================

var NAKIOS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
var NAKIOS_VITRINE = 'https://nakios.online/';
var NAKIOS_BLACKLIST = ['online', 'health', 'png', 'svg', 'com', 'support', 'news', 'media'];

var _cachedEndpoint = null;

// Étape 1 : lit le HTML de nakios.online et trouve l'URL du bundle JS
function fetchBundleUrl() {
  return fetch(NAKIOS_VITRINE, { redirect: 'follow' })
    .then(function(res) { return res.text(); })
    .then(function(html) {
      var match = html.match(/src=["'](\/assets\/[^"']+\.js)["']/);
      if (!match) throw new Error('Bundle JS introuvable dans nakios.online');
      var bundleUrl = 'https://nakios.online' + match[1];
      console.log('[Nakios] Bundle trouvé: ' + bundleUrl);
      return bundleUrl;
    });
}

// Étape 2 : télécharge le bundle et extrait tous les domaines nakios.*
function extractDomainsFromBundle(bundleUrl) {
  return fetch(bundleUrl)
    .then(function(res) { return res.text(); })
    .then(function(js) {
      var matches = js.match(/https?:\/\/nakios\.([a-z]{2,10})/gi) || [];
      var tlds = [];
      var seen = {};
      matches.forEach(function(url) {
        var tld = url.replace(/https?:\/\/nakios\./, '').toLowerCase();
        if (!seen[tld] && NAKIOS_BLACKLIST.indexOf(tld) === -1) {
          seen[tld] = true;
          tlds.push(tld);
        }
      });
      if (tlds.length === 0) throw new Error('Aucun domaine trouvé dans le bundle');
      console.log('[Nakios] Domaines extraits du bundle: ' + tlds.join(', '));
      return tlds;
    });
}

// Détection complète : bundle → premier domaine (= le plus récent)
function detectEndpoint() {
  if (_cachedEndpoint) {
    console.log('[Nakios] Endpoint en cache: ' + _cachedEndpoint.api);
    return Promise.resolve(_cachedEndpoint);
  }

  return fetchBundleUrl()
    .then(extractDomainsFromBundle)
    .then(function(tlds) {
      var tld = tlds[0];
      var endpoint = {
        base:    'https://nakios.' + tld,
        api:     'https://api.nakios.' + tld + '/api',
        referer: 'https://nakios.' + tld + '/'
      };
      console.log('[Nakios] Domaine sélectionné: nakios.' + tld);
      _cachedEndpoint = endpoint;
      return endpoint;
    })
    .catch(function(err) {
      console.error('[Nakios] Détection auto échouée: ' + (err.message || err));
      return null;
    });
}

function fetchSources(endpoint, tmdbId, mediaType, season, episode) {
  var url = mediaType === 'tv'
    ? endpoint.api + '/sources/tv/' + tmdbId + '/' + (season || 1) + '/' + (episode || 1)
    : endpoint.api + '/sources/movie/' + tmdbId;

  console.log('[Nakios] Fetch sources: ' + url);

  return fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': NAKIOS_UA,
      'Referer':    endpoint.referer,
      'Origin':     endpoint.base
    }
  })
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      if (!data || !data.success || !data.sources || data.sources.length === 0) {
        throw new Error('Aucune source');
      }
      return data.sources;
    });
}

function extractOrigin(url) {
  var match = url.match(/^(https?:\/\/[^\/]+)/);
  return match ? match[1] : null;
}

function resolveSource(source) {
  var rawUrl = source.url || '';

  if (rawUrl.startsWith('http')) {
    var format = (source.isM3U8 || rawUrl.indexOf('.m3u8') !== -1) ? 'm3u8' : 'mp4';
    return {
      url:     rawUrl,
      format:  format,
      referer: null,
      origin:  null
    };
  }

  if (rawUrl.charAt(0) === '/') {
    var urlMatch = rawUrl.match(/[?&]url=([^&]+)/);
    if (!urlMatch) return null;

    var decoded;
    try {
      decoded = decodeURIComponent(urlMatch[1]);
    } catch (e) {
      return null;
    }

    if (!decoded || !decoded.startsWith('http')) return null;

    var origin = extractOrigin(decoded);
    if (!origin) return null;

    return {
      url:     decoded,
      format:  'm3u8',
      referer: origin + '/',
      origin:  origin
    };
  }

  return null;
}

function normalizeSources(sources, endpoint) {
  var results = [];

  for (var i = 0; i < sources.length; i++) {
    var source = sources[i];

    if (source.isEmbed) continue;

    var lang    = (source.lang    || 'MULTI').toUpperCase();
    var quality = source.quality  || 'HD';
    var name    = source.name     || 'Nakios';

    var resolved = resolveSource(source);
    if (!resolved) continue;

    var referer = resolved.referer || endpoint.referer;
    var origin  = resolved.origin  || endpoint.base;

    console.log('[Nakios] +source: ' + quality + ' | ' + lang + ' | ' + resolved.format +
                ' | referer=' + referer + ' → ' + resolved.url.substring(0, 70));

    results.push({
      name:    'Nakios',
      title:   name + ' - ' + lang + ' ' + quality,
      url:     resolved.url,
      quality: quality,
      format:  resolved.format,
      headers: {
        'User-Agent': NAKIOS_UA,
        'Referer':    referer,
        'Origin':     origin
      }
    });
  }

  return results;
}

function getStreams(tmdbId, mediaType, season, episode) {
  console.log('[Nakios] START tmdbId=' + tmdbId + ' type=' + mediaType + ' S' + season + 'E' + episode);

  return detectEndpoint()
    .then(function(endpoint) {
      if (!endpoint) throw new Error('Détection endpoint échouée');
      return fetchSources(endpoint, tmdbId, mediaType, season, episode);
    })
    .then(function(sources) {
      var results = normalizeSources(sources, _cachedEndpoint);
      console.log('[Nakios] ' + results.length + ' source(s) disponible(s)');
      return results;
    })
    .catch(function(err) {
      console.error('[Nakios] Erreur: ' + (err.message || String(err)));
      return [];
    });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams: getStreams };
} else {
  global.getStreams = getStreams;
}
