const PriceDatabase = require('./database');
const EmailNotifier = require('./email');

class WeeklyReporter {
  constructor(config) {
    this.config = config;
  }

  async generateWeeklyReport() {
    if (!this.config.weeklyReport || !this.config.weeklyReport.enabled) {
      return;
    }

    console.log('\n📊 Generating weekly report...');
    
    const db = new PriceDatabase();
    await db.initialize();

    const report = {
      cars: [],
      summary: {
        totalCars: 0,
        priceChanges: 0,
        totalSavings: 0,
        avgPriceChange: 0
      }
    };

    // Get all cars
    const cars = this.config.cars;
    report.summary.totalCars = cars.length;

    for (const car of cars) {
      const carId = db.getCarId(car.url);
      if (!carId) continue;

      // Get price history for last 7 days
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      
      const history = db.getPriceHistory(carId, 50); // Get more to filter by date
      const weekHistory = history.filter(h => new Date(h.checked_at) >= oneWeekAgo);
      
      if (weekHistory.length === 0) continue;

      const currentPrice = weekHistory[0].price;
      const weekStartPrice = weekHistory[weekHistory.length - 1].price;
      const priceChange = currentPrice - weekStartPrice;
      const priceChanges = this.countPriceChanges(weekHistory);

      const carReport = {
        name: car.name,
        url: car.url,
        currentPrice,
        weekStartPrice,
        priceChange,
        priceChanges,
        trend: priceChange < 0 ? 'down' : priceChange > 0 ? 'up' : 'stable',
        checksThisWeek: weekHistory.length
      };

      report.cars.push(carReport);

      if (priceChange !== 0) {
        report.summary.priceChanges++;
        if (priceChange < 0) {
          report.summary.totalSavings += Math.abs(priceChange);
        }
      }
    }

    db.close();

    // Calculate average
    if (report.summary.priceChanges > 0) {
      report.summary.avgPriceChange = report.summary.totalSavings / report.summary.priceChanges;
    }

    // Send email report
    await this.sendWeeklyEmail(report);

    console.log('✅ Weekly report sent');
    return report;
  }

  countPriceChanges(history) {
    let changes = 0;
    for (let i = 1; i < history.length; i++) {
      if (history[i-1].price !== history[i].price) {
        changes++;
      }
    }
    return changes;
  }

  async sendWeeklyEmail(report) {
    const emailNotifier = new EmailNotifier(this.config);
    
    const subject = `🚗 Weekly Car Price Report - ${report.summary.priceChanges} change(s) detected`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 800px;">
        <h2>📊 Weekly Car Price Report</h2>
        <p><em>${new Date().toLocaleDateString('en-GB', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })}</em></p>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3>📈 Weekly Summary</h3>
          <ul>
            <li><strong>Cars tracked:</strong> ${report.summary.totalCars}</li>
            <li><strong>Price changes:</strong> ${report.summary.priceChanges}</li>
            <li><strong>Total potential savings:</strong> £${report.summary.totalSavings.toLocaleString()}</li>
            ${report.summary.avgPriceChange > 0 ? 
              `<li><strong>Average price drop:</strong> £${Math.round(report.summary.avgPriceChange).toLocaleString()}</li>` : 
              ''
            }
          </ul>
        </div>

        <h3>🚗 Individual Car Reports</h3>
        ${report.cars.map(car => `
          <div style="border: 1px solid #dee2e6; padding: 15px; margin: 10px 0; border-radius: 5px;">
            <h4 style="margin-top: 0;">${car.name}</h4>
            <div style="display: flex; justify-content: space-between; margin: 10px 0;">
              <div>
                <strong>Current Price:</strong> £${car.currentPrice.toLocaleString()}
              </div>
              <div>
                <strong>Week Start:</strong> £${car.weekStartPrice.toLocaleString()}
              </div>
              <div>
                <strong>Change:</strong> 
                <span style="color: ${car.priceChange < 0 ? '#28a745' : car.priceChange > 0 ? '#dc3545' : '#6c757d'};">
                  ${car.priceChange === 0 ? 'No change' : 
                    `${car.priceChange < 0 ? '-' : '+'}£${Math.abs(car.priceChange).toLocaleString()}`
                  }
                </span>
              </div>
            </div>
            <div style="font-size: 12px; color: #6c757d;">
              ${car.priceChanges} price change(s) • ${car.checksThisWeek} checks this week
              <br>
              <a href="${car.url}" style="color: #007bff;">View listing</a>
            </div>
          </div>
        `).join('')}
        
        <div style="margin-top: 30px; padding: 20px; background-color: #e9ecef; border-radius: 5px;">
          <h4>💡 Tips</h4>
          <ul>
            <li>Price drops are highlighted in green - these might be good opportunities</li>
            <li>No changes this week? That's normal - prices don't fluctuate constantly</li>
            <li>Check the listings directly for the most up-to-date information</li>
          </ul>
        </div>
        
        <p style="color: #6c757d; font-size: 12px; margin-top: 30px;">
          Generated: ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}<br>
          MGC Car Tracker - Weekly Report
        </p>
      </div>
    `;

    const recipients = this.config.weeklyReport.recipients || this.config.email.recipients;
    
    const mailOptions = {
      from: this.config.email.sender,
      to: recipients.join(', '),
      subject: subject,
      html: html
    };

    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransporter({
      service: 'gmail',
      auth: {
        user: this.config.email.sender,
        pass: this.config.email.password
      }
    });

    try {
      const info = await transporter.sendMail(mailOptions);
      console.log(`✅ Weekly report email sent: ${info.messageId}`);
      return true;
    } catch (error) {
      console.error('❌ Error sending weekly report:', error.message);
      return false;
    }
  }
}

module.exports = WeeklyReporter;
