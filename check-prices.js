// MGC Price Monitor v2.0 - Price Checker
const fs = require('fs');
const path = require('path');
const PriceDatabase = require('./database');
const ItemScraper = require('./scraper');
const EmailNotifier = require('./email');

async function checkPrices() {
  console.log('\n' + '='.repeat(60));
  console.log(`🔍 Checking item prices - ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}`);
  console.log('='.repeat(60) + '\n');

  // Load config
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
  
  const db = new PriceDatabase();
  await db.initialize();
  
  const scraper = new ItemScraper();
  const emailNotifier = new EmailNotifier(config);

  // Ensure all items from config are in database
  for (const item of config.items) {
    db.addItem(item.url, item.name, item.category || 'General');
  }

  let priceChanges = 0;

  // Check each item
  for (const item of config.items) {
    // Skip disabled items
    if (item.disabled) {
      console.log(`\n📊 Skipping: ${item.name} (PAUSED)`);
      continue;
    }
    
    console.log(`\n📊 Checking: ${item.name} [${item.category || 'General'}]`);
    console.log(`   URL: ${item.url}`);

    const itemId = db.getItemId(item.url);
    if (!itemId) {
      console.log('   ⚠️  Item not found in database');
      continue;
    }

    // Scrape current details
    const currentDetails = await scraper.scrapeItemDetails(item.url);

    if (!currentDetails.success) {
      console.log(`   ❌ Failed to scrape: ${currentDetails.error || 'Unknown error'}`);
      console.log(`   💾 Logging failure (${currentDetails.errorType})`);
      
      // Log the failure
      db.logFailure(itemId, currentDetails.errorType, currentDetails.error, currentDetails.htmlSnapshot);
      
      // Check consecutive failures
      const consecutiveFailures = db.getConsecutiveFailures(itemId);
      console.log(`   📊 Consecutive failures: ${consecutiveFailures}`);
      
      // If 3 consecutive failures, send immediate alert
      if (consecutiveFailures === 3) {
        console.log('   ⚠️  3 consecutive failures - sending immediate alert...');
        await emailNotifier.sendImmediateFailureAlert(
          { ...item, id: itemId },
          currentDetails.errorType,
          currentDetails.error
        );
      }
      
      continue;
    }

    if (currentDetails.price === null) {
      console.log('   ⚠️  Could not extract price from page');
      continue;
    }
    
    // Success - clear any old failures
    db.clearOldFailures(itemId);

    console.log(`   💰 Current price: £${currentDetails.price.toLocaleString()}`);
    if (currentDetails.mileage) {
      console.log(`   🛣️  Mileage: ${currentDetails.mileage.toLocaleString()} miles`);
    }

    // Get previous price
    const lastCheck = db.getLatestPrice(itemId);

    if (lastCheck) {
      console.log(`   📝 Previous price: £${lastCheck.price.toLocaleString()}`);
      
      // Check if price changed
      if (currentDetails.price !== lastCheck.price) {
        const change = currentDetails.price - lastCheck.price;
        const changeSymbol = change < 0 ? '📉' : '📈';
        console.log(`   ${changeSymbol} PRICE CHANGE: ${change < 0 ? '-' : '+'}£${Math.abs(change).toLocaleString()}`);
        
        // Check if change meets threshold criteria
        let shouldAlert = true;
        if (item.thresholds && change < 0) { // Only apply thresholds to price drops
          const amountChange = Math.abs(change);
          const percentChange = (Math.abs(change) / lastCheck.price) * 100;
          
          const meetsAmountThreshold = amountChange >= (item.thresholds.minAmount || 0);
          const meetsPercentThreshold = percentChange >= (item.thresholds.minPercent || 0);
          
          shouldAlert = meetsAmountThreshold || meetsPercentThreshold;
          
          if (!shouldAlert) {
            console.log(`   ⏸️  Below threshold - not alerting (need £${item.thresholds.minAmount}+ or ${item.thresholds.minPercent}%+)`);
          }
        }
        
        if (shouldAlert) {
          // Send email alert
          console.log('   📧 Sending email alert...');
          const emailSent = await emailNotifier.sendPriceChangeAlert(
            { ...currentDetails, name: item.name, category: item.category },
            lastCheck.price,
            currentDetails.price,
            item.recipients // Pass item-specific recipients
          );
          
          if (emailSent) {
            priceChanges++;
          }
        }
      } else {
        console.log('   ✅ No price change');
      }
    } else {
      console.log('   📝 First check - baseline recorded');
    }

    // Record current check
    db.addPriceCheck(itemId, currentDetails.price, currentDetails.mileage, currentDetails.description);
    
    // Clear failures on successful check
    db.clearOldFailures(itemId);
  }

  db.close();

  console.log('\n' + '='.repeat(60));
  console.log(`✅ Check complete - ${priceChanges} price change(s) detected`);
  console.log('='.repeat(60) + '\n');
}

// Run if called directly
if (require.main === module) {
  checkPrices().catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}

module.exports = checkPrices;
