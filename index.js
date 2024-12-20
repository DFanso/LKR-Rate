const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;

const API_KEY = '8d67339ff660a76bbd12c4c1';
const BASE_URL = `https://v6.exchangerate-api.com/v6/${API_KEY}`;
const HISTORY_FILE = 'rate_history.json';

// Function to load historical data
function loadHistoricalData() {
    try {
        if (fs.existsSync(HISTORY_FILE)) {
            const data = fs.readFileSync(HISTORY_FILE, 'utf8');
            return JSON.parse(data);
        }
        return [];
    } catch (error) {
        console.error('Error loading historical data:', error);
        return [];
    }
}

// Function to save historical data
function saveHistoricalData(data) {
    try {
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error saving historical data:', error);
    }
}

// Function to add new rate to history
function addToHistory(rate) {
    const history = loadHistoricalData();
    const newEntry = {
        date: new Date().toISOString(),
        rate: parseFloat(rate)
    };
    
    history.push(newEntry);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const filteredHistory = history.filter(entry => 
        new Date(entry.date) > thirtyDaysAgo
    );
    
    saveHistoricalData(filteredHistory);
    return filteredHistory;
}

// Function to generate forecast data
function generateForecast(lastRate, days) {
    const forecast = [];
    const volatility = 0.002;
    const trend = 0.0001;
    
    for (let i = 1; i <= days; i++) {
        const date = new Date();
        date.setDate(date.getDate() + i);
        
        const randomChange = (Math.random() - 0.5) * 2 * volatility;
        const trendChange = trend * i;
        const newRate = lastRate * (1 + randomChange + trendChange);
        
        forecast.push({
            date: date.toISOString(),
            rate: newRate.toFixed(3),
            isForecast: true
        });
    }
    return forecast;
}

// Function to get data for specific time period
function getDataForPeriod(period, historicalData) {
    const now = new Date();
    let startDate = new Date();
    let forecastDays = 0;

    switch(period) {
        case '1D':
            startDate.setDate(now.getDate() - 1);
            forecastDays = 1;
            break;
        case '1W':
            startDate.setDate(now.getDate() - 7);
            forecastDays = 3;
            break;
        case '1M':
            startDate.setMonth(now.getMonth() - 1);
            forecastDays = 7;
            break;
        case '1Y':
            startDate.setFullYear(now.getFullYear() - 1);
            forecastDays = 30;
            break;
        case '5Y':
            startDate.setFullYear(now.getFullYear() - 5);
            forecastDays = 90;
            break;
        default:
            startDate.setDate(now.getDate() - 1);
            forecastDays = 1;
    }

    const filteredData = historicalData.filter(entry => 
        new Date(entry.date) >= startDate
    );

    const lastRate = historicalData[historicalData.length - 1]?.rate || 320;
    const forecast = generateForecast(lastRate, forecastDays);

    return { historical: filteredData, forecast };
}

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
        const period = req.query.period || '1D';
        const showForecast = req.query.forecast === 'true';
        
        const data = await fetchLatestRates();
        const lkrRate = data.conversion_rates.LKR;
        
        const historicalData = addToHistory(lkrRate);
        const periodData = getDataForPeriod(period, historicalData);
        
        res.json({
            current_rate: lkrRate,
            last_updated: data.time_last_update_utc,
            next_update: data.time_next_update_utc,
            historical: periodData.historical,
            forecast: showForecast ? periodData.forecast : []
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Failed to fetch exchange rates' });
    }
});

app.get('/history', (req, res) => {
    const history = loadHistoricalData();
    res.json(history);
});

app.use(express.static('public'));

const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>USD/LKR Exchange Rate Widget</title>
    <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
        body {
            font-family: 'Inter', sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f8f9fa;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
        }
        .widget-container {
            background: white;
            border-radius: 16px;
            box-shadow: 0 4px 24px rgba(0,0,0,0.1);
            padding: 24px;
            width: 90%;
            max-width: 800px;
            margin: 20px;
        }
        .widget-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 24px;
        }
        .currency-info {
            flex: 1;
        }
        .title {
            font-size: 20px;
            font-weight: 600;
            color: #1a1f36;
            margin: 0 0 8px 0;
        }
        .currency-pair {
            font-size: 32px;
            font-weight: 600;
            color: #1a1f36;
            margin: 0;
        }
        .rate-info {
            text-align: right;
        }
        .current-rate {
            font-size: 28px;
            font-weight: 600;
            color: #1a1f36;
            margin: 0;
        }
        .change {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            margin-top: 8px;
        }
        .positive {
            background-color: #ecfdf3;
            color: #039855;
        }
        .negative {
            background-color: #fef3f2;
            color: #d92d20;
        }
        .update-time {
            color: #667085;
            font-size: 12px;
            margin-top: 8px;
        }
        .chart-container {
            margin-top: 20px;
            border-radius: 12px;
            overflow: hidden;
            background: white;
        }
        #chart {
            height: 360px;
        }
        .controls {
            display: flex;
            gap: 16px;
            margin-bottom: 20px;
            align-items: center;
        }
        .period-selector {
            display: flex;
            gap: 8px;
            background: #f8f9fa;
            padding: 4px;
            border-radius: 8px;
        }
        .period-btn {
            padding: 8px 16px;
            border: none;
            background: none;
            cursor: pointer;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            color: #667085;
            transition: all 0.2s;
        }
        .period-btn.active {
            background: white;
            color: #1a1f36;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .forecast-toggle {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .switch {
            position: relative;
            display: inline-block;
            width: 40px;
            height: 24px;
        }
        .switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        .slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: #e0e0e0;
            transition: .4s;
            border-radius: 24px;
        }
        .slider:before {
            position: absolute;
            content: "";
            height: 18px;
            width: 18px;
            left: 3px;
            bottom: 3px;
            background-color: white;
            transition: .4s;
            border-radius: 50%;
        }
        input:checked + .slider {
            background-color: #0052ff;
        }
        input:checked + .slider:before {
            transform: translateX(16px);
        }
        .stat-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 16px;
            margin-top: 24px;
            padding: 16px;
            background: #f8f9fa;
            border-radius: 12px;
        }
        .stat-item {
            text-align: center;
        }
        .stat-label {
            font-size: 12px;
            color: #667085;
            margin-bottom: 4px;
        }
        .stat-value {
            font-size: 16px;
            font-weight: 600;
            color: #1a1f36;
        }
        @media (max-width: 600px) {
            .widget-header {
                flex-direction: column;
                align-items: stretch;
            }
            .rate-info {
                text-align: left;
                margin-top: 16px;
            }
            .controls {
                flex-direction: column;
                align-items: stretch;
            }
        }
    </style>
</head>
<body>
    <div class="widget-container">
        <div class="widget-header">
            <div class="currency-info">
                <div class="title">Exchange Rate</div>
                <div class="currency-pair">USD/LKR</div>
            </div>
            <div class="rate-info">
                <div class="current-rate" id="currentRate">Loading...</div>
                <div class="change" id="rateChange"></div>
                <div class="update-time" id="updateTime"></div>
            </div>
        </div>
        
        <div class="controls">
            <div class="period-selector">
                <button class="period-btn active" data-period="1D">1D</button>
                <button class="period-btn" data-period="1W">1W</button>
                <button class="period-btn" data-period="1M">1M</button>
                <button class="period-btn" data-period="1Y">1Y</button>
                <button class="period-btn" data-period="5Y">5Y</button>
            </div>
            <div class="forecast-toggle">
                <label class="switch">
                    <input type="checkbox" id="forecastToggle">
                    <span class="slider"></span>
                </label>
                <span>Show Forecast</span>
            </div>
        </div>
        
        <div class="chart-container">
            <div id="chart"></div>
        </div>
        
        <div class="stat-grid">
            <div class="stat-item">
                <div class="stat-label">24h High</div>
                <div class="stat-value" id="dayHigh">-</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">24h Low</div>
                <div class="stat-value" id="dayLow">-</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">24h Change</div>
                <div class="stat-value" id="dayChange">-</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Last Updated</div>
                <div class="stat-value" id="lastUpdate">-</div>
            </div>
        </div>
    </div>
    
    <script>
        let currentPeriod = '1D';
        let showForecast = false;
        
        async function updateChart() {
            try {
                const response = await fetch('/rates?period=' + currentPeriod + '&forecast=' + showForecast);
                const data = await response.json();
                
                const allData = [...data.historical];
                if (showForecast) {
                    allData.push(...data.forecast);
                }
                
                const historicalTrace = {
                    x: data.historical.map(point => new Date(point.date)),
                    y: data.historical.map(point => parseFloat(point.rate)),
                    type: 'scatter',
                    mode: 'lines',
                    name: 'Historical',
                    line: {
                        color: '#0052ff',
                        width: 2,
                        shape: 'spline'
                    },
                    fill: 'tonexty',
                    fillcolor: 'rgba(0, 82, 255, 0.1)'
                };
                
                const traces = [historicalTrace];
                
                if (showForecast && data.forecast.length > 0) {
                    const forecastTrace = {
                        x: data.forecast.map(point => new Date(point.date)),
                        y: data.forecast.map(point => parseFloat(point.rate)),
                        type: 'scatter',
                        mode: 'lines',
                        name: 'Forecast',
                        line: {
                            color: '#34a853',
                            width: 2,
                            dash: 'dot',
                            shape: 'spline'
                        }
                    };
                    traces.push(forecastTrace);
                }
                
                const layout = {
                    autosize: true,
                    margin: { l: 40, r: 20, t: 20, b: 20 },
                    showlegend: showForecast,
                    legend: {
                        x: 0,
                        y: 1.1,
                        orientation: 'h'
                    },plot_bgcolor: 'white',
                    paper_bgcolor: 'white',
                    xaxis: {
                        showgrid: true,
                        gridcolor: '#f0f0f0',
                        zeroline: false,
                        showline: true,
                        linecolor: '#e0e0e0',
                        linewidth: 1,
                        showticklabels: true,
                        tickfont: {
                            size: 10,
                            color: '#667085',
                            family: 'Inter'
                        }
                    },
                    yaxis: {
                        showgrid: true,
                        gridcolor: '#f0f0f0',
                        zeroline: false,
                        showline: true,
                        linecolor: '#e0e0e0',
                        linewidth: 1,
                        tickfont: {
                            size: 10,
                            color: '#667085',
                            family: 'Inter'
                        }
                    }
                };
                
                const config = {
                    responsive: true,
                    displayModeBar: false
                };
                
                Plotly.newPlot('chart', traces, layout, config);
                
                // Update current rate and stats
                document.getElementById('currentRate').textContent = 
                    data.current_rate.toFixed(2) + ' LKR';
                
                const rates = data.historical.map(point => parseFloat(point.rate));
                const dayHigh = Math.max(...rates).toFixed(2);
                const dayLow = Math.min(...rates).toFixed(2);
                
                document.getElementById('dayHigh').textContent = dayHigh + ' LKR';
                document.getElementById('dayLow').textContent = dayLow + ' LKR';
                
                // Calculate change
                const firstRate = parseFloat(data.historical[0].rate);
                const lastRate = parseFloat(data.historical[data.historical.length - 1].rate);
                const change = lastRate - firstRate;
                const changePercent = (change / firstRate) * 100;
                
                const changeElement = document.getElementById('rateChange');
                changeElement.textContent = 
                    \`\${change >= 0 ? '+' : ''}\${change.toFixed(2)} (\${changePercent.toFixed(2)}%)\`;
                changeElement.className = 'change ' + (change >= 0 ? 'positive' : 'negative');
                
                document.getElementById('dayChange').textContent = 
                    \`\${changePercent >= 0 ? '+' : ''}\${changePercent.toFixed(2)}%\`;
                
                // Update time display
                const updateTime = new Date(data.last_updated);
                document.getElementById('lastUpdate').textContent = 
                    updateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                document.getElementById('updateTime').textContent = 
                    \`Last updated: \${updateTime.toLocaleString()}\`;
                
            } catch (error) {
                console.error('Error updating chart:', error);
            }
        }
        
        // Event listeners for period buttons
        document.querySelectorAll('.period-btn').forEach(button => {
            button.addEventListener('click', () => {
                document.querySelectorAll('.period-btn').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                currentPeriod = button.dataset.period;
                updateChart();
            });
        });
        
        // Event listener for forecast toggle
        document.getElementById('forecastToggle').addEventListener('change', (e) => {
            showForecast = e.target.checked;
            updateChart();
        });
        
        // Initial load and auto-refresh
        document.addEventListener('DOMContentLoaded', () => {
            updateChart();
            setInterval(updateChart, 60000); // Update every minute
        });

        // Make chart responsive
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
