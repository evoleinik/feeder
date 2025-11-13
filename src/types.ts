export interface Article {
  id?: number;
  url: string;
  title: string;
  source: string;
  topic: string;
  content: string;
  published_date: string;
  fetched_date?: string;
}

export interface Analysis {
  id?: number;
  article_id: number;
  summary: string;
  themes: string[];
  sentiment_score: number;
  sentiment_reasoning: string;
  analyzed_date?: string;
}

export interface ArticleLink {
  url: string;
  title: string;
  topic: string;
}

export interface DailyDigest {
  date: string;
  topics: {
    [topicName: string]: ArticleResult[];
  };
  stats: {
    total: number;
    avgSentiment: number;
  };
}

export interface ArticleResult {
  article: Article;
  analysis: Analysis;
}

export interface Config {
  imap: {
    host: string;
    port: number;
    user: string;
    password: string;
  };
  anthropic: {
    apiKey: string;
  };
  slack: {
    webhookUrl: string;
  };
  cron: {
    schedule: string;
  };
}
