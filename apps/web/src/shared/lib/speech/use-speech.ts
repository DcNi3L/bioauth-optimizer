'use client';

import { useCallback, useEffect, useRef } from 'react';

import { useBrowserValue, useStoredValue, writeStored } from '../browser';
import { INITIAL_GATE, nextGate, pickVoice, type SpeechGate, speechLang } from './speech-queue';

const STORAGE_KEY = 'bioauth.voice';

const subscribeVoices = (cb: () => void) => {
  if (!('speechSynthesis' in window)) return () => undefined;
  window.speechSynthesis.addEventListener('voiceschanged', cb);
  return () => window.speechSynthesis.removeEventListener('voiceschanged', cb);
};

/**
 * Озвучка подсказок (Web Speech API, синтез в браузере, ничего не отправляется на сервер). Выключена по умолчанию;
 * выбор запоминается в браузере. `hasVoice` = false — в системе нет голоса для языка интерфейса.
 */
export function useSpeech(locale: string) {
  const supported = useBrowserValue(() => 'speechSynthesis' in window, false);
  const stored = useStoredValue(STORAGE_KEY);
  const enabled = supported && stored === 'on';
  // Список голосов приходит асинхронно (voiceschanged); пустой список — ещё не загружен, не «нет голоса».
  const hasVoice = useBrowserValue(
    () => {
      if (!('speechSynthesis' in window)) return true;
      const voices = window.speechSynthesis.getVoices();
      return voices.length === 0 || pickVoice(voices, locale) !== null;
    },
    true,
    subscribeVoices,
  );
  const gate = useRef<SpeechGate>(INITIAL_GATE);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = useCallback(
    (text: string) => {
      const synth = window.speechSynthesis;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = speechLang(locale);
      const voice = pickVoice(synth.getVoices(), locale);
      if (voice) u.voice = voice;
      u.rate = 1.05;
      synth.cancel(); // устаревшая подсказка не дочитывается
      synth.speak(u);
    },
    [locale],
  );

  /** Сообщить текущую подсказку; озвучится, когда продержится и не будет повтором. */
  const announce = useCallback(
    (text: string | null) => {
      if (!enabled) return;
      const step = () => {
        const r = nextGate(gate.current, text, performance.now());
        gate.current = r.gate;
        if (r.say) say(r.say);
      };
      step();
      if (timer.current) clearTimeout(timer.current);
      if (text) timer.current = setTimeout(step, 400);
    },
    [enabled, say],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (supported) window.speechSynthesis.cancel();
    },
    [supported],
  );

  const toggle = useCallback(() => {
    const next = !enabled;
    writeStored(STORAGE_KEY, next ? 'on' : 'off');
    if (!next) window.speechSynthesis.cancel();
    gate.current = INITIAL_GATE;
  }, [enabled]);

  return { supported, enabled, hasVoice, toggle, announce };
}
