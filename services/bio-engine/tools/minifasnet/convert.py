"""Конвертация опубликованных весов MiniFASNet (.pth) в ONNX.

Запускается один раз вручную (нужен PyTorch, в образ сервиса он не входит):
    python tools/minifasnet/convert.py --v2 2.7_80x80_MiniFASNetV2.pth --v1se 4_0_0_80x80_MiniFASNetV1SE.pth --out models/
Веса: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing/tree/master/resources/anti_spoof_models (Apache-2.0).
Веса загружаются с weights_only=True: распаковщик PyTorch не исполняет произвольный код из файла.
Скрипт проверяет, что ONNX Runtime даёт те же логиты, что и PyTorch.
"""

from __future__ import annotations

import argparse
import hashlib
from collections import OrderedDict
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch

from model import minifasnet_v1se, minifasnet_v2


def load(factory, path: Path) -> torch.nn.Module:
    model = factory()
    state = torch.load(path, map_location='cpu', weights_only=True)
    state = OrderedDict((k.removeprefix('module.'), v) for k, v in state.items())
    model.load_state_dict(state, strict=True)
    return model.eval()


def export(model: torch.nn.Module, dst: Path) -> None:
    x = torch.rand(4, 3, 80, 80) * 255  # вход модели — BGR без нормировки, 0…255
    torch.onnx.export(model, x[:1], dst, input_names=['input'], output_names=['logits'], opset_version=13,
                      dynamic_axes={'input': {0: 'n'}, 'logits': {0: 'n'}}, dynamo=False)
    with torch.no_grad():
        ref = model(x).numpy()
    got = ort.InferenceSession(str(dst), providers=['CPUExecutionProvider']).run(None, {'input': x.numpy()})[0]
    diff = float(np.abs(ref - got).max())
    if diff > 1e-3:
        raise SystemExit(f'{dst.name}: расхождение ONNX и PyTorch {diff}')
    print(f'{dst.name}: max|Δ| = {diff:.2e}, sha256 = {hashlib.sha256(dst.read_bytes()).hexdigest()}')


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument('--v2', type=Path, required=True)
    p.add_argument('--v1se', type=Path, required=True)
    p.add_argument('--out', type=Path, default=Path('models'))
    a = p.parse_args()
    a.out.mkdir(parents=True, exist_ok=True)
    export(load(minifasnet_v2, a.v2), a.out / 'minifasnet_v2_2.7_80x80.onnx')
    export(load(minifasnet_v1se, a.v1se), a.out / 'minifasnet_v1se_4.0_80x80.onnx')


if __name__ == '__main__':
    main()
