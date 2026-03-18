// chart.js — main focus line chart
import { SERIES, MARGIN, visible, priceMode, brushExtent } from './main.js';

const MAIN_H = 340;   // height of the main chart SVG

// Real-price key mapping: for each nominal key, what's the real column?
const REAL_KEY = {
    wti:  'wti_real',
    brent:'brent_real',
    // WCS, Urals, OPEC don't have precomputed real columns —
    // we'll derive them on the fly using CPI ratio vs WTI as proxy
};

function getVal(row, key) {
    if (priceMode === 'real') {
        if (REAL_KEY[key]) return row[REAL_KEY[key]];
        // derive: scale by same CPI deflator as WTI
        if (row.wti && row.wti_real && row[key] != null)
            return row[key] * (row.wti_real / row.wti);
    }
    return row[key];
}

// ── Tooltip helpers ───────────────────────────────────────────────────────────
function showTooltip(event, html) {
    const tip = document.getElementById('tooltip');
    tip.innerHTML = html;
    tip.classList.remove('hidden');
    positionTooltip(event);
}

function positionTooltip(event) {
    const tip = document.getElementById('tooltip');
    const pad = 14;
    let x = event.clientX + pad;
    let y = event.clientY + pad;
    if (x + 200 > window.innerWidth)  x = event.clientX - 200 - pad;
    if (y + 160 > window.innerHeight) y = event.clientY - 160 - pad;
    tip.style.left = x + 'px';
    tip.style.top  = y + 'px';
}

function hideTooltip() {
    document.getElementById('tooltip').classList.add('hidden');
}

// ── Event panel ───────────────────────────────────────────────────────────────
function openEventPanel(ev) {
    const fmt = d3.timeFormat('%B %Y');
    document.getElementById('event-label').textContent  = ev.label;
    document.getElementById('event-detail').textContent = ev.detail;
    document.getElementById('event-date').textContent   = fmt(ev.date);
    const cat = document.getElementById('event-category');
    cat.textContent  = ev.category.toUpperCase();
    cat.className    = 'event-category ' + ev.category;
    document.getElementById('event-panel').classList.remove('hidden');
}

document.getElementById('event-close')
    .addEventListener('click', () =>
        document.getElementById('event-panel').classList.add('hidden')
    );

// ── Main export: initChart + updateChart ─────────────────────────────────────
let xScale, yScale, svg, chartG, width;

export function initChart(data, events) {
    const container = document.getElementById('chart-container');
    const totalW = container.clientWidth;
    width  = totalW - MARGIN.left - MARGIN.right;
    const height = MAIN_H - MARGIN.top - MARGIN.bottom;

    // Clear and resize SVG
    const svgEl = document.getElementById('main-chart');
    svgEl.setAttribute('height', MAIN_H);
    d3.select(svgEl).selectAll('*').remove();

    svg = d3.select(svgEl);
    chartG = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    // Clip path so lines don't overflow during brush
    svg.append('defs').append('clipPath').attr('id', 'main-clip')
        .append('rect').attr('width', width).attr('height', height + 4).attr('y', -4);

    // Scales — x is full range; updateChart will narrow it via brushExtent
    xScale = d3.scaleTime()
        .domain(d3.extent(data, d => d.month))
        .range([0, width]);

    yScale = d3.scaleLinear().range([height, 0]);

    // Axes placeholders
    chartG.append('g').attr('class', 'axis axis-x')
        .attr('transform', `translate(0,${height})`);
    chartG.append('g').attr('class', 'axis axis-y');

    // Grid placeholder
    chartG.append('g').attr('class', 'grid grid-y');

    // Lines group (clipped)
    chartG.append('g').attr('class', 'lines-group')
        .attr('clip-path', 'url(#main-clip)');

    // Annotations group (clipped)
    chartG.append('g').attr('class', 'annotations-group')
        .attr('clip-path', 'url(#main-clip)');

    // Overlay for mouse events
    chartG.append('rect')
        .attr('class', 'overlay')
        .attr('width', width).attr('height', height)
        .attr('fill', 'transparent')
        .on('mousemove', (event) => onMouseMove(event, data, height))
        .on('mouseleave', () => {
            chartG.select('.crosshair-x').attr('opacity', 0);
            chartG.select('.crosshair-y').attr('opacity', 0);
            hideTooltip();
        });

    // Crosshairs
    chartG.append('line').attr('class', 'crosshair crosshair-x').attr('opacity', 0)
        .attr('y1', 0).attr('y2', height);
    chartG.append('line').attr('class', 'crosshair crosshair-y').attr('opacity', 0)
        .attr('x1', 0).attr('x2', width);

    updateChart(data, events);
}

export function updateChart(data, events) {
    if (!chartG) return;
    const height = MAIN_H - MARGIN.top - MARGIN.bottom;

    // Determine x domain from brushExtent or full range
    const xDomain = brushExtent
        ? brushExtent
        : d3.extent(data, d => d.month);
    xScale.domain(xDomain);

    // Filter data to visible range
    const inView = data.filter(d => d.month >= xDomain[0] && d.month <= xDomain[1]);

    // Compute y domain across all ACTIVE series within view
    let yMin = Infinity, yMax = -Infinity;
    for (const s of SERIES) {
        if (!visible.has(s.key)) continue;
        for (const row of inView) {
            const v = getVal(row, s.key);
            if (v == null) continue;
            if (v < yMin) yMin = v;
            if (v > yMax) yMax = v;
        }
    }
    if (!isFinite(yMin)) { yMin = 0; yMax = 150; }
    // Allow a little breathing room, floor at 0
    const pad = (yMax - yMin) * 0.07;
    yScale.domain([Math.max(0, yMin - pad), yMax + pad]);

    // ── Axes ───────────────────────────────────────────────────────────────────
    const xAxis = d3.axisBottom(xScale)
        .ticks(width < 500 ? 4 : 8)
        .tickSizeOuter(0);

    const yAxis = d3.axisLeft(yScale)
        .ticks(6)
        .tickFormat(d => `$${d}`)
        .tickSizeOuter(0);

    chartG.select('.axis-x').transition().duration(300).call(xAxis);
    chartG.select('.axis-y').transition().duration(300).call(yAxis);

    // Y grid
    chartG.select('.grid-y')
        .transition().duration(300)
        .call(d3.axisLeft(yScale).ticks(6).tickSize(-width).tickFormat(''))
        .select('.domain').remove();

    // ── Lines ──────────────────────────────────────────────────────────────────
    const linesG = chartG.select('.lines-group');

    const lineGen = key => d3.line()
        .defined(d => getVal(d, key) != null)
        .x(d => xScale(d.month))
        .y(d => yScale(getVal(d, key)))
        .curve(d3.curveMonotoneX);

    SERIES.forEach(s => {
        const isVis = visible.has(s.key);

        let path = linesG.select(`.line.${s.key}`);
        if (path.empty()) {
            path = linesG.append('path')
                .attr('class', `line ${s.key}`)
                .attr('fill', 'none')
                .attr('stroke', s.color)
                .attr('stroke-width', 1.5);
        }

        path.datum(data)
            .transition().duration(300)
            .attr('d', lineGen(s.key))
            .attr('opacity', isVis ? 1 : 0)
            .attr('pointer-events', isVis ? 'all' : 'none');
    });

    // ── Annotations ────────────────────────────────────────────────────────────
    const annG = chartG.select('.annotations-group');
    annG.selectAll('.ann-marker').remove();

    // Only show events within the current x domain; cluster nearby ones
    const visibleEvents = events.filter(e =>
        e.date >= xDomain[0] && e.date <= xDomain[1]
    );

    // Deduplicate: if two events are within 8px of each other, keep only first
    const placed = [];
    for (const ev of visibleEvents) {
        const px = xScale(ev.date);
        if (placed.every(p => Math.abs(p - px) > 10)) placed.push(px);
        else continue;

        const yTop = 6;
        const marker = annG.append('g')
            .attr('class', 'ann-marker')
            .attr('transform', `translate(${px},0)`)
            .on('click', () => openEventPanel(ev))
            .on('mouseenter', function(event) {
                showTooltip(event,
                    `<div class="tooltip-date">${d3.timeFormat('%B %Y')(ev.date)}</div>
           <div style="font-size:12px;color:#e6edf3">${ev.label}</div>`
                );
            })
            .on('mousemove', positionTooltip)
            .on('mouseleave', hideTooltip);

        marker.append('line')
            .attr('y1', yTop + 6).attr('y2', height - 4);

        marker.append('circle')
            .attr('cy', yTop + 3).attr('r', 3.5);
    }
}

// ── Mouse crosshair + tooltip ─────────────────────────────────────────────────
function onMouseMove(event, data, height) {
    const [mx] = d3.pointer(event);
    const hovDate = xScale.invert(mx);

    // Snap to nearest data point
    const bisect = d3.bisector(d => d.month).left;
    const i = bisect(data, hovDate, 1);
    const d0 = data[i - 1], d1 = data[i];
    if (!d0) return;
    const row = !d1 || (hovDate - d0.month < d1.month - hovDate) ? d0 : d1;

    const px = xScale(row.month);

    // Vertical crosshair
    chartG.select('.crosshair-x')
        .attr('opacity', 0.5).attr('x1', px).attr('x2', px);

    // Build tooltip rows for visible series
    const fmt = d3.timeFormat('%B %Y');
    let rows = `<div class="tooltip-date">${fmt(row.month)}</div>`;
    for (const s of SERIES) {
        if (!visible.has(s.key)) continue;
        const v = getVal(row, s.key);
        if (v == null) continue;
        rows += `<div class="tooltip-row">
      <span class="tooltip-swatch" style="background:${s.color}"></span>
      <span class="tooltip-name">${s.label}</span>
      <span class="tooltip-val">$${v.toFixed(2)}</span>
    </div>`;
    }
    // Add spread if WCS visible
    if (visible.has('wcs') && row.spread_wti_wcs != null) {
        rows += `<div class="tooltip-row" style="margin-top:6px;border-top:1px solid #30363d;padding-top:6px">
      <span class="tooltip-name" style="color:#8b949e">WTI−WCS spread</span>
      <span class="tooltip-val" style="color:#f47067">$${row.spread_wti_wcs.toFixed(2)}</span>
    </div>`;
    }

    showTooltip(event, rows);
}