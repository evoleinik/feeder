import { Article, IntelligenceBrief, NotableArticle } from './types';
import { AIProvider } from './providers/base';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

function extractJSON(text: string): string {
  // Remove markdown code blocks
  let cleaned = text.trim();
  cleaned = cleaned.replace(/```json\n?/g, '').replace(/```\n?/g, '');

  // Find JSON object boundaries
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');

  if (start !== -1 && end !== -1) {
    return cleaned.substring(start, end + 1);
  }

  return cleaned;
}

export class IntelligenceAnalyzer {
  private provider: AIProvider;
  private aiProviderType: string;
  private domain: string;

  constructor(provider: AIProvider, domain: string) {
    this.provider = provider;
    this.domain = domain;
    this.aiProviderType = process.env.AI_PROVIDER?.toLowerCase() || 'openai';
    console.log(`Using AI provider: ${provider.getName()}`);
  }

  async createBrief(articles: Article[], date: string): Promise<IntelligenceBrief> {
    if (articles.length === 0) {
      return {
        date,
        executive_summary: 'No new articles found today.',
        key_developments: [],
        notable_articles: [],
        sentiment_summary: 'Neutral',
        trends: 'No significant trends detected.',
        what_to_watch: 'Monitor for new developments.',
        article_count: 0
      };
    }

    try {
      // Prepare article summaries for AI
      const articleSummaries = articles.map((article, idx) =>
        `[${idx + 1}] ${article.title}\nURL: ${article.url}\nSource: ${article.source}\nTopic: ${article.topic}\nContent preview: ${article.content.slice(0, 500)}...\n`
      ).join('\n');

      const prompt = `You are an intelligence analyst covering ${this.domain}. Analyze today's articles and create a daily intelligence brief.

Articles (${articles.length} total):
${articleSummaries}

Create a JSON response with:
{
  "executive_summary": "2-3 sentence summary of what's happening today",
  "key_developments": ["3-5 bullet points of unique/important developments, consolidate similar stories"],
  "notable_articles": [
    {
      "title": "article title",
      "url": "COMPLETE URL including https:// protocol",
      "source": "source domain",
      "why_important": "one sentence explaining why this matters"
    }
  ],
  "sentiment_summary": "Overall mood: optimistic/cautious/neutral/hype - with brief reasoning",
  "trends": "What patterns do you see? Are we in early hype or practical implementation? 2-3 sentences.",
  "what_to_watch": "What questions are emerging? What might happen next? 2-3 sentences."
}

IMPORTANT: For notable_articles, you MUST include the FULL URL exactly as provided above (starting with https://).
Example: "url": "https://example.com/article/full-path" NOT "url": "example.com"

Focus on intelligence, not just summaries. What actually matters? What's changing?

RESPOND WITH ONLY THE JSON OBJECT. NO MARKDOWN CODE BLOCKS. NO EXPLANATIONS. JUST THE RAW JSON.`;

      // Call AI directly (not through provider to avoid prompt wrapping)
      const rawResponse = await this.callAI(prompt);

      // Parse the response - the provider should return structured data
      // For now, we'll extract from the summary field which should contain JSON
      const briefData = this.parseAIResponse(rawResponse, articles);

      return {
        date,
        ...briefData,
        article_count: articles.length,
        raw_ai_response: rawResponse
      };

    } catch (error) {
      console.error('Failed to create intelligence brief:', error);

      // Fallback brief
      return {
        date,
        executive_summary: `Analyzed ${articles.length} articles on ${this.domain} today. See individual articles for details.`,
        key_developments: articles.slice(0, 5).map(a => `${a.title} (${a.source})`),
        notable_articles: articles.slice(0, 3).map(a => ({
          title: a.title,
          url: a.url,
          source: a.source,
          why_important: 'Relevant to today\'s developments'
        })),
        sentiment_summary: 'Neutral - Unable to perform detailed analysis',
        trends: `Multiple articles discussing ${this.domain} across various sectors.`,
        what_to_watch: `Monitor for emerging patterns in ${this.domain}.`,
        article_count: articles.length
      };
    }
  }

  private async callAI(prompt: string): Promise<string> {
    if (this.aiProviderType === 'openai') {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.7
      });
      return response.choices[0].message.content || '';
    } else if (this.aiProviderType === 'claude') {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const response = await client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }]
      });
      const textContent = response.content[0];
      return textContent.type === 'text' ? textContent.text : '';
    } else {
      throw new Error(`Unsupported AI provider: ${this.aiProviderType}`);
    }
  }

  private parseAIResponse(summary: string, articles: Article[]): Omit<IntelligenceBrief, 'date' | 'article_count' | 'raw_ai_response'> {
    try {
      // Extract JSON from potential markdown or extra text
      const jsonText = extractJSON(summary);
      const parsed = JSON.parse(jsonText);

      // Ensure notable_articles has full URLs
      if (parsed.notable_articles) {
        parsed.notable_articles = parsed.notable_articles.map((article: any) => {
          // Validate and fix URL
          const hasValidUrl = article.url && (article.url.startsWith('http://') || article.url.startsWith('https://'));

          if (!hasValidUrl) {
            // Try to find the full URL from our articles
            let matchingArticle = null;

            // First, try exact title match
            matchingArticle = articles.find(a =>
              a.title.toLowerCase() === article.title.toLowerCase()
            );

            // If not found, try partial title match
            if (!matchingArticle) {
              matchingArticle = articles.find(a =>
                a.title.toLowerCase().includes(article.title.toLowerCase()) ||
                article.title.toLowerCase().includes(a.title.toLowerCase())
              );
            }

            // If still not found and we have a partial URL, try domain matching
            if (!matchingArticle && article.url) {
              const domain = article.url.replace('www.', '');
              matchingArticle = articles.find(a =>
                a.url.includes(domain) || a.source.includes(domain)
              );
            }

            // If found, use the full URL
            if (matchingArticle) {
              article.url = matchingArticle.url;
              if (!article.source) {
                article.source = matchingArticle.source;
              }
            } else {
              console.warn(`Could not find full URL for article: ${article.title}`);
            }
          }

          return article;
        });
      }

      return parsed;
    } catch (e) {
      // Log the raw response for debugging
      console.error('Failed to parse AI response:', e);
      console.error('Raw response:', summary);

      // If not JSON, create a basic structure
      return {
        executive_summary: summary.slice(0, 500),
        key_developments: [`Summary: ${summary.slice(0, 200)}`],
        notable_articles: articles.slice(0, 3).map(a => ({
          title: a.title,
          url: a.url,
          source: a.source,
          why_important: 'Relevant to today\'s developments'
        })),
        sentiment_summary: 'Unable to determine',
        trends: 'See executive summary',
        what_to_watch: 'Monitor for updates'
      };
    }
  }
}
