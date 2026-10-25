/*
 * Energy YoY Card – Tagesverbrauch der letzten 30 Tage vs. Vorjahr
 *
 *   type: custom:energy-yoy-card
 *   entity: sensor.strom_gesamt
 *   title: Strom        # optional
 *   days: 30            # optional
 *
 * Tagesbalken: rot = höher als im Vorjahr, grün = niedriger.
 * Voraussetzung: Entität mit Langzeitstatistik (state_class) und >= 1 Jahr Historie.
 */

const keyOf = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const minusYear = (d) => new Date(d.getFullYear() - 1, d.getMonth(), d.getDate());

class EnergyYoyCard extends HTMLElement {
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
    return document.createElement("energy-yoy-card-editor");
  }
  static getStubConfig() {
    return { entity: "", days: 30 };
  }

  setConfig(config) {
    this._config = { days: 30, ...config };
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
    const stale = Date.now() - this._loadedAt > 15 * 60 * 1000;
    if (this._config.entity && !this._loading && (!this._data || stale)) {
      this._load();
    } else if (first) {
      this._paint();
    }
  }

  async _load() {
    const id = this._config.entity;
    const days = this._config.days;
    this._loading = true;
    this._error = null;
    this._paint();

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const start = addDays(today, -(days - 1));
    const prevStart = minusYear(start);
    const prevEnd = minusYear(addDays(today, 1));

    const fetchRange = (s, e) =>
      this._hass.callWS({
        type: "recorder/statistics_during_period",
        start_time: s.toISOString(),
        end_time: e.toISOString(),
        statistic_ids: [id],
        period: "day",
        types: ["change", "mean"],
      });

    try {
      const [cur, prev] = await Promise.all([
        fetchRange(start, addDays(today, 1)),
        fetchRange(prevStart, addDays(prevEnd, 1)),
      ]);
      const toMap = (res) => {
        const m = new Map();
        (res[id] || []).forEach((r) => {
          const v = r.change != null ? r.change : r.mean;
          if (v != null) m.set(keyOf(new Date(r.start)), v);
        });
        return m;
      };
      const curMap = toMap(cur);
      const prevMap = toMap(prev);
      const rows = [];
      for (let i = 0; i < days; i++) {
        const d = addDays(start, i);
        const pd = minusYear(d);
        rows.push({
          date: d,
          prevDate: pd,
          cur: curMap.has(keyOf(d)) ? curMap.get(keyOf(d)) : null,
          prev: prevMap.has(keyOf(pd)) ? prevMap.get(keyOf(pd)) : null,
        });
      }
      this._data = { rows };
      this._sel = days - 1;
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

  _day(d) {
    return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  }

  _cls(cur, prev) {
    if (cur == null || prev == null || cur === prev) return "neutral";
    return cur > prev ? "bad" : "good";
  }

  _chart(rows) {
    const W = 360, H = 170, padL = 34, padR = 6, padT = 8, padB = 22;
    const cw = W - padL - padR, ch = H - padT - padB;
    const vals = rows.flatMap((r) => [r.cur, r.prev]).filter((v) => v != null);
    const maxRaw = Math.max(...vals, 0);
    if (!vals.length || maxRaw <= 0) return "";
    const step = Math.pow(10, Math.floor(Math.log10(maxRaw)));
    const max = [1, 2, 2.5, 5, 10].map((m) => m * step).find((m) => m >= maxRaw) || maxRaw;
    const slot = cw / rows.length;
    const y = (v) => padT + ch - (v / max) * ch;
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Tagesverbrauch im Vergleich zum Vorjahr">`;

    for (let t = 0; t <= 2; t++) {
      const v = (max / 2) * t;
      svg += `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/>`;
      svg += `<text class="axis" x="${padL - 4}" y="${y(v) + 3}" text-anchor="end">${this._fmt(v, v >= 10 ? 0 : 1)}</text>`;
    }

    rows.forEach((r, i) => {
      const x0 = padL + i * slot;
      if (i === this._sel) svg += `<rect class="selbg" x="${x0}" y="${padT}" width="${slot}" height="${ch}"/>`;
      if (r.prev != null) {
        svg += `<rect class="prev" x="${x0 + slot * 0.1}" y="${y(r.prev)}" width="${slot * 0.8}" height="${Math.max(0, padT + ch - y(r.prev))}" rx="1.5"/>`;
      }
      if (r.cur != null) {
        svg += `<rect class="bar ${this._cls(r.cur, r.prev)}" x="${x0 + slot * 0.28}" y="${y(r.cur)}" width="${slot * 0.44}" height="${Math.max(0, padT + ch - y(r.cur))}" rx="1.5"/>`;
      }
      svg += `<rect class="hit" data-i="${i}" x="${x0}" y="${padT}" width="${slot}" height="${ch + padB}"/>`;
    });

    [0, Math.floor((rows.length - 1) / 2), rows.length - 1].forEach((i, k) => {
      const anchor = k === 0 ? "start" : k === 2 ? "end" : "middle";
      const x = padL + i * slot + (k === 0 ? 0 : k === 2 ? slot : slot / 2);
      svg += `<text class="axis" x="${x}" y="${H - 6}" text-anchor="${anchor}">${this._day(rows[i].date)}</text>`;
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
      detail = `<b>${this._day(s.date)}</b> <span class="${this._cls(s.cur, s.prev)}-t">${this._fmt(s.cur)} ${unit}</span>
        <span class="muted">· Vorjahr ${this._day(s.prevDate)}.${s.prevDate.getFullYear()}: ${this._fmt(s.prev)} ${unit}${
          d != null ? ` · Δ ${d > 0 ? "+" : ""}${this._fmt(d)}` : ""
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
             <span><i class="k bad"></i>höher als Vorjahr</span>
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
        .axis { fill:var(--secondary-text-color); font-size:9px; }
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
                <div><div class="lbl">Letzte ${this._config.days} Tage</div><div class="val">${this._fmt(sumCur)} <small>${unit}</small></div></div>
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
class EnergyYoyCardEditor extends HTMLElement {
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
        { name: "days", selector: { number: { min: 7, max: 90, mode: "box" } } },
      ];
      this._form.computeLabel = (s) =>
        ({ entity: "Entität", title: "Titel (optional)", days: "Anzahl Tage" }[s.name] || s.name);
      this._form.addEventListener("value-changed", (ev) => {
        this.dispatchEvent(
          new CustomEvent("config-changed", { detail: { config: ev.detail.value }, bubbles: true, composed: true })
        );
      });
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.data = { days: 30, ...this._config };
  }
}

customElements.define("energy-yoy-card", EnergyYoyCard);
customElements.define("energy-yoy-card-editor", EnergyYoyCardEditor);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "energy-yoy-card",
  name: "Energie-Vorjahresvergleich",
  description: "Tagesverbrauch der letzten 30 Tage im Vergleich zum Vorjahr.",
});
