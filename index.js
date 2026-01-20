const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const checkPrices = require('./check-prices');

console.log('🚗 MGC Car Tracker Starting...\n');

// Load config
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

console.log('📋 Configuration:');
console.log(`   Sender: ${config.email.sender}`);
console.log(`   Recipients: ${config.email.recipients.join(', ')}`);
console.log(`   Monitoring ${config.cars.length} car(s):`);
config.cars.forEach(car => {
  console.log(`   - ${car.name}`);
});
console.log('\n⏰ Schedule:');
config.schedule.times.forEach(time => {
  console.log(`   - ${time}`);
});
console.log('   Timezone: Europe/London (UK)');
console.log('\n' + '='.repeat(60) + '\n');

// Schedule checks at configured times
config.schedule.times.forEach(time => {
  const [hour, minute] = time.split(':');
  const cronExpression = `${minute} ${hour} * * *`;
  
  cron.schedule(cronExpression, () => {
    checkPrices();
  }, {
    timezone: config.schedule.timezone
  });
  
  console.log(`✅ Scheduled check for ${time}`);
});

console.log('\n' + '='.repeat(60));
console.log('🚀 MGC Car Tracker is now running!');
console.log('   Press Ctrl+C to stop');
console.log('='.repeat(60) + '\n');

// Run initial check
console.log('Running initial price check...\n');
checkPrices();

// Keep the process running
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down MGC Car Tracker...');
  process.exit(0);
});
