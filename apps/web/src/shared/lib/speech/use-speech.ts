'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { INITIAL_GATE, nextGate, pickVoice, type SpeechGate, speechLang } from './speech-queue';

const STORAGE_KEY = 'bioauth.voice';

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

/**
 * Озвучка подсказок (Web Speech API, синтез в браузере, ничего не отправляется на сервер). Выключена по умолчанию;
 * выбор запоминается в браузере. `hasVoice` = false — в системе нет голоса для языка интерфейса.
 */
export function useSpeech(locale: string) {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [enabled, setEnabled] = useState(false);
  const [hasVoice, setHasVoice] = useState(true);
  const gate = useRef<SpeechGate>(INITIAL_GATE);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setEnabled(supported && readStored()), [supported]);

  useEffect(() => {
    if (!supported) return;
    const check = () => {
      const voices = window.speechSynthesis.getVoices();
      setHasVoice(voices.length === 0 || pickVoice(voices, locale) !== null);
    };
    check();
    window.speechSynthesis.addEventListener('voiceschanged', check);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', check);
  }, [supported, locale]);

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
    setEnabled((on) => {
      const next = !on;
      try {
        localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off');
      } catch {
        /* приватный режим: выбор действует до перезагрузки */
      }
      if (!next) window.speechSynthesis.cancel();
      gate.current = INITIAL_GATE;
      return next;
    });
  }, []);

  return { supported, enabled, hasVoice, toggle, announce };
}
