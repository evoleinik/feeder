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

export interface ArticleLink {
  url: string;
  title: string;
  topic: string;
}

export interface NotableArticle {
  title: string;
  url: string;
  source: string;
  why_important: string;
}

export interface IntelligenceBrief {
  id?: number;
  date: string;
  executive_summary: string;
  key_developments: string[];
  notable_articles: NotableArticle[];
  sentiment_summary: string;
  trends: string;
  what_to_watch: string;
  article_count: number;
  raw_ai_response?: string;
  created_date?: string;
}

export interface Config {
  imap: {
    host: string;
    port: number;
    user: string;
    password: string;
    maxPerRun: number;
  };
  ai: {
    provider: 'claude' | 'openai' | 'gemini';
    apiKeys: {
      anthropic?: string;
      openai?: string;
      gemini?: string;
    };
  };
  slack: {
    webhookUrl: string;
  };
  cron: {
    schedule: string;
  };
  brief: {
    domain: string;
    title: string;
  };
}
