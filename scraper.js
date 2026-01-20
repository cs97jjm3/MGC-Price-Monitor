const axios = require('axios');
const cheerio = require('cheerio');

class CarScraper {
  async scrapeCarDetails(url) {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 15000
      });

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

      return {
        price,
        mileage,
        description,
        success: price !== null,
        url
      };

    } catch (error) {
      console.error(`Error scraping ${url}:`, error.message);
      return {
        price: null,
        mileage: null,
        description: null,
        success: false,
        error: error.message,
        url
      };
    }
  }
}

module.exports = CarScraper;
