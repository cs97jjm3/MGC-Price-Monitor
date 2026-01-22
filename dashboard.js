// MGC Price Monitor v2.0 - Web Dashboard Server
const http = require('http');
const fs = require('fs');
const path = require('path');
const PriceDatabase = require('./database');

class DashboardServer {
  constructor(config) {
    this.config = config;
    this.port = 3739;
  }

  async start() {
    const server = http.createServer(async (req, res) => {
      if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(await this.generateDashboard());
      } else if (req.url === '/manage') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(await this.generateManagePage());
      } else if (req.url.startsWith('/item/')) {
        const itemIndex = parseInt(req.url.split('/item/')[1]);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(await this.generateItemPage(itemIndex));
      } else if (req.url === '/api/data') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(await this.getDashboardData()));
      } else if (req.url === '/api/add-item' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', async () => {
          const result = await this.addItem(JSON.parse(body));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        });
      } else if (req.url === '/api/delete-item' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', async () => {
          const result = await this.deleteItem(JSON.parse(body));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        });
      } else if (req.url === '/api/toggle-item' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', async () => {
          const result = await this.toggleItem(JSON.parse(body));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        });
      } else if (req.url === '/api/reload-config' && req.method === 'POST') {
        const result = await this.reloadConfig();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    server.listen(this.port, () => {
      console.log(`📊 Dashboard available at: http://localhost:${this.port}`);
    });
  }

  async addItem(itemData) {
    try {
      if (!itemData.url || !itemData.name) {
        return { success: false, message: 'URL and name are required' };
      }

      const configPath = path.join(__dirname, 'config.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      const recipients = itemData.recipients 
        ? itemData.recipients.split(',').map(email => email.trim()).filter(email => email.length > 0)
        : config.email.recipients;
      
      const newItem = {
        url: itemData.url.trim(),
        name: itemData.name.trim(),
        category: itemData.category || 'General',
        recipients: recipients
      };
      
      if (itemData.minAmount || itemData.minPercent) {
        newItem.thresholds = {
          minAmount: parseInt(itemData.minAmount) || 100,
          minPercent: parseInt(itemData.minPercent) || 5
        };
      }
      
      const existingItem = config.items.find(item => item.url === newItem.url);
      if (existingItem) {
        return { success: false, message: 'This item URL is already being tracked!' };
      }
      
      config.items.push(newItem);
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      
      const db = new PriceDatabase();
      await db.initialize();
      db.addItem(newItem.url, newItem.name, newItem.category);
      db.close();
      
      return { 
        success: true, 
        message: 'Item added successfully! Click "Reload Config" below to begin monitoring immediately.',
        item: newItem 
      };
      
    } catch (error) {
      console.error('Error adding item:', error);
      return { success: false, message: 'Failed to add item: ' + error.message };
    }
  }

  async deleteItem(itemData) {
    try {
      const configPath = path.join(__dirname, 'config.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      const itemIndex = config.items.findIndex(item => item.url === itemData.url);
      if (itemIndex === -1) {
        return { success: false, message: 'Item not found' };
      }
      
      const removedItem = config.items[itemIndex];
      config.items.splice(itemIndex, 1);
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      
      return { 
        success: true, 
        message: `"${removedItem.name}" removed from monitoring. Click "Reload Config" below to apply immediately.`,
        item: removedItem
      };
      
    } catch (error) {
      console.error('Error deleting item:', error);
      return { success: false, message: 'Failed to delete item: ' + error.message };
    }
  }

  async toggleItem(itemData) {
    try {
      const configPath = path.join(__dirname, 'config.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      const item = config.items.find(item => item.url === itemData.url);
      if (!item) {
        return { success: false, message: 'Item not found' };
      }
      
      item.disabled = !item.disabled;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      
      const status = item.disabled ? 'paused' : 'resumed';
      return { 
        success: true, 
        message: `"${item.name}" monitoring ${status}. Click 'Reload Config' to apply immediately.`,
        item: item
      };
      
    } catch (error) {
      console.error('Error toggling item:', error);
      return { success: false, message: 'Failed to toggle item: ' + error.message };
    }
  }

  async reloadConfig() {
    try {
      const configPath = path.join(__dirname, 'config.json');
      const newConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      this.config = newConfig;
      
      console.log('🔄 Configuration reloaded from dashboard');
      console.log(`📋 Now tracking ${newConfig.items.length} item(s)`);
      
      return { 
        success: true, 
        message: `Configuration reloaded! Now tracking ${newConfig.items.length} item(s). Changes will apply on next scheduled check.`,
        itemCount: newConfig.items.length
      };
      
    } catch (error) {
      console.error('Error reloading config:', error);
      return { success: false, message: 'Failed to reload config: ' + error.message };
    }
  }

  async getDashboardData() {
    const db = new PriceDatabase();
    await db.initialize();
    
    const data = {
      items: [],
      lastUpdated: new Date().toISOString()
    };

    for (const item of this.config.items) {
      const itemId = db.getItemId(item.url);
      if (itemId) {
        const history = db.getPriceHistory(itemId, 30);
        const latest = history[0];
        
        data.items.push({
          name: item.name,
          url: item.url,
          category: item.category || 'General',
          currentPrice: latest?.price,
          disabled: item.disabled || false,
          thresholds: item.thresholds,
          priceHistory: history.map(h => ({
            price: h.price,
            date: h.checked_at,
            mileage: h.mileage
          })),
          recipients: item.recipients || ['global']
        });
      }
    }

    db.close();
    return data;
  }

  async generateItemPage(itemIndex) {
    const data = await this.getDashboardData();
    const item = data.items[itemIndex];
    
    if (!item) {
      return `<h1>Item not found</h1><a href="/">← Back to Dashboard</a>`;
    }

    // Calculate stats
    const highestPrice = item.priceHistory.length >= 2 ? 
      '£' + Math.max(...item.priceHistory.map(h => h.price)).toLocaleString() : 'N/A';
    const lowestPrice = item.priceHistory.length >= 2 ? 
      '£' + Math.min(...item.priceHistory.map(h => h.price)).toLocaleString() : 'N/A';
    const priceRange = item.priceHistory.length >= 2 ? 
      '£' + Math.abs(Math.max(...item.priceHistory.map(h => h.price)) - Math.min(...item.priceHistory.map(h => h.price))).toLocaleString() : 'N/A';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${item.name} - MGC Price Monitor</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f8f9fa; }
        .container { max-width: 1000px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 30px; }
        .header h1 { color: #007bff; margin-bottom: 10px; }
        .nav { text-align: center; margin-bottom: 30px; }
        .nav a { display: inline-block; margin: 0 15px; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; }
        .nav a:hover { background: #0056b3; }
        .item-details { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; }
        .price-current { font-size: 36px; font-weight: bold; color: #007bff; margin: 15px 0; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }
        .stat-card { background: #f8f9fa; padding: 15px; border-radius: 5px; text-align: center; }
        .stat-value { font-size: 24px; font-weight: bold; color: #007bff; }
        .stat-label { font-size: 14px; color: #6c757d; }
        .chart-container { position: relative; height: 400px; margin: 30px 0; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0; }
        .info-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .info-card h3 { margin-top: 0; color: #333; }
        .item-link { display: inline-block; margin-top: 15px; padding: 10px 20px; background: #28a745; color: white; text-decoration: none; border-radius: 5px; }
        .item-link:hover { background: #218838; }
        .history-table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        .history-table th, .history-table td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #ddd; }
        .history-table th { background-color: #f8f9fa; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🏷️ ${item.name}</h1>
            <p>${item.category} - Detailed price monitoring</p>
        </div>
        
        <div class="nav">
            <a href="/">📊 Dashboard</a>
            <a href="/manage">➕ Manage Items</a>
        </div>
        
        <div class="item-details">
            <h2>${item.name} ${item.disabled ? '(PAUSED)' : ''}</h2>
            <div class="price-current">£${item.currentPrice?.toLocaleString() || 'N/A'}</div>
            
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${item.priceHistory.length}</div>
                    <div class="stat-label">Price Checks</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${highestPrice}</div>
                    <div class="stat-label">Highest Price</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${lowestPrice}</div>
                    <div class="stat-label">Lowest Price</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${priceRange}</div>
                    <div class="stat-label">Price Range</div>
                </div>
            </div>
        </div>
        
        <div class="chart-container">
            <canvas id="priceChart"></canvas>
        </div>
        
        <div class="info-grid">
            <div class="info-card">
                <h3>Item Details</h3>
                <p><strong>Name:</strong> ${item.name}</p>
                <p><strong>Category:</strong> ${item.category}</p>
                <p><strong>Status:</strong> ${item.disabled ? '⏸️ Paused' : '✅ Active'}</p>
                <p><strong>Alert Recipients:</strong> ${item.recipients.join(', ')}</p>
                ${item.thresholds ? `<p><strong>Thresholds:</strong> £${item.thresholds.minAmount}+ or ${item.thresholds.minPercent}%+</p>` : ''}
                <a href="${item.url}" target="_blank" class="item-link">View Original Listing →</a>
            </div>
            
            <div class="info-card">
                <h3>Recent Price History</h3>
                <table class="history-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Price</th>
                            <th>Change</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${item.priceHistory.slice(0, 10).map((entry, index) => {
                            const nextEntry = item.priceHistory[index + 1];
                            const change = nextEntry ? entry.price - nextEntry.price : 0;
                            const changeText = change === 0 ? '-' : (change < 0 ? `-£${Math.abs(change).toLocaleString()}` : `+£${change.toLocaleString()}`);
                            const changeColor = change < 0 ? '#dc3545' : change > 0 ? '#28a745' : '#6c757d';
                            return `
                                <tr>
                                    <td>${new Date(entry.date).toLocaleDateString('en-GB')}</td>
                                    <td>£${entry.price.toLocaleString()}</td>
                                    <td style="color: ${changeColor}">${changeText}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <script>
    const ctx = document.getElementById('priceChart').getContext('2d');
    const priceData = ${JSON.stringify(item.priceHistory.reverse())};
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: priceData.map(h => {
                const d = new Date(h.date);
                return d.toLocaleDateString('en-GB') + ' ' + d.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'});
            }),
            datasets: [{
                label: 'Price (£)',
                data: priceData.map(h => h.price),
                borderColor: '#007bff',
                backgroundColor: 'rgba(0, 123, 255, 0.1)',
                tension: 0.1,
                fill: true,
                pointBackgroundColor: '#007bff',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Price History - ${item.name}',
                    font: { size: 16 }
                },
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    ticks: {
                        callback: function(value) {
                            return '£' + value.toLocaleString();
                        }
                    },
                    title: {
                        display: true,
                        text: 'Price (£)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Date'
                    }
                }
            }
        }
    });
    </script>
</body>
</html>`;
  }

  async generateDashboard() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MGC Price Monitor Dashboard</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f8f9fa; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 30px; }
        .header h1 { color: #007bff; margin-bottom: 10px; }
        .nav { text-align: center; margin-bottom: 30px; }
        .nav a { display: inline-block; margin: 0 15px; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; }
        .nav a:hover { background: #0056b3; }
        .item-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 20px; }
        .item-card { background: white; border-radius: 8px; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .item-card h3 { margin-top: 0; color: #333; }
        .price-current { font-size: 24px; font-weight: bold; color: #007bff; margin: 10px 0; }
        .price-change { padding: 5px 10px; border-radius: 4px; font-weight: bold; margin: 10px 0; }
        .price-drop { background-color: #d4edda; color: #155724; }
        .price-rise { background-color: #f8d7da; color: #721c24; }
        .price-same { background-color: #e2e3e5; color: #383d41; }
        .item-links { margin-top: 15px; }
        .item-link { display: inline-block; margin-right: 10px; padding: 8px 15px; text-decoration: none; border-radius: 5px; font-size: 14px; }
        .btn-details { background: #007bff; color: white; }
        .btn-details:hover { background: #0056b3; }
        .btn-listing { background: #28a745; color: white; }
        .btn-listing:hover { background: #218838; }
        .recipients { font-size: 12px; color: #6c757d; margin-top: 10px; }
        .category-badge { display: inline-block; padding: 4px 8px; background: #17a2b8; color: white; border-radius: 3px; font-size: 11px; margin-bottom: 10px; }
        .last-updated { text-align: center; color: #6c757d; font-size: 12px; margin-top: 30px; }
        .schedule-info { text-align: center; background: white; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🏷️ MGC Price Monitor Dashboard</h1>
            <p>Real-time price monitoring across all categories</p>
        </div>
        
        <div class="nav">
            <a href="/">📊 Dashboard</a>
            <a href="/manage">➕ Manage Items</a>
        </div>
        
        <div class="schedule-info">
            <strong>📅 Checking every 2 hours:</strong> 6am, 8am, 10am, 12pm, 2pm, 4pm, 6pm, 8pm, 10pm
        </div>
        
        <div id="loading" style="text-align: center; padding: 40px;">
            Loading dashboard data...
        </div>
        
        <div id="dashboard" class="item-grid" style="display: none;"></div>
        <div id="lastUpdated" class="last-updated"></div>
    </div>

    <script>
    async function loadDashboard() {
        try {
            const response = await fetch('/api/data');
            const data = await response.json();
            
            document.getElementById('loading').style.display = 'none';
            document.getElementById('dashboard').style.display = 'grid';
            
            const dashboard = document.getElementById('dashboard');
            dashboard.innerHTML = '';
            
            data.items.forEach((item, index) => {
                let priceChange = '';
                if (item.priceHistory.length >= 2) {
                    const current = item.priceHistory[0].price;
                    const previous = item.priceHistory[1].price;
                    const change = current - previous;
                    
                    if (change < 0) {
                        priceChange = \`<div class="price-change price-drop">📉 -£\${Math.abs(change).toLocaleString()}</div>\`;
                    } else if (change > 0) {
                        priceChange = \`<div class="price-change price-rise">📈 +£\${change.toLocaleString()}</div>\`;
                    } else {
                        priceChange = \`<div class="price-change price-same">➡️ No change</div>\`;
                    }
                }
                
                const card = document.createElement('div');
                card.className = 'item-card';
                
                card.innerHTML = \`
                    <div class="category-badge">\${item.category}</div>
                    <h3>\${item.name} \${item.disabled ? '(PAUSED)' : ''}</h3>
                    <div class="price-current">£\${item.currentPrice?.toLocaleString() || 'N/A'}</div>
                    \${priceChange}
                    <div class="item-links">
                        <a href="/item/\${index}" class="item-link btn-details">📊 View Details</a>
                        <a href="\${item.url}" target="_blank" class="item-link btn-listing">🔗 View Listing</a>
                    </div>
                    <div class="recipients">Alerts: \${item.recipients.join(', ')}</div>
                \`;
                
                dashboard.appendChild(card);
            });
            
            document.getElementById('lastUpdated').innerHTML = 
                \`Last updated: \${new Date(data.lastUpdated).toLocaleString('en-GB')}\`;
                
        } catch (error) {
            document.getElementById('loading').innerHTML = 
                '<p style="color: red;">Error loading dashboard data</p>';
        }
    }
    
    loadDashboard();
    setInterval(loadDashboard, 5 * 60 * 1000);
    </script>
</body>
</html>`;
  }

  async generateManagePage() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MGC Price Monitor - Manage Items</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f8f9fa; }
        .container { max-width: 800px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 30px; }
        .header h1 { color: #007bff; margin-bottom: 10px; }
        .nav { text-align: center; margin-bottom: 30px; }
        .nav a { display: inline-block; margin: 0 15px; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; }
        .nav a:hover { background: #0056b3; }
        .form-container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .form-group { margin-bottom: 20px; }
        .form-group label { display: block; margin-bottom: 5px; font-weight: bold; color: #333; }
        .form-group input, .form-group textarea, .form-group select { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; }
        .form-group textarea { height: 60px; resize: vertical; }
        .form-group small { color: #6c757d; font-size: 12px; }
        .form-row { display: flex; gap: 15px; }
        .form-row .form-group { flex: 1; }
        .btn { background: #28a745; color: white; padding: 12px 24px; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; }
        .btn:hover { background: #218838; }
        .btn:disabled { background: #6c757d; cursor: not-allowed; }
        .alert { padding: 15px; margin: 15px 0; border-radius: 4px; }
        .alert-success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .alert-error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .current-items { margin-top: 40px; }
        .item-item { background: white; padding: 15px; margin: 10px 0; border-radius: 5px; border-left: 4px solid #007bff; }
        .item-item.disabled { border-left-color: #6c757d; opacity: 0.7; }
        .item-item h4 { margin: 0 0 10px 0; color: #333; }
        .item-item small { color: #6c757d; }
        .item-actions { margin-top: 10px; }
        .item-actions button { margin-right: 10px; padding: 5px 10px; border: none; border-radius: 3px; cursor: pointer; font-size: 12px; }
        .btn-pause { background: #ffc107; color: #212529; }
        .btn-resume { background: #28a745; color: white; }
        .btn-delete { background: #dc3545; color: white; }
        .btn-pause:hover { background: #e0a800; }
        .btn-resume:hover { background: #218838; }
        .btn-delete:hover { background: #c82333; }
        .btn-reload { background: #17a2b8; color: white; }
        .btn-reload:hover { background: #138496; }
        .category-badge { display: inline-block; padding: 4px 8px; background: #17a2b8; color: white; border-radius: 3px; font-size: 11px; margin-left: 10px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🏷️ MGC Price Monitor - Manage Items</h1>
            <p>Add new items to monitor and configure alert settings</p>
        </div>
        
        <div class="nav">
            <a href="/">📊 Dashboard</a>
            <a href="/manage">➕ Manage Items</a>
        </div>
        
        <div class="form-container">
            <h2>Add New Item</h2>
            <form id="addItemForm">
                <div class="form-group">
                    <label for="itemName">Item Name/Description</label>
                    <input type="text" id="itemName" name="name" placeholder="e.g., VW Golf 2019 Blue" required>
                    <small>Descriptive name to identify this item</small>
                </div>
                
                <div class="form-group">
                    <label for="category">Category</label>
                    <select id="category" name="category" required>
                        <option value="Cars">Cars</option>
                        <option value="Furniture">Furniture</option>
                        <option value="Kitchen">Kitchen</option>
                        <option value="Toys">Toys</option>
                        <option value="Electronics">Electronics</option>
                        <option value="Garden">Garden</option>
                        <option value="Clothing">Clothing</option>
                        <option value="Sports">Sports</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label for="itemUrl">Item Listing URL</label>
                    <textarea id="itemUrl" name="url" placeholder="https://dealer.com/items/..." required></textarea>
                    <small>Full URL from the dealer website</small>
                </div>
                
                <div class="form-group">
                    <label for="recipients">Email Recipients</label>
                    <input type="text" id="recipients" name="recipients" placeholder="email1@domain.com, email2@domain.com">
                    <small>Comma-separated email addresses (leave blank to use global recipients)</small>
                </div>
                
                <div class="form-row">
                    <div class="form-group">
                        <label for="minAmount">Min Amount Threshold (£)</label>
                        <input type="number" id="minAmount" name="minAmount" placeholder="100">
                        <small>Only alert if price drops by this amount or more</small>
                    </div>
                    
                    <div class="form-group">
                        <label for="minPercent">Min Percent Threshold (%)</label>
                        <input type="number" id="minPercent" name="minPercent" placeholder="5">
                        <small>Only alert if price drops by this percentage or more</small>
                    </div>
                </div>
                
                <button type="submit" class="btn" id="submitBtn">Add Item</button>
            </form>
            
            <div id="result"></div>
        </div>
        
        <div class="current-items">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h2 style="margin: 0;">Currently Monitored Items</h2>
                <button onclick="reloadConfig()" class="btn btn-reload" style="font-size: 14px; padding: 10px 20px;">
                    🔄 Reload Config
                </button>
            </div>
            <div id="currentItems">Loading...</div>
        </div>
    </div>

    <script>
    document.getElementById('addItemForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const submitBtn = document.getElementById('submitBtn');
        const resultDiv = document.getElementById('result');
        
        submitBtn.disabled = true;
        submitBtn.textContent = 'Adding Item...';
        
        const formData = new FormData(e.target);
        const itemData = Object.fromEntries(formData.entries());
        
        try {
            const response = await fetch('/api/add-item', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(itemData)
            });
            
            const result = await response.json();
            
            if (result.success) {
                resultDiv.innerHTML = \`<div class="alert alert-success">\${result.message}</div>\`;
                e.target.reset();
                loadCurrentItems();
            } else {
                resultDiv.innerHTML = \`<div class="alert alert-error">\${result.message}</div>\`;
            }
        } catch (error) {
            resultDiv.innerHTML = \`<div class="alert alert-error">Error: \${error.message}</div>\`;
        }
        
        submitBtn.disabled = false;
        submitBtn.textContent = 'Add Item';
    });
    
    async function loadCurrentItems() {
        try {
            const response = await fetch('/api/data');
            const data = await response.json();
            
            const container = document.getElementById('currentItems');
            
            if (data.items.length === 0) {
                container.innerHTML = '<p>No items currently being monitored.</p>';
                return;
            }
            
            container.innerHTML = data.items.map(item => \`
                <div class="item-item \${item.disabled ? 'disabled' : ''}">
                    <h4>\${item.name} <span class="category-badge">\${item.category}</span> \${item.disabled ? '(PAUSED)' : ''}</h4>
                    <p><strong>Current Price:</strong> £\${item.currentPrice?.toLocaleString() || 'N/A'}</p>
                    <p><strong>Recipients:</strong> \${item.recipients.join(', ')}</p>
                    \${item.thresholds ? \`<p><strong>Thresholds:</strong> £\${item.thresholds.minAmount}+ or \${item.thresholds.minPercent}%+</p>\` : ''}
                    <small><a href="\${item.url}" target="_blank">View Listing</a></small>
                    <div class="item-actions">
                        <button class="\${item.disabled ? 'btn-resume' : 'btn-pause'}" onclick="toggleItem('\${item.url}')">
                            \${item.disabled ? '▶️ Resume' : '⏸️ Pause'}
                        </button>
                        <button class="btn-delete" onclick="deleteItem('\${item.url}', '\${item.name}')">
                            🗑️ Delete
                        </button>
                    </div>
                </div>
            \`).join('');
            
        } catch (error) {
            document.getElementById('currentItems').innerHTML = '<p>Error loading items</p>';
        }
    }
    
    async function toggleItem(url) {
        try {
            const response = await fetch('/api/toggle-item', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: url })
            });
            
            const result = await response.json();
            
            const resultDiv = document.getElementById('result');
            if (result.success) {
                resultDiv.innerHTML = \`<div class="alert alert-success">\${result.message}</div>\`;
                loadCurrentItems();
            } else {
                resultDiv.innerHTML = \`<div class="alert alert-error">\${result.message}</div>\`;
            }
        } catch (error) {
            document.getElementById('result').innerHTML = \`<div class="alert alert-error">Error: \${error.message}</div>\`;
        }
    }
    
    async function deleteItem(url, name) {
        if (!confirm(\`Are you sure you want to delete "\${name}" from monitoring?\`)) {
            return;
        }
        
        try {
            const response = await fetch('/api/delete-item', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: url })
            });
            
            const result = await response.json();
            
            const resultDiv = document.getElementById('result');
            if (result.success) {
                resultDiv.innerHTML = \`<div class="alert alert-success">\${result.message}</div>\`;
                loadCurrentItems();
            } else {
                resultDiv.innerHTML = \`<div class="alert alert-error">\${result.message}</div>\`;
            }
        } catch (error) {
            document.getElementById('result').innerHTML = \`<div class="alert alert-error">Error: \${error.message}</div>\`;
        }
    }
    
    async function reloadConfig() {
        const resultDiv = document.getElementById('result');
        resultDiv.innerHTML = '<div class="alert alert-success">Reloading configuration...</div>';
        
        try {
            const response = await fetch('/api/reload-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            const result = await response.json();
            
            if (result.success) {
                resultDiv.innerHTML = \`<div class="alert alert-success">\${result.message}</div>\`;
                loadCurrentItems();
            } else {
                resultDiv.innerHTML = \`<div class="alert alert-error">\${result.message}</div>\`;
            }
        } catch (error) {
            resultDiv.innerHTML = \`<div class="alert alert-error">Error: \${error.message}</div>\`;
        }
    }
    
    loadCurrentItems();
    </script>
</body>
</html>`;
  }
}

module.exports = DashboardServer;
