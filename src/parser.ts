import * as cheerio from 'cheerio';
import { ArticleLink } from './types';

export class EmailParser {
  parseGoogleAlertsEmail(html: string, subject: string): ArticleLink[] {
    const $ = cheerio.load(html);
    const links: ArticleLink[] = [];

    // Determine topic from subject line
    const topic = this.extractTopic(subject);

    // Google Alerts uses specific link patterns
    // Try multiple selectors to catch different formats
    const selectors = [
      'a[href*="google.com/url?"]', // Google redirect links
      'table a[href^="http"]',      // Direct links in tables
      'div a[href^="http"]'         // Links in divs
    ];

    const seenUrls = new Set<string>();

    for (const selector of selectors) {
      $(selector).each((_, element) => {
        const $link = $(element);
        let url = $link.attr('href');
        const title = $link.text().trim();

        if (!url || !title) return;

        // Decode Google redirect URLs
        if (url.includes('google.com/url?')) {
          const match = url.match(/url=([^&]+)/);
          if (match) {
            url = decodeURIComponent(match[1]);
          }
        }

        // Filter out non-article links
        if (this.isValidArticleUrl(url) && !seenUrls.has(url)) {
          seenUrls.add(url);
          links.push({
            url,
            title: title || 'Untitled',
            topic
          });
        }
      });
    }

    return links;
  }

  private extractTopic(subject: string): string {
    const subjectLower = subject.toLowerCase();

    if (subjectLower.includes('agentic commerce')) {
      return 'agentic commerce';
    } else if (subjectLower.includes('ai commerce')) {
      return 'ai commerce';
    }

    // Fallback: extract topic from "Google Alert - [topic]"
    const match = subject.match(/Google Alert\s*-\s*(.+)/i);
    return match ? match[1].trim() : 'unknown';
  }

  private isValidArticleUrl(url: string): boolean {
    try {
      const parsed = new URL(url);

      // Exclude Google/internal links
      const excludeDomains = ['google.com', 'googleusercontent.com', 'feedproxy.google.com'];
      if (excludeDomains.some(domain => parsed.hostname.includes(domain))) {
        return false;
      }

      // Must be http/https
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }
}
