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

  async sendPriceChangeAlert(carDetails, oldPrice, newPrice) {
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

    const mailOptions = {
      from: this.config.email.sender,
      to: this.config.email.recipients.join(', '),
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

  async sendTestEmail() {
    const mailOptions = {
      from: this.config.email.sender,
      to: this.config.email.recipients.join(', '),
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
