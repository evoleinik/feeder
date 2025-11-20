import { Article, IntelligenceBrief, KeyDevelopment } from './types';
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
  "key_developments": [
    {
      "development": "Brief description of the key development (1-2 sentences)",
      "sources": [
        {
          "title": "article title",
          "url": "COMPLETE URL including https:// protocol",
          "source": "source domain"
        }
      ]
    }
  ],
  "sentiment_summary": "Overall mood: optimistic/cautious/neutral/hype - with brief reasoning",
  "trends": "What patterns do you see? Are we in early hype or practical implementation? 2-3 sentences.",
  "what_to_watch": "What questions are emerging? What might happen next? 2-3 sentences."
}

IMPORTANT:
- Include 3-5 key developments, consolidating similar stories
- Each development MUST have at least one source article with FULL URL (starting with https://)
- Multiple related articles can be grouped under one development

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
        key_developments: articles.slice(0, 5).map(a => ({
          development: a.title,
          sources: [{ title: a.title, url: a.url, source: a.source }]
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

      // Ensure key_developments sources have full URLs
      if (parsed.key_developments) {
        parsed.key_developments = parsed.key_developments.map((dev: any) => {
          if (dev.sources) {
            dev.sources = dev.sources.map((source: any) => {
              const hasValidUrl = source.url && (source.url.startsWith('http://') || source.url.startsWith('https://'));

              if (!hasValidUrl) {
                // Try to find the full URL from our articles
                let matchingArticle = articles.find(a =>
                  a.title.toLowerCase() === source.title.toLowerCase()
                ) || articles.find(a =>
                  a.title.toLowerCase().includes(source.title.toLowerCase()) ||
                  source.title.toLowerCase().includes(a.title.toLowerCase())
                );

                if (!matchingArticle && source.url) {
                  const domain = source.url.replace('www.', '');
                  matchingArticle = articles.find(a =>
                    a.url.includes(domain) || a.source.includes(domain)
                  );
                }

                if (matchingArticle) {
                  source.url = matchingArticle.url;
                  if (!source.source) {
                    source.source = matchingArticle.source;
                  }
                } else {
                  console.warn(`Could not find full URL for source: ${source.title}`);
                }
              }

              return source;
            });
          }
          return dev;
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
        key_developments: [{
          development: summary.slice(0, 200),
          sources: articles.slice(0, 1).map(a => ({ title: a.title, url: a.url, source: a.source }))
        }],
        sentiment_summary: 'Unable to determine',
        trends: 'See executive summary',
        what_to_watch: 'Monitor for updates'
      };
    }
  }
}
