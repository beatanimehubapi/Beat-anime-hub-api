import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import { createApiRoutes } from "./src/routes/apiRoutes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));
app.use(express.json());

// Helper functions for JSON responses
const jsonResponse = (res, data, status = 200) =>
  res.status(status).json({ success: true, results: data });

const jsonError = (res, message = "Internal server error", status = 500) =>
  res.status(status).json({ success: false, message });

// PROXY VIDEO ROUTE - Must be before other routes

// Handle OPTIONS for CORS preflight
app.options("/api/proxy-video", (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.status(204).send();
});

app.get("/api/proxy-video", async (req, res) => {
  console.log('🎬 PROXY ROUTE HIT!', req.query);
  
  try {
    const { url } = req.query;
    
    if (!url) {
      console.log('❌ No URL provided');
      return res.status(400).json({ error: 'URL parameter required' });
    }

    console.log('📹 Proxying:', url);
    
    // Parse URL to get domain
    const urlObj = new URL(url);
    const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
    const pathOnly = urlObj.pathname.substring(0, urlObj.pathname.lastIndexOf('/') + 1);
    
    // Determine if this is a playlist or video segment
    const isPlaylist = url.includes('.m3u8');
    
    const response = await axios.get(url, {
      responseType: isPlaylist ? 'text' : 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': baseUrl + '/',
        'Origin': baseUrl,
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site'
      },
      timeout: 30000,
      validateStatus: (status) => status < 500
    });

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Expose-Headers', '*');
    
    if (isPlaylist) {
      console.log('✅ Playlist fetched, rewriting URLs');
      
      let playlist = response.data;
      
      // Rewrite relative URLs in the playlist to go through proxy
      const lines = playlist.split('\n');
      const rewrittenLines = lines.map(line => {
        // Skip comments and empty lines
        if (line.startsWith('#') || line.trim() === '') {
          return line;
        }
        
        // If it's a relative URL or full URL
        let targetUrl;
        if (line.startsWith('http://') || line.startsWith('https://')) {
          targetUrl = line.trim();
        } else if (line.trim()) {
          // Relative URL - make it absolute
          targetUrl = baseUrl + pathOnly + line.trim();
        } else {
          return line;
        }
        
        // Rewrite to go through our proxy
        const proxiedUrl = `https://anime-api-1ci7.onrender.com/api/proxy-video?url=${encodeURIComponent(targetUrl)}`;
        return proxiedUrl;
      });
      
      const rewrittenPlaylist = rewrittenLines.join('\n');
      
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.send(rewrittenPlaylist);
      
    } else {
      console.log('✅ Video segment fetched, streaming');
      
      // Stream video segments
      res.setHeader('Content-Type', response.headers['content-type'] || 'video/mp2t');
      
      if (response.headers['content-length']) {
        res.setHeader('Content-Length', response.headers['content-length']);
      }
      if (response.headers['content-range']) {
        res.setHeader('Content-Range', response.headers['content-range']);
      }
      
      response.data.pipe(res);
    }
    
  } catch (error) {
    console.error('❌ Proxy error:', error.message);
    
    // Return error but with CORS headers so frontend sees it
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(error.response?.status || 500).json({ 
      error: 'Proxy failed', 
      details: error.message,
      status: error.response?.status 
    });
  }
});

console.log('✅ Proxy route registered at /api/proxy-video');

// Test endpoint to verify routing works
app.get("/api/test", (req, res) => {
  res.json({ message: "API is working!", timestamp: new Date().toISOString() });
});

// Create API routes
createApiRoutes(app, jsonResponse, jsonError);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Registered routes:');
  console.log('  GET /api/proxy-video - Video proxy');
  console.log('  GET /api/test - Test endpoint');
});
