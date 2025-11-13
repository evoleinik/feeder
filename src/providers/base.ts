import { Article } from '../types';

export interface AnalysisResult {
  summary: string;
  themes: string[];
  sentiment_score: number;
  sentiment_reasoning: string;
}

export interface AIProvider {
  analyze(article: Article): Promise<AnalysisResult>;
  getName(): string;
}
