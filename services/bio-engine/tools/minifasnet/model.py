"""Архитектура MiniFASNet для конвертации весов в ONNX.

Порт архитектуры из проекта Silent-Face-Anti-Spoofing (Minivision AI, лицензия Apache-2.0):
https://github.com/minivision-ai/Silent-Face-Anti-Spoofing — src/model_lib/MiniFASNet.py.
Имена модулей совпадают с оригиналом, чтобы опубликованные веса загружались без переименования.
Используется только инструментом convert.py; сервис bio-engine исполняет готовый ONNX без PyTorch.
"""

from __future__ import annotations

import torch
from torch import nn

KEEP_V1 = [32, 32, 103, 103, 64, 13, 13, 64, 26, 26, 64, 13, 13, 64, 52, 52, 64, 231, 231, 128,
           154, 154, 128, 52, 52, 128, 26, 26, 128, 52, 52, 128, 26, 26, 128, 26, 26, 128, 308, 308,
           128, 26, 26, 128, 26, 26, 128, 512, 512]
KEEP_V2 = [32, 32, 103, 103, 64, 13, 13, 64, 13, 13, 64, 13, 13, 64, 13, 13, 64, 231, 231, 128,
           231, 231, 128, 52, 52, 128, 26, 26, 128, 77, 77, 128, 26, 26, 128, 26, 26, 128, 308, 308,
           128, 26, 26, 128, 26, 26, 128, 512, 512]


class ConvBlock(nn.Module):
    def __init__(self, cin: int, cout: int, kernel=(1, 1), stride=(1, 1), padding=(0, 0), groups: int = 1):
        super().__init__()
        self.conv = nn.Conv2d(cin, cout, kernel, stride, padding, groups=groups, bias=False)
        self.bn = nn.BatchNorm2d(cout)
        self.prelu = nn.PReLU(cout)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.prelu(self.bn(self.conv(x)))


class LinearBlock(nn.Module):
    def __init__(self, cin: int, cout: int, kernel=(1, 1), stride=(1, 1), padding=(0, 0), groups: int = 1):
        super().__init__()
        self.conv = nn.Conv2d(cin, cout, kernel, stride, padding, groups=groups, bias=False)
        self.bn = nn.BatchNorm2d(cout)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.bn(self.conv(x))


class SEModule(nn.Module):
    def __init__(self, channels: int, reduction: int):
        super().__init__()
        self.avg_pool = nn.AdaptiveAvgPool2d(1)
        self.fc1 = nn.Conv2d(channels, channels // reduction, 1, bias=False)
        self.bn1 = nn.BatchNorm2d(channels // reduction)
        self.relu = nn.ReLU()
        self.fc2 = nn.Conv2d(channels // reduction, channels, 1, bias=False)
        self.bn2 = nn.BatchNorm2d(channels)
        self.sigmoid = nn.Sigmoid()

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        w = self.sigmoid(self.bn2(self.fc2(self.relu(self.bn1(self.fc1(self.avg_pool(x)))))))
        return x * w


class DepthWise(nn.Module):
    def __init__(self, c1, c2, c3, residual=False, stride=(2, 2), se_reduct: int | None = None):
        super().__init__()
        self.conv = ConvBlock(c1[0], c1[1])
        self.conv_dw = ConvBlock(c2[0], c2[1], kernel=(3, 3), stride=stride, padding=(1, 1), groups=c2[0])
        self.project = LinearBlock(c3[0], c3[1])
        self.residual = residual
        if se_reduct is not None:
            self.se_module = SEModule(c3[1], se_reduct)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        y = self.project(self.conv_dw(self.conv(x)))
        if not self.residual:
            return y
        if hasattr(self, 'se_module'):
            y = self.se_module(y)
        return x + y


class Residual(nn.Module):
    def __init__(self, c1, c2, c3, se: bool):
        super().__init__()
        n = len(c1)
        self.model = nn.Sequential(*[
            DepthWise(c1[i], c2[i], c3[i], residual=True, stride=(1, 1),
                      se_reduct=4 if (se and i == n - 1) else None)
            for i in range(n)
        ])

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.model(x)


def _triples(k: list[int], idx: list[int]):
    c1 = [(k[i], k[i + 1]) for i in idx]
    c2 = [(k[i + 1], k[i + 2]) for i in idx]
    c3 = [(k[i + 2], k[i + 3]) for i in idx]
    return c1, c2, c3


class MiniFASNet(nn.Module):
    def __init__(self, keep: list[int], se: bool, conv6_kernel=(5, 5), embedding_size: int = 128, num_classes: int = 3):
        super().__init__()
        k = keep
        self.conv1 = ConvBlock(3, k[0], kernel=(3, 3), stride=(2, 2), padding=(1, 1))
        self.conv2_dw = ConvBlock(k[0], k[1], kernel=(3, 3), padding=(1, 1), groups=k[1])
        self.conv_23 = DepthWise((k[1], k[2]), (k[2], k[3]), (k[3], k[4]))
        self.conv_3 = Residual(*_triples(k, [4, 7, 10, 13]), se=se)
        self.conv_34 = DepthWise((k[16], k[17]), (k[17], k[18]), (k[18], k[19]))
        self.conv_4 = Residual(*_triples(k, [19, 22, 25, 28, 31, 34]), se=se)
        self.conv_45 = DepthWise((k[37], k[38]), (k[38], k[39]), (k[39], k[40]))
        self.conv_5 = Residual(*_triples(k, [40, 43]), se=se)
        self.conv_6_sep = ConvBlock(k[46], k[47])
        self.conv_6_dw = LinearBlock(k[47], k[48], kernel=conv6_kernel, groups=k[48])
        self.linear = nn.Linear(512, embedding_size, bias=False)
        self.bn = nn.BatchNorm1d(embedding_size)
        self.prob = nn.Linear(embedding_size, num_classes, bias=False)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        for name in ('conv1', 'conv2_dw', 'conv_23', 'conv_3', 'conv_34', 'conv_4', 'conv_45', 'conv_5',
                     'conv_6_sep', 'conv_6_dw'):
            x = getattr(self, name)(x)
        x = torch.flatten(x, 1)
        return self.prob(self.bn(self.linear(x)))


def minifasnet_v2() -> MiniFASNet:
    return MiniFASNet(KEEP_V2, se=False)


def minifasnet_v1se() -> MiniFASNet:
    return MiniFASNet(KEEP_V1, se=True)
