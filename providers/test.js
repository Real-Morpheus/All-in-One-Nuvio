const axios = require("axios");
const cheerio = require("cheerio");
const { decode, idToSlug } = require("../utils/helpers");
const { extractLinks } = require("./links");

const BASE_URL = "https://one.1cinevood.watch";
const API_URL = `${BASE_URL}/wp-json/wp/v2`;

// ══════════════════════════════════════════════════════════════
//  GET META (detailed info)
// ══════════════════════════════════════════════════════════════
async function getMeta(id, type) {
  const slug = idToSlug(id);
  
  try {
    const { data } = await axios.get(`${API_URL}/posts`, {
      params: { slug, per_page: 1 },
      timeout: 15000,
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json"
      }
    });
    
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("Post not found");
    }
    
    const post = data[0];
    const title = decode(post.title?.rendered || "");
    const contentHtml = post.content?.rendered || "";
    
    // Parse content with cheerio
    const $ = cheerio.load(contentHtml);
    
    // Poster
    let poster = null;
    try {
      poster = post.meta?.fifu_image_url || null;
    } catch (e) {}
    
    if (!poster) {
      poster = $("img[src*='tmdb']").attr("src") ||
               $("img[src*='bmscdn']").attr("src") ||
               $("img[src*='media-amazon']").attr("src") ||
               null;
    }
    
    // Background (use poster)
    const background = poster;
    
    // Plot/Description
    let description = $("#summary").text() || "";
    if (description) {
      description = description.replace(/Summary:\s*/i, "").replace(/Read all/i, "").trim();
    }
    if (!description) {
      description = $("p").filter((i, el) => {
        return $(el).text().toLowerCase().includes("plot:");
      }).first().text().replace(/Plot:\s*/i, "").trim();
    }
    if (!description) {
      description = post.excerpt?.rendered ? decode(post.excerpt.rendered) : "";
    }
    
    // Genres
    const genres = [];
    const genreMatch = contentHtml.match(/Genres:<\/strong>\s*([^<]+)/);
    if (genreMatch) {
      genreMatch[1].split(",").forEach(g => genres.push(g.trim()));
    }
    
    // Year
    const yearMatch = title.match(/\((\d{4})\)/);
    const releaseInfo = yearMatch ? yearMatch[1] : undefined;
    
    // IMDb rating
    let imdbRating = null;
    const ratingMatch = contentHtml.match(/Rating:<\/strong>\s*([\d.]+)/);
    if (ratingMatch) {
      imdbRating = ratingMatch[1];
    }
    
    // Runtime
    let runtime = null;
    const runtimeMatch = contentHtml.match(/Runtime:<\/strong>\s*(\d+h\s*\d+m|\d+m)/);
    if (runtimeMatch) {
      runtime = runtimeMatch[1];
    }
    
    // Director
    const directorMatch = contentHtml.match(/Director:<\/strong>\s*([^<]+)/);
    const director = directorMatch ? [directorMatch[1].trim()] : undefined;
    
    // Cast
    const castMatch = contentHtml.match(/Actors:<\/strong>\s*([^<]+)/);
    const cast = castMatch ? castMatch[1].split(",").map(c => c.trim()) : undefined;
    
    return {
      id,
      type,
      name: title,
      poster,
      posterShape: "poster",
      background,
      logo: null,
      description: description.substring(0, 500),
      releaseInfo,
      runtime,
      genres,
      director,
      cast,
      imdbRating,
      links: [
        {
          name: "CineVood",
          category: "Website",
          url: post.link
        }
      ]
    };
    
  } catch (error) {
    console.error("Meta fetch error:", error.message);
    throw error;
  }
}

// ══════════════════════════════════════════════════════════════
//  GET STREAMS (video links)
// ══════════════════════════════════════════════════════════════
async function getStreams(id, type) {
  const slug = idToSlug(id);
  
  try {
    const { data } = await axios.get(`${API_URL}/posts`, {
      params: { slug, per_page: 1 },
      timeout: 15000,
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json"
      }
    });
    
    if (!Array.isArray(data) || data.length === 0) {
      return [];
    }
    
    const contentHtml = data[0].content?.rendered || "";
    const postUrl = data[0].link || "";
    
    // Extract links from content
    const streams = await extractLinks(contentHtml, postUrl);
    
    return streams;
    
  } catch (error) {
    console.error("Stream fetch error:", error.message);
    return [];
  }
}

module.exports = { getStreams, getStreams };
