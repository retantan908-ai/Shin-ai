import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

const app = express();
app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false }));

const PORT = Number(process.env.PORT || 8787);
const API_KEY = process.env.NVIDIA_API_KEY;
const MODEL = process.env.NVIDIA_MODEL || 'meta/llama-3.1-8b-instruct';
const APP_TOKEN = process.env.APP_TOKEN;

app.get('/health', (_req, res) => res.json({ ok: true, service: 'SHIN AI' }));

app.post('/api/study', async (req, res) => {
  try {
    if (!APP_TOKEN || req.get('x-app-token') !== APP_TOKEN) {
      return res.status(401).json({ error: 'Unauthorized app client.' });
    }
    if (!API_KEY) return res.status(503).json({ error: 'Backend NVIDIA API key is not configured.' });
    const question = String(req.body?.question || '').trim();
    const mode = String(req.body?.mode || 'explain');
    if (!question) return res.status(400).json({ error: 'Question is required.' });
    if (question.length > 12000) return res.status(413).json({ error: 'Question is too long.' });

    const system = `You are SHIN, an Indonesian-language study assistant for a school student.
Help the learner understand the question. For multiple choice, identify the best answer and explain briefly why.
For essays, draft a clear age-appropriate model answer and explain the key points.
For math/science, show the relevant formula and steps. If information is missing or ambiguous, say so rather than inventing facts.
Do not assist cheating or concealment in live/proctored exams.`;
    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `Mode: ${mode}\n\nQuestion:\n${question}` }
        ],
        temperature: 0.2,
        top_p: 0.7,
        max_tokens: 1400,
        stream: false
      })
    });
    const raw = await response.text();
    if (!response.ok) {
      console.error('NVIDIA API error:', response.status, raw.slice(0, 1200));
      return res.status(502).json({ error: `AI provider returned ${response.status}. Check backend logs and model access.` });
    }
    const data = JSON.parse(raw);
    const answer = data?.choices?.[0]?.message?.content;
    if (!answer) return res.status(502).json({ error: 'AI provider returned an empty answer.' });
    return res.json({ answer, model: MODEL });
  } catch (error) {
    console.error('Study request failed:', error);
    return res.status(500).json({ error: 'Backend could not complete the request.' });
  }
});

app.listen(PORT, () => console.log(`SHIN Study AI listening on ${PORT}`));
