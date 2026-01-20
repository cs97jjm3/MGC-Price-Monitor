const express = require('express');
const path = require('path');
const fs = require('fs');
const PriceDatabase = require('./database');

class DashboardServer {
  constructor(config) {
    this.config = config;
    this.app = express();
    this.port = 3000;
    
    this.setupRoutes();
  }

  setupRoutes() {
    // Serve static dashboard
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'dashboard.html'));
    });

    // API endpoint for car data
    this.app.get('/api/cars', async (req, res) => {
      try {
        const db = new PriceDatabase();
        await db.initialize();

        const cars = [];
        
        for (const car of this.config.cars) {
          const carId = db.getCarId(car.url);
          if (!carId) continue;

          const history = db.getPriceHistory(carId, 30); // Last 30 checks
          const currentPrice = history.length > 0 ? history[0].price : null;
          const previousPrice = history.length > 1 ? history[1].price : null;
          const recentChange = (currentPrice && previousPrice) ? (currentPrice - previousPrice) : 0;
          const lastCheck = history.length > 0 ? history[0].checked_at : null;

          cars.push({
            id: carId,
            name: car.name,
            url: car.url,
            currentPrice,
            previousPrice,
            recentChange,
            lastCheck,
            history: history.slice(0, 20), // Last 20 for chart
            recipients: car.recipients || []
          });
        }

        db.close();
        res.json(cars);
      } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: 'Failed to fetch car data' });
      }
    });

    // API endpoint for triggering manual check
    this.app.post('/api/check', async (req, res) => {
      try {
        const checkPrices = require('./check-prices');
        await checkPrices();
        res.json({ success: true, message: 'Price check completed' });
      } catch (error) {
        res.status(500).json({ error: 'Price check failed', message: error.message });
      }
    });
  }

  start() {
    this.app.listen(this.port, () => {
      console.log(`📊 Dashboard server running at http://localhost:${this.port}`);
      console.log(`   Open your browser to view the car price dashboard`);
    });
  }
}

module.exports = DashboardServer;
