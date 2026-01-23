// MGC Price Monitor v2.0 - Price Database Manager
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

class PriceDatabase {
  constructor() {
    this.dbPath = path.join(__dirname, 'item-prices.db');
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
      CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        category TEXT DEFAULT 'General',
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS price_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id INTEGER NOT NULL,
        price REAL NOT NULL,
        mileage INTEGER,
        description TEXT,
        checked_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (item_id) REFERENCES items(id)
      )
    `);

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_item_id ON price_history(item_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_checked_at ON price_history(checked_at)`);

    // Create scrape_failures table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS scrape_failures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id INTEGER NOT NULL,
        failed_at TEXT DEFAULT (datetime('now')),
        error_type TEXT NOT NULL,
        error_message TEXT,
        consecutive_failures INTEGER DEFAULT 1,
        html_snapshot TEXT,
        FOREIGN KEY (item_id) REFERENCES items(id)
      )
    `);

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_failure_item_id ON scrape_failures(item_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_failure_date ON scrape_failures(failed_at)`);
    
    this.save();
  }

  save() {
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  addItem(url, name, category = 'General') {
    try {
      this.db.run('INSERT OR IGNORE INTO items (url, name, category) VALUES (?, ?, ?)', [url, name, category]);
      this.save();
    } catch (error) {
      console.error('Error adding item:', error);
    }
  }

  updateItemUrl(itemId, newUrl, newName, newCategory) {
    try {
      this.db.run('UPDATE items SET url = ?, name = ?, category = ? WHERE id = ?', [newUrl, newName, newCategory, itemId]);
      this.save();
    } catch (error) {
      console.error('Error updating item:', error);
    }
  }

  getItemId(url) {
    const result = this.db.exec('SELECT id FROM items WHERE url = ?', [url]);
    if (result.length > 0 && result[0].values.length > 0) {
      return result[0].values[0][0];
    }
    return null;
  }

  getLatestPrice(itemId) {
    const result = this.db.exec(`
      SELECT price, mileage, description, checked_at 
      FROM price_history 
      WHERE item_id = ? 
      ORDER BY checked_at DESC 
      LIMIT 1
    `, [itemId]);
    
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

  addPriceCheck(itemId, price, mileage, description) {
    this.db.run(`
      INSERT INTO price_history (item_id, price, mileage, description) 
      VALUES (?, ?, ?, ?)
    `, [itemId, price, mileage, description]);
    this.save();
  }

  getPriceHistory(itemId, limit = 10) {
    const result = this.db.exec(`
      SELECT price, mileage, description, checked_at 
      FROM price_history 
      WHERE item_id = ? 
      ORDER BY checked_at DESC 
      LIMIT ?
    `, [itemId, limit]);
    
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

  getAllItems() {
    const result = this.db.exec('SELECT id, url, name, category FROM items');
    if (result.length > 0) {
      return result[0].values.map(row => ({
        id: row[0],
        url: row[1],
        name: row[2],
        category: row[3]
      }));
    }
    return [];
  }

  // Failure tracking methods
  logFailure(itemId, errorType, errorMessage, htmlSnapshot = null) {
    this.db.run(`
      INSERT INTO scrape_failures (item_id, error_type, error_message, html_snapshot) 
      VALUES (?, ?, ?, ?)
    `, [itemId, errorType, errorMessage, htmlSnapshot]);
    this.save();
  }

  getConsecutiveFailures(itemId) {
    // Count consecutive failures from most recent check
    const result = this.db.exec(`
      SELECT COUNT(*) as count
      FROM scrape_failures
      WHERE item_id = ?
      AND failed_at > (
        SELECT COALESCE(MAX(checked_at), '1970-01-01')
        FROM price_history
        WHERE item_id = ?
      )
    `, [itemId, itemId]);
    
    if (result.length > 0 && result[0].values.length > 0) {
      return result[0].values[0][0];
    }
    return 0;
  }

  getRecentFailures(hours = 24) {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - hours);
    const cutoffStr = cutoff.toISOString().slice(0, 19).replace('T', ' ');
    
    const result = this.db.exec(`
      SELECT f.item_id, c.name, c.url, f.error_type, f.error_message, f.failed_at
      FROM scrape_failures f
      JOIN items c ON f.item_id = c.id
      WHERE f.failed_at > ?
      ORDER BY f.failed_at DESC
    `, [cutoffStr]);
    
    if (result.length > 0) {
      return result[0].values.map(row => ({
        itemId: row[0],
        name: row[1],
        url: row[2],
        errorType: row[3],
        errorMessage: row[4],
        failedAt: row[5]
      }));
    }
    return [];
  }

  getFailuresSince(itemId, since) {
    const result = this.db.exec(`
      SELECT error_type, error_message, failed_at
      FROM scrape_failures
      WHERE item_id = ?
      AND failed_at > ?
      ORDER BY failed_at DESC
    `, [itemId, since]);
    
    if (result.length > 0) {
      return result[0].values.map(row => ({
        errorType: row[0],
        errorMessage: row[1],
        failedAt: row[2]
      }));
    }
    return [];
  }

  clearOldFailures(itemId) {
    // Clear old failures when a successful check happens
    this.db.run('DELETE FROM scrape_failures WHERE item_id = ?', [itemId]);
    this.save();
  }

  getItemsWithPersistentFailures(days = 7) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 19).replace('T', ' ');
    
    const result = this.db.exec(`
      SELECT c.id, c.name, c.url, MIN(f.failed_at) as first_failure, COUNT(*) as failure_count
      FROM items c
      JOIN scrape_failures f ON c.id = f.item_id
      WHERE f.failed_at > ?
      AND NOT EXISTS (
        SELECT 1 FROM price_history p
        WHERE p.item_id = c.id
        AND p.checked_at > f.failed_at
      )
      GROUP BY c.id, c.name, c.url
      HAVING MIN(f.failed_at) <= ?
      ORDER BY first_failure ASC
    `, [cutoffStr, cutoffStr]);
    
    if (result.length > 0) {
      return result[0].values.map(row => ({
        id: row[0],
        name: row[1],
        url: row[2],
        firstFailure: row[3],
        failureCount: row[4]
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
