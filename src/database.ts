import Database from 'better-sqlite3';
import path from 'path';
import { Article, Analysis } from './types';

const DB_PATH = path.join(__dirname, '../db/alerts.db');

class DatabaseManager {
  private db: Database.Database;

  constructor() {
    this.db = new Database(DB_PATH);
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS articles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT UNIQUE NOT NULL,
        title TEXT,
        source TEXT,
        topic TEXT,
        content TEXT,
        published_date TEXT,
        fetched_date TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS analysis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        article_id INTEGER NOT NULL,
        summary TEXT,
        themes TEXT,
        sentiment_score REAL,
        sentiment_reasoning TEXT,
        analyzed_date TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (article_id) REFERENCES articles(id)
      );

      CREATE INDEX IF NOT EXISTS idx_articles_url ON articles(url);
      CREATE INDEX IF NOT EXISTS idx_articles_topic ON articles(topic);
      CREATE INDEX IF NOT EXISTS idx_analysis_article ON analysis(article_id);
    `);
  }

  articleExists(url: string): boolean {
    const stmt = this.db.prepare('SELECT id FROM articles WHERE url = ?');
    return stmt.get(url) !== undefined;
  }

  insertArticle(article: Article): number {
    const stmt = this.db.prepare(`
      INSERT INTO articles (url, title, source, topic, content, published_date)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      article.url,
      article.title,
      article.source,
      article.topic,
      article.content,
      article.published_date
    );

    return result.lastInsertRowid as number;
  }

  insertAnalysis(analysis: Analysis): number {
    const stmt = this.db.prepare(`
      INSERT INTO analysis (article_id, summary, themes, sentiment_score, sentiment_reasoning)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      analysis.article_id,
      analysis.summary,
      JSON.stringify(analysis.themes),
      analysis.sentiment_score,
      analysis.sentiment_reasoning
    );

    return result.lastInsertRowid as number;
  }

  getArticleWithAnalysis(articleId: number): { article: Article; analysis: Analysis } | null {
    const articleStmt = this.db.prepare('SELECT * FROM articles WHERE id = ?');
    const analysisStmt = this.db.prepare('SELECT * FROM analysis WHERE article_id = ?');

    const article = articleStmt.get(articleId) as Article | undefined;
    const analysisRow = analysisStmt.get(articleId) as any;

    if (!article || !analysisRow) return null;

    const analysis: Analysis = {
      ...analysisRow,
      themes: JSON.parse(analysisRow.themes)
    };

    return { article, analysis };
  }

  getRecentArticles(days: number = 7): Array<{ article: Article; analysis: Analysis }> {
    const stmt = this.db.prepare(`
      SELECT
        a.*,
        an.id as analysis_id,
        an.summary,
        an.themes,
        an.sentiment_score,
        an.sentiment_reasoning,
        an.analyzed_date
      FROM articles a
      JOIN analysis an ON a.id = an.article_id
      WHERE datetime(a.fetched_date) >= datetime('now', '-' || ? || ' days')
      ORDER BY a.fetched_date DESC
    `);

    const rows = stmt.all(days) as any[];

    return rows.map(row => ({
      article: {
        id: row.id,
        url: row.url,
        title: row.title,
        source: row.source,
        topic: row.topic,
        content: row.content,
        published_date: row.published_date,
        fetched_date: row.fetched_date
      },
      analysis: {
        id: row.analysis_id,
        article_id: row.id,
        summary: row.summary,
        themes: JSON.parse(row.themes),
        sentiment_score: row.sentiment_score,
        sentiment_reasoning: row.sentiment_reasoning,
        analyzed_date: row.analyzed_date
      }
    }));
  }

  close() {
    this.db.close();
  }
}

export default DatabaseManager;
