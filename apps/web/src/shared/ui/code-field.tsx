'use client';

import { useEffect, useRef } from 'react';

import { TextField } from './field';

/** Поле 6-значного кода: цифровая клавиатура на телефоне, автозаполнение из SMS/менеджера паролей, только цифры. */
export function CodeField({
  label,
  hint,
  value,
  onChange,
  focusOnMount,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  /** Перевести фокус на поле при появлении — после шага, на который пользователь сам перешёл. */
  focusOnMount?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focusOnMount) ref.current?.focus();
  }, [focusOnMount]);
  return (
    <TextField
      ref={ref}
      label={label}
      hint={hint}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="\d{6}"
      maxLength={6}
      className="max-w-48"
      required
    />
  );
}
