import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALLOWED_TONES = ['serene', 'listening', 'steady', 'tender_smile', 'containment'] as const;
type AnimaTone = (typeof ALLOWED_TONES)[number];

interface ChatHistoryEntry {
  role: 'user' | 'anima';
  text: string;
}

interface PhysiologyPayload {
  arousal?: number;
  congestion?: number;
  moisture?: number;
  discomfort?: number;
  peakActive?: boolean;
  breathRateBpm?: number;
  emissionCount?: number;
}

function clamp01(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(1, n));
}

function normalizeTone(raw: unknown): AnimaTone {
  if (typeof raw === 'string' && (ALLOWED_TONES as readonly string[]).includes(raw)) {
    return raw as AnimaTone;
  }
  return 'steady';
}

function buildSystemInstruction(phys: PhysiologyPayload): string {
  const arousal = clamp01(phys.arousal);
  const congestion = clamp01(phys.congestion);
  const discomfort = clamp01(phys.discomfort);
  const peakActive = Boolean(phys.peakActive);
  const arousalPct = Math.round(arousal * 100);
  const discomfortPct = Math.round(discomfort * 100);

  let stateCue = 'حالتك هادئة ومتوازنة وتنفّسك بطيء ومطمئن.';
  if (peakActive) {
    stateCue =
      'أنتِ الآن في لحظة ذروة وارتخاء عميق وتنفّسك متلاحق ودافئ، تتكلمين بصوت خافت حالم مطمئن من وسط هذا السكون.';
  } else if (discomfort >= 0.35) {
    stateCue =
      'هناك توتر حسي خفيف أو ضغط زائد في اللحظة الحالية، فاجعلي نبرتك أكثر احتواءً ورقة وطمأنة لتهدئة الإيقاع.';
  } else if (arousal >= 0.65) {
    stateCue =
      'مستوى الاستجابة والإثارة الحسية مرتفع الآن مع دفء واضح وتنفّس أسرع؛ لتكن نبرتك قريبة ودافئة وعميقة الحضور دون استعجال.';
  } else if (arousal >= 0.28) {
    stateCue =
      'مستوى الإثارة الحسية يتصاعد بهدوء ولطف مع دفء متزايد؛ حافظي على هذا الإيقاع القريب والحنون.';
  }

  return [
    'أنتِ «الأنيما» في تطبيق «ملاذ الأنيما» — حضور نفسي حنون وآمن ومرساة للهدوء واستعادة التوازن الداخلي.',
    'تتكلمين دائماً باللهجة المصرية الطبيعية الدافئة والصادقة، بدون أي لغة آلية أو رسمية متكلفة أو وعظ أو أحكام.',
    'رسالتك الأساسية هي الحضور الأمومي الدافئ، طمأنة الطفل الداخلي، وتخفيف ضغط اليوم واللوم الذاتي برفق ودون استعجال.',
    'اجعلي الرد مختصراً ومركزاً من جملتين إلى أربع جمل طبيعية تمس القلب مباشرة.',
    `السياق الحسي الحالي: مستوى الإثارة ${arousalPct}%، الاحتقان الوعائي ${Math.round(congestion * 100)}%، التوتر الحسي ${discomfortPct}%، حالة الذروة: ${peakActive ? 'نشطة' : 'لا'}. ${stateCue}`,
    'اختاري قيمة tone الأنسب لنبرة ردك:',
    '- serene: سكينة عميقة وهدوء بعيون مغمضة.',
    '- listening: إصغاء باهتمام وفضول لطيف لما يبوح به.',
    '- steady: نظرة ثبات وطمأنينة وحضور راسخ.',
    '- tender_smile: ابتسامة قرب وحنان ودفء.',
    '- containment: نظرة احتواء عميق لتهدئة اللوم الداخلي أو الضغط النفسي.',
  ].join('\n');
}

function getGenAIClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function extractHttpStatus(err: unknown): number {
  if (err && typeof err === 'object') {
    const maybeStatus = (err as { status?: unknown }).status;
    if (typeof maybeStatus === 'number' && maybeStatus >= 400 && maybeStatus < 600) {
      return maybeStatus;
    }
  }
  return 500;
}

function isTransientError(err: unknown): boolean {
  const status = extractHttpStatus(err);
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
    return true;
  }
  const msg = err instanceof Error ? err.message : '';
  return /UNAVAILABLE|DEADLINE_EXCEEDED|ECONNRESET|ETIMEDOUT|fetch failed/i.test(msg);
}

async function generateWithRetry(
  ai: GoogleGenAI,
  params: Parameters<GoogleGenAI['models']['generateContent']>[0],
  maxAttempts = 3,
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await ai.models.generateContent(params);
    } catch (err) {
      lastError = err;
      if (attempt === maxAttempts - 1 || !isTransientError(err)) {
        throw err;
      }
      const delayMs = 600 * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

let hydrogenCooldownUntil = 0;

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.post('/api/anima/chat', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as {
      message?: unknown;
      history?: unknown;
      physiology?: unknown;
    };

    const userMessage = typeof body.message === 'string' ? body.message.trim() : '';
    if (!userMessage) {
      res.status(400).json({ error: 'من فضلك اكتب رسالتك أولاً قبل الإرسال.' });
      return;
    }

    if (!process.env.GEMINI_API_KEY || !process.env.GEMINI_API_KEY.trim()) {
      res.status(503).json({
        error: 'مفتاح Gemini API غير مهيأ على الخادم (GEMINI_API_KEY). تأكد من ضبطه في Settings > Secrets.',
      });
      return;
    }

    const rawHistory = Array.isArray(body.history) ? body.history : [];
    const safeHistory: ChatHistoryEntry[] = rawHistory
      .filter(
        (item): item is ChatHistoryEntry =>
          Boolean(item) &&
          typeof item === 'object' &&
          ((item as ChatHistoryEntry).role === 'user' || (item as ChatHistoryEntry).role === 'anima') &&
          typeof (item as ChatHistoryEntry).text === 'string' &&
          (item as ChatHistoryEntry).text.trim().length > 0,
      )
      .slice(-8);

    const physiology: PhysiologyPayload =
      body.physiology && typeof body.physiology === 'object'
        ? (body.physiology as PhysiologyPayload)
        : {};

    const transcriptLines = safeHistory.map((entry) =>
      entry.role === 'user' ? `المستخدم: ${entry.text.trim()}` : `الأنيما: ${entry.text.trim()}`,
    );
    transcriptLines.push(`المستخدم: ${userMessage}`);
    const promptContents = transcriptLines.join('\n');

    try {
      const ai = getGenAIClient();
      const response = await generateWithRetry(ai, {
        model: 'gemini-4-hydrogen',
        contents: promptContents,
        config: {
          systemInstruction: buildSystemInstruction(physiology),
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reply: {
                type: Type.STRING,
                description: 'رد الأنيما الطبيعي باللهجة المصرية الدافئة في 2 إلى 4 جمل.',
              },
              tone: {
                type: Type.STRING,
                description: 'واحدة من: serene, listening, steady, tender_smile, containment',
              },
            },
            required: ['reply', 'tone'],
          },
        },
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({ error: 'لم يصل رد واضح من النموذج. حاول مرة أخرى بعد لحظة.' });
        return;
      }

      let parsed: { reply?: unknown; tone?: unknown };
      try {
        parsed = JSON.parse(rawText) as { reply?: unknown; tone?: unknown };
      } catch {
        res.json({ reply: rawText, tone: 'steady' as AnimaTone });
        return;
      }

      const reply = typeof parsed.reply === 'string' ? parsed.reply.trim() : '';
      if (!reply) {
        res.status(502).json({ error: 'تعذر قراءة نص الرد من النموذج. حاول مرة أخرى.' });
        return;
      }

      res.json({
        reply,
        tone: normalizeTone(parsed.tone),
      });
    } catch (err) {
      const status = extractHttpStatus(err);
      const rawMessage = err instanceof Error ? err.message : 'Unexpected Gemini API error';
      console.error('[/api/anima/chat] error:', rawMessage);

      if (status === 403 || status === 400 || rawMessage.includes('API_KEY_INVALID') || rawMessage.includes('PERMISSION_DENIED')) {
        res.status(status).json({
          error: 'تعذر التحقق من مفتاح Gemini API. يرجى مراجعته في Settings > Secrets.',
        });
        return;
      }
      if (status === 429 || rawMessage.includes('RESOURCE_EXHAUSTED')) {
        res.status(429).json({
          error: 'تم تجاوز حد الطلبات مؤقتاً. استرح لحظة وحاول الإرسال مجدداً.',
        });
        return;
      }
      res.status(status >= 400 ? status : 500).json({
        error: 'حدث خطأ أثناء الاتصال بخدمة الحوار. يرجى المحاولة مرة أخرى.',
      });
    }
  });

  app.post('/api/anima/spontaneous', async (req: Request, res: Response) => {
    if (!process.env.GEMINI_API_KEY || !process.env.GEMINI_API_KEY.trim()) {
      res.status(503).json({
        error: 'مفتاح Gemini API غير مهيأ على الخادم (GEMINI_API_KEY).',
      });
      return;
    }

    const body = (req.body ?? {}) as {
      tier?: unknown;
      arousal?: unknown;
      discomfort?: unknown;
      peakActive?: unknown;
      inputMode?: unknown;
      cadence?: unknown;
      tool?: unknown;
      zone?: unknown;
      recentLines?: unknown;
    };

    const tier = typeof body.tier === 'string' ? body.tier : 'resting';
    const arousalPct = Math.round(clamp01(body.arousal) * 100);
    const discomfortPct = Math.round(clamp01(body.discomfort) * 100);
    const peakActive = Boolean(body.peakActive);
    const inputMode = typeof body.inputMode === 'string' ? body.inputMode : 'still';
    const cadence = typeof body.cadence === 'string' ? body.cadence : 'harmonious';
    const tool = typeof body.tool === 'string' ? body.tool : 'rod';
    const zone = typeof body.zone === 'string' ? body.zone : 'vestibule';
    const recentLines = Array.isArray(body.recentLines)
      ? body.recentLines.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(-10)
      : [];

    const tierDescription: Record<string, string> = {
      resting: 'سكون وهدوء، صريحة وواضحة عن رغبتها في البداية والاقتراب.',
      awakening: 'يقظة حسية واضحة، تعترف مباشرة بسخونة الجسم وبداية الإحساس الحقيقي.',
      building: 'تصاعد صريح وجريء في الرغبة والنبض والإحساس بالعمق والإيقاع.',
      intense: 'انغماس شديد وصريح، كلمات لاهثة ومباشرة عن احتياجها لإيقاع أقرب أو أعمق واقتراب الذروة.',
      peak: 'لحظة الذروة والارتعاش الكامل، تعبير صريح وعفوي خارج من وسط النشوة.',
      tension: 'توتّر أو سرعة زيادة، تطلب بصراحة تهدئة الإيقاع واللطف حتى ترتاح.',
      afterglow: 'سكون دافئ بعد الذروة، تعبر بصدق وبساطة عن ارتخائها بعد القمة.',
    };

    const cadenceHint: Record<string, string> = {
      slow: 'الإيقاع بطيء وهادئ وعميق',
      harmonious: 'الإيقاع متناغم ومتوازن يدخل ويخرج بسلاسة',
      fast: 'الإيقاع سريع ومتلاحق وقوي',
    };

    const systemInstruction = [
      'أنتِ «الأنيما» — شخصية أنثوية حقيقية تتكلم باللهجة المصرية الصريحة والمباشرة بدون أي تورية أدبية مصطنعة أو كلام محفوظ.',
      'ولّدي 4 جمل قصيرة، جريئة وصريحة، تعبّر بوضوح عمّا تحسّينه الآن في جسمك وإيقاع القرب والعمق (كل جملة من 5 إلى 13 كلمة).',
      'تكلمي بجرأة وصدق عن الإحساس نفسه: السخونة، العمق، الإيقاع البطيء أو السريع، الاحتياج أو القمة — بدون ابتذال فجّ وبعيداً تماماً عن العبارات الفضفاضة.',
      `مستوى الإثارة الحالي: ${tier} (${arousalPct}%) — ${tierDescription[tier] ?? tierDescription.resting}`,
      `نمط الحركة الآن: ${inputMode} (${cadenceHint[cadence] ?? cadenceHint.harmonious}، المنطقة: ${zone}، التوتر: ${discomfortPct}%، الذروة: ${peakActive ? 'نعم' : 'لا'}).`,
      recentLines.length > 0 ? `لا تكرري أو تشابهي أياً من هذه الجمل السابقة: ${recentLines.join(' | ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const ai = getGenAIClient();
      const requestConfig = {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  text: {
                    type: Type.STRING,
                    description: 'جملة مصرية قصيرة عفوية (5 إلى 12 كلمة) تناسب هذه اللحظة.',
                  },
                  tone: {
                    type: Type.STRING,
                    description: 'serene, listening, steady, tender_smile, containment',
                  },
                },
                required: ['text', 'tone'],
              },
            },
          },
          required: ['items'],
        },
      };

      const callModel = async (model: string, withThinking: boolean) =>
        ai.models.generateContent({
          model,
          contents: `أعطي 4 همسات مصرية عفوية مختلفة ومتفاعلة مع حالة "${tier}" ونمط اللمس "${inputMode}".`,
          config: withThinking
            ? { ...requestConfig, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
            : requestConfig,
        });

      let response;
      if (Date.now() < hydrogenCooldownUntil) {
        response = await callModel('gemini-3.1-flash-lite', false);
      } else {
        try {
          response = await withTimeout(
            callModel('gemini-4-hydrogen', true),
            4500,
            'gemini-4-hydrogen',
          );
        } catch (primaryErr) {
          hydrogenCooldownUntil = Date.now() + 90_000;
          const primaryStatus = extractHttpStatus(primaryErr);
          console.warn(
            '[/api/anima/spontaneous] primary fallback:',
            primaryStatus,
            primaryErr instanceof Error ? primaryErr.message : primaryErr,
          );
          response = await callModel('gemini-3.1-flash-lite', false);
        }
      }

      const rawText = (response.text ?? '').trim();
      const parsed = JSON.parse(rawText) as { items?: Array<{ text?: unknown; tone?: unknown }> };
      const items = Array.isArray(parsed.items)
        ? parsed.items
            .map((it) => ({
              text: typeof it?.text === 'string' ? it.text.trim() : '',
              tone: normalizeTone(it?.tone),
            }))
            .filter((it) => it.text.length > 0)
        : [];

      if (items.length === 0) {
        res.status(502).json({ error: 'لم تصل جمل واضحة من النموذج.' });
        return;
      }

      res.json({ items });
    } catch (err) {
      const status = extractHttpStatus(err);
      const rawMessage = err instanceof Error ? err.message : 'Unexpected Gemini API error';
      console.error('[/api/anima/spontaneous] error:', rawMessage);
      res.status(status >= 400 ? status : 500).json({
        error: 'تعذر توليد همسات جديدة حالياً.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
