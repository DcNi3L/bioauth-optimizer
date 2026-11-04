import Link from 'next/link';

function Term({ children, tone }: { children: React.ReactNode; tone: 'far' | 'frr' }) {
  return <span className={tone === 'far' ? 'text-far' : 'text-frr'}>{children}</span>;
}

export function HomePage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-14 px-4 py-12 sm:px-6">
      <section className="flex flex-col gap-6">
        <h1 className="max-w-3xl text-3xl sm:text-4xl">
          Порог и состав факторов биометрической аутентификации — по расчёту, а не на глаз
        </h1>
        <p className="text-graphite max-w-2xl text-[17px]">
          Снижая ложный допуск, система чаще отказывает законным пользователям. Программа находит рабочую
          точку, где ожидаемые потери минимальны при заданных стоимостях ошибок, и подбирает набор факторов
          под ограничения на задержку, бюджет и защиту от атак на предъявление.
        </p>
        <p
          className="formula py-2 text-2xl leading-relaxed sm:text-[34px]"
          aria-label="E от тау равно c FA умножить на FAR от тау плюс c FR умножить на FRR от тау"
        >
          E(τ) = c<sub className="text-[0.55em]">FA</sub>·<Term tone="far">FAR(τ)</Term> + c
          <sub className="text-[0.55em]">FR</sub>·<Term tone="frr">FRR(τ)</Term> → min
        </p>
      </section>

      <section className="grid gap-10 md:grid-cols-2">
        <div className="border-ink flex flex-col gap-3 border-t-2 pt-5">
          <h2 className="text-xl">Оптимальный порог</h2>
          <p className="text-graphite">
            По параметрам распределений оценок или по вашим данным в CSV. Сравнение с точкой равных ошибок,
            графики FAR, FRR и стоимости, ROC-кривая.
          </p>
          <p className="text-sm">
            Пример из статьи: <span className="num">τ* = 0,5818</span> вместо{' '}
            <span className="num">0,531</span>, потери ниже на{' '}
            <span className="num text-optimum">41,8 %</span>.
          </p>
          <Link
            href="/threshold"
            className="bg-ink text-sheet mt-2 w-fit rounded-md px-4 py-2 text-sm font-medium hover:bg-[#2a3644]"
          >
            Рассчитать порог
          </Link>
        </div>
        <div className="border-ink flex flex-col gap-3 border-t-2 pt-5">
          <h2 className="text-xl">Состав факторов</h2>
          <p className="text-graphite">
            Целочисленная задача с правилом «И»: какие факторы включить, чтобы минимизировать потери при
            ограничениях на задержку, стоимость, FAR и наличие PAD. Полный перебор или ЦЛП с доказательством
            оптимальности.
          </p>
          <p className="text-sm">
            Пример из статьи: <span className="num">F2 + F5</span> — 6 допустимых наборов из 31, при бюджете
            2,0 — <span className="num">F1 + F2</span>.
          </p>
          <Link
            href="/factors"
            className="bg-ink text-sheet mt-2 w-fit rounded-md px-4 py-2 text-sm font-medium hover:bg-[#2a3644]"
          >
            Подобрать факторы
          </Link>
        </div>
      </section>

      <p className="border-rule text-graphite max-w-3xl border-t pt-6 text-sm">
        Методы — из статьи СРО1 «Многокритериальная оптимизация параметров систем биометрической
        аутентификации» (Мекенбаев Д. К., Университет «Туран»). Каждый расчёт сохраняется в{' '}
        <Link href="/experiments" className="text-frr underline underline-offset-2">
          истории
        </Link>
        .
      </p>
    </div>
  );
}
