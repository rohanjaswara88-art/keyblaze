/* Animated canvas chart: WPM + raw per second with error markers and hover tooltip. */
(function (root) {
  'use strict';

  const PAD = { top: 18, right: 44, bottom: 28, left: 40 };
  const DRAW_MS = 1100;

  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function niceMax(value) {
    const steps = [20, 40, 60, 80, 100, 120, 150, 200, 250, 300];
    return steps.find((s) => s >= value) || Math.ceil(value / 50) * 50;
  }

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLElement} tooltip
   * @param {{wpm:number[], raw:number[], errors:number[]}} series one entry per second
   */
  function drawChart(canvas, tooltip, series, options) {
    const labelFor = (options && options.label) || ((i) => `${i + 1}s`);
    const dpr = Math.min(2, root.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const c = canvas.getContext('2d');
    const w = rect.width;
    const h = rect.height;
    const n = series.wpm.length;
    if (n === 0) {
      c.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const maxY = niceMax(Math.max(10, ...series.wpm, ...series.raw) * 1.1);
    const maxErr = Math.max(1, ...series.errors);
    const plotW = w - PAD.left - PAD.right;
    const plotH = h - PAD.top - PAD.bottom;
    const xAt = (i) => PAD.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const yAt = (v) => PAD.top + plotH - (v / maxY) * plotH;
    const accent = cssVar('--accent', '#7c5cff');
    const accent2 = cssVar('--accent-2', '#22d3ee');
    const sub = cssVar('--text-dim', '#8b8fa8');
    const errColor = cssVar('--error', '#ff4d6d');
    const grid = cssVar('--grid', 'rgba(255,255,255,0.06)');

    function path(values) {
      c.beginPath();
      values.forEach((v, i) => {
        const x = xAt(i);
        const y = yAt(v);
        if (i === 0) {
          c.moveTo(x, y);
          return;
        }
        // Smooth curve through midpoints.
        const px = xAt(i - 1);
        const py = yAt(values[i - 1]);
        const mx = (px + x) / 2;
        c.bezierCurveTo(mx, py, mx, y, x, y);
      });
    }

    function frame(progress, hoverIndex) {
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, w, h);
      c.font = '11px "JetBrains Mono", monospace';
      c.fillStyle = sub;
      c.strokeStyle = grid;
      c.lineWidth = 1;
      for (let g = 0; g <= 4; g += 1) {
        const v = (maxY / 4) * g;
        const y = yAt(v);
        c.beginPath();
        c.moveTo(PAD.left, y);
        c.lineTo(w - PAD.right, y);
        c.stroke();
        c.textAlign = 'right';
        c.fillText(String(Math.round(v)), PAD.left - 8, y + 4);
      }
      c.textAlign = 'center';
      const labelEvery = Math.max(1, Math.ceil(n / 12));
      for (let i = 0; i < n; i += labelEvery) c.fillText(String(i + 1), xAt(i), h - 8);

      c.save();
      c.beginPath();
      c.rect(0, 0, PAD.left + plotW * progress + 2, h);
      c.clip();

      // Area under WPM.
      path(series.wpm);
      c.lineTo(xAt(n - 1), yAt(0));
      c.lineTo(xAt(0), yAt(0));
      c.closePath();
      const fill = c.createLinearGradient(0, PAD.top, 0, h - PAD.bottom);
      fill.addColorStop(0, `${accent}55`);
      fill.addColorStop(1, `${accent}00`);
      c.fillStyle = fill;
      c.fill();

      c.setLineDash([4, 4]);
      c.strokeStyle = sub;
      c.lineWidth = 1.5;
      path(series.raw);
      c.stroke();
      c.setLineDash([]);

      const line = c.createLinearGradient(PAD.left, 0, w - PAD.right, 0);
      line.addColorStop(0, accent);
      line.addColorStop(1, accent2);
      c.strokeStyle = line;
      c.lineWidth = 3;
      c.shadowColor = accent;
      c.shadowBlur = 12;
      path(series.wpm);
      c.stroke();
      c.shadowBlur = 0;

      series.errors.forEach((e, i) => {
        if (!e) return;
        const x = xAt(i);
        const y = PAD.top + plotH - (e / maxErr) * plotH * 0.35;
        const s = 3 + Math.min(3, e);
        c.strokeStyle = errColor;
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(x - s, y - s); c.lineTo(x + s, y + s);
        c.moveTo(x + s, y - s); c.lineTo(x - s, y + s);
        c.stroke();
      });
      c.restore();

      if (series.errors.some((e) => e > 0)) {
        c.fillStyle = errColor;
        c.textAlign = 'left';
        c.fillText('errors', w - PAD.right + 6, PAD.top + plotH - 4);
      }

      if (hoverIndex != null) {
        const x = xAt(hoverIndex);
        c.strokeStyle = sub;
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(x, PAD.top);
        c.lineTo(x, PAD.top + plotH);
        c.stroke();
        c.fillStyle = accent;
        c.beginPath();
        c.arc(x, yAt(series.wpm[hoverIndex]), 5, 0, Math.PI * 2);
        c.fill();
      }
    }

    const start = performance.now();
    function animate(now) {
      const t = Math.min(1, (now - start) / DRAW_MS);
      frame(1 - Math.pow(1 - t, 3), null);
      if (t < 1) root.requestAnimationFrame(animate);
    }
    root.requestAnimationFrame(animate);

    canvas.onmousemove = (ev) => {
      const r = canvas.getBoundingClientRect();
      const px = ev.clientX - r.left;
      const idx = Math.max(0, Math.min(n - 1, Math.round(((px - PAD.left) / plotW) * (n - 1))));
      frame(1, idx);
      tooltip.innerHTML = `<b>${labelFor(idx)}</b><span>wpm <i>${Math.round(series.wpm[idx])}</i></span>` +
        `<span>raw <i>${Math.round(series.raw[idx])}</i></span><span>errors <i>${series.errors[idx]}</i></span>`;
      tooltip.style.left = `${xAt(idx)}px`;
      tooltip.style.top = `${yAt(series.wpm[idx])}px`;
      tooltip.classList.add('show');
    };
    canvas.onmouseleave = () => {
      frame(1, null);
      tooltip.classList.remove('show');
    };
  }

  root.TT = Object.assign(root.TT || {}, { chart: { drawChart } });
})(typeof window !== 'undefined' ? window : globalThis);
