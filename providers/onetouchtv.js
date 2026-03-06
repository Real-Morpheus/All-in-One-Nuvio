/**
 * onetouchtv provider
 * Korean drama scraper
 */

const axios = require("axios");
const cheerio = require("cheerio-without-node-native");

const BASE = "https://onetouchtv.xyz";

const TMDB_API_KEY = "1b3113663c9004682ed61086cf967c44";
const TMDB_BASE = "https://api.themoviedb.org/3";

const HEADERS = {
 "User-Agent":
 "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
 "Accept": "text/html,application/xhtml+xml",
 "Referer": BASE
};

function normalize(title){
 return title
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g,"")
  .replace(/\s+/g," ")
  .trim();
}

async function getTMDBDetails(id,type){

 try{

  const endpoint = type==="tv" ? "tv" : "movie";

  const url = `${TMDB_BASE}/${endpoint}/${id}?api_key=${TMDB_API_KEY}`;

  const res = await axios.get(url);

  const data = res.data;

  return {
   title:data.name || data.title,
   year:(data.first_air_date || data.release_date || "").split("-")[0]
  };

 }catch(e){

  console.log("[OneTouchTV] TMDB failed");

  return null;

 }

}

async function search(query){

 try{

  const url = `${BASE}/?s=${encodeURIComponent(query)}`;

  const res = await axios.get(url,{headers:HEADERS});

  const $ = cheerio.load(res.data);

  const results=[];

  $("article h2 a").each((i,el)=>{

   results.push({
    title:$(el).text().trim(),
    url:$(el).attr("href")
   });

  });

  return results;

 }catch(e){

  console.log("[OneTouchTV] search failed");

  return [];

 }

}

async function findEpisode(page,episode){

 try{

  const res = await axios.get(page,{headers:HEADERS});

  const $ = cheerio.load(res.data);

  let link=null;

  $("a").each((i,el)=>{

   const text=$(el).text();

   if(text.match(new RegExp(`Episode\\s*${episode}`,"i"))){

    link=$(el).attr("href");

   }

  });

  return link;

 }catch(e){

  return null;

 }

}

async function extractStream(url){

 try{

  const res = await axios.get(url,{headers:HEADERS});

  const html = res.data;

  // direct stream
  const m3u8 = html.match(/https?:\/\/[^"' ]+\.m3u8[^"' ]*/);

  if(m3u8) return m3u8[0];

  const $ = cheerio.load(html);

  const iframe = $("iframe").attr("src");

  if(!iframe) return null;

  const frame = await axios.get(iframe,{headers:HEADERS});

  const frameHtml = frame.data;

  const stream = frameHtml.match(/https?:\/\/[^"' ]+\.m3u8[^"' ]*/);

  if(stream) return stream[0];

  return null;

 }catch(e){

  console.log("[OneTouchTV] extract failed");

  return null;

 }

}

async function getStreams(tmdbId,mediaType="tv",season=1,episode=1){

 try{

  const info = await getTMDBDetails(tmdbId,mediaType);

  if(!info) return [];

  console.log(`[OneTouchTV] searching ${info.title}`);

  const results = await search(info.title);

  if(!results.length){

   console.log("[OneTouchTV] no results");

   return [];

  }

  const match = results.find(r =>
   normalize(r.title).includes(normalize(info.title))
  ) || results[0];

  console.log(`[OneTouchTV] matched ${match.title}`);

  const epPage = await findEpisode(match.url,episode);

  if(!epPage){

   console.log("[OneTouchTV] episode not found");

   return [];

  }

  const stream = await extractStream(epPage);

  if(!stream){

   console.log("[OneTouchTV] no stream found");

   return [];

  }

  return [

   {
    name:"OneTouchTV",
    title:`OneTouchTV (1080p)
📺 ${info.title} S${String(season).padStart(2,"0")}E${String(episode).padStart(2,"0")}`,
    url:stream,
    quality:"1080p",
    type:"hls",
    headers:HEADERS,
    provider:"OneTouchTV"
   }

  ];

 }catch(e){

  console.log("[OneTouchTV] getStreams error",e.message);

  return [];

 }

}

module.exports = { getStreams };
