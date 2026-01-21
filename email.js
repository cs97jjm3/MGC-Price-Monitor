// MGC Price Monitor v2.0 - Email Notification System
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

  async sendPriceChangeAlert(itemDetails, oldPrice, newPrice, recipients = null) {
    const priceChange = newPrice - oldPrice;
    const changeType = priceChange < 0 ? 'DROPPED' : 'INCREASED';
    const changeSymbol = priceChange < 0 ? '📉' : '📈';
    
    const subject = `${changeSymbol} Price ${changeType}: ${itemDetails.name}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2 style="color: ${priceChange < 0 ? '#28a745' : '#dc3545'};">
          Price ${changeType}!
        </h2>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin-top: 0;">${itemDetails.name}</h3>
          
          <p style="font-size: 24px; margin: 10px 0;">
            <strong>Old Price:</strong> <span style="text-decoration: line-through;">£${oldPrice.toLocaleString()}</span>
          </p>
          
          <p style="font-size: 28px; margin: 10px 0; color: ${priceChange < 0 ? '#28a745' : '#dc3545'};">
            <strong>New Price:</strong> £${newPrice.toLocaleString()}
          </p>
          
          <p style="font-size: 20px; margin: 10px 0; color: ${priceChange < 0 ? '#28a745' : '#dc3545'};">
            <strong>Change:</strong> ${priceChange < 0 ? '-' : '+'}£${Math.abs(priceChange).toLocaleString()}
          </p>
          
          ${itemDetails.mileage ? `<p><strong>Mileage:</strong> ${itemDetails.mileage.toLocaleString()} miles</p>` : ''}
        </div>
        
        <p>
          <a href="${itemDetails.url}" 
             style="display: inline-block; background-color: #007bff; color: white; 
                    padding: 12px 24px; text-decoration: none; border-radius: 5px; 
                    font-weight: bold;">
            View Item Listing
          </a>
        </p>
        
        <p style="color: #6c757d; font-size: 12px; margin-top: 30px;">
          URL: ${itemDetails.url}<br>
          Checked: ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}
        </p>
      </div>
    `;

    // Use item-specific recipients or fall back to global recipients
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

  async sendWeeklySummary(items, priceHistory, persistentFailures = []) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    
    let summaryHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 800px;">
        <h2 style="color: #007bff;">Weekly Price Summary</h2>
        <p><strong>Week ending:</strong> ${new Date().toLocaleDateString('en-GB')}</p>
        <hr>
    `;
    
    let totalChanges = 0;
    let biggestDrop = { amount: 0, item: null };
    let biggestIncrease = { amount: 0, item: null };
    
    for (const item of items) {
      const history = priceHistory[item.url] || [];
      if (history.length < 2) continue;
      
      const currentPrice = history[0].price;
      const weekAgoPrice = history.find(h => new Date(h.checked_at) <= startDate)?.price || currentPrice;
      const change = currentPrice - weekAgoPrice;
      
      if (change !== 0) {
        totalChanges++;
        if (change < 0 && Math.abs(change) > biggestDrop.amount) {
          biggestDrop = { amount: Math.abs(change), item: item.name, price: currentPrice };
        }
        if (change > 0 && change > biggestIncrease.amount) {
          biggestIncrease = { amount: change, item: item.name, price: currentPrice };
        }
      }
      
      const changeSymbol = change < 0 ? '📉' : change > 0 ? '📈' : '➡️';
      const changeText = change === 0 ? 'No change' : `${change < 0 ? '-' : '+'}£${Math.abs(change).toLocaleString()}`;
      
      summaryHtml += `
        <div style="background-color: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 5px;">
          <h3 style="margin: 0 0 10px 0;">${item.name}</h3>
          <p style="margin: 5px 0;"><strong>Current price:</strong> £${currentPrice.toLocaleString()}</p>
          <p style="margin: 5px 0; color: ${change < 0 ? '#28a745' : change > 0 ? '#dc3545' : '#6c757d'}">
            <strong>Week change:</strong> ${changeSymbol} ${changeText}
          </p>
          <p style="font-size: 12px; color: #6c757d; margin: 5px 0;">
            <a href="${item.url}">View listing</a>
          </p>
        </div>
      `;
    }
    
    // Summary stats
    summaryHtml += `
      <hr>
      <div style="background-color: #e9ecef; padding: 15px; border-radius: 5px;">
        <h3>This Week's Summary</h3>
        <p>• <strong>${totalChanges}</strong> item(s) changed price</p>
    `;
    
    if (biggestDrop.item) {
      summaryHtml += `<p>• 📉 <strong>Biggest drop:</strong> ${biggestDrop.item} (-£${biggestDrop.amount.toLocaleString()})</p>`;
    }
    
    if (biggestIncrease.item) {
      summaryHtml += `<p>• 📈 <strong>Biggest increase:</strong> ${biggestIncrease.item} (+£${biggestIncrease.amount.toLocaleString()})</p>`;
    }
    
    if (totalChanges === 0) {
      summaryHtml += `<p>• 🔄 All tracked items maintained their prices</p>`;
    }
    
    summaryHtml += `
        </div>
    `;
    
    // Add persistent failures section
    if (persistentFailures.length > 0) {
      summaryHtml += `
        <hr>
        <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin-top: 20px;">
          <h3 style="color: #856404;">⚠️ Items Needing Attention</h3>
          <p><strong>${persistentFailures.length}</strong> item(s) haven't updated successfully in 7+ days:</p>
      `;
      
      persistentFailures.forEach(failure => {
        const daysSince = Math.floor((new Date() - new Date(failure.firstFailure)) / (1000 * 60 * 60 * 24));
        summaryHtml += `
          <div style="background-color: white; padding: 10px; margin: 10px 0; border-left: 3px solid #ffc107;">
            <p style="margin: 5px 0;"><strong>${failure.name}</strong></p>
            <p style="margin: 5px 0; font-size: 14px;">Failed for ${daysSince} days (${failure.failureCount} attempts)</p>
            <p style="margin: 5px 0; font-size: 12px;"><a href="${failure.url}">Check if still available</a></p>
          </div>
        `;
      });
      
      summaryHtml += `
          <p style="margin-top: 15px;">💡 <strong>Suggestion:</strong> These items may be sold or removed. Check them and remove from tracking if needed.</p>
        </div>
      `;
    }
    
    summaryHtml += `
        <p style="color: #6c757d; font-size: 12px; margin-top: 30px;">
          Generated: ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}
        </p>
      </div>
    `;
    
    const mailOptions = {
      from: this.config.email.sender,
      to: this.config.weeklyEmail?.recipients?.join(', ') || this.config.email.recipients?.join(', '),
      subject: `📈 MGC Weekly Summary - ${totalChanges} change(s)`,
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

  async sendImmediateFailureAlert(item, errorType, errorMessage) {
    const errorExplanations = {
      '404_NOT_FOUND': 'The page no longer exists. The item may have been sold or the listing removed.',
      '403_FORBIDDEN': 'Access to the page was denied. The site may be blocking automated access.',
      'PARSE_ERROR': 'The page structure has changed and the price cannot be extracted.',
      'TIMEOUT': 'The website took too long to respond (3 attempts).',
      'CONNECTION_REFUSED': 'Unable to connect to the website (3 attempts).',
      '500_SERVER_ERROR': 'The website is experiencing server errors (3 attempts).',
      'UNKNOWN_ERROR': 'An unknown error occurred (3 attempts).'
    };

    const explanation = errorExplanations[errorType] || errorMessage;
    
    const subject = `⚠️ MGC Alert: ${item.name} may no longer be available`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2 style="color: #dc3545;">⚠️ Item Unavailable</h2>
        
        <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
          <h3 style="margin-top: 0;">${item.name}</h3>
          <p><strong>Status:</strong> Failed to check price after 3 consecutive attempts</p>
          <p><strong>Error:</strong> ${errorType}</p>
        </div>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3>What this means:</h3>
          <p>${explanation}</p>
          
          <h3>What to do:</h3>
          <ul>
            <li>Visit the listing to check if it's still available</li>
            <li>If sold, you can remove it from your tracked items</li>
            <li>If the site is down, it will retry automatically</li>
          </ul>
        </div>
        
        <p>
          <a href="${item.url}" 
             style="display: inline-block; background-color: #007bff; color: white; 
                    padding: 12px 24px; text-decoration: none; border-radius: 5px; 
                    font-weight: bold;">
            Check Listing
          </a>
        </p>
        
        <p style="color: #6c757d; font-size: 12px; margin-top: 30px;">
          URL: ${item.url}<br>
          Time: ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}
        </p>
      </div>
    `;

    const emailRecipients = item.recipients || this.config.email.recipients;
    
    const mailOptions = {
      from: this.config.email.sender,
      to: emailRecipients.join(', '),
      subject: subject,
      html: html
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Immediate failure alert sent: ${info.messageId}`);
      return true;
    } catch (error) {
      console.error('❌ Error sending immediate failure alert:', error.message);
      return false;
    }
  }

  async sendTestEmail(recipients = null) {
    // Use provided recipients or fall back to global recipients
    const emailRecipients = recipients || this.config.email.recipients;
    
    const mailOptions = {
      from: this.config.email.sender,
      to: emailRecipients.join(', '),
      subject: '🏷️ MGC Price Monitor - Test Email',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <h2>MGC Price Monitor is Running!</h2>
          <p>This is a test email to confirm your price monitoring is set up correctly.</p>
          <p><strong>Monitoring schedule:</strong></p>
          <ul>
            ${this.config.schedule.times.map(time => `<li>${time}</li>`).join('')}
          </ul>
          <p>You'll receive alerts when any tracked item's price changes.</p>
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
