/**
 * onetouchtv korean drama provider
 */

const axios = require("axios");
const cheerio = require("cheerio-without-node-native");

const BASE = "https://onetouchtv.xyz";

const TMDB_API_KEY = "1b3113663c9004682ed61086cf967c44";
const TMDB_BASE = "https://api.themoviedb.org/3";

const HEADERS = {
 "User-Agent":
 "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
 "Referer": BASE
};

function formatTitle(title, season, episode){
 const s = String(season || 1).padStart(2,"0");
 const e = String(episode || 1).padStart(2,"0");

 return `OneTouchTV (1080p) [OneTouchTV]
📺 ${title} S${s}E${e}`;
}

async function getTMDBTitle(tmdbId){

 try{

  const url = `${TMDB_BASE}/tv/${tmdbId}?api_key=${TMDB_API_KEY}`;

  const res = await axios.get(url);

  return res.data.name;

 }catch(e){

  return null;

 }

}

async function search(title){

 try{

  const url = `${BASE}/?s=${encodeURIComponent(title)}`;

  const res = await axios.get(url,{headers:HEADERS});

  const $ = cheerio.load(res.data);

  const results = [];

  $("article h2 a").each((i,el)=>{

   results.push({
    title:$(el).text().trim(),
    url:$(el).attr("href")
   });

  });

  return results;

 }catch(e){

  return [];

 }

}

async function getEpisode(page,episode){

 const res = await axios.get(page,{headers:HEADERS});

 const $ = cheerio.load(res.data);

 let epLink=null;

 $("a").each((i,el)=>{

  const text=$(el).text();

  if(text.includes(`Episode ${episode}`)){
   epLink=$(el).attr("href");
  }

 });

 return epLink;

}

async function extractStream(url){

 const res = await axios.get(url,{headers:HEADERS});

 const html=res.data;

 const m3u8=html.match(/https?:\/\/[^"' ]+\.m3u8[^"' ]*/);

 if(m3u8) return m3u8[0];

 const $=cheerio.load(html);

 let iframe=$("iframe").attr("src");

 if(!iframe) return null;

 const frame=await axios.get(iframe,{headers:HEADERS});

 const frameHtml=frame.data;

 const stream=frameHtml.match(/https?:\/\/[^"' ]+\.m3u8[^"' ]*/);

 if(stream) return stream[0];

 return null;

}

async function getStreams(tmdbId,mediaType="tv",season=1,episode=1){

 try{

  const title=await getTMDBTitle(tmdbId);

  if(!title) return [];

  const results=await search(title);

  if(!results.length) return [];

  const page=results[0].url;

  const ep=await getEpisode(page,episode);

  if(!ep) return [];

  const stream=await extractStream(ep);

  if(!stream) return [];

  return [

   {
    name:"OneTouchTV",
    title:formatTitle(title,season,episode),
    url:stream,
    quality:"1080p",
    type:"hls",
    headers:HEADERS,
    provider:"OneTouchTV"
   }

  ];

 }catch(e){

  console.log("[OneTouchTV error]",e.message);

  return [];

 }

}

module.exports={getStreams};
