import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSpeechStylePrompt,
  buildTtsCacheKey,
  DEFAULT_HUMAN_VOICE,
  HUMAN_VOICE_PRESETS,
  isValidHumanVoice,
  normalizeTtsText,
  normalizeVoiceId,
  resolveApiUrl,
} from './ttsHelpers';

test('isValidHumanVoice validates known presets and rejects unknown values', () => {
  for (const preset of HUMAN_VOICE_PRESETS) {
    assert.equal(isValidHumanVoice(preset.id), true);
  }
  assert.equal(isValidHumanVoice('RobotVoice9000'), false);
  assert.equal(isValidHumanVoice(null), false);
  assert.equal(normalizeVoiceId('invalid'), DEFAULT_HUMAN_VOICE);
  assert.equal(normalizeVoiceId('Zephyr'), 'Zephyr');
});

test('buildTtsCacheKey normalizes whitespace and separates slow vs normal pace', () => {
  const keyNormal = buildTtsCacheKey('Hello,   I am   Sara.', 'Kore', false);
  const keySlow = buildTtsCacheKey('Hello, I am Sara.', 'Kore', true);
  assert.equal(keyNormal, 'Kore:normal:Hello, I am Sara.');
  assert.equal(keySlow, 'Kore:slow:Hello, I am Sara.');
  assert.notEqual(keyNormal, keySlow);
  assert.equal(normalizeTtsText('  Good   morning  '), 'Good morning');
});

test('buildSpeechStylePrompt reflects slow articulation vs natural cadence', () => {
  const normalPrompt = buildSpeechStylePrompt('Kore', false);
  const slowPrompt = buildSpeechStylePrompt('Kore', true);
  assert.match(normalPrompt.toLowerCase(), /natural/);
  assert.match(slowPrompt.toLowerCase(), /slowly|syllable/);
});

test('resolveApiUrl builds relative paths on web and absolute backend URLs for APK builds', () => {
  assert.equal(resolveApiUrl('/api/tts'), '/api/tts');
  assert.equal(resolveApiUrl('api/tts', ''), '/api/tts');
  assert.equal(
    resolveApiUrl('/api/tts', 'https://example.run.app/'),
    'https://example.run.app/api/tts'
  );
  assert.equal(
    resolveApiUrl('api/tts', '  https://example.run.app  '),
    'https://example.run.app/api/tts'
  );
});

