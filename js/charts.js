// Charts Configuration and Management
import { chartColors, translations } from './config.js';
import { getProductivityTrendData } from './productivity.js?v=2026.07.20.1';

let productivityChartInstance = null;
let hoursChartInstance = null;
let chartMonth = new Date().getMonth();   // 0-indexed
let chartYear = new Date().getFullYear();

// Attach chart nav listeners once
let chartNavInitialized = false;

export function getThemeChartColors(style = null) {
    const resolvedStyle = style || (typeof getComputedStyle === 'function'
        ? getComputedStyle(document.documentElement)
        : null);
    const token = (name, fallback) => resolvedStyle?.getPropertyValue?.(name)?.trim() || fallback;

    return {
        primary: token('--accent', chartColors.primary),
        text: token('--text-secondary', chartColors.text),
        grid: token('--border', chartColors.grid),
        tooltip: token('--primary-dark', 'rgba(10, 14, 39, 0.95)'),
        surface: token('--primary-light', '#1a2332')
    };
}

// Initialize all charts
export function initializeCharts() {
    initializeProductivityChart();
    initializeHoursChart();

    if (!chartNavInitialized) {
        chartNavInitialized = true;
        document.getElementById('chartPrevMonth')?.addEventListener('click', () => {
            chartMonth--;
            if (chartMonth < 0) { chartMonth = 11; chartYear--; }
            initializeProductivityChart();
        });
        document.getElementById('chartNextMonth')?.addEventListener('click', () => {
            chartMonth++;
            if (chartMonth > 11) { chartMonth = 0; chartYear++; }
            initializeProductivityChart();
        });
    }
}

// Dashboard Productivity Chart — uses real data from productivity module
export function initializeProductivityChart() {
    const ctx = document.getElementById('productivityChart');
    if (!ctx) return;
    const themeColors = getThemeChartColors();

    // Always update the chart title to show the viewed month
    const lang = localStorage.getItem('language') || 'ro';
    const locales = { ro: 'ro-RO', en: 'en-US', it: 'it-IT' };
    const locale = locales[lang] || 'ro-RO';
    const trendLabel = (translations[lang] && translations[lang]['productivity-trend']) || 'Productivity Trend';
    const monthDate = new Date(chartYear, chartMonth, 1);
    const monthName = monthDate.toLocaleDateString(locale, { month: 'long' });
    const capitalMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    const titleEl = ctx.parentElement.querySelector('.chart-title');
    if (titleEl) titleEl.textContent = `${trendLabel} — ${capitalMonth} ${chartYear}`;

    const trendData = getProductivityTrendData(chartYear, chartMonth);

    if (!trendData || Object.keys(trendData.teams).length === 0) {
        if (productivityChartInstance) {
            productivityChartInstance.destroy();
            productivityChartInstance = null;
        }
        const parent = ctx.parentElement;
        let emptyMsg = parent.querySelector('.chart-empty-msg');
        if (!emptyMsg) {
            emptyMsg = document.createElement('div');
            emptyMsg.className = 'chart-empty-msg';
            emptyMsg.style.cssText = 'text-align: center; padding: 3rem; color: var(--text-secondary);';
            emptyMsg.textContent = (translations[lang] && translations[lang]['charts-no-data']) || 'No productivity data uploaded.';
            parent.appendChild(emptyMsg);
        }
        ctx.style.display = 'none';
        return;
    }

    // Remove empty message if it exists
    const parent = ctx.parentElement;
    const emptyMsg = parent.querySelector('.chart-empty-msg');
    if (emptyMsg) emptyMsg.remove();
    ctx.style.display = '';

    // Format date labels
    const labels = trendData.dates.map(dk => {
        const parts = dk.split('-');
        return `${parseInt(parts[2])}.${parts[1]}`;
    });

    // Build datasets per team
    const datasets = [];
    for (const [teamName, values] of Object.entries(trendData.teams)) {
        const color = chartColors.teams[teamName] || '#888';
        datasets.push({
            label: teamName,
            data: values.map(v => v !== null ? parseFloat(v.toFixed(2)) : null),
            borderColor: color,
            backgroundColor: color + '20',
            tension: 0.4,
            pointRadius: 4,
            pointHoverRadius: 7,
            borderWidth: 3,
            spanGaps: true
        });
    }

    // Title already updated above

    if (productivityChartInstance) {
        productivityChartInstance.destroy();
    }

    productivityChartInstance = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            interaction: {
                intersect: true,
                mode: 'nearest'
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: themeColors.text,
                        font: { size: 12, weight: '600' },
                        padding: 20,
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    backgroundColor: themeColors.tooltip,
                    titleColor: themeColors.primary,
                    bodyColor: themeColors.text,
                    borderColor: themeColors.primary,
                    borderWidth: 1,
                    cornerRadius: 8,
                    displayColors: true,
                    bodyFont: { size: 11 },
                    titleFont: { size: 12 },
                    padding: 8,
                    boxPadding: 3,
                    maxWidth: 220,
                    // Only show the hovered dataset, not all at once
                    mode: 'nearest',
                    intersect: true,
                    callbacks: {
                        label: function(context) {
                            if (context.parsed.y === null) return context.dataset.label + ': N/A';
                            return context.dataset.label + ': ' + context.parsed.y.toFixed(2) + ' t/h';
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: themeColors.grid, display: false },
                    ticks: {
                        color: themeColors.text,
                        font: { size: 11 }
                    }
                },
                y: {
                    grid: { color: themeColors.grid },
                    ticks: {
                        color: themeColors.text,
                        callback: function(value) { return value + ' t/h'; },
                        font: { size: 11 }
                    },
                    beginAtZero: true
                }
            }
        }
    });
}

// Hours allocation doughnut chart — uses real planner data
function initializeHoursChart() {
    const ctx = document.getElementById('hoursChart');
    if (!ctx) return;
    const themeColors = getThemeChartColors();

    hoursChartInstance?.destroy();

    hoursChartInstance = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['RO zooplus', 'HU zooplus', 'IT zooplus', 'NL zooplus', 'DE zooplus'],
            datasets: [{
                data: [168, 134, 120, 80, 34],
                backgroundColor: [
                    chartColors.teams['RO zooplus'],
                    chartColors.teams['HU zooplus'],
                    chartColors.teams['IT zooplus'],
                    chartColors.teams['NL zooplus'],
                    chartColors.teams['DE zooplus']
                ],
                borderColor: themeColors.surface,
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: themeColors.text,
                        font: { size: 12, weight: '600' },
                        padding: 15,
                        usePointStyle: true
                    }
                },
                tooltip: {
                    backgroundColor: themeColors.tooltip,
                    titleColor: themeColors.primary,
                    bodyColor: themeColors.text,
                    borderColor: themeColors.primary,
                    borderWidth: 1,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            const lang = localStorage.getItem('language') || 'ro';
                            const hoursUnit = (translations[lang] && translations[lang]['charts-hours-unit']) || 'hours';
                            return context.label + ': ' + context.parsed + ' ' + hoursUnit;
                        }
                    }
                }
            },
            cutout: '60%'
        }
    });
}
