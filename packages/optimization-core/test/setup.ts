import fc from 'fast-check';

// Синхронное свойство блокирует цикл событий, и таймаут vitest не срабатывает: ограничиваем время самого fast-check,
// чтобы найденный контрпример и его сужение не подвешивали CI.
fc.configureGlobal({ interruptAfterTimeLimit: 120_000, markInterruptAsFailure: true, endOnFailure: false });
