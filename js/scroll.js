// scroll.js — scrollytelling engine
// Watches each section entering the viewport and fires its init animation once.
// Also keeps the sticky nav dot in sync.

const SECTIONS = ['benchmarks', 'map', 'heatmap', 'scatter', 'race'];
const initiated = new Set();

export function initScroll(callbacks) {
    // callbacks: { sectionId: () => void } — called once when section enters view

    const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const id = entry.target.dataset.section;

            // Activate nav dot
            document.querySelectorAll('.nav-dot').forEach(d =>
                d.classList.toggle('active', d.dataset.section === id)
            );

            // Fade in narrative text
            entry.target.querySelectorAll('.narrative').forEach(el => {
                el.classList.add('visible');
            });

            // Fire chart init callback once
            if (!initiated.has(id) && callbacks[id]) {
                initiated.add(id);
                callbacks[id]();
            }
        }
    }, { threshold: 0.25 });

    SECTIONS.forEach(id => {
        const el = document.getElementById(`section-${id}`);
        if (el) observer.observe(el);
    });

    // Sticky nav click → smooth scroll
    document.querySelectorAll('.nav-dot').forEach(dot => {
        dot.addEventListener('click', () => {
            const el = document.getElementById(`section-${dot.dataset.section}`);
            if (el) el.scrollIntoView({ behavior: 'smooth' });
        });
    });
}