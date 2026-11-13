import fc from 'fast-check';

// Синхронное свойство блокирует цикл событий, и таймаут vitest не срабатывает: ограничиваем время самого fast-check,
// чтобы найденный контрпример и его сужение не подвешивали CI.
fc.configureGlobal({ endOnFailure: false });
fc.installGlobalPlugin(fc.interruptAfterTimeLimit(120_000, { failOnInterrupt: true }));
