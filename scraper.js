// MGC Price Monitor v2.0 - Universal Item Scraper
const axios = require('axios');
const cheerio = require('cheerio');

class ItemScraper {
  constructor() {
    this.maxRetries = 3;
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getRandomUserAgent() {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  getBrowserHeaders(url) {
    const urlObj = new URL(url);
    return {
      'User-Agent': this.getRandomUserAgent(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-GB,en;q=0.9,en-US;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Cache-Control': 'max-age=0',
      'Referer': `${urlObj.protocol}//${urlObj.hostname}/`
    };
  }

  classifyError(error) {
    // Classify errors as temporary (retry) or permanent (don't retry)
    if (error.response) {
      const status = error.response.status;
      
      // Permanent errors - don't retry
      if (status === 404) return { type: '404_NOT_FOUND', retry: false };
      if (status === 403) return { type: '403_FORBIDDEN', retry: true }; // Changed to retry with better headers
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

  extractPrice($) {
    // Try multiple price selectors in order of priority
    const selectors = [
      // Generic price selectors
      '.price',
      '.vehicle-price',
      '.product-price',
      '[class*="price"]',
      '[data-test*="price"]',
      '[data-testid*="price"]',
      // Lego specific
      '[data-test="product-price"]',
      '.ProductPrice__priceValue',
      '[class*="ProductPrice"]',
      // Common e-commerce
      '.product__price',
      '.selling-price',
      '.sale-price',
      '.current-price',
      // Fallback to text search
      'h2:contains("£")',
      'span:contains("£")',
      'div:contains("£")'
    ];

    for (const selector of selectors) {
      const priceText = $(selector).first().text();
      const priceMatch = priceText.match(/£([\d,]+\.?\d*)/);
      if (priceMatch) {
        const price = parseFloat(priceMatch[1].replace(/,/g, ''));
        if (price > 0) {
          return price;
        }
      }
    }

    return null;
  }

  extractMileage($) {
    const mileageText = $('.mileage').text() || 
                       $('[class*="mileage"]').text() ||
                       $('li:contains("miles")').text();
    
    const mileageMatch = mileageText.match(/([\d,]+)\s*miles/i);
    if (mileageMatch) {
      return parseInt(mileageMatch[1].replace(/,/g, ''));
    }
    return null;
  }

  extractDescription($) {
    return $('title').text().trim() || 
           $('.vehicle-title').text().trim() ||
           $('.product-title').text().trim() ||
           $('h1').first().text().trim() ||
           $('[data-test="product-overview-name"]').text().trim() ||
           'No description found';
  }

  async scrapeItemDetails(url) {
    let lastError = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        // Add random delay between attempts to appear more human
        if (attempt > 1) {
          const waitTime = Math.pow(2, attempt - 1) * 1000 + Math.random() * 1000; // Add jitter
          console.error(`   Waiting ${(waitTime/1000).toFixed(1)}s before retry...`);
          await this.sleep(waitTime);
        }

        const response = await axios.get(url, {
          headers: this.getBrowserHeaders(url),
          timeout: 20000, // Increased timeout for slow sites
          maxRedirects: 5,
          validateStatus: (status) => status < 500 // Don't throw on 4xx errors
        });

        // Check for permanent error status codes
        if (response.status === 404 || response.status === 410) {
          return {
            price: null,
            mileage: null,
            description: null,
            success: false,
            error: `HTTP ${response.status}`,
            errorType: response.status === 404 ? '404_NOT_FOUND' : '410_GONE',
            htmlSnapshot: null,
            url,
            retry: false
          };
        }

        // 403 on last attempt is permanent, otherwise retry with different UA
        if (response.status === 403) {
          if (attempt === this.maxRetries) {
            return {
              price: null,
              mileage: null,
              description: null,
              success: false,
              error: `HTTP 403 - Site blocking automated access (tried ${this.maxRetries} different approaches)`,
              errorType: '403_FORBIDDEN',
              htmlSnapshot: null,
              url,
              retry: false
            };
          }
          console.error(`⚠️  HTTP 403 on attempt ${attempt}/${this.maxRetries} - trying different browser signature...`);
          continue; // Try again with different user agent
        }

        const $ = cheerio.load(response.data);
        
        // Extract price using enhanced selectors
        const price = this.extractPrice($);

        // Extract mileage (for cars)
        const mileage = this.extractMileage($);

        // Get page title/description
        const description = this.extractDescription($);

        // If no price found, it's a parse error
        if (price === null) {
          const htmlSnapshot = response.data.substring(0, 5000); // First 5KB for debugging
          return {
            price: null,
            mileage,
            description,
            success: false,
            error: 'Failed to extract price from page - price format may have changed',
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
        
        // Log retry attempts
        if (attempt < this.maxRetries) {
          console.error(`⚠️  Temporary error on attempt ${attempt}/${this.maxRetries}: ${error.message}`);
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

module.exports = ItemScraper;
