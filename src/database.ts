import Database from 'better-sqlite3';
import path from 'path';
import { Article } from './types';

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

      CREATE TABLE IF NOT EXISTS daily_briefs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT UNIQUE NOT NULL,
        executive_summary TEXT,
        key_developments TEXT,
        notable_articles TEXT,
        sentiment_summary TEXT,
        trends TEXT,
        what_to_watch TEXT,
        article_count INTEGER,
        raw_ai_response TEXT,
        created_date TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_articles_url ON articles(url);
      CREATE INDEX IF NOT EXISTS idx_articles_topic ON articles(topic);
      CREATE INDEX IF NOT EXISTS idx_articles_date ON articles(fetched_date);
      CREATE INDEX IF NOT EXISTS idx_briefs_date ON daily_briefs(date);
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

  insertDailyBrief(brief: any): number {
    const stmt = this.db.prepare(`
      INSERT INTO daily_briefs (
        date,
        executive_summary,
        key_developments,
        notable_articles,
        sentiment_summary,
        trends,
        what_to_watch,
        article_count,
        raw_ai_response
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      brief.date,
      brief.executive_summary,
      JSON.stringify(brief.key_developments),
      JSON.stringify(brief.notable_articles),
      brief.sentiment_summary,
      brief.trends,
      brief.what_to_watch,
      brief.article_count,
      brief.raw_ai_response || null
    );

    return result.lastInsertRowid as number;
  }

  getBriefForDate(date: string): any | null {
    const stmt = this.db.prepare('SELECT * FROM daily_briefs WHERE date = ?');
    const row = stmt.get(date) as any;

    if (!row) return null;

    return {
      ...row,
      key_developments: JSON.parse(row.key_developments),
      notable_articles: JSON.parse(row.notable_articles)
    };
  }

  getArticlesForDate(date: string): Article[] {
    const stmt = this.db.prepare(`
      SELECT * FROM articles
      WHERE DATE(fetched_date) = ?
      ORDER BY fetched_date DESC
    `);

    return stmt.all(date) as Article[];
  }

  getRecentArticles(days: number = 1): Article[] {
    const stmt = this.db.prepare(`
      SELECT * FROM articles
      WHERE datetime(fetched_date) >= datetime('now', '-' || ? || ' days')
      ORDER BY fetched_date DESC
    `);

    return stmt.all(days) as Article[];
  }

  close() {
    this.db.close();
  }
}

export default DatabaseManager;
