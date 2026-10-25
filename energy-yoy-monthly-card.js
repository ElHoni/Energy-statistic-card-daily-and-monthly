/*
 * Energy YoY Monthly Card – Monatsverbrauch der letzten 12 Monate vs. jeweiliger Vorjahresmonat
 *
 *   type: custom:energy-yoy-monthly-card
 *   entity: sensor.strom_gesamt
 *   title: Strom        # optional
 *   months: 12          # optional
 *
 * Monatsbalken: rot = höher als im Vorjahresmonat, grün = niedriger.
 * Voraussetzung: Entität mit Langzeitstatistik (state_class) und >= 1 Jahr Historie.
 */

const mKey = (d) => `${d.getFullYear()}-${d.getMonth()}`;
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const minusYear = (d) => new Date(d.getFullYear() - 1, d.getMonth(), 1);

class EnergyYoyMonthlyCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._data = null;
    this._loading = false;
    this._error = null;
    this._sel = null;
    this._loadedAt = 0;
  }

  static getConfigElement() {
    return document.createElement("energy-yoy-monthly-card-editor");
  }
  static getStubConfig() {
    return { entity: "", months: 12 };
  }

  setConfig(config) {
    this._config = { months: 12, ...config };
    this._data = null;
    this._loadedAt = 0;
    this._paint();
  }

  getCardSize() {
    return 5;
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    const stale = Date.now() - this._loadedAt > 30 * 60 * 1000;
    if (this._config.entity && !this._loading && (!this._data || stale)) {
      this._load();
    } else if (first) {
      this._paint();
    }
  }

  async _load() {
    const id = this._config.entity;
    const n = this._config.months;
    this._loading = true;
    this._error = null;
    this._paint();

    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const start = addMonths(thisMonth, -(n - 1));
    const end = addMonths(thisMonth, 1);

    const fetchRange = (s, e) =>
      this._hass.callWS({
        type: "recorder/statistics_during_period",
        start_time: s.toISOString(),
        end_time: e.toISOString(),
        statistic_ids: [id],
        period: "month",
        types: ["change", "mean"],
      });

    try {
      const [cur, prev] = await Promise.all([
        fetchRange(start, end),
        fetchRange(minusYear(start), minusYear(end)),
      ]);
      const toMap = (res) => {
        const m = new Map();
        (res[id] || []).forEach((r) => {
          const v = r.change != null ? r.change : r.mean;
          if (v != null) m.set(mKey(new Date(r.start)), v);
        });
        return m;
      };
      const curMap = toMap(cur);
      const prevMap = toMap(prev);
      const rows = [];
      for (let i = 0; i < n; i++) {
        const d = addMonths(start, i);
        const pd = minusYear(d);
        rows.push({
          date: d,
          prevDate: pd,
          cur: curMap.has(mKey(d)) ? curMap.get(mKey(d)) : null,
          prev: prevMap.has(mKey(pd)) ? prevMap.get(mKey(pd)) : null,
        });
      }
      this._data = { rows };
      this._sel = n - 1;
    } catch (e) {
      this._error = (e && e.message) || "Statistiken konnten nicht geladen werden.";
      this._data = { rows: [] };
    }
    this._loadedAt = Date.now();
    this._loading = false;
    this._paint();
  }

  _fmt(v, digits) {
    if (v == null || isNaN(v)) return "–";
    const lang = (this._hass && this._hass.locale && this._hass.locale.language) || "de";
    const d = digits != null ? digits : Math.abs(v) < 10 ? 2 : Math.abs(v) < 100 ? 1 : 0;
    return v.toLocaleString(lang, { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  _short(d) {
    return d.toLocaleDateString("de-DE", { month: "short" }).replace(".", "");
  }

  _long(d) {
    return `${this._short(d)} ${d.getFullYear()}`;
  }

  _cls(cur, prev) {
    if (cur == null || prev == null || cur === prev) return "neutral";
    return cur > prev ? "bad" : "good";
  }

  _chart(rows) {
    const W = 360, H = 180, padL = 34, padR = 6, padT = 8, padB = 24;
    const cw = W - padL - padR, ch = H - padT - padB;
    const vals = rows.flatMap((r) => [r.cur, r.prev]).filter((v) => v != null);
    const maxRaw = Math.max(...vals, 0);
    if (!vals.length || maxRaw <= 0) return "";
    const step = Math.pow(10, Math.floor(Math.log10(maxRaw)));
    const max = [1, 2, 2.5, 5, 10].map((m) => m * step).find((m) => m >= maxRaw) || maxRaw;
    const slot = cw / rows.length;
    const y = (v) => padT + ch - (v / max) * ch;
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Monatsverbrauch im Vergleich zum Vorjahr">`;

    for (let t = 0; t <= 2; t++) {
      const v = (max / 2) * t;
      svg += `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/>`;
      svg += `<text class="axis" x="${padL - 4}" y="${y(v) + 3}" text-anchor="end">${this._fmt(v, v >= 10 ? 0 : 1)}</text>`;
    }

    rows.forEach((r, i) => {
      const x0 = padL + i * slot;
      if (i === this._sel) svg += `<rect class="selbg" x="${x0}" y="${padT}" width="${slot}" height="${ch}"/>`;
      if (r.prev != null) {
        svg += `<rect class="prev" x="${x0 + slot * 0.08}" y="${y(r.prev)}" width="${slot * 0.84}" height="${Math.max(0, padT + ch - y(r.prev))}" rx="2"/>`;
      }
      if (r.cur != null) {
        svg += `<rect class="bar ${this._cls(r.cur, r.prev)}" x="${x0 + slot * 0.25}" y="${y(r.cur)}" width="${slot * 0.5}" height="${Math.max(0, padT + ch - y(r.cur))}" rx="2"/>`;
      }
      svg += `<text class="axis ${i === this._sel ? "axis-sel" : ""}" x="${x0 + slot / 2}" y="${H - 8}" text-anchor="middle">${this._short(r.date)}</text>`;
      svg += `<rect class="hit" data-i="${i}" x="${x0}" y="${padT}" width="${slot}" height="${ch + padB}"/>`;
    });
    return svg + "</svg>";
  }

  _paint() {
    if (!this._config) return;
    const id = this._config.entity;
    const st = this._hass && id ? this._hass.states[id] : null;
    const unit = (st && st.attributes.unit_of_measurement) || "";
    const title = this._config.title || (st && st.attributes.friendly_name) || "Verbrauch";
    const rows = this._data ? this._data.rows : [];

    const sumCur = rows.reduce((a, r) => a + (r.cur || 0), 0);
    const sumPrev = rows.reduce((a, r) => a + (r.prev || 0), 0);
    const hasPrev = rows.some((r) => r.prev != null) && sumPrev > 0;
    const delta = hasPrev ? ((sumCur - sumPrev) / sumPrev) * 100 : null;
    const sumCls = hasPrev ? this._cls(sumCur, sumPrev) : "neutral";
    const deltaTxt = delta == null ? "kein Vorjahr" : `${delta > 0 ? "+" : ""}${this._fmt(delta, 1)} %`;

    const s = rows[this._sel];
    let detail = "Balken antippen für Details";
    if (s) {
      const d = s.cur != null && s.prev != null ? s.cur - s.prev : null;
      const pct = d != null && s.prev > 0 ? ` (${d > 0 ? "+" : ""}${this._fmt((d / s.prev) * 100, 1)} %)` : "";
      detail = `<b>${this._long(s.date)}</b> <span class="${this._cls(s.cur, s.prev)}-t">${this._fmt(s.cur)} ${unit}</span>
        <span class="muted">· ${this._long(s.prevDate)}: ${this._fmt(s.prev)} ${unit}${
          d != null ? ` · Δ ${d > 0 ? "+" : ""}${this._fmt(d)}${pct}` : ""
        }</span>`;
    }

    let body;
    if (!id) {
      body = `<div class="msg">Bitte eine Entität (<code>entity</code>) auswählen.</div>`;
    } else if (this._loading && !rows.length) {
      body = `<div class="msg">Lade Statistiken …</div>`;
    } else if (this._error) {
      body = `<div class="msg">${this._error}</div>`;
    } else {
      const svg = this._chart(rows);
      body = svg
        ? `<div class="chart">${svg}</div>
           <div class="legend">
             <span><i class="k bad"></i>höher als Vorjahresmonat</span>
             <span><i class="k good"></i>niedriger</span>
             <span><i class="k prev"></i>Vorjahr</span>
           </div>
           <div class="detail">${detail}</div>`
        : `<div class="msg">Für diese Entität liegen keine Statistikwerte vor.</div>`;
    }

    this.shadowRoot.innerHTML = `
      <style>
        ha-card { padding: 16px; }
        .title { font-size:1.1rem; font-weight:500; color:var(--primary-text-color); margin-bottom:12px; }
        .sums { display:grid; grid-template-columns:1fr 1fr auto; gap:12px; align-items:end; margin-bottom:8px; }
        .lbl { font-size:.78rem; color:var(--secondary-text-color); }
        .val { font-size:1.35rem; font-weight:500; color:var(--primary-text-color); line-height:1.2; }
        .val small { font-size:.8rem; font-weight:400; color:var(--secondary-text-color); }
        .chip { font-size:.9rem; font-weight:500; padding:4px 10px; border-radius:12px;
          background:var(--secondary-background-color); color:var(--secondary-text-color); white-space:nowrap; }
        .chip.good, .good-t { color:var(--success-color,#2e7d32); }
        .chip.bad, .bad-t { color:var(--error-color,#c62828); }
        .good-t, .bad-t { font-weight:500; }
        svg { width:100%; height:auto; display:block; touch-action:manipulation; }
        .grid { stroke:var(--divider-color); stroke-width:.6; }
        .axis { fill:var(--secondary-text-color); font-size:8.5px; }
        .axis-sel { fill:var(--primary-text-color); font-weight:600; }
        .bar.good { fill:var(--success-color,#2e7d32); }
        .bar.bad { fill:var(--error-color,#c62828); }
        .bar.neutral { fill:var(--primary-color); }
        .prev { fill:var(--disabled-text-color,#9e9e9e); opacity:.4; }
        .selbg { fill:var(--primary-text-color); opacity:.07; }
        .hit { fill:transparent; cursor:pointer; }
        .legend { display:flex; flex-wrap:wrap; gap:4px 14px; font-size:.78rem; color:var(--secondary-text-color); margin-top:4px; }
        .k { display:inline-block; width:10px; height:10px; border-radius:2px; margin-right:6px; vertical-align:-1px; }
        .k.good { background:var(--success-color,#2e7d32); }
        .k.bad { background:var(--error-color,#c62828); }
        .k.prev { background:var(--disabled-text-color,#9e9e9e); opacity:.55; }
        .detail { margin-top:10px; font-size:.88rem; color:var(--primary-text-color); min-height:2.4em; }
        .muted { color:var(--secondary-text-color); }
        .msg { padding:24px 0; text-align:center; color:var(--secondary-text-color); font-size:.9rem; }
        code { background:var(--secondary-background-color); padding:1px 4px; border-radius:4px; }
      </style>
      <ha-card>
        <div class="title">${title}</div>
        ${
          rows.length && !this._error
            ? `<div class="sums">
                <div><div class="lbl">Letzte ${this._config.months} Monate</div><div class="val">${this._fmt(sumCur)} <small>${unit}</small></div></div>
                <div><div class="lbl">Vorjahr</div><div class="val">${hasPrev ? this._fmt(sumPrev) : "–"} <small>${hasPrev ? unit : ""}</small></div></div>
                <div class="chip ${sumCls}">${deltaTxt}</div>
              </div>`
            : ""
        }
        ${body}
      </ha-card>`;

    this.shadowRoot.querySelectorAll(".hit").forEach((el) =>
      el.addEventListener("click", () => {
        this._sel = Number(el.dataset.i);
        this._paint();
      })
    );
  }
}

/* ---------- Visueller Editor ---------- */
class EnergyYoyMonthlyCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config;
    this._render();
  }
  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
  }
  _render() {
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.schema = [
        { name: "entity", selector: { entity: { domain: "sensor" } } },
        { name: "title", selector: { text: {} } },
        { name: "months", selector: { number: { min: 3, max: 24, mode: "box" } } },
      ];
      this._form.computeLabel = (s) =>
        ({ entity: "Entität", title: "Titel (optional)", months: "Anzahl Monate" }[s.name] || s.name);
      this._form.addEventListener("value-changed", (ev) => {
        this.dispatchEvent(
          new CustomEvent("config-changed", { detail: { config: ev.detail.value }, bubbles: true, composed: true })
        );
      });
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.data = { months: 12, ...this._config };
  }
}

customElements.define("energy-yoy-monthly-card", EnergyYoyMonthlyCard);
customElements.define("energy-yoy-monthly-card-editor", EnergyYoyMonthlyCardEditor);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "energy-yoy-monthly-card",
  name: "Energie-Vorjahresvergleich (Monate)",
  description: "Monatsverbrauch der letzten 12 Monate im Vergleich zum jeweiligen Vorjahresmonat.",
});
