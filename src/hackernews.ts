import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ArticleLink } from './types';
import { ProviderType } from './providers/factory';

interface HNItem {
  title: string;
  url: string;
}

export class HackerNewsFetcher {
  private providerType: ProviderType;
  private apiKey: string;
  private domain: string;

  constructor(providerType: ProviderType, apiKey: string, domain: string) {
    this.providerType = providerType;
    this.apiKey = apiKey;
    this.domain = domain;
  }

  async fetchRelevantArticles(): Promise<ArticleLink[]> {
    console.log('Fetching Hacker News front page...');

    // Fetch HN front page items
    const items = await this.fetchFrontPage();
    console.log(`Found ${items.length} items on HN front page`);

    if (items.length === 0) {
      return [];
    }

    // Use LLM to filter relevant articles
    console.log('Filtering articles with AI...');
    const relevantItems = await this.filterWithLLM(items);
    console.log(`Found ${relevantItems.length} relevant article(s)`);

    return relevantItems.map(item => ({
      url: item.url,
      title: item.title,
      topic: 'hacker news'
    }));
  }

  private async fetchFrontPage(): Promise<HNItem[]> {
    // Fetch top story IDs
    const topStoriesRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
    const storyIds: number[] = await topStoriesRes.json();

    // Fetch first 30 stories
    const items: HNItem[] = [];
    const top30 = storyIds.slice(0, 30);

    for (const id of top30) {
      const itemRes = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
      const item = await itemRes.json();

      if (item && item.url && item.title) {
        items.push({
          title: item.title,
          url: item.url
        });
      }
    }

    return items;
  }

  private async filterWithLLM(items: HNItem[]): Promise<HNItem[]> {
    const itemsList = items.map((item, i) => `${i + 1}. ${item.title}`).join('\n');

    const prompt = `You are filtering Hacker News articles for relevance to: ${this.domain}

Here are the article titles:
${itemsList}

Return a JSON array of the numbers (1-indexed) of articles that are relevant to ${this.domain}. Be selective - only include articles that are clearly related. If none are relevant, return an empty array.

Example response: [1, 5, 12]

Respond with only the JSON array, no other text.`;

    const relevantIndices = await this.callLLM(prompt);

    return relevantIndices
      .filter(i => i >= 1 && i <= items.length)
      .map(i => items[i - 1]);
  }

  private async callLLM(prompt: string): Promise<number[]> {
    try {
      let response: string;

      switch (this.providerType) {
        case 'openai':
          response = await this.callOpenAI(prompt);
          break;
        case 'claude':
          response = await this.callClaude(prompt);
          break;
        case 'gemini':
          response = await this.callGemini(prompt);
          break;
        default:
          throw new Error(`Unknown provider: ${this.providerType}`);
      }

      // Parse JSON array from response
      const match = response.match(/\[[\d,\s]*\]/);
      if (match) {
        return JSON.parse(match[0]);
      }
      return [];
    } catch (error) {
      console.error('Error calling LLM:', error);
      return [];
    }
  }

  private async callOpenAI(prompt: string): Promise<string> {
    const client = new OpenAI({ apiKey: this.apiKey });
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 256,
      temperature: 0
    });
    return response.choices[0].message.content || '[]';
  }

  private async callClaude(prompt: string): Promise<string> {
    const client = new Anthropic({ apiKey: this.apiKey });
    const response = await client.messages.create({
      model: 'claude-3-5-haiku-latest',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }]
    });
    const content = response.content[0];
    return content.type === 'text' ? content.text : '[]';
  }

  private async callGemini(prompt: string): Promise<string> {
    const genAI = new GoogleGenerativeAI(this.apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    return result.response.text();
  }
}
