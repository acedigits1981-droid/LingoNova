export type HumanVoiceId = 'Kore' | 'Zephyr' | 'Puck' | 'Charon' | 'Fenrir';

export interface HumanVoicePreset {
  id: HumanVoiceId;
  nameFa: string;
  nameEn: string;
  toneFa: string;
  toneEn: string;
  styleNote: string;
}

export const DEFAULT_HUMAN_VOICE: HumanVoiceId = 'Kore';

export const HUMAN_VOICE_PRESETS: ReadonlyArray<HumanVoicePreset> = [
  {
    id: 'Kore',
    nameFa: 'کورا (گرم و شفاف)',
    nameEn: 'Kore (Warm Coach)',
    toneFa: 'لحن گرم و آموزشی طبیعی',
    toneEn: 'Warm, expressive pronunciation coach',
    styleNote: 'Warm, articulate, friendly female English pronunciation coach',
  },
  {
    id: 'Zephyr',
    nameFa: 'زفیر (پرانرژی و طبیعی)',
    nameEn: 'Zephyr (Bright & Natural)',
    toneFa: 'صدای روشن و محاوره‌ای',
    toneEn: 'Bright, natural conversational speaker',
    styleNote: 'Bright, cheerful, natural conversational English speaker',
  },
  {
    id: 'Puck',
    nameFa: 'پاک (صمیمی و روان)',
    nameEn: 'Puck (Friendly & Smooth)',
    toneFa: 'بیان صمیمی و روزمره',
    toneEn: 'Friendly, relaxed everyday cadence',
    styleNote: 'Friendly, relatable, upbeat English speaker with natural rhythm',
  },
  {
    id: 'Charon',
    nameFa: 'کارون (آرام و عمیق)',
    nameEn: 'Charon (Calm & Deep)',
    toneFa: 'صدای بم، آرام و شمرده',
    toneEn: 'Calm, grounded, measured cadence',
    styleNote: 'Calm, deep, reassuring male English voice coach',
  },
  {
    id: 'Fenrir',
    nameFa: 'فنریر (رسا و دقیق)',
    nameEn: 'Fenrir (Crisp & Confident)',
    toneFa: 'بیان رسا با تلفظ دقیق حروف',
    toneEn: 'Crisp, confident diction and clarity',
    styleNote: 'Confident, crisp, clear male English tutor',
  },
];

const VALID_VOICE_SET = new Set<string>(HUMAN_VOICE_PRESETS.map((v) => v.id));

export function isValidHumanVoice(value: unknown): value is HumanVoiceId {
  return typeof value === 'string' && VALID_VOICE_SET.has(value);
}

export function normalizeVoiceId(value: unknown): HumanVoiceId {
  return isValidHumanVoice(value) ? value : DEFAULT_HUMAN_VOICE;
}

export function normalizeTtsText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function buildTtsCacheKey(
  text: string,
  voiceName: HumanVoiceId,
  slow: boolean
): string {
  const clean = normalizeTtsText(text);
  return `${voiceName}:${slow ? 'slow' : 'normal'}:${clean}`;
}

export function buildSpeechStylePrompt(
  voiceName: HumanVoiceId,
  slow: boolean
): string {
  const preset =
    HUMAN_VOICE_PRESETS.find((v) => v.id === voiceName) ??
    HUMAN_VOICE_PRESETS[0];

  if (slow) {
    return `${preset.styleNote}, speaking gently and slowly with clear syllable separation and natural human warmth so an English learner can hear every sound`;
  }
  return `${preset.styleNote}, speaking naturally at a comfortable human pace with authentic intonation and clear pronunciation`;
}

export function resolveApiUrl(path: string, baseUrl?: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const trimmedBase = typeof baseUrl === 'string' ? baseUrl.trim().replace(/\/+$/, '') : '';
  return trimmedBase ? `${trimmedBase}${cleanPath}` : cleanPath;
}

