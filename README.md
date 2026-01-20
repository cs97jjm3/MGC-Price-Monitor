# MGC Car Tracker

Automated car price monitoring tool that tracks multiple vehicle listings and sends email alerts when prices change. Built for families monitoring car purchases with configurable schedules, smart thresholds, and visual dashboard.

## Features

- **Smart Price Alerts**: Configurable thresholds - only alert for significant changes (£100+ or 5%+)
- **Per-Car Recipients**: Different family members get alerts for cars they're interested in
- **Weekly Summary Emails**: Comprehensive overview of all tracked cars and price trends
- **Real-time Dashboard**: Visual price history graphs and current status at http://localhost:3739
- **Automated Scheduling**: UK timezone-aware with quiet hours (11pm-6am)
- **Price History**: SQLite database stores complete pricing history with timestamps
- **Multi-Car Support**: Track unlimited vehicles from any dealer website
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

Once running, visit **http://localhost:3739** for the visual dashboard.

## Configuration

Edit `config.json`:

```json
{
  "email": {
    "sender": "your-gmail@gmail.com",
    "password": "your-gmail-app-password"
  },
  "cars": [
    {
      "url": "https://dealer.com/car-listing-url",
      "name": "Car Make Model Year",
      "recipients": ["family1@email.com", "family2@email.com"],
      "thresholds": {
        "minAmount": 100,
        "minPercent": 5
      }
    }
  ],
  "schedule": {
    "times": ["06:00", "12:00", "18:00", "19:00", "20:00", "21:00", "22:00"],
    "timezone": "Europe/London"
  },
  "weeklyEmail": {
    "enabled": true,
    "dayOfWeek": "sunday",
    "time": "18:00",
    "recipients": ["person1@email.com"]
  }
}
```

### Smart Thresholds

Prevent email spam from minor price fluctuations:
- `minAmount`: Only alert if price drops by this amount or more (e.g., £100)
- `minPercent`: Only alert if price drops by this percentage or more (e.g., 5%)
- Alerts sent if **either** threshold is met
- Only applies to price drops (increases always alert)

### Per-Car Recipients

Each car can have different people watching it:
```json
{
  "name": "Car for Son",
  "recipients": ["dad@email.com", "son@email.com"]
},
{
  "name": "Car for Daughter", 
  "recipients": ["mum@email.com", "daughter@email.com"]
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
- Starts price checking, weekly emails, and dashboard
- Dashboard available at http://localhost:3739

**One-time check:**
```bash
npm run check
```

**Test email setup:**
```bash
node test-email.js
```

**Manual weekly summary:**
```bash
node weekly-summary.js
```

## Email Features

### Price Change Alerts
When prices change and meet thresholds, recipients receive HTML emails showing:
- Old vs new price with visual indicators (📉📈)
- Exact change amount and percentage
- Direct link to car listing
- Current mileage if available
- Timestamp of change

### Weekly Summary
Every Sunday at 6pm (configurable):
- All tracked cars and their week-over-week changes
- Biggest price drops and increases
- Summary statistics
- "No changes" confirmation if all prices stayed the same

## Web Dashboard

Visual interface showing:
- **Real-time prices** for all tracked cars
- **Price history graphs** with Chart.js
- **Change indicators** (📉📈➡️) 
- **Direct links** to car listings
- **Alert recipients** for each car
- **Auto-refresh** every 5 minutes

Access at **http://localhost:3739** when tracker is running.

### Dashboard Management Features

**Management Interface** - Access at **http://localhost:3739/manage**

Add cars through the web interface instead of editing config.json:
- Click "Add Car" button
- Enter car URL, name, and recipient email addresses
- Car is added to both config.json and database automatically

Pause/Resume monitoring:
- Click "Pause" to temporarily stop checking a car
- Click "Resume" to restart monitoring
- Paused cars stay in your config but won't be checked or send alerts

Delete cars:
- Click "Delete" to remove a car completely
- Removes from config.json and hides from dashboard
- Price history stays in database

**Individual Car Pages** - Click any car name to see:
- Complete price history table
- Price trend graph
- All recorded price changes with dates
- Current mileage tracking

**Manual Pause via Config** - Edit config.json directly:
```json
{
  "name": "Car Name",
  "url": "https://...",
  "disabled": true,
  "recipients": ["email@example.com"]
}
```
Set `"disabled": true` to pause monitoring without deleting the car.

## Database

Price history stored in `car-prices.db` (SQLite):
- All monitored vehicles with complete price history
- Timestamps in UK timezone
- Mileage tracking where available
- Description change detection

## Scripts

| Command | Purpose |
|---------|---------|
| `npm start` | Full system (monitoring + dashboard + weekly emails) |
| `npm run check` | Single price check |
| `node test-email.js` | Test email configuration |
| `node test-price-change.js` | Simulate price change alert |
| `node weekly-summary.js` | Generate weekly summary |

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
├── index.js              # Main scheduler + dashboard launcher
├── check-prices.js       # Price checking with smart thresholds
├── database.js           # SQLite database handler
├── scraper.js           # Web scraping engine
├── email.js             # Gmail notifications + weekly summaries
├── dashboard.js         # Web dashboard server
├── weekly-summary.js    # Weekly email generation
├── config.json          # Configuration (not in git)
├── config.example.json  # Configuration template
├── test-*.js           # Testing utilities
├── car-prices.db        # Price history database
└── README.md            # This documentation
```

## Technical Details

- **Web Scraping**: Cheerio + Axios with user-agent spoofing
- **Database**: sql.js (pure JavaScript SQLite)
- **Email**: Nodemailer with Gmail SMTP
- **Scheduling**: node-cron with timezone support  
- **Dashboard**: Chart.js for price history visualization
- **Error Handling**: Comprehensive logging and retry logic

## Extending

**Add more cars**: Use web interface at http://localhost:3739/manage OR edit config.json

**Pause monitoring**: Use web interface "Pause" button OR set `"disabled": true` in config.json

**Different thresholds**: Set per-car minAmount/minPercent values in config.json

**Custom schedules**: Modify `schedule.times` array in config.json

**Different dashboard port**: Change `this.port` in dashboard.js

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

**Dashboard not loading:**
- Check port 3739 isn't blocked
- Verify tracker is running (`npm start`)
- Check console for dashboard server errors

**Thresholds not working:**
- Only applies to price drops (not increases)
- Must meet minAmount OR minPercent (whichever comes first)
- Check console output shows threshold evaluation

## License

MIT License - built for practical family use

## Author

James Murrell - Business Analyst specializing in practical automation solutions

---

**Latest Version Features:**
- ✅ Smart price thresholds (reduce email noise)
- ✅ Per-car email recipients  
- ✅ Weekly summary emails
- ✅ Real-time web dashboard with price graphs
- ✅ Web-based car management (add/delete/pause cars)
- ✅ Individual car detail pages with complete history
- ✅ Improved console output and logging
