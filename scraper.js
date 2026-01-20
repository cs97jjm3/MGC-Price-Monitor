const axios = require('axios');
const cheerio = require('cheerio');

class CarScraper {
  constructor() {
    this.maxRetries = 3;
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  classifyError(error) {
    // Classify errors as temporary (retry) or permanent (don't retry)
    if (error.response) {
      const status = error.response.status;
      
      // Permanent errors - don't retry
      if (status === 404) return { type: '404_NOT_FOUND', retry: false };
      if (status === 403) return { type: '403_FORBIDDEN', retry: false };
      if (status === 410) return { type: '410_GONE', retry: false };
      
      // Temporary errors - retry
      if (status === 429) return { type: '429_RATE_LIMIT', retry: true };
      if (status >= 500) return { type: `${status}_SERVER_ERROR`, retry: true };
    }
    
    // Network errors - retry
    if (error.code === 'ETIMEDOUT') return { type: 'TIMEOUT', retry: true };
    if (error.code === 'ECONNREFUSED') return { type: 'CONNECTION_REFUSED', retry: true };
    if (error.code === 'ECONNRESET') return { type: 'CONNECTION_RESET', retry: true };
    
    // Unknown - treat as temporary
    return { type: 'UNKNOWN_ERROR', retry: true };
  }

  async scrapeCarDetails(url) {
    let lastError = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          },
          timeout: 15000,
          validateStatus: (status) => status < 500 // Don't throw on 4xx errors
        });

        // Check for permanent error status codes
        if (response.status === 404 || response.status === 403 || response.status === 410) {
          return {
            price: null,
            mileage: null,
            description: null,
            success: false,
            error: `HTTP ${response.status}`,
            errorType: response.status === 404 ? '404_NOT_FOUND' : `${response.status}_ERROR`,
            htmlSnapshot: null,
            url,
            retry: false
          };
        }

        const $ = cheerio.load(response.data);
        
        // Extract price - try multiple selectors
        let price = null;
        const priceText = $('.price').text() || 
                         $('.vehicle-price').text() || 
                         $('[class*="price"]').first().text() ||
                         $('h2:contains("£")').text() ||
                         $('span:contains("£")').first().text();
        
        const priceMatch = priceText.match(/£([\d,]+)/);
        if (priceMatch) {
          price = parseFloat(priceMatch[1].replace(/,/g, ''));
        }

        // Extract mileage
        let mileage = null;
        const mileageText = $('.mileage').text() || 
                           $('[class*="mileage"]').text() ||
                           $('li:contains("miles")').text();
        
        const mileageMatch = mileageText.match(/([\d,]+)\s*miles/i);
        if (mileageMatch) {
          mileage = parseInt(mileageMatch[1].replace(/,/g, ''));
        }

        // Get page title/description
        const description = $('title').text().trim() || 
                           $('.vehicle-title').text().trim() ||
                           $('h1').first().text().trim();

        // If no price found, it's a parse error
        if (price === null) {
          const htmlSnapshot = response.data.substring(0, 5000); // First 5KB for debugging
          return {
            price: null,
            mileage,
            description,
            success: false,
            error: 'Failed to extract price from page',
            errorType: 'PARSE_ERROR',
            htmlSnapshot,
            url,
            retry: false // Don't retry parse errors
          };
        }

        return {
          price,
          mileage,
          description,
          success: true,
          url
        };

      } catch (error) {
        lastError = error;
        const errorClass = this.classifyError(error);
        
        // If it's a permanent error, don't retry
        if (!errorClass.retry) {
          console.error(`❌ Permanent error on attempt ${attempt}/${this.maxRetries}: ${error.message}`);
          return {
            price: null,
            mileage: null,
            description: null,
            success: false,
            error: error.message,
            errorType: errorClass.type,
            htmlSnapshot: null,
            url,
            retry: false
          };
        }
        
        // If this isn't the last attempt, wait and retry
        if (attempt < this.maxRetries) {
          const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
          console.error(`⚠️  Temporary error on attempt ${attempt}/${this.maxRetries}: ${error.message}`);
          console.error(`   Waiting ${waitTime/1000}s before retry...`);
          await this.sleep(waitTime);
        }
      }
    }
    
    // All retries exhausted
    const errorClass = this.classifyError(lastError);
    console.error(`❌ All ${this.maxRetries} attempts failed for ${url}`);
    
    return {
      price: null,
      mileage: null,
      description: null,
      success: false,
      error: lastError.message,
      errorType: errorClass.type,
      htmlSnapshot: null,
      url,
      retry: false
    };
  }
}

module.exports = CarScraper;
