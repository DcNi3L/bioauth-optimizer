/** Фото профиля или инициалы на цветном фоне (цвет стабилен для имени). */
const HUES = [205, 150, 340, 28, 262, 180, 8, 95];

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const s = parts.length >= 2 ? `${parts[0]![0]}${parts[1]![0]}` : (parts[0] ?? '?').slice(0, 2);
  return s.toUpperCase();
}

export function Avatar({
  src,
  name,
  size = 36,
  className = '',
}: {
  src?: string | null;
  name: string;
  size?: number;
  className?: string;
}) {
  const hue = HUES[Array.from(name).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % HUES.length]!;
  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) };
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- аватар отдаёт API, оптимизатор Next не нужен
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        style={style}
        className={`shrink-0 rounded-full object-cover ring-1 ring-rule ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{ ...style, background: `hsl(${hue} 45% 42%)` }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white select-none ${className}`}
    >
      {initials(name)}
    </span>
  );
}
