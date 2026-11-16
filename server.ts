import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';
import {
  buildSpeechStylePrompt,
  buildTtsCacheKey,
  normalizeTtsText,
  normalizeVoiceId,
} from './src/utils/ttsHelpers.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const TTS_MODEL = 'gemini-3.8-flash-lite-tts';
const MAX_CACHE_ENTRIES = 200;

interface CachedAudioEntry {
  audioBase64: string;
  mimeType: string;
  voiceName: string;
}

const serverAudioCache = new Map<string, CachedAudioEntry>();

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function setCachedAudio(key: string, entry: CachedAudioEntry): void {
  if (serverAudioCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = serverAudioCache.keys().next().value;
    if (oldestKey) {
      serverAudioCache.delete(oldestKey);
    }
  }
  serverAudioCache.set(key, entry);
}

async function synthesizeWithGeminiTts(
  ai: GoogleGenAI,
  text: string,
  voiceName: ReturnType<typeof normalizeVoiceId>,
  slow: boolean
): Promise<CachedAudioEntry> {
  const style = buildSpeechStylePrompt(voiceName, slow);

  const response = await ai.models.generateContent({
    model: TTS_MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text,
            speechMetadata: {
              style,
            },
          },
        ],
      },
    ],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName,
          },
        },
      },
    },
  });

  const part = response.candidates?.[0]?.content?.parts?.[0];
  const base64Audio = part?.inlineData?.data;
  const mimeType = part?.inlineData?.mimeType || 'audio/wav';

  if (!base64Audio) {
    throw new Error('Gemini TTS response did not include audio inlineData');
  }

  return {
    audioBase64: base64Audio,
    mimeType,
    voiceName,
  };
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  app.use(express.json({ limit: '64kb' }));

  app.use('/api', (_req: Request, res: Response, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (_req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.get('/api/tts/health', (_req: Request, res: Response) => {
    const configured = Boolean(
      process.env.GEMINI_API_KEY &&
        process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
    );
    res.json({
      ok: true,
      configured,
      model: TTS_MODEL,
    });
  });

  app.post('/api/tts', async (req: Request, res: Response) => {
    const rawText = typeof req.body?.text === 'string' ? req.body.text : '';
    const text = normalizeTtsText(rawText);
    const slow = Boolean(req.body?.slow);
    const voiceName = normalizeVoiceId(req.body?.voiceName);

    if (!text) {
      res.status(400).json({ error: 'Text is required for speech synthesis.' });
      return;
    }
    if (text.length > 500) {
      res.status(400).json({ error: 'Text exceeds maximum 500 characters.' });
      return;
    }

    const cacheKey = buildTtsCacheKey(text, voiceName, slow);
    const cached = serverAudioCache.get(cacheKey);
    if (cached) {
      res.json({
        audioBase64: cached.audioBase64,
        mimeType: cached.mimeType,
        voiceName: cached.voiceName,
        model: TTS_MODEL,
        cached: true,
      });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'Gemini TTS API key is not configured on the server.',
      });
      return;
    }

    try {
      const result = await synthesizeWithGeminiTts(ai, text, voiceName, slow);
      setCachedAudio(cacheKey, result);
      res.json({
        audioBase64: result.audioBase64,
        mimeType: result.mimeType,
        voiceName: result.voiceName,
        model: TTS_MODEL,
        cached: false,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to synthesize speech';
      const status =
        typeof (err as { status?: unknown })?.status === 'number'
          ? (err as { status: number }).status
          : 500;
      res.status(status >= 400 && status < 600 ? status : 500).json({
        error: message,
      });
    }
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const enableHmr = process.env.ENABLE_HMR === 'true';

    if (!enableHmr) {
      const noHmrViteClient = `
const sheetsMap = new Map();
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
    sheetsMap.set(id, style);
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    style.remove();
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    invalidate() {},
    decline() {},
    on() {},
    off() {},
    send() {},
  };
}
export function injectQuery(url, queryToInject) {
  if (url[0] !== '.' && url[0] !== '/') return url;
  const pathname = url.replace(/[?#].*$/, '');
  const { search, hash } = new URL(url, 'http://vite.dev');
  return pathname + '?' + queryToInject + (search ? '&' + search.slice(1) : '') + (hash || '');
}
export class ErrorOverlay extends HTMLElement {}
`;
      app.get('/@vite/client', (_req: Request, res: Response) => {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.send(noHmrViteClient);
      });
    }

    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: enableHmr ? { server: httpServer } : false,
        ws: enableHmr ? { server: httpServer } : false,
        allowedHosts: true,
        watch: enableHmr ? {} : null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`LingoNova server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start LingoNova server:', err);
  process.exit(1);
});
