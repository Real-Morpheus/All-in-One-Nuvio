// ============================================================
// Einthusan Provider for Nuvio (Promise Only - No Async)
// ============================================================

var BASE_URL = 'https://einthusan.tv';

var HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 15; ALT-NX1 Build/HONORALT-N31; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/146.0.7680.177 Mobile Safari/537.36',
  'Referer': 'https://einthusan.tv/',
  'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Android WebView";v="146"',
  'Accept': '*/*'
};

function getStreams(tmdbId, mediaType) {
  return new Promise(function (resolve) {
    // Hardcoded test ID '661t' based on your previous working link
    var watchUrl = BASE_URL + '/movie/watch/661t/?lang=hindi';

    fetch(watchUrl, { headers: HEADERS })
      .then(function (res) { return res.text(); })
      .then(function (html) {
        // Log page length to check if we are being blocked by Cloudflare (usually small page)
        console.log('Page Load Success. Length: ' + html.length);

        // Pattern 1: Standard CDN link
        var pattern1 = /["'](https?:\/\/cdn1\.einthusan\.io\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i;
        // Pattern 2: Search for any JSON-like URL property (common for hidden players)
        var pattern2 = /"(?:url|file|src)"\s*:\s*"([^"]+\.(?:m3u8|mp4)[^"]*)"/i;
        
        var match = html.match(pattern1) || html.match(pattern2);

        if (match) {
          var streamUrl = match[1].replace(/&amp;/g, '&').replace(/\\/g, '').trim();
          console.log('Stream Found: ' + streamUrl);

          resolve([{
            url: streamUrl,
            quality: 'HD',
            format: streamUrl.indexOf('m3u8') !== -1 ? 'm3u8' : 'mp4',
            headers: {
              'User-Agent': HEADERS['User-Agent'],
              'Referer': 'https://einthusan.tv/',
              'Origin': 'https://einthusan.tv'
            }
          }]);
        } else {
          console.log('No link found in HTML source.');
          resolve([]);
        }
      })
      .catch(function (err) {
        console.log('Fetch error: ' + err);
        resolve([]);
      });
  });
}

module.exports = { getStreams: getStreams };
