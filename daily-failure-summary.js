const fs = require('fs');
const path = require('path');
const PriceDatabase = require('./database');
const EmailNotifier = require('./email');

async function sendDailyFailureSummary() {
  console.log('\n' + '='.repeat(60));
  console.log(`📊 Generating daily failure summary - ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}`);
  console.log('='.repeat(60) + '\n');

  // Load config
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
  
  if (!config.failureAlerts?.dailySummary) {
    console.log('📧 Daily failure summary is disabled in config');
    return;
  }
  
  const db = new PriceDatabase();
  await db.initialize();
  
  const emailNotifier = new EmailNotifier(config);

  // Get failures from last 24 hours
  const failures = db.getRecentFailures(24);
  
  if (failures.length === 0) {
    console.log('✅ No failures in the last 24 hours - no email sent');
    db.close();
    return;
  }

  console.log(`⚠️  Found ${failures.length} failure(s) in the last 24 hours`);

  // Group failures by car
  const failuresByCar = {};
  failures.forEach(failure => {
    if (!failuresByCar[failure.carId]) {
      failuresByCar[failure.carId] = {
        name: failure.name,
        url: failure.url,
        failures: []
      };
    }
    failuresByCar[failure.carId].failures.push({
      errorType: failure.errorType,
      errorMessage: failure.errorMessage,
      failedAt: failure.failedAt
    });
  });

  // Generate HTML email
  let html = `
    <div style="font-family: Arial, sans-serif; max-width: 800px;">
      <h2 style="color: #dc3545;">📊 Daily Failure Summary</h2>
      <p><strong>Date:</strong> ${new Date().toLocaleDateString('en-GB')}</p>
      <p><strong>Total failures:</strong> ${failures.length} issue(s) across ${Object.keys(failuresByCar).length} car(s)</p>
      <hr>
  `;

  const errorTypeDescriptions = {
    '404_NOT_FOUND': 'Page not found - likely sold or removed',
    '403_FORBIDDEN': 'Access denied - site blocking',
    'PARSE_ERROR': 'Page structure changed',
    'TIMEOUT': 'Connection timeout',
    'CONNECTION_REFUSED': 'Unable to connect',
    '500_SERVER_ERROR': 'Server error',
    'UNKNOWN_ERROR': 'Unknown error'
  };

  for (const carId in failuresByCar) {
    const car = failuresByCar[carId];
    const firstFailure = car.failures[0];
    const failureCount = car.failures.length;
    
    html += `
      <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 15px 0; border-radius: 5px;">
        <h3 style="margin-top: 0;">${car.name}</h3>
        <p><strong>Error:</strong> ${errorTypeDescriptions[firstFailure.errorType] || firstFailure.errorType}</p>
        <p><strong>Occurrences:</strong> ${failureCount} time(s) in last 24 hours</p>
        <p><strong>First failure:</strong> ${new Date(firstFailure.failedAt).toLocaleString('en-GB', { timeZone: 'Europe/London' })}</p>
        <p style="font-size: 12px; color: #6c757d; margin: 5px 0;">
          <a href="${car.url}">View listing</a>
        </p>
      </div>
    `;
  }

  html += `
      <hr>
      <div style="background-color: #e9ecef; padding: 15px; border-radius: 5px;">
        <h3>What to do:</h3>
        <ul>
          <li>Check each listing to see if it's still available</li>
          <li>Remove sold items from your tracked cars</li>
          <li>Site errors usually resolve themselves - will keep trying</li>
        </ul>
      </div>
      <p style="color: #6c757d; font-size: 12px; margin-top: 30px;">
        Generated: ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}
      </p>
    </div>
  `;

  const mailOptions = {
    from: config.email.sender,
    to: config.email.recipients?.join(', ') || config.email.sender,
    subject: `📊 MGC Daily: ${Object.keys(failuresByCar).length} item(s) had issues today`,
    html: html
  };

  try {
    const info = await emailNotifier.transporter.sendMail(mailOptions);
    console.log(`✅ Daily failure summary sent: ${info.messageId}`);
  } catch (error) {
    console.error('❌ Error sending daily failure summary:', error.message);
  }

  db.close();
  
  console.log('\n' + '='.repeat(60) + '\n');
}

// Run if called directly
if (require.main === module) {
  sendDailyFailureSummary().catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}

module.exports = sendDailyFailureSummary;
