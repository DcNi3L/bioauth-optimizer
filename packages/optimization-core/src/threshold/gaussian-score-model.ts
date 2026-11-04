import { normalLowerTail, normalPdf, normalUpperTail } from '../numeric';
import type { ScoreModel } from './score-model';
import type { NormalParams } from './types';

export class GaussianScoreModel implements ScoreModel {
  constructor(
    readonly genuine: NormalParams,
    readonly impostor: NormalParams,
  ) {}

  far(tau: number): number {
    return normalUpperTail(tau, this.impostor.mean, this.impostor.std);
  }

  frr(tau: number): number {
    return normalLowerTail(tau, this.genuine.mean, this.genuine.std);
  }

  genuinePdf(tau: number): number {
    return normalPdf(tau, this.genuine.mean, this.genuine.std);
  }

  impostorPdf(tau: number): number {
    return normalPdf(tau, this.impostor.mean, this.impostor.std);
  }
}
