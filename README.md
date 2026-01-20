# MGC Car Tracker

Automated car price monitoring tool that tracks multiple vehicle listings and sends email alerts when prices change. Built for families monitoring car purchases with configurable schedules and multi-recipient notifications.

## Features

- **Automated Price Monitoring**: Checks car listings at configurable intervals (default: 7 times daily)
- **Email Alerts**: Instant notifications when prices change, with before/after comparison
- **Multi-Car Support**: Track unlimited vehicles from any dealer website
- **Price History**: SQLite database stores complete pricing history with timestamps
- **Smart Scheduling**: UK timezone-aware with quiet hours (11pm-6am)
- **Multi-Recipient**: Email alerts to multiple family members
- **No-Compile Installation**: Pure JavaScript - no Visual Studio or build tools required

## Quick Start

```bash
# Clone and install
git clone [repository-url]
cd MGC-Car-Tracker
npm install

# Configure
cp config.example.json config.json
# Edit config.json with your cars and Gmail settings

# Test
npm run check

# Run continuously
npm start
```

## Configuration

Edit `config.json`:

```json
{
  "email": {
    "sender": "your-gmail@gmail.com",
    "password": "your-gmail-app-password",
    "recipients": ["family1@email.com", "family2@email.com"]
  },
  "cars": [
    {
      "url": "https://dealer.com/car-listing-url",
      "name": "Car Make Model Year"
    }
  ],
  "schedule": {
    "times": ["06:00", "12:00", "18:00", "19:00", "20:00", "21:00", "22:00"],
    "timezone": "Europe/London"
  }
}
```

## Gmail Setup

1. Enable 2-Step Verification in your Google Account
2. Go to Security → App passwords
3. Generate app password for "Mail"
4. Use this password in config.json (not your regular Gmail password)

## Usage

**Continuous monitoring:**
```bash
npm start
```

**One-time check:**
```bash
npm run check
```

**Test email setup:**
```bash
node test-email.js
```

## Email Alerts

When prices change, all recipients receive HTML emails showing:
- Old vs new price with clear visual indicators
- Price change amount (+ or -)
- Direct link to car listing
- Current mileage if available
- Timestamp of change

## Database

Price history stored in `car-prices.db` (SQLite):
- All monitored vehicles
- Complete price history with timestamps
- Mileage tracking
- Description changes

## Background Service

### Windows Task Scheduler
1. Open Task Scheduler
2. Create Basic Task → "When computer starts"
3. Action: Start program
   - Program: `C:\Program Files\nodejs\node.exe`
   - Arguments: `index.js`
   - Start in: `[path-to-MGC-Car-Tracker]`

### Linux/Mac
Create systemd service or use PM2 for production deployments.

## File Structure

```
MGC Car Tracker/
├── index.js              # Main scheduler
├── check-prices.js       # Price checking logic
├── database.js           # SQLite database handler
├── scraper.js           # Web scraping engine
├── email.js             # Gmail notifications
├── config.json          # Configuration file
├── test-email.js        # Email testing utility
├── test-price-change.js # Price change simulation
├── car-prices.db        # Price history database
└── README.md            # Documentation
```

## Technical Details

- **Web Scraping**: Cheerio + Axios with user-agent spoofing
- **Database**: sql.js (pure JavaScript SQLite)
- **Email**: Nodemailer with Gmail SMTP
- **Scheduling**: node-cron with timezone support
- **Error Handling**: Comprehensive logging and retry logic

## Extending

**Add more cars**: Edit config.json, no code changes required

**Different schedules**: Modify `schedule.times` array

**Custom notifications**: Extend EmailNotifier class

**Multiple dealers**: Scraper automatically adapts to different website structures

## Troubleshooting

**Emails not sending:**
- Verify Gmail app password (not regular password)
- Check spam folders
- Ensure 2-step verification enabled

**Price not detected:**
- Website structure may have changed
- Check console output for scraping errors
- Verify URL accessibility

**Scheduler not running:**
- Keep terminal window open, or
- Set up as system service (see above)

## License

MIT License - built for practical family use

## Author

James Murrell - Business Analyst specializing in practical automation solutions
