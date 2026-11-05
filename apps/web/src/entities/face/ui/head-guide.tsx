import type { LivenessCommand } from '@bioauth/contracts';

export type GuideTone = 'neutral' | 'ok' | 'warn';

/**
 * Силуэт головы и плеч в системе координат 400×300 (кадр 4:3). Лицо (лоб–подбородок) занимает
 * примерно 0,34 ширины кадра — под эти размеры настроены подсказки «ближе/дальше» (entities/face/model/guide).
 */
export const HEAD_PATH =
  'M200 40 C244 40 268 72 268 116 C268 128 266 138 264 146 C272 146 276 154 274 166 C272 178 266 184 260 184 ' +
  'C254 206 238 224 222 232 C214 236 207 238 200 238 C193 238 186 236 178 232 C162 224 146 206 140 184 ' +
  'C134 184 128 178 126 166 C124 154 128 146 136 146 C134 138 132 128 132 116 C132 72 156 40 200 40 Z';
export const SHOULDERS_PATH =
  'M178 236 L176 258 C150 264 112 274 92 300 M222 236 L224 258 C250 264 288 274 308 300';

const TONE: Record<GuideTone, string> = {
  neutral: 'rgba(251,252,250,0.85)',
  ok: '#4ade80',
  warn: '#fbbf24',
};

function Chevrons({ dir, x, y }: { dir: 'left' | 'right' | 'up'; x: number; y: number }) {
  const d =
    dir === 'left'
      ? 'M10 -12 L0 0 L10 12'
      : dir === 'right'
        ? 'M-10 -12 L0 0 L-10 12'
        : 'M-12 10 L0 0 L12 10';
  const step = dir === 'up' ? { dx: 0, dy: -16 } : { dx: dir === 'left' ? -16 : 16, dy: 0 };
  return (
    <g>
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          d={d}
          transform={`translate(${x + step.dx * i} ${y + step.dy * i})`}
          className={`guide-chevron guide-chevron-${dir}`}
          style={{ animationDelay: `${i * 0.18}s` }}
          fill="none"
          stroke="#fbfcfa"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </g>
  );
}

/** Стрелки и линии, показывающие, что сделать. Предпросмотр зеркальный: «влево» для человека — влево на экране. */
function CommandGuide({ command }: { command: LivenessCommand }) {
  switch (command) {
    case 'TURN_LEFT':
      return (
        <g>
          <path
            d="M200 30 C160 26 126 46 112 78"
            fill="none"
            stroke="#fbfcfa"
            strokeWidth="3"
            strokeDasharray="7 6"
            className="guide-dash"
          />
          <path
            d="M104 68 L111 80 L124 74"
            fill="none"
            stroke="#fbfcfa"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <Chevrons dir="left" x={104} y={150} />
        </g>
      );
    case 'TURN_RIGHT':
      return (
        <g>
          <path
            d="M200 30 C240 26 274 46 288 78"
            fill="none"
            stroke="#fbfcfa"
            strokeWidth="3"
            strokeDasharray="7 6"
            className="guide-dash"
          />
          <path
            d="M296 68 L289 80 L276 74"
            fill="none"
            stroke="#fbfcfa"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <Chevrons dir="right" x={296} y={150} />
        </g>
      );
    case 'CHIN_UP':
      return (
        <g>
          <Chevrons dir="up" x={200} y={30} />
          <path
            d="M150 262 C170 248 230 248 250 262"
            fill="none"
            stroke="#fbfcfa"
            strokeWidth="3"
            strokeDasharray="7 6"
            className="guide-dash"
          />
          <path
            d="M200 270 L200 246 M190 254 L200 244 L210 254"
            fill="none"
            stroke="#fbfcfa"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      );
    case 'MOVE_CLOSER':
      return (
        <g className="guide-expand">
          {[
            'M112 52 L112 30 L134 30',
            'M288 52 L288 30 L266 30',
            'M112 228 L112 250 L134 250',
            'M288 228 L288 250 L266 250',
          ].map((d) => (
            <path key={d} d={d} fill="none" stroke="#fbfcfa" strokeWidth="4" strokeLinecap="round" />
          ))}
        </g>
      );
  }
}

/** Рамка найденного лица (координаты в долях кадра, кадр не зеркальный) → система 400×300 с учётом object-cover. */
function boxToView(box: readonly [number, number, number, number], aspect: number) {
  const [x, y, w, h] = box;
  const mx = 1 - x - w; // зеркалим, как предпросмотр
  if (aspect >= 4 / 3) {
    const vw = 300 * aspect;
    const off = (vw - 400) / 2;
    return { x: mx * vw - off, y: y * 300, w: w * vw, h: h * 300 };
  }
  const vh = 400 / aspect;
  const off = (vh - 300) / 2;
  return { x: mx * 400, y: y * vh - off, w: w * 400, h: h * vh };
}

export function HeadGuide({
  tone,
  progress,
  command,
  showCenter,
  box,
  aspect,
}: {
  tone: GuideTone;
  progress: number;
  command: LivenessCommand | null;
  showCenter: boolean;
  box: readonly [number, number, number, number] | null;
  aspect: number;
}) {
  const stroke = TONE[tone];
  const b = box ? boxToView(box, aspect) : null;
  return (
    <svg
      viewBox="0 0 400 300"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    >
      <defs>
        <mask id="head-hole">
          <rect width="400" height="300" fill="white" />
          <path d={HEAD_PATH} fill="black" />
        </mask>
      </defs>
      <rect width="400" height="300" fill="rgba(10,15,22,0.5)" mask="url(#head-hole)" />
      {showCenter && (
        <g stroke="rgba(251,252,250,0.35)" strokeWidth="1" strokeDasharray="3 5">
          <line x1="150" y1="122" x2="250" y2="122" />
          <line x1="200" y1="70" x2="200" y2="212" />
        </g>
      )}
      <path
        d={SHOULDERS_PATH}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeOpacity="0.6"
        strokeLinecap="round"
      />
      <path
        d={HEAD_PATH}
        fill="none"
        stroke={stroke}
        strokeWidth="2.5"
        strokeDasharray="7 5"
        className="transition-[stroke] duration-300"
      />
      {progress > 0 && (
        <path
          d={HEAD_PATH}
          pathLength={1}
          fill="none"
          stroke="#4ade80"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${Math.min(1, progress)} 1`}
          className="transition-[stroke-dasharray] duration-200"
        />
      )}
      {command && <CommandGuide command={command} />}
      {b && (
        <g stroke={stroke} strokeWidth="2" fill="none" opacity="0.9">
          <path d={`M${b.x} ${b.y + 12} V${b.y} H${b.x + 12}`} />
          <path d={`M${b.x + b.w - 12} ${b.y} H${b.x + b.w} V${b.y + 12}`} />
          <path d={`M${b.x} ${b.y + b.h - 12} V${b.y + b.h} H${b.x + 12}`} />
          <path d={`M${b.x + b.w - 12} ${b.y + b.h} H${b.x + b.w} V${b.y + b.h - 12}`} />
        </g>
      )}
    </svg>
  );
}
