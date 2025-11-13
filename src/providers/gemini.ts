import { GoogleGenerativeAI } from '@google/generative-ai';
import { Article } from '../types';
import { AIProvider, AnalysisResult } from './base';

export class GeminiProvider implements AIProvider {
  private client: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  getName(): string {
    return 'Google Gemini';
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

    const model = this.client.getGenerativeModel({ model: 'gemini-1.5-pro' });

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    let jsonText = text.trim();
    jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');

    const parsed = JSON.parse(jsonText);

    return {
      summary: parsed.summary || 'No summary available',
      themes: Array.isArray(parsed.themes) ? parsed.themes : [],
      sentiment_score: this.normalizeSentiment(parsed.sentiment_score),
      sentiment_reasoning: parsed.sentiment_reasoning || 'No reasoning provided'
    };
  }

  private normalizeSentiment(score: any): number {
    const num = parseFloat(score);
    if (isNaN(num)) return 0.0;
    return Math.max(-1.0, Math.min(1.0, num));
  }
}
