import Anthropic from '@anthropic-ai/sdk';
import { Article } from '../types';
import { AIProvider, AnalysisResult } from './base';

export class ClaudeProvider implements AIProvider {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  getName(): string {
    return 'Claude (Anthropic)';
  }

  async analyze(article: Article): Promise<AnalysisResult> {
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

    let jsonText = textContent.text.trim();
    jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');

    const result = JSON.parse(jsonText);

    return {
      summary: result.summary || 'No summary available',
      themes: Array.isArray(result.themes) ? result.themes : [],
      sentiment_score: this.normalizeSentiment(result.sentiment_score),
      sentiment_reasoning: result.sentiment_reasoning || 'No reasoning provided'
    };
  }

  private normalizeSentiment(score: any): number {
    const num = parseFloat(score);
    if (isNaN(num)) return 0.0;
    return Math.max(-1.0, Math.min(1.0, num));
  }
}
