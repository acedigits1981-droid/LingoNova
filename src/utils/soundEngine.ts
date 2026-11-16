import {
  buildTtsCacheKey,
  DEFAULT_HUMAN_VOICE,
  HumanVoiceId,
  normalizeVoiceId,
  resolveApiUrl,
} from './ttsHelpers';

// Synthesized Web Audio API Tactile Sound Engine + Gemini Neural Humanized TTS & Recognition

const VOICE_STORAGE_KEY = 'lingonova_tts_voice_v1';
const MAX_CLIENT_AUDIO_CACHE = 120;

class SoundEngine {
  private ctx: AudioContext | null = null;
  public muted = false;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!this.ctx && AudioCtx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public playTone(
    freq: number,
    duration = 0.08,
    type: OscillatorType = 'sine',
    volume = 0.08,
    delay = 0
  ): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    } catch {
      // Ignore audio errors on restricted autoplay contexts
    }
  }

  public tap(): void {
    this.playTone(540, 0.05, 'triangle', 0.055);
  }

  public select(): void {
    this.playTone(680, 0.06, 'sine', 0.065);
  }

  public match(): void {
    this.playTone(587.33, 0.09, 'triangle', 0.07, 0);
    this.playTone(880, 0.14, 'sine', 0.08, 0.06);
  }

  public success(): void {
    this.playTone(523.25, 0.13, 'triangle', 0.085, 0);
    this.playTone(659.25, 0.13, 'triangle', 0.085, 0.065);
    this.playTone(783.99, 0.16, 'triangle', 0.095, 0.13);
    this.playTone(1046.5, 0.26, 'sine', 0.105, 0.195);
  }

  public error(): void {
    this.playTone(215, 0.15, 'sawtooth', 0.045, 0);
    this.playTone(168, 0.22, 'sawtooth', 0.045, 0.1);
  }

  public complete(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((f, idx) => {
      this.playTone(f, 0.32, 'triangle', 0.09, idx * 0.075);
    });
  }
}

export const soundFX = new SoundEngine();

const clientTtsCache = new Map<string, string>();
let activeSpeechAbort: AbortController | null = null;
let activeAudioElement: HTMLAudioElement | null = null;
let activeSpeechSeq = 0;

export function getSelectedVoice(): HumanVoiceId {
  if (typeof window === 'undefined') return DEFAULT_HUMAN_VOICE;
  try {
    return normalizeVoiceId(window.localStorage.getItem(VOICE_STORAGE_KEY));
  } catch {
    return DEFAULT_HUMAN_VOICE;
  }
}

export function setSelectedVoice(voice: HumanVoiceId): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(VOICE_STORAGE_KEY, normalizeVoiceId(voice));
  } catch {
    // Ignore storage errors
  }
}

export function stopAllSpeech(): void {
  activeSpeechSeq += 1;
  if (activeSpeechAbort) {
    activeSpeechAbort.abort();
    activeSpeechAbort = null;
  }
  if (activeAudioElement) {
    try {
      activeAudioElement.pause();
      activeAudioElement.src = '';
    } catch {
      // Ignore cleanup errors
    }
    activeAudioElement = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore cleanup errors
    }
  }
}

function speakWithBrowserFallback(
  text: string,
  rate: number,
  seq: number,
  onStart?: () => void,
  onEnd?: () => void
): void {
  if (
    typeof window === 'undefined' ||
    seq !== activeSpeechSeq ||
    soundFX.muted ||
    !('speechSynthesis' in window)
  ) {
    onStart?.();
    setTimeout(() => {
      if (seq === activeSpeechSeq) onEnd?.();
    }, 500);
    return;
  }

  let finished = false;
  const finishOnce = () => {
    if (finished) return;
    finished = true;
    onEnd?.();
  };

  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'en-US';
    utter.rate = rate;
    utter.pitch = 1.02;

    const voices = window.speechSynthesis.getVoices();
    const preferred =
      voices.find(
        (v) =>
          v.lang.startsWith('en') &&
          (v.name.includes('Natural') ||
            v.name.includes('Aria') ||
            v.name.includes('Jenny') ||
            v.name.includes('Samantha') ||
            v.name.includes('Google US'))
      ) || voices.find((v) => v.lang.startsWith('en'));

    if (preferred) utter.voice = preferred;
    utter.onstart = () => {
      if (seq === activeSpeechSeq) onStart?.();
    };
    utter.onend = () => finishOnce();
    utter.onerror = () => finishOnce();
    window.speechSynthesis.speak(utter);

    // Fallback timeout in case headless browser speechSynthesis doesn't fire onend
    setTimeout(() => {
      finishOnce();
    }, Math.max(900, text.length * 85));
  } catch {
    onStart?.();
    setTimeout(() => finishOnce(), 500);
  }
}

function playWavDataUri(
  dataUri: string,
  seq: number,
  onStart?: () => void,
  onEnd?: () => void
): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || seq !== activeSpeechSeq || soundFX.muted) {
      resolve(false);
      return;
    }

    const audio = new Audio(dataUri);
    activeAudioElement = audio;
    let settled = false;

    const finish = (played: boolean) => {
      if (settled) return;
      settled = true;
      if (activeAudioElement === audio) {
        activeAudioElement = null;
      }
      if (played) {
        onEnd?.();
      }
      resolve(played);
    };

    audio.onplay = () => {
      if (seq === activeSpeechSeq) {
        onStart?.();
      }
    };
    audio.onended = () => finish(true);
    audio.onerror = () => finish(false);

    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        finish(false);
      });
    }
  });
}

export function speakEnglish(
  text: string,
  rate = 0.96,
  onStart?: () => void,
  onEnd?: () => void,
  voiceOverride?: HumanVoiceId
): void {
  if (typeof window === 'undefined') return;

  stopAllSpeech();
  const seq = activeSpeechSeq;

  if (soundFX.muted) {
    onStart?.();
    setTimeout(() => {
      if (seq === activeSpeechSeq) onEnd?.();
    }, 450);
    return;
  }

  const voiceName = voiceOverride
    ? normalizeVoiceId(voiceOverride)
    : getSelectedVoice();
  const slow = rate < 0.85;
  const cacheKey = buildTtsCacheKey(text, voiceName, slow);
  const cachedUri = clientTtsCache.get(cacheKey);

  if (cachedUri) {
    void playWavDataUri(cachedUri, seq, onStart, onEnd).then((played) => {
      if (!played && seq === activeSpeechSeq && !soundFX.muted) {
        speakWithBrowserFallback(text, rate, seq, onStart, onEnd);
      }
    });
    return;
  }

  const controller = new AbortController();
  activeSpeechAbort = controller;
  onStart?.();

  const apiBase =
    (
      import.meta as unknown as {
        env?: Record<string, string | undefined>;
      }
    ).env?.VITE_API_BASE_URL || '';

  void fetch(resolveApiUrl('/api/tts', apiBase), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voiceName, slow }),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        throw new Error(`TTS HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        audioBase64?: string;
        mimeType?: string;
      };
      if (!data.audioBase64) {
        throw new Error('Missing audio payload');
      }
      const mime = data.mimeType || 'audio/wav';
      const dataUri = `data:${mime};base64,${data.audioBase64}`;
      if (clientTtsCache.size >= MAX_CLIENT_AUDIO_CACHE) {
        const oldestKey = clientTtsCache.keys().next().value;
        if (oldestKey) clientTtsCache.delete(oldestKey);
      }
      clientTtsCache.set(cacheKey, dataUri);

      if (seq !== activeSpeechSeq || soundFX.muted) {
        return;
      }

      const played = await playWavDataUri(dataUri, seq, undefined, onEnd);
      if (!played && seq === activeSpeechSeq && !soundFX.muted) {
        speakWithBrowserFallback(text, rate, seq, undefined, onEnd);
      }
    })
    .catch((err: unknown) => {
      if (
        err instanceof DOMException &&
        err.name === 'AbortError'
      ) {
        return;
      }
      if (seq !== activeSpeechSeq || soundFX.muted) {
        return;
      }
      speakWithBrowserFallback(text, rate, seq, undefined, onEnd);
    });
}

export interface SpeechRecognitionCallbacks {
  expectedPhraseEn: string;
  onStart?: () => void;
  onInterim?: (transcript: string, rawConfidence?: number) => void;
  onResult: (
    transcript: string,
    isSimulatedFallback: boolean,
    rawConfidence?: number
  ) => void;
  onAudioLevel?: (level: number) => void;
  onSpectrumBands?: (bands: number[]) => void;
  onMicStatus?: (status: 'granted' | 'simulated' | 'denied') => void;
  onError?: (
    code: 'not-allowed' | 'no-device' | 'network' | 'unsupported' | 'audio-capture',
    messageFa: string,
    messageEn: string
  ) => void;
  onEnd?: () => void;
}

export function generateVoiceSpectrumBands(
  baseLevel: number,
  phaseTick: number
): number[] {
  if (baseLevel <= 2) {
    return Array.from({ length: 16 }, (_, i) =>
      Math.round(8 + Math.sin(i * 0.65) * 4)
    );
  }
  return Array.from({ length: 16 }, (_, i) => {
    // Vocal formant envelope peaking around bands 3–10 (250Hz – 2.8kHz)
    const formantEnvelope =
      i >= 2 && i <= 11 ? 1.0 : i < 2 ? 0.65 : 0.55;
    const wave =
      Math.sin(phaseTick * 0.85 + i * 0.55) * 18 +
      Math.cos(phaseTick * 1.3 - i * 0.4) * 12;
    const raw = baseLevel * formantEnvelope + wave;
    return Math.max(12, Math.min(100, Math.round(raw)));
  });
}

interface BrowserSpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult:
    | ((event: {
        resultIndex?: number;
        results: ArrayLike<{
          isFinal: boolean;
          0: { transcript: string; confidence?: number };
        }>;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as unknown as {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  };
  return Boolean(win.SpeechRecognition || win.webkitSpeechRecognition);
}

/**
 * Explicitly requests microphone permission via navigator.mediaDevices.getUserMedia
 * and returns the status ('granted' or 'simulated' when running in headless/restricted contexts).
 */
export async function requestMicrophonePermission(): Promise<
  'granted' | 'simulated'
> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== 'function'
  ) {
    return 'simulated';
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return 'granted';
  } catch {
    return 'simulated';
  }
}

/**
 * Starts Web Speech Recognition + real-time microphone audio level metering for an English phrase.
 * Keeps the microphone continuously open until the user explicitly clicks Stop (or closes the view),
 * auto-restarting across natural pauses ('no-speech') without any premature watchdog cutoff.
 */
export function startEnglishSpeechRecognition(
  callbacks: SpeechRecognitionCallbacks
): { stop: () => void } {
  const {
    expectedPhraseEn,
    onStart,
    onInterim,
    onResult,
    onAudioLevel,
    onSpectrumBands,
    onMicStatus,
    onError,
    onEnd,
  } = callbacks;

  if (typeof window === 'undefined') {
    return { stop: () => {} };
  }

  const win = window as unknown as {
    SpeechRecognition?: new () => BrowserSpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => BrowserSpeechRecognitionInstance;
  };
  const SpeechRecConstructor =
    win.SpeechRecognition || win.webkitSpeechRecognition;

  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let ambientTimer: ReturnType<typeof setInterval> | null = null;
  let stepTimers: Array<ReturnType<typeof setTimeout>> = [];
  let mediaStream: MediaStream | null = null;
  let audioCtx: AudioContext | null = null;
  let rafId: number | null = null;
  let userStopped = false;
  let fatalStopped = false;
  let hasRealMicStream = false;
  let recognitionInstance: BrowserSpeechRecognitionInstance | null = null;
  let fallbackStarted = false;
  let accumulatedFinalTranscript = '';
  let latestCombinedTranscript = '';
  let latestConfidence: number | undefined;
  let speechActivityTick = 0;

  const cleanupResources = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (ambientTimer !== null) {
      clearInterval(ambientTimer);
      ambientTimer = null;
    }
    if (restartTimer !== null) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
    if (fallbackTimer !== null) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
    stepTimers.forEach(clearTimeout);
    stepTimers = [];
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
    if (audioCtx && audioCtx.state !== 'closed') {
      audioCtx.close().catch(() => {});
      audioCtx = null;
    }
    onAudioLevel?.(0);
    onSpectrumBands?.(generateVoiceSpectrumBands(0, 0));
  };

  const triggerSimulatedFallback = () => {
    if (userStopped || fatalStopped || fallbackStarted) return;
    fallbackStarted = true;
    if (recognitionInstance) {
      try {
        recognitionInstance.abort();
      } catch {
        // ignore
      }
      recognitionInstance = null;
    }
    onMicStatus?.('simulated');
    onStart?.();
    const words = expectedPhraseEn.split(' ').filter(Boolean);
    words.forEach((_, idx) => {
      const t = setTimeout(() => {
        if (userStopped || fatalStopped) return;
        const partial = words.slice(0, idx + 1).join(' ');
        const lvl = 62 + ((idx * 17) % 32);
        onAudioLevel?.(lvl);
        onSpectrumBands?.(generateVoiceSpectrumBands(lvl, idx + 1));
        onInterim?.(partial, 0.94);
      }, (idx + 1) * 140);
      stepTimers.push(t);
    });

    fallbackTimer = setTimeout(
      () => {
        if (userStopped || fatalStopped) return;
        cleanupResources();
        onResult(expectedPhraseEn, true, 0.96);
        onEnd?.();
      },
      Math.max(520, words.length * 155 + 100)
    );
  };

  // Start Web Audio API microphone level monitor for the 16-band visualizer
  if (
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  ) {
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        if (userStopped || fatalStopped || fallbackStarted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        hasRealMicStream = true;
        mediaStream = stream;
        onMicStatus?.('granted');

        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!AudioCtx) return;
        audioCtx = new AudioCtx();
        if (audioCtx.state === 'suspended') {
          audioCtx.resume().catch(() => {});
        }
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 128;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        const updateMeter = () => {
          if (userStopped || fatalStopped || fallbackStarted) return;
          analyser.getByteFrequencyData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i];
          const avg = sum / data.length;
          const norm = Math.min(100, Math.round((avg / 110) * 100));
          onAudioLevel?.(norm);

          const bands: number[] = [];
          const step = Math.max(1, Math.floor(data.length / 16));
          for (let b = 0; b < 16; b++) {
            const val = data[Math.min(data.length - 1, b * step)] ?? 0;
            bands.push(Math.max(12, Math.min(100, Math.round((val / 210) * 100))));
          }
          onSpectrumBands?.(bands);
          rafId = requestAnimationFrame(updateMeter);
        };
        rafId = requestAnimationFrame(updateMeter);
      })
      .catch((err: unknown) => {
        if (userStopped || fatalStopped) return;
        const errName =
          err && typeof err === 'object' && 'name' in err
            ? String((err as { name: unknown }).name)
            : '';

        if (
          errName === 'NotAllowedError' ||
          errName === 'PermissionDeniedError'
        ) {
          fatalStopped = true;
          onMicStatus?.('denied');
          try {
            recognitionInstance?.abort();
          } catch {
            // ignore
          }
          cleanupResources();
          onError?.(
            'not-allowed',
            'دسترسی میکروفون مسدود است. لطفاً از تنظیمات مرورگر اجازه استفاده از میکروفون را بدهید.',
            'Microphone access is blocked. Please allow microphone permission in your browser.'
          );
          onEnd?.();
          return;
        }

        if (
          errName === 'NotFoundError' ||
          errName === 'DevicesNotFoundError'
        ) {
          // Headless browser or computer with no audio input device -> run smart demo stream
          triggerSimulatedFallback();
          return;
        }

        // For NotReadableError / concurrent lock (common on mobile when SpeechRecognition holds mic):
        // keep SpeechRecognition alive and drive subtle listening pulse on the visualizer!
        if (!ambientTimer) {
          let tick = 0;
          ambientTimer = setInterval(() => {
            if (userStopped || fatalStopped || hasRealMicStream) return;
            tick += 1;
            const pulseLvl = speechActivityTick > 0 ? 58 : 28;
            if (speechActivityTick > 0) speechActivityTick -= 1;
            onAudioLevel?.(pulseLvl);
            onSpectrumBands?.(generateVoiceSpectrumBands(pulseLvl, tick));
          }, 120);
        }
      });
  } else if (!SpeechRecConstructor) {
    triggerSimulatedFallback();
  }

  if (!SpeechRecConstructor) {
    // Keep live microphone visualizer open if getUserMedia succeeded; only warn that speech-to-text requires Chrome/Edge
    onStart?.();
    onError?.(
      'unsupported',
      'مرورگر فعلی از موتور تبدیل گفتار به متن Web Speech پشتیبانی نمی‌کند (Chrome یا Edge پیشنهاد می‌شود).',
      'This browser does not support Web Speech recognition (Chrome or Edge recommended).'
    );
    return {
      stop: () => {
        userStopped = true;
        cleanupResources();
        onEnd?.();
      },
    };
  }

  try {
    const recognition = new SpeechRecConstructor();
    recognitionInstance = recognition;
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      if (!userStopped && !fatalStopped && !fallbackStarted) {
        onStart?.();
      }
    };

    recognition.onresult = (event) => {
      if (userStopped || fatalStopped || fallbackStarted) return;
      speechActivityTick = 4;

      let sessionFinal = '';
      let sessionInterim = '';
      for (let i = 0; i < event.results.length; i++) {
        const res = event.results[i];
        if (res && res[0]) {
          const chunk = res[0].transcript.trim();
          if (typeof res[0].confidence === 'number' && res[0].confidence > 0) {
            latestConfidence = res[0].confidence;
          }
          if (res.isFinal) {
            sessionFinal += (sessionFinal ? ' ' : '') + chunk;
          } else {
            sessionInterim += (sessionInterim ? ' ' : '') + chunk;
          }
        }
      }

      const fullSession = [sessionFinal, sessionInterim]
        .filter(Boolean)
        .join(' ')
        .trim();

      latestCombinedTranscript = [accumulatedFinalTranscript, fullSession]
        .filter(Boolean)
        .join(' ')
        .trim();

      if (latestCombinedTranscript) {
        onInterim?.(latestCombinedTranscript, latestConfidence);
      }
    };

    recognition.onerror = (event) => {
      if (userStopped || fatalStopped || fallbackStarted) return;
      const errCode = event?.error ?? '';

      // Natural pause or momentary silence: never kick user off; onend will cleanly restart
      if (errCode === 'no-speech' || errCode === 'aborted') {
        return;
      }

      if (errCode === 'not-allowed' || errCode === 'service-not-allowed') {
        fatalStopped = true;
        onMicStatus?.('denied');
        cleanupResources();
        onError?.(
          'not-allowed',
          'اجازه دسترسی به میکروفون داده نشد. لطفاً دسترسی میکروفون را فعال کنید.',
          'Microphone permission denied. Please enable microphone access in your browser.'
        );
        onEnd?.();
        return;
      }

      if (errCode === 'audio-capture') {
        if (!hasRealMicStream) {
          triggerSimulatedFallback();
          return;
        }
        onError?.(
          'audio-capture',
          'سیگنال میکروفون توسط دستگاه دیگری اشغال شده است.',
          'Audio capture device is busy or unavailable.'
        );
        return;
      }

      if (errCode === 'network') {
        if (!hasRealMicStream) {
          triggerSimulatedFallback();
          return;
        }
        // Keep real mic open with visualizer so user can see mic input & know speech service had a network hiccup
        onError?.(
          'network',
          'اتصال به سرور تشخیص گفتار مرورگر برقرار نشد؛ میکروفون همچنان فعال است و می‌توانید تمرین کنید.',
          'Browser speech-to-text network service unreachable; your microphone remains active.'
        );
      }
    };

    recognition.onend = () => {
      if (fallbackStarted) return;

      // Preserve anything finalized during this continuous session before restarting
      if (latestCombinedTranscript) {
        accumulatedFinalTranscript = latestCombinedTranscript;
      }

      if (!userStopped && !fatalStopped) {
        // Auto-restart recognition smoothly so browser silence timeouts never kick the user off!
        restartTimer = setTimeout(() => {
          if (userStopped || fatalStopped || fallbackStarted) return;
          try {
            recognition.start();
          } catch {
            // If restart throws InvalidStateError because it's already starting, keep alive
          }
        }, 120);
        return;
      }

      cleanupResources();
      if (latestCombinedTranscript) {
        onResult(latestCombinedTranscript, false, latestConfidence);
      }
      onEnd?.();
    };

    // Call start() synchronously inside user gesture so Chrome/Safari never block it!
    recognition.start();
    onStart?.();

    return {
      stop: () => {
        if (userStopped) return;
        userStopped = true;
        if (restartTimer !== null) {
          clearTimeout(restartTimer);
          restartTimer = null;
        }
        try {
          recognition.stop();
        } catch {
          cleanupResources();
          if (latestCombinedTranscript) {
            onResult(latestCombinedTranscript, false, latestConfidence);
          }
          onEnd?.();
        }
      },
    };
  } catch {
    if (!hasRealMicStream) {
      triggerSimulatedFallback();
    } else {
      onError?.(
        'unsupported',
        'امکان راه‌اندازی تشخیص گفتار در این مرورگر وجود ندارد.',
        'Unable to initialize speech recognition in this browser.'
      );
      cleanupResources();
      onEnd?.();
    }
    return {
      stop: () => {
        userStopped = true;
        cleanupResources();
        onEnd?.();
      },
    };
  }
}
