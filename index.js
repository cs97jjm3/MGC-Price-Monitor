const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const checkPrices = require('./check-prices');
const sendWeeklySummary = require('./weekly-summary');
const DashboardServer = require('./dashboard');

console.log('🚗 MGC Car Tracker Starting...\n');

// Load config
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

console.log('📋 Configuration:');
console.log(`   Sender: ${config.email.sender}`);
console.log(`   Monitoring ${config.cars.length} car(s):`);
config.cars.forEach(car => {
  console.log(`   - ${car.name} (alerts: ${car.recipients ? car.recipients.join(', ') : 'global'})`);
  if (car.thresholds) {
    console.log(`     Thresholds: £${car.thresholds.minAmount}+ or ${car.thresholds.minPercent}%+`);
  }
});
console.log('\n⏰ Schedule:');
config.schedule.times.forEach(time => {
  console.log(`   - ${time}`);
});
console.log('   Timezone: Europe/London (UK)');

if (config.weeklyEmail?.enabled) {
  console.log(`\n📧 Weekly Summary: ${config.weeklyEmail.dayOfWeek}s at ${config.weeklyEmail.time}`);
  console.log(`   Recipients: ${config.weeklyEmail.recipients?.join(', ') || 'global'}`);
}

console.log('\n' + '='.repeat(60) + '\n');

// Schedule price checks at configured times
config.schedule.times.forEach(time => {
  const [hour, minute] = time.split(':');
  const cronExpression = `${minute} ${hour} * * *`;
  
  cron.schedule(cronExpression, () => {
    checkPrices();
  }, {
    timezone: config.schedule.timezone
  });
  
  console.log(`✅ Scheduled price check for ${time}`);
});

// Schedule weekly summary if enabled
if (config.weeklyEmail?.enabled) {
  const dayNumber = {
    'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
    'thursday': 4, 'friday': 5, 'saturday': 6
  }[config.weeklyEmail.dayOfWeek.toLowerCase()];
  
  const [hour, minute] = config.weeklyEmail.time.split(':');
  const weeklyCron = `${minute} ${hour} * * ${dayNumber}`;
  
  cron.schedule(weeklyCron, () => {
    sendWeeklySummary();
  }, {
    timezone: config.schedule.timezone
  });
  
  console.log(`✅ Scheduled weekly summary for ${config.weeklyEmail.dayOfWeek}s at ${config.weeklyEmail.time}`);
}

console.log('\n' + '='.repeat(60));
console.log('🚀 MGC Car Tracker is now running!');
console.log('   Press Ctrl+C to stop');
console.log('='.repeat(60) + '\n');

// Start dashboard server
const dashboard = new DashboardServer(config);
dashboard.start();

// Run initial check
console.log('\nRunning initial price check...\n');
checkPrices();

// Keep the process running
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down MGC Car Tracker...');
  process.exit(0);
});
