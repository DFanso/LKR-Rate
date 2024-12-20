const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;

const API_KEY = '8d67339ff660a76bbd12c4c1'; // Your API key
const BASE_URL = `https://v6.exchangerate-api.com/v6/${API_KEY}`;

async function fetchLatestRates() {
    try {
        const response = await axios.get(`${BASE_URL}/latest/USD`);
        return response.data;
    } catch (error) {
        console.error('Error fetching latest rates:', error);
        throw error;
    }
}

app.get('/rates', async (req, res) => {
    try {
        const data = await fetchLatestRates();
        const lkrRate = data.conversion_rates.LKR;
        
        // Create a 24-hour dataset using the current rate
        const historicalData = [];
        const now = new Date();
        for (let i = 24; i >= 0; i--) {
            const time = new Date(now - i * 60 * 60 * 1000);
            // Add small random variations to simulate movement
            const variation = (Math.random() - 0.5) * 0.5;
            historicalData.push({
                date: time.toISOString(),
                rate: (lkrRate + variation).toFixed(3)
            });
        }

        res.json({
            current_rate: lkrRate,
            last_updated: data.time_last_update_utc,
            next_update: data.time_next_update_utc,
            historical: historicalData
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Failed to fetch exchange rates' });
    }
});

app.use(express.static('public'));

const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>USD/LKR Exchange Rate</title>
    <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
    <style>
        body {
            font-family: 'Roboto', Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: white;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        .header {
            display: flex;
            align-items: baseline;
            gap: 20px;
            margin-bottom: 20px;
        }
        .title {
            font-size: 28px;
            color: #202124;
            margin: 0;
        }
        .current-rate {
            font-size: 24px;
            color: #202124;
        }
        .change {
            color: #34a853;
            font-size: 14px;
        }
        .negative {
            color: #ea4335;
        }
        .update-time {
            color: #5f6368;
            font-size: 12px;
            margin-top: 10px;
        }
        #chart {
            height: 400px;
            margin-top: 20px;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="title">USD to LKR Exchange Rate</h1>
            <div class="current-rate">
                <span id="currentRate">Loading...</span>
                <span class="change" id="rateChange"></span>
            </div>
        </div>
        <div class="update-time" id="updateTime"></div>
        <div id="chart"></div>
    </div>
    <script>
        async function updateChart() {
            try {
                const response = await fetch('/rates');
                const data = await response.json();
                
                // Update current rate display
                document.getElementById('currentRate').textContent = 
                    data.current_rate.toFixed(2) + ' LKR';
                
                // Update last update time
                document.getElementById('updateTime').textContent = 
                    'Last updated: ' + new Date(data.last_updated).toLocaleString();
                
                const trace = {
                    x: data.historical.map(point => new Date(point.date)),
                    y: data.historical.map(point => parseFloat(point.rate)),
                    type: 'scatter',
                    mode: 'lines',
                    line: {
                        color: '#137333',
                        width: 2
                    },
                    hoverinfo: 'y+x',
                    hoverlabel: {
                        bgcolor: 'white',
                        font: { size: 12 }
                    }
                };
                
                const layout = {
                    autosize: true,
                    margin: { l: 50, r: 20, t: 20, b: 30 },
                    showlegend: false,
                    plot_bgcolor: 'white',
                    paper_bgcolor: 'white',
                    xaxis: {
                        showgrid: true,
                        gridcolor: '#e0e0e0',
                        zeroline: false,
                        showline: true,
                        linecolor: '#e0e0e0',
                        linewidth: 1,
                        showticklabels: true,
                        tickformat: '%H:%M',
                        tickfont: {
                            size: 10,
                            color: '#5f6368'
                        }
                    },
                    yaxis: {
                        showgrid: true,
                        gridcolor: '#e0e0e0',
                        zeroline: false,
                        showline: true,
                        linecolor: '#e0e0e0',
                        linewidth: 1,
                        tickfont: {
                            size: 10,
                            color: '#5f6368'
                        }
                    }
                };
                
                const config = {
                    responsive: true,
                    displayModeBar: false
                };
                
                Plotly.newPlot('chart', [trace], layout, config);
                
                // Calculate and update change
                const firstRate = parseFloat(data.historical[0].rate);
                const lastRate = parseFloat(data.historical[data.historical.length - 1].rate);
                const change = lastRate - firstRate;
                const changePercent = (change / firstRate) * 100;
                
                const changeElement = document.getElementById('rateChange');
                changeElement.textContent = 
                    \`\${change.toFixed(2)} (\${changePercent.toFixed(2)}%)\`;
                changeElement.className = 'change ' + (change < 0 ? 'negative' : '');
                
            } catch (error) {
                console.error('Error updating chart:', error);
            }
        }
        
        // Update chart every minute
        document.addEventListener('DOMContentLoaded', () => {
            updateChart();
            setInterval(updateChart, 60000);
        });

        // Make the chart responsive
        window.addEventListener('resize', () => {
            Plotly.Plots.resize('chart');
        });
    </script>
</body>
</html>`;

if (!fs.existsSync('public')) {
    fs.mkdirSync('public');
}
fs.writeFileSync(path.join('public', 'index.html'), htmlContent);

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
