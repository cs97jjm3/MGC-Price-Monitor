const nodemailer = require('nodemailer');

class EmailNotifier {
  constructor(config) {
    this.config = config;
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.email.sender,
        pass: config.email.password
      }
    });
  }

  async sendPriceChangeAlert(carDetails, oldPrice, newPrice, recipients = null) {
    const priceChange = newPrice - oldPrice;
    const changeType = priceChange < 0 ? 'DROPPED' : 'INCREASED';
    const changeSymbol = priceChange < 0 ? '📉' : '📈';
    
    const subject = `${changeSymbol} Price ${changeType}: ${carDetails.name}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2 style="color: ${priceChange < 0 ? '#28a745' : '#dc3545'};">
          Price ${changeType}!
        </h2>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin-top: 0;">${carDetails.name}</h3>
          
          <p style="font-size: 24px; margin: 10px 0;">
            <strong>Old Price:</strong> <span style="text-decoration: line-through;">£${oldPrice.toLocaleString()}</span>
          </p>
          
          <p style="font-size: 28px; margin: 10px 0; color: ${priceChange < 0 ? '#28a745' : '#dc3545'};">
            <strong>New Price:</strong> £${newPrice.toLocaleString()}
          </p>
          
          <p style="font-size: 20px; margin: 10px 0; color: ${priceChange < 0 ? '#28a745' : '#dc3545'};">
            <strong>Change:</strong> ${priceChange < 0 ? '-' : '+'}£${Math.abs(priceChange).toLocaleString()}
          </p>
          
          ${carDetails.mileage ? `<p><strong>Mileage:</strong> ${carDetails.mileage.toLocaleString()} miles</p>` : ''}
        </div>
        
        <p>
          <a href="${carDetails.url}" 
             style="display: inline-block; background-color: #007bff; color: white; 
                    padding: 12px 24px; text-decoration: none; border-radius: 5px; 
                    font-weight: bold;">
            View Car Listing
          </a>
        </p>
        
        <p style="color: #6c757d; font-size: 12px; margin-top: 30px;">
          URL: ${carDetails.url}<br>
          Checked: ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}
        </p>
      </div>
    `;

    // Use car-specific recipients or fall back to global recipients
    const emailRecipients = recipients || this.config.email.recipients;
    
    const mailOptions = {
      from: this.config.email.sender,
      to: emailRecipients.join(', '),
      subject: subject,
      html: html
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Email sent: ${info.messageId}`);
      return true;
    } catch (error) {
      console.error('❌ Error sending email:', error.message);
      return false;
    }
  }

  async sendWeeklySummary(cars, priceHistory) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    
    let summaryHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 800px;">
        <h2 style="color: #007bff;">Weekly Car Price Summary</h2>
        <p><strong>Week ending:</strong> ${new Date().toLocaleDateString('en-GB')}</p>
        <hr>
    `;
    
    let totalChanges = 0;
    let biggestDrop = { amount: 0, car: null };
    let biggestIncrease = { amount: 0, car: null };
    
    for (const car of cars) {
      const history = priceHistory[car.url] || [];
      if (history.length < 2) continue;
      
      const currentPrice = history[0].price;
      const weekAgoPrice = history.find(h => new Date(h.checked_at) <= startDate)?.price || currentPrice;
      const change = currentPrice - weekAgoPrice;
      
      if (change !== 0) {
        totalChanges++;
        if (change < 0 && Math.abs(change) > biggestDrop.amount) {
          biggestDrop = { amount: Math.abs(change), car: car.name, price: currentPrice };
        }
        if (change > 0 && change > biggestIncrease.amount) {
          biggestIncrease = { amount: change, car: car.name, price: currentPrice };
        }
      }
      
      const changeSymbol = change < 0 ? '📉' : change > 0 ? '📈' : '➡️';
      const changeText = change === 0 ? 'No change' : `${change < 0 ? '-' : '+'}£${Math.abs(change).toLocaleString()}`;
      
      summaryHtml += `
        <div style="background-color: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 5px;">
          <h3 style="margin: 0 0 10px 0;">${car.name}</h3>
          <p style="margin: 5px 0;"><strong>Current price:</strong> £${currentPrice.toLocaleString()}</p>
          <p style="margin: 5px 0; color: ${change < 0 ? '#28a745' : change > 0 ? '#dc3545' : '#6c757d'}">
            <strong>Week change:</strong> ${changeSymbol} ${changeText}
          </p>
          <p style="font-size: 12px; color: #6c757d; margin: 5px 0;">
            <a href="${car.url}">View listing</a>
          </p>
        </div>
      `;
    }
    
    // Summary stats
    summaryHtml += `
      <hr>
      <div style="background-color: #e9ecef; padding: 15px; border-radius: 5px;">
        <h3>This Week's Summary</h3>
        <p>• <strong>${totalChanges}</strong> car(s) changed price</p>
    `;
    
    if (biggestDrop.car) {
      summaryHtml += `<p>• 📉 <strong>Biggest drop:</strong> ${biggestDrop.car} (-£${biggestDrop.amount.toLocaleString()})</p>`;
    }
    
    if (biggestIncrease.car) {
      summaryHtml += `<p>• 📈 <strong>Biggest increase:</strong> ${biggestIncrease.car} (+£${biggestIncrease.amount.toLocaleString()})</p>`;
    }
    
    if (totalChanges === 0) {
      summaryHtml += `<p>• 🔄 All tracked cars maintained their prices</p>`;
    }
    
    summaryHtml += `
        </div>
        <p style="color: #6c757d; font-size: 12px; margin-top: 30px;">
          Generated: ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}
        </p>
      </div>
    `;
    
    const mailOptions = {
      from: this.config.email.sender,
      to: this.config.weeklyEmail?.recipients?.join(', ') || this.config.email.recipients?.join(', '),
      subject: `📈 Weekly Car Price Summary - ${totalChanges} change(s)`,
      html: summaryHtml
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Weekly summary sent: ${info.messageId}`);
      return true;
    } catch (error) {
      console.error('❌ Error sending weekly summary:', error.message);
      return false;
    }
  }

  async sendTestEmail(recipients = null) {
    // Use provided recipients or fall back to global recipients
    const emailRecipients = recipients || this.config.email.recipients;
    
    const mailOptions = {
      from: this.config.email.sender,
      to: emailRecipients.join(', '),
      subject: '🚗 MGC Car Tracker - Test Email',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <h2>MGC Car Tracker is Running!</h2>
          <p>This is a test email to confirm your car price monitoring is set up correctly.</p>
          <p><strong>Monitoring schedule:</strong></p>
          <ul>
            ${this.config.schedule.times.map(time => `<li>${time}</li>`).join('')}
          </ul>
          <p>You'll receive alerts when any tracked car's price changes.</p>
          <p style="color: #6c757d; font-size: 12px; margin-top: 30px;">
            Sent: ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}
          </p>
        </div>
      `
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Test email sent: ${info.messageId}`);
      return true;
    } catch (error) {
      console.error('❌ Error sending test email:', error.message);
      return false;
    }
  }
}

module.exports = EmailNotifier;
