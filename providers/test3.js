// ============================================================
// Einthusan Provider - Final Handshake Fix
// ============================================================

var BASE_URL = 'https://einthusan.tv';

var HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 15; ALT-NX1 Build/HONORALT-N31; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/146.0.7680.177 Mobile Safari/537.36',
  'Referer': 'https://einthusan.tv/',
  'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Android WebView";v="146"',
  'sec-ch-ua-mobile': '?1',
  'sec-ch-ua-platform': '"Android"',
  'Accept-Encoding': 'identity;q=1, *;q=0',
  'Accept': '*/*'
};

function getStreams(tmdbId, mediaType) {
  return new Promise(function (resolve) {
    // Note: Replace '661t' with dynamic logic later; hardcoded for this specific test
    var watchUrl = BASE_URL + '/movie/watch/661t/?lang=hindi';

    fetch(watchUrl, { headers: HEADERS })
      .then(function (res) { return res.text(); })
      .then(function (html) {
        // Updated Regex to specifically target the cdn1.einthusan.io structure
        var streamPattern = /["'](https?:\/\/cdn1\.einthusan\.io\/[^"']+)["']/i;
        var match = html.match(streamPattern);

        if (match) {
          // 1. Clean HTML entities (&amp; -> &)
          var streamUrl = match[1].replace(/&amp;/g, '&');
          
          // 2. Remove any backslashes (often added by JS escapes in the source)
          streamUrl = streamUrl.replace(/\\/g, '');

          resolve([{
            url: streamUrl,
            quality: 'HD',
            // If the URL contains .m3u8, ensure the format is set correctly
            format: streamUrl.includes('m3u8') ? 'm3u8' : 'mp4',
            // 3. Forward the exact headers to the Nuvio Player engine
            headers: {
              'User-Agent': HEADERS['User-Agent'],
              'Referer': 'https://einthusan.tv/',
              'Origin': 'https://einthusan.tv',
              'Accept-Encoding': 'identity;q=1, *;q=0',
              'sec-ch-ua': HEADERS['sec-ch-ua'],
              'sec-ch-ua-platform': '"Android"'
            }
          }]);
        } else {
          resolve([]);
        }
      })
      .catch(function () {
        resolve([]);
      });
  });
}

module.exports = { getStreams: getStreams };
