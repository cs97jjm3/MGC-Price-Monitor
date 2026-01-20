const fs = require('fs');
const path = require('path');
const PriceDatabase = require('./database');
const EmailNotifier = require('./email');

async function sendWeeklySummary() {
  console.log('\n' + '='.repeat(60));
  console.log(`📊 Generating weekly summary - ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}`);
  console.log('='.repeat(60) + '\n');

  // Load config
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
  
  if (!config.weeklyEmail?.enabled) {
    console.log('📧 Weekly email is disabled in config');
    return;
  }
  
  const db = new PriceDatabase();
  await db.initialize();
  
  const emailNotifier = new EmailNotifier(config);

  // Get price history for each car
  const priceHistory = {};
  for (const car of config.cars) {
    const carId = db.getCarId(car.url);
    if (carId) {
      priceHistory[car.url] = db.getPriceHistory(carId, 50); // Get more history for weekly analysis
    }
  }

  console.log(`📈 Analyzing ${config.cars.length} car(s) for weekly changes...`);
  
  const success = await emailNotifier.sendWeeklySummary(config.cars, priceHistory);
  
  if (success) {
    console.log('✅ Weekly summary sent successfully!');
  } else {
    console.log('❌ Failed to send weekly summary');
  }

  db.close();
  
  console.log('\n' + '='.repeat(60) + '\n');
}

// Run if called directly
if (require.main === module) {
  sendWeeklySummary().catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}

module.exports = sendWeeklySummary;
