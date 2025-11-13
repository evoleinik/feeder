import puppeteer from 'puppeteer';
import { ArticleLink, Article } from './types';

export class ArticleScraper {
  async scrapeArticle(link: ArticleLink): Promise<Article | null> {
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const page = await browser.newPage();

      // Set user agent to avoid blocking
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      );

      // Navigate with timeout
      await page.goto(link.url, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      // Extract article content
      const articleData = await page.evaluate(() => {
        // Try to find article content using common selectors
        const selectors = [
          'article',
          '[role="article"]',
          '.article-content',
          '.post-content',
          '.entry-content',
          'main',
          '.content'
        ];

        let content = '';
        let title = document.title;

        // Try each selector
        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (element) {
            content = element.textContent || '';
            break;
          }
        }

        // Fallback to body if no article found
        if (!content) {
          content = document.body.textContent || '';
        }

        // Try to find better title
        const h1 = document.querySelector('h1');
        if (h1?.textContent) {
          title = h1.textContent;
        }

        // Clean up content
        content = content
          .replace(/\s+/g, ' ')
          .replace(/\n+/g, '\n')
          .trim();

        return {
          title,
          content,
          source: window.location.hostname
        };
      });

      await browser.close();

      // Validate we got meaningful content
      if (!articleData.content || articleData.content.length < 100) {
        console.log(`Insufficient content for ${link.url}`);
        return null;
      }

      return {
        url: link.url,
        title: articleData.title || link.title,
        source: articleData.source,
        topic: link.topic,
        content: articleData.content.slice(0, 10000), // Limit to 10k chars
        published_date: new Date().toISOString()
      };
    } catch (error) {
      console.error(`Failed to scrape ${link.url}:`, error);
      if (browser) await browser.close();
      return null;
    }
  }

  async scrapeMultiple(links: ArticleLink[]): Promise<Article[]> {
    const articles: Article[] = [];

    for (const link of links) {
      console.log(`Scraping: ${link.url}`);
      const article = await this.scrapeArticle(link);
      if (article) {
        articles.push(article);
      }
      // Small delay to be respectful
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return articles;
  }
}
