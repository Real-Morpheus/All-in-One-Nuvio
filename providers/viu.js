var DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'ar,en;q=0.9',
  'Accept': 'application/json',
};

var BASE = 'https://viu.com';
var API = 'https://api.viu.com';
var NAME = 'viu';

var VIU_HEADERS = Object.assign({}, DEFAULT_HEADERS, {
  'x-client-with': 'viu.com',
  'x-country-code': 'EG',
  'x-language-code': 'ar',
  'Referer': BASE,
});

function httpGetJson(url) {
  return fetch(url, { headers: VIU_HEADERS }).then(function(res) {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  console.log('[' + NAME + '] getStreams:', tmdbId, mediaType, season, episode);
  var searchUrl = API + '/cms/api/ar/search/one?keyword=' + encodeURIComponent(tmdbId)
    + '&platform_flag_label=web&area_id=1&language_flag_id=1';

  return httpGetJson(searchUrl).then(function(json) {
    var series = (json && json.data && json.data.series) ? json.data.series : [];
    if (!series.length) return [];
    var s = series[0];
    var episodesUrl = API + '/cms/api/ar/category/product?series_id=' + s.series_id
      + '&platform_flag_label=web&area_id=1&language_flag_id=1';

    return httpGetJson(episodesUrl).then(function(epJson) {
      var episodes = (epJson && epJson.data && epJson.data.product) ? epJson.data.product : [];
      var ep = episodes[0];
      for (var i = 0; i < episodes.length; i++) {
        if (episodes[i].number == (episode || 1)) { ep = episodes[i]; break; }
      }
      if (!ep) return [];

      var streamUrl = API + '/playback/api/getVodSrc?platform_flag_label=web&product_id=' + ep.product_id
        + '&area_id=1&language_flag_id=1';

      return httpGetJson(streamUrl).then(function(sJson) {
        var streams = [];
        var streamList = (sJson && sJson.data && sJson.data.stream) ? sJson.data.stream : {};
        Object.keys(streamList).forEach(function(quality) {
          var u = streamList[quality];
          if (u && u.indexOf('http') === 0) {
            streams.push({ name: NAME, title: quality, url: u, quality: quality, headers: { Referer: BASE } });
          }
        });
        return streams;
      });
    });
  }).catch(function(err) {
    console.error('[' + NAME + '] Error:', err.message);
    return [];
  });
}

module.exports = { getStreams };
