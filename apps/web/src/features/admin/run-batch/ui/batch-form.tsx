'use client';

import { useId, useState } from 'react';

import { parseNumber } from '@/shared/lib';
import { ApiErrorNotice, Button, Checkbox, NumberField, TextField } from '@/shared/ui';

import { useStartBatch } from '../api/batch';

/** Загрузка архива набора изображений: «<субъект>/<файл>.jpg», общая корневая папка допускается. */
export function BatchForm() {
  const start = useStartBatch();
  const fileId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [seed, setSeed] = useState('0');
  const [maxImpostor, setMaxImpostor] = useState('100000');
  const [include, setInclude] = useState(false);
  const s = parseNumber(seed);
  const m = parseNumber(maxImpostor);
  const valid =
    file !== null &&
    s !== null &&
    Number.isInteger(s) &&
    s >= 0 &&
    m !== null &&
    Number.isInteger(m) &&
    m >= 1 &&
    m <= 900_000;
  return (
    <div className="flex flex-col gap-4">
      <label
        htmlFor={fileId}
        className="border-graphite/50 bg-paper hover:border-ink flex cursor-pointer flex-col gap-1 rounded-md border border-dashed px-4 py-5 text-sm"
      >
        <span className="font-medium">{file ? file.name : 'Выберите zip-архив с изображениями лиц'}</span>
        <span className="text-graphite">
          Папка на каждого субъекта: <span className="num">alice/1.jpg, alice/2.jpg, bob/1.jpg…</span> JPEG,
          PNG или BMP; до 5000 файлов.
        </span>
        <input
          id={fileId}
          type="file"
          accept=".zip,application/zip"
          className="sr-only"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>
      <TextField
        label="Название набора оценок"
        placeholder="по имени архива"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          label="Seed выборки"
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          hint="Тот же seed — те же пары и тот же CSV"
        />
        <NumberField
          label="Impostor-пар не больше"
          value={maxImpostor}
          onChange={(e) => setMaxImpostor(e.target.value)}
          hint="Если всех пар больше — случайная выборка"
        />
      </div>
      <Checkbox
        label="Добавить оценки в калибровку (источник «пакет»)"
        checked={include}
        onChange={(e) => setInclude(e.target.checked)}
      />
      <ApiErrorNotice error={start.error} />
      <div>
        <Button
          disabled={!valid}
          busy={start.isPending}
          onClick={() =>
            file &&
            start.mutate(
              { file, name, seed: s!, maxImpostor: m!, includeInCalibration: include },
              { onSuccess: () => setFile(null) },
            )
          }
        >
          Запустить обработку
        </Button>
      </div>
    </div>
  );
}
