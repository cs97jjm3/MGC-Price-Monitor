const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

class PriceDatabase {
  constructor() {
    this.dbPath = path.join(__dirname, 'car-prices.db');
    this.db = null;
  }

  async initialize() {
    const SQL = await initSqlJs();
    
    // Load existing database or create new one
    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
    }

    // Create tables
    this.db.run(`
      CREATE TABLE IF NOT EXISTS cars (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS price_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        car_id INTEGER NOT NULL,
        price REAL NOT NULL,
        mileage INTEGER,
        description TEXT,
        checked_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (car_id) REFERENCES cars(id)
      )
    `);

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_car_id ON price_history(car_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_checked_at ON price_history(checked_at)`);
    
    this.save();
  }

  save() {
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  addCar(url, name) {
    try {
      this.db.run('INSERT OR IGNORE INTO cars (url, name) VALUES (?, ?)', [url, name]);
      this.save();
    } catch (error) {
      console.error('Error adding car:', error);
    }
  }

  getCarId(url) {
    const result = this.db.exec('SELECT id FROM cars WHERE url = ?', [url]);
    if (result.length > 0 && result[0].values.length > 0) {
      return result[0].values[0][0];
    }
    return null;
  }

  getLatestPrice(carId) {
    const result = this.db.exec(`
      SELECT price, mileage, description, checked_at 
      FROM price_history 
      WHERE car_id = ? 
      ORDER BY checked_at DESC 
      LIMIT 1
    `, [carId]);
    
    if (result.length > 0 && result[0].values.length > 0) {
      const row = result[0].values[0];
      return {
        price: row[0],
        mileage: row[1],
        description: row[2],
        checked_at: row[3]
      };
    }
    return null;
  }

  addPriceCheck(carId, price, mileage, description) {
    this.db.run(`
      INSERT INTO price_history (car_id, price, mileage, description) 
      VALUES (?, ?, ?, ?)
    `, [carId, price, mileage, description]);
    this.save();
  }

  getPriceHistory(carId, limit = 10) {
    const result = this.db.exec(`
      SELECT price, mileage, description, checked_at 
      FROM price_history 
      WHERE car_id = ? 
      ORDER BY checked_at DESC 
      LIMIT ?
    `, [carId, limit]);
    
    if (result.length > 0) {
      return result[0].values.map(row => ({
        price: row[0],
        mileage: row[1],
        description: row[2],
        checked_at: row[3]
      }));
    }
    return [];
  }

  getAllCars() {
    const result = this.db.exec('SELECT id, url, name FROM cars');
    if (result.length > 0) {
      return result[0].values.map(row => ({
        id: row[0],
        url: row[1],
        name: row[2]
      }));
    }
    return [];
  }

  close() {
    if (this.db) {
      this.save();
      this.db.close();
    }
  }
}

module.exports = PriceDatabase;
