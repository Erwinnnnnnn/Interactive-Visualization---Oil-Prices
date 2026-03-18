// scatter.js — WTI spot vs retail pump price, per country, with lag slider
// X axis: WTI price (lagged by N months)
// Y axis: pump price (ex-tax, $/gal)
// Each dot = one month observation, colored by country

const COUNTRIES = [
    { key: 'pump_usa',     name: 'USA',     color: '#f0b429' },
    { key: 'pump_canada',  name: 'Canada',  color: '#3fb950' },
    { key: 'pump_uk',      name: 'UK',      color: '#58a6ff' },
    { key: 'pump_germany', name: 'Germany', color: '#bc8cff' },
    { key: 'pump_france',  name: 'France',  color: '#f47067' },
    { key: 'pump_japan',   name: 'Japan',   color: '#e3b341' },
];

let initiated = false;

export function initScatter(data) {
    if (initiated) return;
    initiated = true;

    const container = document.getElementById('scatter-container');
    const W = container.clientWidth || 700;
    const H = 380;
    const MARGIN = { top: 20, right: 140, bottom: 50, left: 60 };
    const iW = W - MARGIN.left - MARGIN.right;
    const iH = H - MARGIN.top - MARGIN.bottom;

    const svg = d3.select('#scatter-chart').attr('width', W).attr('height', H);
    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    // Clip path
    svg.append('defs').append('clipPath').attr('id', 'scatter-clip')
        .append('rect').attr('width', iW).attr('height', iH);

    let lagMonths = 1;   // how many months WTI leads pump

    // ── Build scatter data with lag ───────────────────────────────────────────
    function buildDots(lag) {
        const dots = [];
        for (const c of COUNTRIES) {
            for (let i = lag; i < data.length; i++) {
                const pumpRow = data[i];
                const wtiRow  = data[i - lag];
                if (pumpRow[c.key] == null || wtiRow.wti == null) continue;
                dots.push({
                    wti:   wtiRow.wti,
                    pump:  pumpRow[c.key],
                    month: pumpRow.month,
                    name:  c.name,
                    color: c.color,
                    key:   c.key,
                });
            }
        }
        return dots;
    }

    // ── Scales ────────────────────────────────────────────────────────────────
    const xScale = d3.scaleLinear().range([0, iW]);
    const yScale = d3.scaleLinear().range([iH, 0]);

    const xAxis = g.append('g').attr('class', 'axis axis-x').attr('transform', `translate(0,${iH})`);
    const yAxis = g.append('g').attr('class', 'axis axis-y');

    g.append('g').attr('class', 'grid grid-x');
    g.append('g').attr('class', 'grid grid-y');

    // Axis labels
    g.append('text')
        .attr('x', iW / 2).attr('y', iH + 40)
        .attr('text-anchor', 'middle').attr('fill', '#8b949e').attr('font-size', '11px')
        .attr('id', 'x-axis-label')
        .text('WTI spot price ($/bbl, lagged 1 month)');

    g.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', -iH / 2).attr('y', -46)
        .attr('text-anchor', 'middle').attr('fill', '#8b949e').attr('font-size', '11px')
        .text('Pump price ($/gal, ex-tax)');

    const dotsG = g.append('g').attr('clip-path', 'url(#scatter-clip)');
    const tip = document.getElementById('tooltip');

    // ── Trend line ────────────────────────────────────────────────────────────
    const trendG = g.append('g').attr('clip-path', 'url(#scatter-clip)');

    function linearRegression(pts) {
        const n = pts.length;
        if (n < 2) return null;
        const mx = d3.mean(pts, d => d.wti);
        const my = d3.mean(pts, d => d.pump);
        const num = d3.sum(pts, d => (d.wti - mx) * (d.pump - my));
        const den = d3.sum(pts, d => (d.wti - mx) ** 2);
        const slope = den ? num / den : 0;
        const intercept = my - slope * mx;
        return { slope, intercept };
    }

    // ── Draw / update ─────────────────────────────────────────────────────────
    function draw(lag) {
        const dots = buildDots(lag);
        const wtiExt   = d3.extent(dots, d => d.wti);
        const pumpExt  = d3.extent(dots, d => d.pump);
        const wtiPad   = (wtiExt[1] - wtiExt[0]) * 0.05;
        const pumpPad  = (pumpExt[1] - pumpExt[0]) * 0.05;

        xScale.domain([wtiExt[0] - wtiPad, wtiExt[1] + wtiPad]);
        yScale.domain([pumpExt[0] - pumpPad, pumpExt[1] + pumpPad]);

        xAxis.transition().duration(300)
            .call(d3.axisBottom(xScale).ticks(6).tickFormat(d => `$${d}`).tickSizeOuter(0));
        yAxis.transition().duration(300)
            .call(d3.axisLeft(yScale).ticks(5).tickFormat(d => `$${d.toFixed(2)}`).tickSizeOuter(0));

        g.select('.grid-y').transition().duration(300)
            .call(d3.axisLeft(yScale).ticks(5).tickSize(-iW).tickFormat(''))
            .select('.domain').remove();

        document.getElementById('x-axis-label')
            .textContent = `WTI spot price ($/bbl, lagged ${lag} month${lag !== 1 ? 's' : ''})`;

        // Trend line (all countries combined)
        const reg = linearRegression(dots);
        if (reg) {
            const x1 = wtiExt[0] - wtiPad, x2 = wtiExt[1] + wtiPad;
            trendG.selectAll('.trend-line').data([null])
                .join('line')
                .attr('class', 'trend-line')
                .attr('x1', xScale(x1)).attr('x2', xScale(x2))
                .attr('y1', yScale(reg.slope * x1 + reg.intercept))
                .attr('y2', yScale(reg.slope * x2 + reg.intercept))
                .attr('stroke', '#484f58').attr('stroke-width', 1)
                .attr('stroke-dasharray', '4 4');
        }

        // Dots
        const fmt = d3.timeFormat('%b %Y');
        dotsG.selectAll('.sc-dot')
            .data(dots, d => `${d.key}-${d.month}`)
            .join(
                enter => enter.append('circle').attr('class', 'sc-dot')
                    .attr('cx', d => xScale(d.wti))
                    .attr('cy', d => yScale(d.pump))
                    .attr('r', 0)
                    .attr('fill', d => d.color)
                    .attr('fill-opacity', 0.45)
                    .attr('stroke', d => d.color)
                    .attr('stroke-width', 0.5)
                    .attr('cursor', 'pointer')
                    .on('mouseover', function(event, d) {
                        tip.innerHTML = `
              <div class="tooltip-date">${d.name} · ${fmt(d.month)}</div>
              <div class="tooltip-row">
                <span class="tooltip-swatch" style="background:${d.color}"></span>
                <span class="tooltip-name">Pump (ex-tax)</span>
                <span class="tooltip-val">$${d.pump.toFixed(3)}/gal</span>
              </div>
              <div class="tooltip-row">
                <span class="tooltip-name" style="color:#8b949e">WTI (−${lag}mo)</span>
                <span class="tooltip-val">$${d.wti.toFixed(2)}/bbl</span>
              </div>`;
                        tip.classList.remove('hidden');
                        let x = event.clientX + 14, y = event.clientY + 14;
                        if (x + 200 > window.innerWidth) x = event.clientX - 214;
                        tip.style.left = x + 'px'; tip.style.top = y + 'px';
                        d3.select(this).attr('r', 6).attr('fill-opacity', 0.9);
                    })
                    .on('mousemove', function(event) {
                        let x = event.clientX + 14, y = event.clientY + 14;
                        if (x + 200 > window.innerWidth) x = event.clientX - 214;
                        tip.style.left = x + 'px'; tip.style.top = y + 'px';
                    })
                    .on('mouseleave', function() {
                        tip.classList.add('hidden');
                        d3.select(this).attr('r', 3).attr('fill-opacity', 0.45);
                    })
                    .call(e => e.transition().duration(400).attr('r', 3)),
                update => update.transition().duration(300)
                    .attr('cx', d => xScale(d.wti))
                    .attr('cy', d => yScale(d.pump)),
                exit => exit.transition().duration(200).attr('r', 0).remove()
            );
    }

    draw(lagMonths);

    // ── Legend ────────────────────────────────────────────────────────────────
    const legG = svg.append('g')
        .attr('transform', `translate(${W - MARGIN.right + 12}, ${MARGIN.top})`);
    COUNTRIES.forEach((c, i) => {
        legG.append('circle').attr('cx', 5).attr('cy', i * 20 + 5).attr('r', 5)
            .attr('fill', c.color).attr('fill-opacity', 0.6).attr('stroke', c.color);
        legG.append('text').attr('x', 14).attr('y', i * 20 + 5)
            .attr('dominant-baseline', 'central')
            .attr('fill', '#8b949e').attr('font-size', '11px').text(c.name);
    });

    // ── Lag slider ────────────────────────────────────────────────────────────
    const sliderDiv = document.getElementById('scatter-lag');
    sliderDiv.innerHTML = `
    <label style="font-size:12px;color:#8b949e;display:flex;align-items:center;gap:10px">
      WTI lag:
      <input type="range" id="lag-slider" min="0" max="6" value="1" step="1"
        style="width:140px;accent-color:#f0b429">
      <span id="lag-val" style="color:#f0b429;font-weight:600;min-width:60px">1 month</span>
    </label>`;

    document.getElementById('lag-slider').addEventListener('input', function() {
        lagMonths = +this.value;
        document.getElementById('lag-val').textContent =
            lagMonths === 0 ? 'no lag' : `${lagMonths} month${lagMonths > 1 ? 's' : ''}`;
        draw(lagMonths);
    });
}