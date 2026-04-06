// VidSrc German Provider for Nuvio
// Uses VidSrc API which is much more reliable than scraping
// Hermes-compatible (no async/await, only .then() chains)

function getStreams(tmdbId, mediaType, season, episode) {
  console.log('[VidSrc-DE] Starting - TMDB:', tmdbId, 'Type:', mediaType, 'S:', season, 'E:', episode);
  
  var streams = [];
  
  // VidSrc embed URLs
  // These are embed players that handle multiple hosts internally
  var vidsrcBase = 'https://vidsrc.rip/embed/';
  var vidsrc2Base = 'https://vidsrc.icu/embed/';
  var vidsrcToBase = 'https://vidsrc.to/embed/';
  
  if (mediaType === 'movie') {
    // Movie format: /embed/movie/TMDB_ID
    streams.push({
      name: 'VidSrc (German)',
      title: 'VidSrc Player 1',
      url: vidsrcBase + 'movie/' + tmdbId
    });
    
    streams.push({
      name: 'VidSrc (German)',
      title: 'VidSrc Player 2',
      url: vidsrc2Base + 'movie/' + tmdbId
    });
    
    streams.push({
      name: 'VidSrc (German)',
      title: 'VidSrc Player 3',
      url: vidsrcToBase + 'movie/' + tmdbId
    });
    
  } else if (mediaType === 'tv') {
    // TV format: /embed/tv/TMDB_ID/SEASON/EPISODE
    streams.push({
      name: 'VidSrc (German)',
      title: 'VidSrc Player 1 - S' + season + 'E' + episode,
      url: vidsrcBase + 'tv/' + tmdbId + '/' + season + '/' + episode
    });
    
    streams.push({
      name: 'VidSrc (German)',
      title: 'VidSrc Player 2 - S' + season + 'E' + episode,
      url: vidsrc2Base + 'tv/' + tmdbId + '/' + season + '/' + episode
    });
    
    streams.push({
      name: 'VidSrc (German)',
      title: 'VidSrc Player 3 - S' + season + 'E' + episode,
      url: vidsrcToBase + 'tv/' + tmdbId + '/' + season + '/' + episode
    });
  }
  
  console.log('[VidSrc-DE] Returning', streams.length, 'streams');
  
  // Return streams directly - Hermes compatible
  return streams;
}

// Export for Nuvio
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
}
