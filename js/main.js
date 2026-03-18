// main.js — entry point
// Loads data, builds series config, initialises all chart modules.

import { initChart, updateChart } from './chart.js';
import { initSpread, updateSpread } from './spread.js';
import { initContext } from './context.js';

// ── Series config ─────────────────────────────────────────────────────────────
// Add / remove entries here to change what appears in the viz.
export const SERIES = [
    { key: 'wti',          label: 'WTI',         color: '#f0b429', defaultOn: true  },
    { key: 'brent',        label: 'Brent',        color: '#58a6ff', defaultOn: true  },
    { key: 'wcs',          label: 'WCS',          color: '#f47067', defaultOn: true  },
    { key: 'urals',        label: 'Urals',        color: '#bc8cff', defaultOn: true  },
    { key: 'opec_basket',  label: 'OPEC Basket',  color: '#3fb950', defaultOn: false },
];

// Which series keys are currently visible — mutable, shared across modules
export const visible = new Set(SERIES.filter(s => s.defaultOn).map(s => s.key));

// ── Margin/size constants (shared by all chart modules) ───────────────────────
export const MARGIN = { top: 18, right: 24, bottom: 22, left: 52 };

// ── Price mode: 'nominal' | 'real' ───────────────────────────────────────────
export let priceMode = 'nominal';

// ── State shared by context brush → chart ─────────────────────────────────────
// brushExtent holds the current [Date, Date] zoom window; null = full range
export let brushExtent = null;
export function setBrushExtent(ext) { brushExtent = ext; }

// ── Load data ─────────────────────────────────────────────────────────────────
async function load() {
    const [rawRows, events] = await Promise.all([
        d3.csv('data/oil_monthly.csv'),
        d3.json('data/events.json'),
    ]);

    // Parse dates and numeric fields
    const parseMonth = d3.timeParse('%Y-%m-%d');
    const numFields = [
        'wti','brent','wcs','urals','opec_basket',
        'us_gasoline_usd_gal',
        'spread_wti_wcs','spread_wti_brent',
        'wti_real','brent_real','cpi',
        'pump_uk','pump_germany','pump_france',
        'pump_japan','pump_canada','pump_usa',
    ];

    const data = rawRows
        .map(d => {
            const row = { month: parseMonth(d.month) };
            for (const f of numFields) {
                row[f] = d[f] === '' || d[f] == null ? null : +d[f];
            }
            return row;
        })
        .filter(d => d.month !== null)
        .sort((a, b) => a.month - b.month);

    // Parse event dates
    events.forEach(e => { e.date = parseMonth(e.date); });

    return { data, events };
}

// ── Build series toggle buttons ───────────────────────────────────────────────
function buildToggles(onToggle) {
    const container = document.getElementById('series-toggles');
    for (const s of SERIES) {
        const btn = document.createElement('button');
        btn.className = 'series-btn' + (visible.has(s.key) ? ' active' : '');
        btn.dataset.key = s.key;
        btn.innerHTML = `<span class="swatch" style="background:${s.color}"></span>${s.label}`;
        btn.addEventListener('click', () => {
            if (visible.has(s.key)) {
                visible.delete(s.key);
                btn.classList.remove('active');
            } else {
                visible.add(s.key);
                btn.classList.add('active');
            }
            onToggle();
        });
        container.appendChild(btn);
    }
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
    const { data, events } = await load();

    // Initialise all chart modules (they each grab their SVG element and size)
    initChart(data, events);
    initSpread(data);
    initContext(data, (ext) => {
        setBrushExtent(ext);
        updateChart(data, events);
        updateSpread(data);
    });

    // Series toggle buttons
    buildToggles(() => {
        updateChart(data, events);
        updateSpread(data);
    });

    // Nominal / Real toggle
    document.querySelectorAll('.toggle-btn[data-mode]').forEach(btn => {
        btn.addEventListener('click', () => {
            priceMode = btn.dataset.mode;
            document.querySelectorAll('.toggle-btn[data-mode]').forEach(b =>
                b.classList.toggle('active', b === btn)
            );
            updateChart(data, events);
        });
    });

    // Play button — animates the timeline from start to brushed end
    const playBtn = document.getElementById('play-btn');
    let playing = false;
    let playTimer = null;

    playBtn.addEventListener('click', () => {
        if (playing) {
            playing = false;
            clearInterval(playTimer);
            playBtn.textContent = '▶ Play';
            playBtn.classList.remove('playing');
            return;
        }
        playing = true;
        playBtn.textContent = '⏸ Pause';
        playBtn.classList.add('playing');

        const startDate = data[0].month;
        const endDate   = data[data.length - 1].month;
        const totalMs   = endDate - startDate;
        const stepMs    = totalMs / 120;   // ~120 frames across full range

        let current = startDate;
        playTimer = setInterval(() => {
            current = new Date(+current + stepMs);
            if (current >= endDate) {
                current = endDate;
                clearInterval(playTimer);
                playing = false;
                playBtn.textContent = '▶ Play';
                playBtn.classList.remove('playing');
            }
            setBrushExtent([startDate, current]);
            updateChart(data, events);
            updateSpread(data);
        }, 40);
    });

    // Window resize — redraw everything
    window.addEventListener('resize', () => {
        initChart(data, events);
        initSpread(data);
        initContext(data, (ext) => {
            setBrushExtent(ext);
            updateChart(data, events);
            updateSpread(data);
        });
    });
})();