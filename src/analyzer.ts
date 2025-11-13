import { Article, Analysis } from './types';
import { AIProvider } from './providers/base';

export class ArticleAnalyzer {
  private provider: AIProvider;

  constructor(provider: AIProvider) {
    this.provider = provider;
    console.log(`Using AI provider: ${provider.getName()}`);
  }

  async analyzeArticle(article: Article): Promise<Omit<Analysis, 'id' | 'analyzed_date'>> {
    try {
      const result = await this.provider.analyze(article);

      return {
        article_id: article.id!,
        summary: result.summary,
        themes: result.themes,
        sentiment_score: result.sentiment_score,
        sentiment_reasoning: result.sentiment_reasoning
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
}
