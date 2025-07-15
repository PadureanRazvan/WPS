// Charts Configuration and Management
import { chartColors } from './config.js';

// Generate realistic team productivity data
function generateTeamProductivityData(baseProductivity, variation) {
    return Array.from({length: 30}, (_, i) => {
        const weeklyPattern = Math.sin(i / 7 * Math.PI) * 0.3; // Weekly patterns
        const randomVariation = (Math.random() - 0.5) * variation;
        const trendVariation = (i - 15) * 0.01; // Slight trend over time
        return Math.max(2, baseProductivity + weeklyPattern + randomVariation + trendVariation);
    });
}

// Initialize all charts
export function initializeCharts() {
    initializeProductivityChart();
    initializeHoursChart();
}

// Dashboard Productivity Chart
export function initializeProductivityChart() {
    const ctx1 = document.getElementById('productivityChart');
    if (!ctx1) return;

    new Chart(ctx1.getContext('2d'), {
        type: 'line',
        data: {
            labels: Array.from({length: 30}, (_, i) => `${i + 1} Mai`),
            datasets: [
                {
                    label: 'RO zooplus',
                    data: generateTeamProductivityData(4.8, 1.2),
                    borderColor: chartColors.teams['RO zooplus'],
                    backgroundColor: chartColors.teams['RO zooplus'] + '20',
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    borderWidth: 3
                },
                {
                    label: 'HU zooplus',
                    data: generateTeamProductivityData(5.2, 1.0),
                    borderColor: chartColors.teams['HU zooplus'],
                    backgroundColor: chartColors.teams['HU zooplus'] + '20',
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    borderWidth: 3
                },
                {
                    label: 'IT zooplus',
                    data: generateTeamProductivityData(4.6, 1.1),
                    borderColor: chartColors.teams['IT zooplus'],
                    backgroundColor: chartColors.teams['IT zooplus'] + '20',
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    borderWidth: 3
                },
                {
                    label: 'NL zooplus',
                    data: generateTeamProductivityData(5.0, 0.9),
                    borderColor: chartColors.teams['NL zooplus'],
                    backgroundColor: chartColors.teams['NL zooplus'] + '20',
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    borderWidth: 3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: chartColors.text,
                        font: {
                            size: 12,
                            weight: '600'
                        },
                        padding: 20,
                        usePointStyle: true,
                        pointStyle: 'line'
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(10, 14, 39, 0.95)',
                    titleColor: chartColors.primary,
                    bodyColor: chartColors.text,
                    borderColor: chartColors.primary,
                    borderWidth: 1,
                    cornerRadius: 8,
                    displayColors: true,
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ' + context.parsed.y.toFixed(2) + ' t/h';
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: chartColors.grid,
                        display: false
                    },
                    ticks: {
                        color: chartColors.text,
                        maxTicksLimit: 10,
                        font: {
                            size: 11
                        }
                    }
                },
                y: {
                    grid: {
                        color: chartColors.grid
                    },
                    ticks: {
                        color: chartColors.text,
                        callback: function(value) {
                            return value + ' t/h';
                        },
                        font: {
                            size: 11
                        }
                    },
                    min: 2,
                    max: 7
                }
            }
        }
    });
}

// Productivity Evolution Chart
let productivityChart;

export function initializeProductivityEvolution() {
    const ctx2 = document.getElementById('productivityEvolution');
    if (!ctx2) return;

    productivityChart = new Chart(ctx2.getContext('2d'), {
        type: 'line',
        data: {
            labels: Array.from({length: 30}, (_, i) => `${i + 1}`),
            datasets: [
                {
                    label: 'RO zooplus',
                    data: generateTeamProductivityData(4.8, 1.2),
                    borderColor: chartColors.teams['RO zooplus'],
                    backgroundColor: chartColors.teams['RO zooplus'] + '20',
                    tension: 0.4,
                    borderWidth: 3,
                    pointRadius: 0,
                    pointHoverRadius: 6
                },
                {
                    label: 'HU zooplus',
                    data: generateTeamProductivityData(5.2, 1.0),
                    borderColor: chartColors.teams['HU zooplus'],
                    backgroundColor: chartColors.teams['HU zooplus'] + '20',
                    tension: 0.4,
                    borderWidth: 3,
                    pointRadius: 0,
                    pointHoverRadius: 6
                },
                {
                    label: 'IT zooplus',
                    data: generateTeamProductivityData(4.6, 1.1),
                    borderColor: chartColors.teams['IT zooplus'],
                    backgroundColor: chartColors.teams['IT zooplus'] + '20',
                    tension: 0.4,
                    borderWidth: 3,
                    pointRadius: 0,
                    pointHoverRadius: 6
                },
                {
                    label: 'NL zooplus',
                    data: generateTeamProductivityData(5.0, 0.9),
                    borderColor: chartColors.teams['NL zooplus'],
                    backgroundColor: chartColors.teams['NL zooplus'] + '20',
                    tension: 0.4,
                    borderWidth: 3,
                    pointRadius: 0,
                    pointHoverRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: chartColors.text,
                        font: {
                            size: 12,
                            weight: '600'
                        },
                        padding: 20,
                        usePointStyle: true,
                        pointStyle: 'line'
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(10, 14, 39, 0.95)',
                    titleColor: chartColors.primary,
                    bodyColor: chartColors.text,
                    borderColor: chartColors.primary,
                    borderWidth: 1,
                    cornerRadius: 8,
                    displayColors: true,
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ' + context.parsed.y.toFixed(2) + ' t/h';
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: chartColors.grid
                    },
                    ticks: {
                        color: chartColors.text,
                        font: {
                            size: 11
                        }
                    }
                },
                y: {
                    grid: {
                        color: chartColors.grid
                    },
                    ticks: {
                        color: chartColors.text,
                        callback: function(value) {
                            return value + ' t/h';
                        },
                        font: {
                            size: 11
                        }
                    },
                    min: 2,
                    max: 7
                }
            }
        }
    });
}

// Hours allocation chart
function initializeHoursChart() {
    const ctx3 = document.getElementById('hoursChart');
    if (!ctx3) return;

    new Chart(ctx3.getContext('2d'), {
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
                borderColor: '#1a2332',
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
                        color: chartColors.text,
                        font: {
                            size: 12,
                            weight: '600'
                        },
                        padding: 15,
                        usePointStyle: true
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(10, 14, 39, 0.95)',
                    titleColor: chartColors.primary,
                    bodyColor: chartColors.text,
                    borderColor: chartColors.primary,
                    borderWidth: 1,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            return context.label + ': ' + context.parsed + ' ore';
                        }
                    }
                }
            },
            cutout: '60%'
        }
    });
}

// Productivity view change function
export function changeProductivityView(view) {
    if (!productivityChart) return;

    // Update active button
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');

    // Update chart data based on view
    if (view === 'weekly') {
        const weeklyLabels = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'S11', 'S12', 'S13', 'S14', 'S15', 'S16', 'S17', 'S18', 'S19', 'S20', 'S21', 'S22', 'S23', 'S24'];
        productivityChart.data.labels = weeklyLabels;
        productivityChart.data.datasets[0].data = generateTeamProductivityData(4.8, 1.0); // RO
        productivityChart.data.datasets[1].data = generateTeamProductivityData(5.2, 0.8); // HU  
        productivityChart.data.datasets[2].data = generateTeamProductivityData(4.6, 0.9); // IT
        productivityChart.data.datasets[3].data = generateTeamProductivityData(5.0, 0.7); // NL
    } else if (view === 'monthly') {
        productivityChart.data.labels = ['Dec', 'Ian', 'Feb', 'Mar', 'Apr', 'Mai'];
        productivityChart.data.datasets[0].data = [4.2, 4.5, 4.8, 5.1, 4.9, 4.8]; // RO
        productivityChart.data.datasets[1].data = [5.0, 5.1, 5.3, 5.2, 5.4, 5.2]; // HU
        productivityChart.data.datasets[2].data = [4.1, 4.3, 4.5, 4.7, 4.6, 4.6]; // IT
        productivityChart.data.datasets[3].data = [4.8, 4.9, 5.1, 5.0, 5.2, 5.0]; // NL
    } else {
        productivityChart.data.labels = Array.from({length: 30}, (_, i) => `${i + 1}`);
        productivityChart.data.datasets[0].data = generateTeamProductivityData(4.8, 1.2); // RO
        productivityChart.data.datasets[1].data = generateTeamProductivityData(5.2, 1.0); // HU
        productivityChart.data.datasets[2].data = generateTeamProductivityData(4.6, 1.1); // IT
        productivityChart.data.datasets[3].data = generateTeamProductivityData(5.0, 0.9); // NL
    }
    productivityChart.update();
} 