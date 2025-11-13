# Google Alerts Intelligence Tool

Automatically processes Google Alerts emails for "ai commerce" and "agentic commerce", analyzes articles with AI, tracks sentiment/trends over time, and delivers daily insights to Slack.

## Features

- 📧 Fetches Google Alerts emails via IMAP
- 🔍 Extracts and scrapes article content
- 🤖 AI-powered analysis with multiple providers (Claude, OpenAI, Gemini)
- 💾 SQLite database for historical tracking
- 📊 Daily Slack digests with sentiment analysis
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
├── analyzer.ts       # AI analysis orchestrator
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

**analysis**
- article_id, summary, themes (JSON), sentiment_score, sentiment_reasoning

## Sentiment Scale

- **1.0**: Very positive (breakthroughs, major success)
- **0.5**: Positive (progress, optimism)
- **0.0**: Neutral (informational)
- **-0.5**: Negative (challenges, concerns)
- **-1.0**: Very negative (failures, major problems)

## Slack Message Format

Daily digest includes:
- Grouped articles by topic (ai commerce, agentic commerce)
- Article title with link
- Sentiment score with emoji
- 2-3 sentence summary
- Key themes
- Source
- Quick stats (total articles, average sentiment)

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

## Deployment

### Local Machine (macOS/Linux)

Run as a background service:

```bash
npm run build
nohup node dist/index.js > logs/feeder.log 2>&1 &
```

### Docker

```dockerfile
FROM node:18-alpine
RUN apk add --no-cache chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run build
CMD ["node", "dist/index.js"]
```

### Cloud Server

- Upload to VPS (AWS, DigitalOcean, etc.)
- Install Node.js 18+
- Configure `.env`
- Run with pm2 or systemd

## License

MIT
