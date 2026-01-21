// MGC Price Monitor v2.0 - Main Entry Point
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const checkPrices = require('./check-prices');
const sendWeeklySummary = require('./weekly-summary');
const sendDailyFailureSummary = require('./daily-failure-summary');
const DashboardServer = require('./dashboard');

console.log('🏷️ MGC Price Monitor Starting...\n');

// Load config
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

console.log('📋 Configuration:');
console.log(`   Sender: ${config.email.sender}`);
console.log(`   Monitoring ${config.items.length} item(s):`);
config.items.forEach(item => {
  console.log(`   - ${item.name} [${item.category}] (alerts: ${item.recipients ? item.recipients.join(', ') : 'global'})`);
  if (item.thresholds) {
    console.log(`     Thresholds: £${item.thresholds.minAmount}+ or ${item.thresholds.minPercent}%+`);
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

// Schedule daily failure summary if enabled
if (config.failureAlerts?.dailySummary) {
  const dailyTime = config.failureAlerts.dailySummaryTime || '18:00';
  const [hour, minute] = dailyTime.split(':');
  const dailyCron = `${minute} ${hour} * * *`;
  
  cron.schedule(dailyCron, () => {
    sendDailyFailureSummary();
  }, {
    timezone: config.schedule.timezone
  });
  
  console.log(`✅ Scheduled daily failure summary for ${dailyTime}`);
}

console.log('\n' + '='.repeat(60));
console.log('🚀 MGC Price Monitor is now running!');
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
  console.log('\n\n👋 Shutting down MGC Price Monitor...');
  process.exit(0);
});
