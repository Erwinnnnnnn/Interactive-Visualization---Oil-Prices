// map.js — world bubble map, pump prices for 6 countries
// Uses d3-geo Natural Earth projection + TopoJSON world outline
// Dots sized by pump price, colored by region, year slider

const COUNTRY_META = {
    'pump_usa':     { name: 'USA',     coords: [-98,  38],  region: 'americas' },
    'pump_canada':  { name: 'Canada',  coords: [-96,  60],  region: 'americas' },
    'pump_uk':      { name: 'UK',      coords: [ -2,  54],  region: 'europe'   },
    'pump_germany': { name: 'Germany', coords: [ 10,  51],  region: 'europe'   },
    'pump_france':  { name: 'France',  coords: [  2,  47],  region: 'europe'   },
    'pump_japan':   { name: 'Japan',   coords: [138,  36],  region: 'asia'     },
};

const REGION_COLOR = {
    americas: '#f0b429',
    europe:   '#58a6ff',
    asia:     '#f47067',
};

const MAP_H = 400;
let initiated = false;

export function initMap(data) {
    if (initiated) return;
    initiated = true;

    const container = document.getElementById('map-chart');
    const W = container.clientWidth || 700;

    const svg = d3.select('#map-chart')
        .attr('width', W).attr('height', MAP_H);

    svg.selectAll('*').remove();

    // ── Build year list from data ─────────────────────────────────────────────
    const years = [...new Set(
        data
            .filter(d => d.pump_usa != null)
            .map(d => d.month.getFullYear())
    )].sort();

    let currentYear = years[years.length - 1];

    // ── Projection ────────────────────────────────────────────────────────────
    const projection = d3.geoNaturalEarth1()
        .scale(W / 6.5)
        .translate([W / 2, MAP_H / 2 + 20]);

    const path = d3.geoPath().projection(projection);

    const mapG   = svg.append('g');
    const dotsG  = svg.append('g');

    // ── Load world TopoJSON ───────────────────────────────────────────────────
    const TOPO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

    d3.json(TOPO_URL).then(world => {
        const countries = topojson.feature(world, world.objects.countries);

        mapG.selectAll('path')
            .data(countries.features)
            .join('path')
            .attr('d', path)
            .attr('fill', '#1c2128')
            .attr('stroke', '#30363d')
            .attr('stroke-width', 0.4);

        // Graticule
        mapG.append('path')
            .datum(d3.geoGraticule()())
            .attr('d', path)
            .attr('fill', 'none')
            .attr('stroke', '#21262d')
            .attr('stroke-width', 0.3);

        drawDots(currentYear);
    }).catch(() => {
        // Fallback if CDN blocked: draw a simple rectangle world outline
        mapG.append('rect')
            .attr('x', 0).attr('y', 0).attr('width', W).attr('height', MAP_H)
            .attr('fill', '#161b22').attr('stroke', '#30363d');
        drawDots(currentYear);
    });

    // ── Radius scale ──────────────────────────────────────────────────────────
    const rScale = d3.scaleSqrt().domain([0, 150]).range([4, 38]);

    // ── Draw / update dots ────────────────────────────────────────────────────
    function getYearAvg(key, year) {
        const vals = data
            .filter(d => d.month.getFullYear() === year && d[key] != null)
            .map(d => d[key]);
        return vals.length ? d3.mean(vals) : null;
    }

    function drawDots(year) {
        const dots = Object.entries(COUNTRY_META).map(([key, meta]) => ({
            key, ...meta,
            value: getYearAvg(key, year),
            projected: projection(meta.coords),
        })).filter(d => d.value != null && d.projected);

        // Tooltip
        const tip = document.getElementById('tooltip');

        const groups = dotsG.selectAll('.map-dot')
            .data(dots, d => d.key);

        // Enter
        const enter = groups.enter().append('g').attr('class', 'map-dot');

        enter.append('circle')
            .attr('cx', d => d.projected[0])
            .attr('cy', d => d.projected[1])
            .attr('r', 0)
            .attr('fill', d => REGION_COLOR[d.region])
            .attr('fill-opacity', 0.25)
            .attr('stroke', d => REGION_COLOR[d.region])
            .attr('stroke-width', 1.5)
            .attr('cursor', 'pointer');

        enter.append('text')
            .attr('x', d => d.projected[0])
            .attr('y', d => d.projected[1] - 2)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'central')
            .attr('fill', d => REGION_COLOR[d.region])
            .attr('font-size', '10px')
            .attr('pointer-events', 'none');

        // Merge + update
        const merged = enter.merge(groups);

        merged.select('circle')
            .on('mouseover', function(event, d) {
                const wtiRow = data.filter(r => r.month.getFullYear() === year && r.wti != null);
                const wtiAvg = wtiRow.length ? d3.mean(wtiRow, r => r.wti).toFixed(2) : 'N/A';
                tip.innerHTML = `
          <div class="tooltip-date">${d.name} · ${year}</div>
          <div class="tooltip-row">
            <span class="tooltip-swatch" style="background:${REGION_COLOR[d.region]}"></span>
            <span class="tooltip-name">Pump price (ex-tax)</span>
            <span class="tooltip-val">$${d.value.toFixed(2)}/gal</span>
          </div>
          <div class="tooltip-row">
            <span class="tooltip-name" style="color:#8b949e">WTI benchmark avg</span>
            <span class="tooltip-val">$${wtiAvg}/bbl</span>
          </div>
          <div class="tooltip-row">
            <span class="tooltip-name" style="color:#8b949e">Ratio pump/WTI</span>
            <span class="tooltip-val">${(d.value / (+wtiAvg / 42)).toFixed(2)}x</span>
          </div>`;
                tip.classList.remove('hidden');
                let x = event.clientX + 14, y = event.clientY + 14;
                if (x + 220 > window.innerWidth) x = event.clientX - 234;
                tip.style.left = x + 'px'; tip.style.top = y + 'px';
                d3.select(this).attr('fill-opacity', 0.45).attr('stroke-width', 2.5);
            })
            .on('mousemove', function(event) {
                let x = event.clientX + 14, y = event.clientY + 14;
                if (x + 220 > window.innerWidth) x = event.clientX - 234;
                tip.style.left = x + 'px'; tip.style.top = y + 'px';
            })
            .on('mouseleave', function() {
                tip.classList.add('hidden');
                d3.select(this).attr('fill-opacity', 0.25).attr('stroke-width', 1.5);
            })
            .transition().duration(500)
            .attr('r', d => rScale(d.value));

        merged.select('text')
            .text(d => d.name)
            .attr('y', d => d.projected[1] - rScale(d.value) - 5);

        // Exit
        groups.exit().remove();
    }

    // ── Year slider ───────────────────────────────────────────────────────────
    const sliderW = Math.min(W - 80, 500);
    const sliderG = svg.append('g')
        .attr('transform', `translate(${(W - sliderW) / 2}, ${MAP_H - 28})`);

    const xSlider = d3.scalePoint()
        .domain(years.map(String))
        .range([0, sliderW]);

    sliderG.append('line')
        .attr('x1', 0).attr('x2', sliderW)
        .attr('stroke', '#30363d').attr('stroke-width', 2).attr('stroke-linecap', 'round');

    // Year tick marks
    sliderG.selectAll('.yr-tick')
        .data(years.filter((y, i) => i % 2 === 0))
        .join('text')
        .attr('class', 'yr-tick')
        .attr('x', d => xSlider(String(d)))
        .attr('y', 18)
        .attr('text-anchor', 'middle')
        .attr('fill', '#484f58')
        .attr('font-size', '9px')
        .text(d => d);

    const handle = sliderG.append('circle')
        .attr('class', 'slider-handle')
        .attr('cy', 0)
        .attr('r', 7)
        .attr('fill', '#f0b429')
        .attr('stroke', '#0d1117')
        .attr('stroke-width', 2)
        .attr('cursor', 'ew-resize')
        .attr('cx', xSlider(String(currentYear)));

    const yearLabel = sliderG.append('text')
        .attr('y', -14)
        .attr('text-anchor', 'middle')
        .attr('fill', '#f0b429')
        .attr('font-size', '13px')
        .attr('font-weight', '600')
        .attr('cx', xSlider(String(currentYear)))
        .attr('x', xSlider(String(currentYear)))
        .text(currentYear);

    // Drag behaviour
    const drag = d3.drag()
        .on('drag', function(event) {
            const x = Math.max(0, Math.min(sliderW, event.x));
            // Snap to nearest year
            const yearStr = xSlider.domain().reduce((a, b) =>
                Math.abs(xSlider(a) - x) < Math.abs(xSlider(b) - x) ? a : b
            );
            const year = +yearStr;
            if (year === currentYear) return;
            currentYear = year;
            handle.attr('cx', xSlider(yearStr));
            yearLabel.attr('x', xSlider(yearStr)).text(year);
            drawDots(year);
        });

    handle.call(drag);

    // Slider track click
    sliderG.append('rect')
        .attr('x', -8).attr('y', -10).attr('width', sliderW + 16).attr('height', 20)
        .attr('fill', 'transparent').attr('cursor', 'pointer')
        .on('click', function(event) {
            const [x] = d3.pointer(event);
            const yearStr = xSlider.domain().reduce((a, b) =>
                Math.abs(xSlider(a) - x) < Math.abs(xSlider(b) - x) ? a : b
            );
            currentYear = +yearStr;
            handle.attr('cx', xSlider(yearStr));
            yearLabel.attr('x', xSlider(yearStr)).text(currentYear);
            drawDots(currentYear);
        });

    // ── Legend ────────────────────────────────────────────────────────────────
    const legendG = svg.append('g').attr('transform', `translate(16, 16)`);
    Object.entries(REGION_COLOR).forEach(([region, color], i) => {
        legendG.append('circle').attr('cx', 5).attr('cy', i * 18 + 5).attr('r', 5)
            .attr('fill', color).attr('fill-opacity', 0.5).attr('stroke', color);
        legendG.append('text').attr('x', 14).attr('y', i * 18 + 5)
            .attr('dominant-baseline', 'central')
            .attr('fill', '#8b949e').attr('font-size', '11px')
            .text(region.charAt(0).toUpperCase() + region.slice(1));
    });

    // Bubble size legend
    const sizeLegG = svg.append('g').attr('transform', `translate(${W - 90}, 20)`);
    sizeLegG.append('text').attr('fill', '#484f58').attr('font-size', '10px').text('Bubble = pump price');
    [30, 80, 130].forEach((val, i) => {
        const r = rScale(val);
        sizeLegG.append('circle')
            .attr('cx', 20 + i * 36).attr('cy', 30 + r)
            .attr('r', r).attr('fill', 'none').attr('stroke', '#484f58').attr('stroke-width', 0.8);
        sizeLegG.append('text')
            .attr('x', 20 + i * 36).attr('y', 30 + r * 2 + 11)
            .attr('text-anchor', 'middle').attr('fill', '#484f58').attr('font-size', '9px')
            .text(`$${val}`);
    });
}