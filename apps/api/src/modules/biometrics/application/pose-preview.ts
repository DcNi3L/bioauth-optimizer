import type { PosePreviewDto, PosePreviewRequest } from '@bioauth/contracts';
import { Inject, Injectable } from '@nestjs/common';

import { FACE_ENGINE, type FaceEngine, FaceRejectedError } from './ports';

const EMPTY: PosePreviewDto = {
  face: false,
  issues: ['NO_FACE'],
  box: null,
  yawRatio: null,
  pitchRatio: null,
  rollDeg: null,
  interocularPx: null,
};

/**
 * Живые подсказки позы: один кадр низкого разрешения → наличие лица, замечания качества и геометрия
 * (смещение носа, отношение pitch, наклон к плечу, межзрачковое расстояние). Решение о входе здесь не принимается и
 * ничего не сохраняется — интерфейс лишь показывает, насколько выполнена команда.
 */
@Injectable()
export class PosePreviewService {
  constructor(@Inject(FACE_ENGINE) private readonly engine: FaceEngine) {}

  async preview(req: PosePreviewRequest): Promise<PosePreviewDto> {
    let frame;
    try {
      frame = (await this.engine.analyze({ image: req.image, ts: null })).frames[0];
    } catch (err) {
      if (err instanceof FaceRejectedError) return EMPTY;
      throw err;
    }
    if (!frame?.face) return { ...EMPTY, issues: frame?.issues ?? ['NO_FACE'] };
    const [x, y, w, h] = frame.face.bbox as [number, number, number, number];
    const q = frame.quality;
    return {
      face: true,
      issues: frame.issues,
      box: [x / req.width, y / req.height, w / req.width, h / req.height],
      yawRatio: q?.yawRatio ?? null,
      pitchRatio: q?.pitchRatio ?? null,
      rollDeg: q?.rollDeg ?? null,
      interocularPx: q?.interocularPx ?? null,
    };
  }
}
