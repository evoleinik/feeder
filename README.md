# Google Alerts Intelligence Tool

Automatically processes Google Alerts emails for "ai commerce" and "agentic commerce", analyzes articles with AI, tracks sentiment/trends over time, and delivers daily insights to Slack.

## Features

- 📧 Fetches Google Alerts emails via IMAP
- 🔍 Extracts and scrapes article content
- 🤖 AI-powered analysis with multiple providers (Claude, OpenAI, Gemini)
- 💾 SQLite database for historical tracking
- 📊 Daily intelligence briefs with consolidated analysis
- ⏰ Automated daily runs at 11:01 AM
- 🔄 Deduplication (skips already-processed articles)
- 🔌 Pluggable AI providers - easily switch between models

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Email (Gmail)

Create a Gmail App Password:
1. Go to Google Account settings
2. Security → 2-Step Verification (enable if not already)
3. Security → App passwords
4. Generate password for "Mail"
5. Copy the 16-character password

### 3. Choose and Configure AI Provider

The tool supports three AI providers. Choose one and get its API key:

**Option A: OpenAI (GPT-4)**
1. Sign up at https://platform.openai.com
2. Create an API key
3. Copy the key (starts with `sk-proj-`)

**Option B: Anthropic (Claude)**
1. Sign up at https://console.anthropic.com
2. Create an API key
3. Copy the key (starts with `sk-ant-`)

**Option C: Google (Gemini)**
1. Get API key at https://makersuite.google.com/app/apikey
2. Copy the key

### 4. Configure Slack Webhook

1. Go to https://api.slack.com/apps
2. Create new app → From scratch
3. Incoming Webhooks → Activate
4. Add New Webhook to Workspace
5. Select channel and copy webhook URL

### 5. Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USER=your-email@gmail.com
IMAP_PASSWORD=your-16-char-app-password

# Choose one: claude, openai, or gemini
AI_PROVIDER=openai

# Only the API key for your chosen provider is required
ANTHROPIC_API_KEY=sk-ant-xxxxx
OPENAI_API_KEY=sk-proj-xxxxx
GEMINI_API_KEY=xxxxx

SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

CRON_SCHEDULE=1 11 * * *
```

## Usage

### Build

```bash
npm run build
```

### Run (Production)

Starts the scheduler and runs daily at 11:01 AM:

```bash
npm start
```

### Test Run

Process emails immediately without scheduling:

```bash
npm run dev -- --test
```

### Development

Run in development mode with ts-node:

```bash
npm run dev
```

## Switching AI Providers

To switch between AI providers, simply change the `AI_PROVIDER` value in your `.env` file:

```bash
# Use OpenAI (GPT-4)
AI_PROVIDER=openai

# Or use Claude
AI_PROVIDER=claude

# Or use Gemini
AI_PROVIDER=gemini
```

The tool will automatically use the correct API key and model. No code changes needed!

## Architecture

```
src/
├── index.ts          # Main orchestrator + scheduler
├── email.ts          # IMAP email fetching
├── parser.ts         # Extract article links from HTML
├── scraper.ts        # Puppeteer article scraping
├── analyzer.ts       # Creates intelligence briefs from articles
├── providers/
│   ├── base.ts       # AI provider interface
│   ├── claude.ts     # Claude implementation
│   ├── openai.ts     # OpenAI implementation
│   ├── gemini.ts     # Gemini implementation
│   └── factory.ts    # Provider factory
├── slack.ts          # Slack message formatting
├── database.ts       # SQLite operations
└── types.ts          # TypeScript interfaces

db/
└── alerts.db         # SQLite database (auto-created)
```

## Database Schema

**articles**
- url, title, source, topic, content, published_date, fetched_date

**daily_briefs**
- date, executive_summary, key_developments (JSON), notable_articles (JSON), sentiment_summary, trends, what_to_watch, article_count

## Slack Intelligence Brief Format

Daily intelligence brief includes:
- **Executive Summary**: 2-3 sentence overview of what's happening today
- **Key Developments**: 3-5 unique/important developments (similar stories consolidated)
- **Notable Articles**: Curated articles with why they matter
- **Sentiment Summary**: Overall mood and reasoning (optimistic/cautious/neutral/hype)
- **Trends**: Patterns across articles (early hype vs practical implementation)
- **What to Watch**: Emerging questions and potential next developments

## Troubleshooting

**No emails found**
- Check Google Alerts are sending to the configured email
- Verify IMAP credentials
- Check emails aren't already marked as read

**Scraping fails**
- Some sites block automated access
- Tool will skip failed articles and continue

**Claude API errors**
- Check API key is valid
- Verify account has credits
- Tool will fallback to basic analysis if needed

**Slack not receiving**
- Verify webhook URL is correct
- Check webhook hasn't been revoked
- Test webhook with curl

## Deployment to Linux Server

### Prerequisites

```bash
# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Chromium for Puppeteer
sudo apt-get install -y chromium-browser fonts-liberation

# Or install required Puppeteer dependencies
sudo apt-get install -y \
  libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 \
  libcups2 libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 libnspr4 \
  libnss3 libwayland-client0 libxcomposite1 libxdamage1 \
  libxfixes3 libxkbcommon0 libxrandr2 xdg-utils
```

### Setup on Server

**1. Clone the repository:**
```bash
git clone https://github.com/YOUR_USERNAME/feeder.git
cd feeder
```

**2. Install dependencies:**
```bash
npm install
```

**3. Configure environment:**
```bash
cp .env.example .env
nano .env
# Fill in all your credentials:
# - IMAP settings (Gmail app password)
# - AI provider and API key
# - Slack webhook URL
```

**4. Build the project:**
```bash
npm run build
```

**5. Test it works:**
```bash
npm run dev -- --test
```

### Run with PM2 (Recommended)

PM2 is a production process manager that handles restarts, logging, and monitoring.

**Install PM2:**
```bash
sudo npm install -g pm2
```

**Start the application:**
```bash
pm2 start dist/index.js --name feeder
```

**Configure auto-start on reboot:**
```bash
pm2 startup
# Follow the instructions printed
pm2 save
```

**Useful PM2 commands:**
```bash
pm2 status              # Check status
pm2 logs feeder         # View logs
pm2 logs feeder --lines 100  # View last 100 lines
pm2 restart feeder      # Restart
pm2 stop feeder         # Stop
pm2 delete feeder       # Remove from PM2
pm2 monit               # Monitor resources
```

**Configure log rotation:**
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### Alternative: Systemd Service

Create `/etc/systemd/system/feeder.service`:

```ini
[Unit]
Description=Google Alerts Intelligence Tool
After=network.target

[Service]
Type=simple
User=YOUR_USERNAME
WorkingDirectory=/home/YOUR_USERNAME/feeder
ExecStart=/usr/bin/node /home/YOUR_USERNAME/feeder/dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable feeder
sudo systemctl start feeder
sudo systemctl status feeder
```

### Monitoring

Check the scheduled runs are working:
```bash
# With PM2
pm2 logs feeder | grep "Intelligence Run"

# Check database for daily briefs
sqlite3 db/alerts.db "SELECT date, article_count FROM daily_briefs ORDER BY date DESC LIMIT 5"
```

### Timezone Configuration

Ensure your server is set to the correct timezone for cron scheduling:

```bash
# Check current timezone
timedatectl

# Set timezone (example: US Eastern)
sudo timedatectl set-timezone America/New_York

# Or for UTC
sudo timedatectl set-timezone UTC
```

### Troubleshooting

**Puppeteer issues:**
```bash
# Set explicit Chrome path in environment
export PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
```

**Permission issues:**
```bash
# Ensure db directory is writable
chmod 755 db
```

**Check logs:**
```bash
pm2 logs feeder --err   # Error logs only
pm2 logs feeder --lines 200  # More context
```

## License

MIT
