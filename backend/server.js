/**
 * Smart Plant Monitor — Secure Gemini Proxy Backend
 * 
 * This server sits between the frontend and the Gemini API.
 * The API key never leaves this server — the browser only
 * talks to localhost:3000, not to Google directly.
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

// Load .env that sits next to this file, regardless of process.cwd()
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3000;
const GROQ_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// ── Rate Limiter (sliding window, per IP) ──────────────────
const RATE_LIMIT_WINDOW_MS = 60_000;   // 1 minute
const RATE_LIMIT_MAX = 10;             // max 10 requests per window per IP
const requestLog = new Map();          // ip → [timestamps]

function isRateLimited(ip) {
    const now = Date.now();
    const timestamps = (requestLog.get(ip) || []).filter(t => t > now - RATE_LIMIT_WINDOW_MS);
    timestamps.push(now);
    requestLog.set(ip, timestamps);
    return timestamps.length > RATE_LIMIT_MAX;
}

// Clean up stale entries every 5 minutes
setInterval(() => {
    const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
    for (const [ip, timestamps] of requestLog) {
        const fresh = timestamps.filter(t => t > cutoff);
        if (fresh.length === 0) requestLog.delete(ip);
        else requestLog.set(ip, fresh);
    }
}, 300_000);

// ── Retry helper with exponential backoff ──────────────────
async function fetchWithRetry(url, options, retries = 3) {
    for (let attempt = 0; attempt < retries; attempt++) {
        const res = await fetch(url, options);
        if (res.status === 429 && attempt < retries - 1) {
            const waitSec = Math.pow(2, attempt + 1);   // 2s, 4s, 8s
            console.warn(`⏳ Gemini 429 — retrying in ${waitSec}s (attempt ${attempt + 1}/${retries})`);
            await new Promise(r => setTimeout(r, waitSec * 1000));
            continue;
        }
        return res;
    }
}

// ── Middleware ──────────────────────────────────────────────
app.use(express.json());

// Allow requests from the local file:// frontend and any localhost port
app.use(cors({
    origin: (origin, cb) => {
        // Allow: no origin (curl), file:// or 'null' (local file), localhost:*, 127.0.0.1:*
        if (!origin || origin === 'null' || (typeof origin === 'string' && origin.startsWith('file://')) ||
            origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
            cb(null, true);
        } else {
            cb(new Error('Not allowed by CORS'));
        }
    }
}));

// ── Health Check ────────────────────────────────────────────
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        keyConfigured: Boolean(GROQ_KEY),
        timestamp: new Date().toISOString()
    });
});

// ── POST /chat ───────────────────────────────────────────────
// Body: { message: string, sensorContext: string }
app.post('/chat', async (req, res) => {
    if (!GROQ_KEY) {
        return res.status(503).json({ error: 'GROQ_API_KEY not set in .env file.' });
    }

    // Rate-limit check (uses client IP)
    const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
    if (isRateLimited(clientIp)) {
        return res.status(429).json({
            error: 'Too many requests — please wait a moment before asking again.',
            retryAfter: 15
        });
    }

    const { message, sensorContext } = req.body;
    if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'message (string) is required.' });
    }

    const systemPrompt = `You are "Plant Doctor AI", a friendly expert botanical assistant embedded in a plant health monitoring dashboard.

Rules:
- Keep responses concise: 2–4 sentences max.
- Use relevant plant emojis.
- Reference the sensor data when relevant (water urgently if moisture < 40%, suggest shade if temp > 32°C, suggest misting if humidity < 40%).
- Stay in character as a helpful plant doctor.

${sensorContext ? `Live sensor data:\n${sensorContext}` : 'No live sensor data available yet.'}`;

    try {
        const groqRes = await fetchWithRetry(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: message }
                ],
                max_tokens: 200,
                temperature: 0.7
            })
        });

        if (!groqRes.ok) {
            const errText = await groqRes.text();
            console.error('Groq API error:', groqRes.status, errText);

            if (groqRes.status === 429) {
                return res.status(429).json({
                    error: 'Groq rate limit reached. Please wait ~30 seconds and try again.',
                    retryAfter: 30
                });
            }

            return res.status(502).json({ error: `Groq API returned ${groqRes.status}` });
        }

        const data = await groqRes.json();
        const reply = data.choices[0]?.message?.content?.trim() || '';

        if (!reply) {
            return res.status(502).json({ error: 'Empty response from Groq.' });
        }

        res.json({ reply });

    } catch (err) {
        console.error('Proxy error:', err.message);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// ── Start ───────────────────────────────────────────────────
app.listen(PORT, () => {
    if (!GROQ_KEY) {
        console.warn('⚠️  GROQ_API_KEY is not set — add it to backend/.env');
    } else {
        console.log('🔑  Groq API key loaded');
    }
    console.log(`🤖  Model: llama-3.3-70b-versatile (Groq)`);
    console.log(`🛡️  Rate limit: ${RATE_LIMIT_MAX} requests per ${RATE_LIMIT_WINDOW_MS / 1000}s per client`);
    console.log(`🌱 Smart Plant Monitor backend running → http://localhost:${PORT}`);
    console.log(`   Health check: http://localhost:${PORT}/health`);
});
