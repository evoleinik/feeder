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

  async createBrief(articles: Article[], date: string, historicalBriefs: any[] = []): Promise<IntelligenceBrief> {
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
      // Prepare article summaries for AI (limit content to stay within token limits)
      const contentLimit = Math.min(1500, Math.floor(8000 / articles.length));
      const articleSummaries = articles.map((article, idx) =>
        `[${idx + 1}] ${article.title}\nURL: ${article.url}\nSource: ${article.source}\nTopic: ${article.topic}\nContent: ${article.content.slice(0, contentLimit)}...\n`
      ).join('\n');

      // Build historical context
      const historicalContext = this.buildHistoricalContext(historicalBriefs);

      const prompt = `Intelligence analyst for ${this.domain}. Create a TERSE, information-dense daily brief.
${historicalContext}

Articles (${articles.length}):
${articleSummaries}

JSON response:
{
  "executive_summary": "1-2 sentences. What's the big picture today? No filler.",
  "key_developments": [
    {
      "development": "Headline: WHO did WHAT. Short, telegraphic.",
      "key_takeaways": ["Unique insight NOT obvious from headline", "Another non-obvious detail"],
      "sources": [{"title": "...", "url": "FULL https:// URL", "source": "domain"}]
    }
  ],
  "sentiment_summary": "One word (optimistic/cautious/neutral/hype) + why in <10 words",
  "trends": "1 sentence. Hype or real adoption?",
  "what_to_watch": "1 sentence. What's the next domino?"
}

RULES:
- 3-5 developments. CONSOLIDATE same story from multiple sources into ONE development.
- key_takeaways must ADD information, NOT repeat the headline.
  BAD: headline "Visa partners with AWS" → takeaway "Partnership aims to enhance commerce" (useless)
  GOOD: headline "Visa + AWS launch agent toolkit" → takeaway "First payment network with agent-to-agent APIs"
- No filler: "aims to", "seeks to", "this collaboration", "this partnership"
- Be specific: numbers, names, what's actually new
- Skip developments already covered in previous briefs unless major update
- Each source needs FULL URL starting with https://

RESPOND WITH ONLY RAW JSON.`;

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
        article_count: articles.length,
        is_fallback: true
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

  private buildHistoricalContext(briefs: any[]): string {
    if (!briefs || briefs.length === 0) {
      return '';
    }

    const sections: string[] = ['HISTORICAL CONTEXT (previous briefs):'];

    // Previous key developments
    const developments: string[] = [];
    for (const brief of briefs.slice(0, 5)) {
      if (brief.key_developments && brief.key_developments.length > 0) {
        for (const dev of brief.key_developments) {
          developments.push(`- [${brief.date}] ${dev.development}`);
        }
      }
    }
    if (developments.length > 0) {
      sections.push('\nPrevious key developments:');
      sections.push(developments.slice(0, 15).join('\n'));
    }

    // What to watch from previous briefs
    const watchItems: string[] = [];
    for (const brief of briefs.slice(0, 3)) {
      if (brief.what_to_watch) {
        watchItems.push(`- [${brief.date}] ${brief.what_to_watch}`);
      }
    }
    if (watchItems.length > 0) {
      sections.push('\nPrevious "what to watch" items:');
      sections.push(watchItems.join('\n'));
    }

    // Recent sentiment trend
    const sentiments: string[] = [];
    for (const brief of briefs.slice(0, 3)) {
      if (brief.sentiment_summary) {
        sentiments.push(`- [${brief.date}] ${brief.sentiment_summary.slice(0, 100)}`);
      }
    }
    if (sentiments.length > 0) {
      sections.push('\nRecent sentiment:');
      sections.push(sentiments.join('\n'));
    }

    return sections.join('\n') + '\n';
  }
}
