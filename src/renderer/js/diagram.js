'use strict';
// Renders {nodes, edges} as a left-to-right flow diagram (SVG string). No external libraries.
(function (root) {
  const W = 168, H = 56, GAPX = 70, GAPY = 26, PAD = 24;

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function wrap(label, max = 22) {
    const words = label.split(/\s+/);
    const lines = [];
    let cur = '';
    for (const w of words) {
      if ((cur + ' ' + w).trim().length > max && cur) {
        lines.push(cur);
        cur = w;
      } else cur = (cur + ' ' + w).trim();
    }
    if (cur) lines.push(cur);
    return lines.slice(0, 3);
  }

  function levels(nodes, edges) {
    const n = nodes.length;
    const hasIn = new Set(edges.map((e) => e.to));
    let roots = nodes.filter((x) => !hasIn.has(x.id));
    if (!roots.length) roots = [nodes[0]];
    const lv = {};
    roots.forEach((r) => (lv[r.id] = 0));
    for (let i = 0; i < n; i++) {
      for (const e of edges) {
        if (lv[e.from] == null) continue;
        const next = lv[e.from] + 1;
        if (next < n && (lv[e.to] == null || lv[e.to] < next)) lv[e.to] = next;
      }
    }
    nodes.forEach((x) => lv[x.id] == null && (lv[x.id] = 0));
    return lv;
  }

  function render(d) {
    const lv = levels(d.nodes, d.edges);
    const cols = {};
    d.nodes.forEach((n) => (cols[lv[n.id]] = cols[lv[n.id]] || []).push(n));
    const maxCol = Math.max(...Object.values(cols).map((c) => c.length));
    const colCount = Math.max(...Object.keys(cols).map(Number)) + 1;
    const height = PAD * 2 + maxCol * H + (maxCol - 1) * GAPY + 70;
    const width = PAD * 2 + colCount * W + (colCount - 1) * GAPX;
    const pos = {};
    for (const [c, list] of Object.entries(cols)) {
      const colH = list.length * H + (list.length - 1) * GAPY;
      const y0 = PAD + (maxCol * H + (maxCol - 1) * GAPY - colH) / 2;
      list.forEach((n, i) => (pos[n.id] = { x: PAD + c * (W + GAPX), y: y0 + i * (H + GAPY) }));
    }

    let svg = `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(d.title || 'Diagram')}">
<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" style="fill:var(--accent)"/></marker></defs>`;

    for (const e of d.edges) {
      const a = pos[e.from], b = pos[e.to];
      let path, lx, ly;
      if (lv[e.to] > lv[e.from]) {
        const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x, y2 = b.y + H / 2, mx = (x1 + x2) / 2;
        path = `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;
        lx = mx; ly = (y1 + y2) / 2 - 6;
      } else {
        const x1 = a.x + W / 2, y1 = a.y + H, x2 = b.x + W / 2, y2 = b.y + H, dy = 46;
        path = `M${x1} ${y1} C${x1} ${y1 + dy} ${x2} ${y2 + dy} ${x2} ${y2}`;
        lx = (x1 + x2) / 2; ly = Math.max(y1, y2) + dy * 0.75 + 4;
      }
      svg += `<path d="${path}" fill="none" style="stroke:var(--accent)" stroke-width="1.8" marker-end="url(#arr)" opacity=".85"/>`;
      if (e.label) svg += `<text x="${lx}" y="${ly}" text-anchor="middle" font-size="11" style="fill:var(--muted)">${esc(e.label)}</text>`;
    }

    for (const n of d.nodes) {
      const { x, y } = pos[n.id];
      const lines = wrap(n.label);
      svg += `<rect x="${x}" y="${y}" width="${W}" height="${H}" rx="12" style="fill:var(--panel2);stroke:var(--accent)" stroke-opacity=".7"/>`;
      lines.forEach((ln, i) => {
        const ty = y + H / 2 + (i - (lines.length - 1) / 2) * 15 + 4;
        svg += `<text x="${x + W / 2}" y="${ty}" text-anchor="middle" font-size="13" style="fill:var(--text)">${esc(ln)}</text>`;
      });
    }
    return svg + '</svg>';
  }

  const api = { render, levels, wrap };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Diagram = api;
})(typeof window !== 'undefined' ? window : globalThis);
