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
app.get("/api/proxy-video", async (req, res) => {
  console.log('🎬 PROXY ROUTE HIT!', req.query);
  
  try {
    const { url } = req.query;
    
    if (!url) {
      console.log('❌ No URL provided');
      return res.status(400).json({ error: 'URL parameter required' });
    }

    console.log('📹 Proxying video from:', url);
    
    const response = await axios.get(url, {
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://beat-anistream-hub.onrender.com',
        'Origin': 'https://beat-anistream-hub.onrender.com'
      }
    });

    console.log('✅ Video fetched, streaming to client');

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', response.headers['content-type'] || 'application/x-mpegURL');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    response.data.pipe(res);
    
  } catch (error) {
    console.error('❌ Proxy error:', error.message);
    res.status(500).json({ error: 'Failed to proxy video' });
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
