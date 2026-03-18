// context.js — miniature overview chart with d3.brush for zoom selection
import { SERIES, MARGIN } from './main.js';

const CTX_H = 64;
let svg, ctxG, xScale, yScale, brush, width;

export function initContext(data, onBrush) {
    const container = document.getElementById('context-container');
    const totalW = container.clientWidth;
    width  = totalW - MARGIN.left - MARGIN.right;
    const height = CTX_H - 16 - 18;   // compact margins

    const svgEl = document.getElementById('context-chart');
    svgEl.setAttribute('height', CTX_H);
    d3.select(svgEl).selectAll('*').remove();

    svg = d3.select(svgEl);
    ctxG = svg.append('g').attr('transform', `translate(${MARGIN.left},16)`);

    xScale = d3.scaleTime()
        .domain(d3.extent(data, d => d.month))
        .range([0, width]);

    // Y scale: WTI only (representative)
    const yExtent = d3.extent(data, d => d.wti);
    yScale = d3.scaleLinear()
        .domain([0, yExtent[1] * 1.05])
        .range([height, 0]);

    // Draw a thin WTI line as background reference
    const lineGen = d3.line()
        .defined(d => d.wti != null)
        .x(d => xScale(d.month))
        .y(d => yScale(d.wti))
        .curve(d3.curveMonotoneX);

    ctxG.append('path')
        .datum(data)
        .attr('fill', 'none')
        .attr('stroke', '#f0b429')
        .attr('stroke-width', 1)
        .attr('opacity', 0.5)
        .attr('d', lineGen);

    // X axis (just years)
    ctxG.append('g')
        .attr('class', 'axis axis-x')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(xScale).ticks(d3.timeYear.every(2)).tickSizeOuter(0));

    // Brush
    brush = d3.brushX()
        .extent([[0, 0], [width, height]])
        .on('brush end', function(event) {
            if (!event.selection) {
                onBrush(null);
                return;
            }
            const [x0, x1] = event.selection.map(xScale.invert);
            onBrush([x0, x1]);
        });

    ctxG.append('g').attr('class', 'brush').call(brush);
}