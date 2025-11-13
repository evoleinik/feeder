import * as dotenv from 'dotenv';
import * as cron from 'node-cron';
import { EmailFetcher } from './email';
import { EmailParser } from './parser';
import { ArticleScraper } from './scraper';
import { ArticleAnalyzer } from './analyzer';
import { SlackMessenger } from './slack';
import DatabaseManager from './database';
import { Config, DailyDigest, ArticleResult, ArticleLink, Analysis } from './types';
import { createAIProvider, ProviderType } from './providers/factory';

dotenv.config();

class GoogleAlertsIntelligence {
  private config: Config;
  private db: DatabaseManager;
  private emailFetcher: EmailFetcher;
  private parser: EmailParser;
  private scraper: ArticleScraper;
  private analyzer: ArticleAnalyzer;
  private slack: SlackMessenger;

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
    this.analyzer = new ArticleAnalyzer(provider);

    this.slack = new SlackMessenger(this.config.slack.webhookUrl);
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
      }
    };
  }

  async run(): Promise<void> {
    console.log(`\n=== Starting Google Alerts Intelligence Run - ${new Date().toISOString()} ===\n`);

    try {
      // Step 1: Fetch emails
      console.log('Fetching Google Alerts emails...');
      const emails = await this.emailFetcher.fetchGoogleAlerts();
      console.log(`Found ${emails.length} new email(s)`);

      if (emails.length === 0) {
        console.log('No new emails, sending empty digest');
        await this.sendEmptyDigest();
        return;
      }

      // Step 2: Parse emails for article links
      console.log('\nParsing emails for article links...');
      const allLinks: ArticleLink[] = [];
      for (const email of emails) {
        const links = this.parser.parseGoogleAlertsEmail(email.html, email.subject);
        console.log(`  Found ${links.length} links in "${email.subject}"`);
        allLinks.push(...links);
      }

      // Step 3: Filter out already-processed articles
      const newLinks = allLinks.filter(link => !this.db.articleExists(link.url));
      console.log(`\nNew articles to process: ${newLinks.length} (${allLinks.length - newLinks.length} already in database)`);

      if (newLinks.length === 0) {
        console.log('No new articles, sending empty digest');
        await this.sendEmptyDigest();
        return;
      }

      // Step 4: Scrape articles
      console.log('\nScraping articles...');
      const articles = await this.scraper.scrapeMultiple(newLinks);
      console.log(`Successfully scraped ${articles.length} articles`);

      if (articles.length === 0) {
        console.log('No articles scraped successfully, skipping');
        return;
      }

      // Step 5: Store all articles first
      console.log('\nStoring articles in database...');
      for (const article of articles) {
        const articleId = this.db.insertArticle(article);
        article.id = articleId;
      }

      // Step 6: Get all unanalyzed articles (new + old that failed before)
      console.log('Finding articles needing analysis...');
      const unanalyzedArticles = this.db.getArticlesWithoutAnalysis();
      console.log(`Found ${unanalyzedArticles.length} articles to analyze (${articles.length} new, ${unanalyzedArticles.length - articles.length} retries)`);

      // Step 7: Analyze all unanalyzed articles
      console.log('\nAnalyzing articles...');
      const results: ArticleResult[] = [];

      for (const article of unanalyzedArticles) {
        // Analyze
        const analysisData = await this.analyzer.analyzeArticle(article);
        analysisData.article_id = article.id!;

        // Store analysis
        const analysisId = this.db.insertAnalysis(analysisData);

        // Create full Analysis object with id
        const analysis: Analysis = {
          ...analysisData,
          id: analysisId
        };

        results.push({ article, analysis });
      }

      // Step 8: Build and send digest
      console.log('\nSending digest to Slack...');
      const digest = this.buildDigest(results);
      await this.slack.sendDailyDigest(digest);

      console.log(`\n=== Run completed successfully ===\n`);
    } catch (error) {
      console.error('Error during run:', error);
      throw error;
    }
  }

  private buildDigest(results: ArticleResult[]): DailyDigest {
    const topics: { [key: string]: ArticleResult[] } = {};

    // Group by topic
    for (const result of results) {
      const topic = result.article.topic;
      if (!topics[topic]) {
        topics[topic] = [];
      }
      topics[topic].push(result);
    }

    // Calculate average sentiment
    const avgSentiment = results.length > 0
      ? results.reduce((sum, r) => sum + r.analysis.sentiment_score, 0) / results.length
      : 0;

    return {
      date: new Date().toLocaleDateString(),
      topics,
      stats: {
        total: results.length,
        avgSentiment
      }
    };
  }

  private async sendEmptyDigest(): Promise<void> {
    const digest: DailyDigest = {
      date: new Date().toLocaleDateString(),
      topics: {},
      stats: {
        total: 0,
        avgSentiment: 0
      }
    };
    await this.slack.sendDailyDigest(digest);
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
