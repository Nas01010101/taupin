// Forecasts for the coming seasons (the trap week, rootworm hatch and the rotation water columns)
// from the yearly history. Four small models compete: the mean of all past years, the mean of the
// last 10, a least-squares trend, and the average of mean and trend. Each one is scored by a
// rolling-origin backtest: fit on the years up to t, predict t + h for h = 1..5, compare with
// what happened. The model with the lowest backtest error is used, and the 80 % range for each
// horizon comes from that model's own backtest misses, so the range is as wide as the history
// says it should be. No weather forecast is used: a season ahead, none is reliable.

const mean = a => a.reduce((p, c) => p + c, 0) / a.length;

function fitLine(xs, ys) {
  const mx = mean(xs), my = mean(ys);
  const sxx = xs.reduce((p, x) => p + (x - mx) ** 2, 0);
  const b = sxx ? xs.reduce((p, x, i) => p + (x - mx) * (ys[i] - my), 0) / sxx : 0;
  return x => my + b * (x - mx);
}

export const MODELS = {
  mean: { label: 'mean of all past years', fit: (xs, ys) => { const m = mean(ys); return () => m; } },
  recent: { label: 'mean of the last 10 years', fit: (xs, ys) => { const m = mean(ys.slice(-10)); return () => m; } },
  trend: { label: 'straight-line trend', fit: fitLine },
  blend: { label: 'average of mean and trend', fit: (xs, ys) => { const m = mean(ys), f = fitLine(xs, ys); return x => (m + f(x)) / 2; } },
};

export function quantile(xs, q) {
  const s = [...xs].sort((a, b) => a - b), i = (s.length - 1) * q, lo = Math.floor(i);
  return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo);
}

// Misses (actual minus predicted) of every model at horizons 1..H, from origins with at least
// `minTrain` years behind them.
export function backtest(xs, ys, { H = 5, minTrain = 10 } = {}) {
  const out = {};
  for (const [k, m] of Object.entries(MODELS)) {
    out[k] = Array.from({ length: H }, () => []);
    for (let t = minTrain; t < xs.length; t++) {
      const f = m.fit(xs.slice(0, t), ys.slice(0, t));
      for (let h = 1; h <= H && t + h - 1 < xs.length; h++) out[k][h - 1].push(ys[t + h - 1] - f(xs[t + h - 1]));
    }
  }
  return out;
}

const mae = rs => mean(rs.flat().map(Math.abs));

// The range is built from the same backtest misses that picked the model, so its 80 % is not a
// held-out figure. This checks it on misses it was not built from: walking forward through one
// horizon's misses (in origin order), each one is tested against the range made from the misses
// before it alone, once at least `minPrior` are there. {inside, n}.
export function rangeCheck(misses, q = [0.1, 0.9], minPrior = 5) {
  let inside = 0, n = 0;
  for (let i = minPrior; i < misses.length; i++) {
    const prior = misses.slice(0, i), lo = quantile(prior, q[0]), hi = quantile(prior, q[1]);
    n++;
    if (misses[i] >= lo && misses[i] <= hi) inside++;
  }
  return { inside, n };
}

// Forecast `targets` (years after the last one in xs). Returns the chosen model, every model's
// backtest error, per target {year, value, lo, hi, n} with lo..hi the 80 % range, and `check`:
// how often that range held on misses it was not built from (rangeCheck), summed over horizons.
export function forecast(xs, ys, targets, { minTrain = 10, q = [0.1, 0.9] } = {}) {
  const last = xs[xs.length - 1], H = Math.max(...targets.map(y => y - last));
  if (H < 1 || xs.length < minTrain + 3) return null;
  const bt = backtest(xs, ys, { H, minTrain });
  const errors = Object.fromEntries(Object.entries(bt).map(([k, rs]) => [k, mae(rs)]));
  const best = Object.keys(errors).reduce((a, b) => (errors[b] < errors[a] ? b : a));
  const f = MODELS[best].fit(xs, ys);
  const rows = targets.map(year => {
    const rs = bt[best][year - last - 1], v = f(year);
    return { year, value: v, lo: v + quantile(rs, q[0]), hi: v + quantile(rs, q[1]), n: rs.length, misses: rs };
  });
  const checks = bt[best].map(rs => rangeCheck(rs, q));
  const check = { inside: checks.reduce((s, c) => s + c.inside, 0), n: checks.reduce((s, c) => s + c.n, 0), byHorizon: checks };
  return { model: best, label: MODELS[best].label, errors, rows, check, span: [xs[0], last] };
}
