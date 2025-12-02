import * as dotenv from 'dotenv';
import * as cron from 'node-cron';
import { EmailFetcher } from './email';
import { EmailParser } from './parser';
import { ArticleScraper } from './scraper';
import { IntelligenceAnalyzer } from './analyzer';
import { SlackMessenger } from './slack';
import DatabaseManager from './database';
import { Config, ArticleLink } from './types';
import { createAIProvider, ProviderType } from './providers/factory';
import { HackerNewsFetcher } from './hackernews';

dotenv.config();

class GoogleAlertsIntelligence {
  private config: Config;
  private db: DatabaseManager;
  private emailFetcher: EmailFetcher;
  private parser: EmailParser;
  private scraper: ArticleScraper;
  private analyzer: IntelligenceAnalyzer;
  private slack: SlackMessenger;
  private hnFetcher: HackerNewsFetcher;

  constructor() {
    this.config = this.loadConfig();
    this.db = new DatabaseManager();
    this.emailFetcher = new EmailFetcher(this.config.imap);
    this.parser = new EmailParser();
    this.scraper = new ArticleScraper();

    // Create AI provider based on configuration
    const provider = createAIProvider({
      type: this.config.ai.provider,
      apiKey: this.getApiKeyForProvider(this.config.ai.provider)
    });
    this.analyzer = new IntelligenceAnalyzer(provider, this.config.brief.domain);

    this.slack = new SlackMessenger(this.config.slack.webhookUrl, this.config.brief.title);

    this.hnFetcher = new HackerNewsFetcher(
      this.config.ai.provider,
      this.getApiKeyForProvider(this.config.ai.provider),
      this.config.brief.domain
    );
  }

  private getApiKeyForProvider(providerType: ProviderType): string {
    switch (providerType) {
      case 'claude':
        return this.config.ai.apiKeys.anthropic!;
      case 'openai':
        return this.config.ai.apiKeys.openai!;
      case 'gemini':
        return this.config.ai.apiKeys.gemini!;
      default:
        throw new Error(`Unknown provider type: ${providerType}`);
    }
  }

  private loadConfig(): Config {
    const required = [
      'IMAP_HOST',
      'IMAP_PORT',
      'IMAP_USER',
      'IMAP_PASSWORD',
      'SLACK_WEBHOOK_URL',
      'AI_PROVIDER'
    ];

    for (const key of required) {
      if (!process.env[key]) {
        throw new Error(`Missing required environment variable: ${key}`);
      }
    }

    const aiProvider = process.env.AI_PROVIDER?.toLowerCase() as ProviderType;
    if (!['claude', 'openai', 'gemini'].includes(aiProvider)) {
      throw new Error(`Invalid AI_PROVIDER: ${aiProvider}. Must be 'claude', 'openai', or 'gemini'`);
    }

    // Validate the required API key for the selected provider
    const providerKeyMap = {
      claude: 'ANTHROPIC_API_KEY',
      openai: 'OPENAI_API_KEY',
      gemini: 'GEMINI_API_KEY'
    };

    const requiredKey = providerKeyMap[aiProvider];
    if (!process.env[requiredKey]) {
      throw new Error(`Missing required API key for ${aiProvider}: ${requiredKey}`);
    }

    return {
      imap: {
        host: process.env.IMAP_HOST!,
        port: parseInt(process.env.IMAP_PORT!),
        user: process.env.IMAP_USER!,
        password: process.env.IMAP_PASSWORD!,
        maxPerRun: parseInt(process.env.MAX_EMAILS_PER_RUN || '2')
      },
      ai: {
        provider: aiProvider,
        apiKeys: {
          anthropic: process.env.ANTHROPIC_API_KEY,
          openai: process.env.OPENAI_API_KEY,
          gemini: process.env.GEMINI_API_KEY
        }
      },
      slack: {
        webhookUrl: process.env.SLACK_WEBHOOK_URL!
      },
      cron: {
        schedule: process.env.CRON_SCHEDULE || '1 11 * * *' // 11:01 AM daily
      },
      brief: {
        domain: process.env.BRIEF_DOMAIN || 'your monitored topics',
        title: process.env.BRIEF_TITLE || 'Intelligence Brief'
      }
    };
  }

  async run(): Promise<void> {
    console.log(`\n=== Starting Google Alerts Intelligence Run - ${new Date().toISOString()} ===\n`);

    try {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

      // Step 1: Fetch emails
      console.log('Fetching Google Alerts emails...');
      const emails = await this.emailFetcher.fetchGoogleAlerts();
      console.log(`Found ${emails.length} new email(s)`);

      // Step 2: Parse emails for article links
      console.log('\nParsing emails for article links...');
      const allLinks: ArticleLink[] = [];
      for (const email of emails) {
        const links = this.parser.parseGoogleAlertsEmail(email.html, email.subject);
        console.log(`  Found ${links.length} links in "${email.subject}"`);
        allLinks.push(...links);
      }

      // Step 2b: Fetch Hacker News articles
      console.log('\nFetching Hacker News articles...');
      const hnLinks = await this.hnFetcher.fetchRelevantArticles();
      allLinks.push(...hnLinks);

      // Step 3: Filter out already-processed articles
      const newLinks = allLinks.filter(link => !this.db.articleExists(link.url));
      console.log(`\nNew articles to process: ${newLinks.length} (${allLinks.length - newLinks.length} already in database)`);

      // Parse concurrency from -c flag
      const concurrencyIdx = process.argv.indexOf('-c');
      const concurrency = concurrencyIdx !== -1
        ? parseInt(process.argv[concurrencyIdx + 1]) || 3
        : 3;

      // Step 4: Scrape new articles (if any)
      let newArticles = [];
      if (newLinks.length > 0) {
        console.log('\nScraping articles...');
        const articles = await this.scraper.scrapeMultiple(newLinks, concurrency);
        console.log(`Successfully scraped ${articles.length} articles`);

        // Deduplicate articles by URL
        const uniqueArticles = articles.filter((article, index, self) =>
          index === self.findIndex(a => a.url === article.url)
        );
        const duplicateCount = articles.length - uniqueArticles.length;
        if (duplicateCount > 0) {
          console.log(`Removed ${duplicateCount} duplicate article(s)`);
        }

        // Store articles
        console.log('\nStoring articles in database...');
        for (const article of uniqueArticles) {
          const articleId = this.db.insertArticle(article);
          article.id = articleId;
        }

        newArticles = uniqueArticles;
      }

      // Step 5: Get all articles from today for analysis
      console.log('\nGathering today\'s articles...');
      const todayArticles = this.db.getRecentArticles(1);
      console.log(`Found ${todayArticles.length} article(s) from today`);

      // Step 5b: Get historical briefs for context
      const historicalBriefs = this.db.getRecentBriefs(7);
      console.log(`Found ${historicalBriefs.length} previous brief(s) for context`);

      // Step 6: Create intelligence brief
      console.log('\nCreating intelligence brief...');
      const brief = await this.analyzer.createBrief(todayArticles, today, historicalBriefs);

      // Print brief to console
      console.log('\n--- Intelligence Brief ---');
      console.log(`Executive Summary: ${brief.executive_summary}`);
      for (const dev of brief.key_developments) {
        console.log(`\n• ${dev.development}`);
        dev.key_takeaways?.forEach(t => console.log(`  - ${t}`));
      }
      console.log('---\n');

      // Store brief in database
      this.db.insertDailyBrief(brief);

      // Step 7: Send to Slack (skip fallback briefs)
      if (brief.is_fallback) {
        console.log('\nSkipping Slack (fallback brief due to AI error)');
      } else {
        console.log('\nSending brief to Slack...');
        await this.slack.sendIntelligenceBrief(brief);
      }

      console.log(`\n=== Run completed successfully ===\n`);
    } catch (error) {
      console.error('Error during run:', error);
      throw error;
    }
  }

  start(): void {
    console.log('🚀 Google Alerts Intelligence Tool Started');
    console.log(`📅 Schedule: ${this.config.cron.schedule} (11:01 AM daily)`);
    console.log(`📧 Email: ${this.config.imap.user}`);
    console.log('⏳ Waiting for scheduled run...\n');

    // Schedule the job
    cron.schedule(this.config.cron.schedule, async () => {
      try {
        await this.run();
      } catch (error) {
        console.error('Scheduled run failed:', error);
      }
    });

    // Keep process alive
    process.on('SIGINT', () => {
      console.log('\n👋 Shutting down gracefully...');
      this.db.close();
      process.exit(0);
    });
  }
}

// Main execution
const main = async () => {
  const tool = new GoogleAlertsIntelligence();

  // Check if running in test mode
  const isTest = process.argv.includes('--test');

  if (isTest) {
    console.log('🧪 Running in test mode (single run)...\n');
    await tool.run();
    process.exit(0);
  } else {
    tool.start();
  }
};

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
