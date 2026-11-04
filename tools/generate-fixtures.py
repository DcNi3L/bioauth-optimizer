"""
Генерация независимых эталонов для золотых тестов ядра (док. 07-testing, G-T2).
Эталоны считаются средствами SciPy, независимо от TypeScript-реализации:
  - FAR/FRR через scipy.stats.norm (sf/cdf);
  - τ_EER — корень FAR − FRR методом Брента;
  - τ* — глобальная сетка + корень производной E'(τ) = cFR·f_G − cFA·f_I методом Брента.
Запуск: python3 tools/generate-fixtures.py > packages/optimization-core/test/fixtures/threshold-scipy.json
"""
import json
import numpy as np
from scipy.stats import norm
from scipy.optimize import brentq

rng = np.random.default_rng(20261104)
cases = []
while len(cases) < 50:
    mG = float(np.round(rng.uniform(0.5, 0.9), 3))
    mI = float(np.round(rng.uniform(0.1, 0.45), 3))
    sG = float(np.round(rng.uniform(0.04, 0.15), 3))
    sI = float(np.round(rng.uniform(0.04, 0.15), 3))
    cFA = float(np.round(10 ** rng.uniform(-0.3, 2), 3))
    cFR = float(np.round(10 ** rng.uniform(-0.3, 1), 3))
    far = lambda t: norm.sf(t, mI, sI)
    frr = lambda t: norm.cdf(t, mG, sG)
    E = lambda t: cFA * far(t) + cFR * frr(t)
    dE = lambda t: cFR * norm.pdf(t, mG, sG) - cFA * norm.pdf(t, mI, sI)
    t_eer = brentq(lambda t: far(t) - frr(t), mI, mG, xtol=1e-15, rtol=8.9e-16)
    lo, hi = mI - 10 * sI, mG + 10 * sG
    grid = np.linspace(lo, hi, 200001)
    vals = cFA * norm.sf(grid, mI, sI) + cFR * norm.cdf(grid, mG, sG)
    k = int(np.argmin(vals))
    if k == 0 or k == len(grid) - 1 or vals[k] >= min(cFA, cFR) * 0.999:
        continue  # вырожденный случай — в эталоны не берём
    t_opt = brentq(dE, grid[k - 1], grid[k + 1], xtol=1e-15, rtol=8.9e-16)
    cases.append({
        "genuine": {"mean": mG, "std": sG}, "impostor": {"mean": mI, "std": sI},
        "costs": {"cFA": cFA, "cFR": cFR},
        "expected": {
            "tauEer": t_eer, "farEer": far(t_eer), "costEer": E(t_eer),
            "tauOpt": t_opt, "farOpt": far(t_opt), "frrOpt": frr(t_opt), "costOpt": E(t_opt),
        },
    })
tails = [{"z": z, "upperTail": float(norm.sf(z))} for z in (1, 3, 5, 8, 10, 15, 20, 30)]
print(json.dumps({"generator": "tools/generate-fixtures.py", "cases": cases, "tails": tails}, indent=1))
