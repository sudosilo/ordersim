// ordersim-v2-api: leaderboard and run history backend for ORDERSIM
// Runs on Railway. Requires REDIS_URL. Optional ALLOWED_ORIGIN for CORS.

const express = require('express');
const cors = require('cors');
const Redis = require('ioredis');

const PORT = process.env.PORT || 3000;
const REDIS_URL = process.env.REDIS_URL;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

if (!REDIS_URL) {
  console.error('REDIS_URL is not set');
  process.exit(1);
}

const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 3 });
const app = express();

app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.json({ limit: '8kb' }));

const SCENARIOS = ['breakfast', 'dinner', 'huge', 'freeplay'];
const MAX_SCORE_PER_SEC = 400;
const rateBucket = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const hits = (rateBucket.get(ip) || []).filter(t => now - t < 60000);
  hits.push(now);
  rateBucket.set(ip, hits);
  return hits.length > 10;
}

function cleanCallsign(v) {
  const s = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  return s || 'PLAYER';
}

function toInt(v) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

app.get('/health', async (req, res) => {
  try {
    await redis.ping();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

app.post('/api/runs', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  if (rateLimited(ip)) return res.status(429).json({ error: 'slow down' });

  const b = req.body || {};
  const scenario = String(b.scenario || '');
  if (!SCENARIOS.includes(scenario)) return res.status(400).json({ error: 'bad scenario' });

  const score = toInt(b.score);
  const durationSec = toInt(b.durationSec);
  const bumped = toInt(b.bumped);
  const receipts = toInt(b.receipts);
  const jams = toInt(b.jams);
  if ([score, durationSec, bumped, receipts, jams].some(v => v === null)) {
    return res.status(400).json({ error: 'bad numbers' });
  }
  if (durationSec < 5 || score > durationSec * MAX_SCORE_PER_SEC) {
    return res.status(400).json({ error: 'rejected' });
  }

  const callsign = cleanCallsign(b.callsign);
  const run = {
    callsign, scenario, score, durationSec, bumped, receipts, jams,
    version: String(b.version || '').slice(0, 10),
    at: new Date().toISOString()
  };

  const boardKey = 'ordersim:board:' + scenario;
  const prev = await redis.zscore(boardKey, callsign);
  const multi = redis.multi();
  if (prev === null || score > Number(prev)) multi.zadd(boardKey, score, callsign);
  multi.lpush('ordersim:runs:' + scenario, JSON.stringify(run));
  multi.ltrim('ordersim:runs:' + scenario, 0, 199);
  multi.hincrby('ordersim:stats', 'runs', 1);
  multi.hincrby('ordersim:stats', 'bumped', bumped);
  multi.hincrby('ordersim:stats', 'receipts', receipts);
  await multi.exec();

  const rank = await redis.zrevrank(boardKey, callsign);
  res.json({ ok: true, rank: rank === null ? null : rank + 1 });
});

app.get('/api/leaderboard/:scenario', async (req, res) => {
  const scenario = req.params.scenario;
  if (!SCENARIOS.includes(scenario)) return res.status(400).json({ error: 'bad scenario' });
  const limit = Math.min(50, Math.max(1, toInt(req.query.limit) || 10));
  const raw = await redis.zrevrange('ordersim:board:' + scenario, 0, limit - 1, 'WITHSCORES');
  const entries = [];
  for (let i = 0; i < raw.length; i += 2) entries.push({ callsign: raw[i], score: Number(raw[i + 1]) });
  res.json({ scenario, entries });
});

app.get('/api/runs/:scenario', async (req, res) => {
  const scenario = req.params.scenario;
  if (!SCENARIOS.includes(scenario)) return res.status(400).json({ error: 'bad scenario' });
  const raw = await redis.lrange('ordersim:runs:' + scenario, 0, 24);
  res.json({ scenario, runs: raw.map(r => JSON.parse(r)) });
});

app.get('/api/stats', async (req, res) => {
  const s = await redis.hgetall('ordersim:stats');
  res.json({
    runs: Number(s.runs || 0),
    bumped: Number(s.bumped || 0),
    receipts: Number(s.receipts || 0)
  });
});

app.listen(PORT, () => console.log('ordersim-v2-api on ' + PORT));
