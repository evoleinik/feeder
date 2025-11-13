import Anthropic from '@anthropic-ai/sdk';
import { Article, Analysis } from './types';

export class ArticleAnalyzer {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async analyzeArticle(article: Article): Promise<Omit<Analysis, 'id' | 'analyzed_date'>> {
    const prompt = `Analyze this article about ${article.topic}:

Title: ${article.title}
Source: ${article.source}
Content: ${article.content.slice(0, 4000)}

Provide a JSON response with:
1. "summary": 2-3 sentence summary of the article
2. "themes": array of 2-4 key themes/topics (lowercase, concise)
3. "sentiment_score": float from -1.0 (very negative) to 1.0 (very positive)
4. "sentiment_reasoning": one sentence explaining the sentiment score

Sentiment scale:
- 1.0: Very positive (breakthroughs, major success)
- 0.5: Positive (progress, optimism)
- 0.0: Neutral (informational, balanced)
- -0.5: Negative (challenges, concerns)
- -1.0: Very negative (failures, major problems)

Respond with valid JSON only, no other text.`;

    try {
      const response = await this.client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const textContent = response.content[0];
      if (textContent.type !== 'text') {
        throw new Error('Expected text response from Claude');
      }

      // Extract JSON from response
      let jsonText = textContent.text.trim();

      // Remove markdown code blocks if present
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');

      const result = JSON.parse(jsonText);

      // Validate and normalize
      return {
        article_id: article.id!,
        summary: result.summary || 'No summary available',
        themes: Array.isArray(result.themes) ? result.themes : [],
        sentiment_score: this.normalizeSentiment(result.sentiment_score),
        sentiment_reasoning: result.sentiment_reasoning || 'No reasoning provided'
      };
    } catch (error) {
      console.error(`Failed to analyze article ${article.url}:`, error);

      // Return basic fallback analysis
      return {
        article_id: article.id!,
        summary: `Article from ${article.source} about ${article.topic}`,
        themes: [article.topic],
        sentiment_score: 0.0,
        sentiment_reasoning: 'Analysis failed, neutral sentiment assumed'
      };
    }
  }

  async analyzeMultiple(articles: Article[]): Promise<Analysis[]> {
    const analyses: Analysis[] = [];

    for (const article of articles) {
      console.log(`Analyzing: ${article.title}`);
      const analysis = await this.analyzeArticle(article);
      analyses.push(analysis as Analysis);

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return analyses;
  }

  private normalizeSentiment(score: any): number {
    const num = parseFloat(score);
    if (isNaN(num)) return 0.0;
    return Math.max(-1.0, Math.min(1.0, num));
  }
}
