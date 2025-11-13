import { IncomingWebhook } from '@slack/webhook';
import { DailyDigest, ArticleResult } from './types';

export class SlackMessenger {
  private webhook: IncomingWebhook;

  constructor(webhookUrl: string) {
    this.webhook = new IncomingWebhook(webhookUrl);
  }

  async sendDailyDigest(digest: DailyDigest): Promise<void> {
    const blocks = this.buildMessageBlocks(digest);

    try {
      await this.webhook.send({
        text: `Daily Commerce AI Intelligence - ${digest.date}`,
        blocks
      });
      console.log('Daily digest sent to Slack successfully');
    } catch (error) {
      console.error('Failed to send to Slack:', error);
      throw error;
    }
  }

  private buildMessageBlocks(digest: DailyDigest): any[] {
    const blocks: any[] = [];

    // Header
    blocks.push({
      type: 'header',
      text: {
        type: 'plain_text',
        text: `📊 Daily Commerce AI Intelligence - ${digest.date}`
      }
    });

    blocks.push({ type: 'divider' });

    // Each topic section
    for (const [topicName, articles] of Object.entries(digest.topics)) {
      if (articles.length === 0) continue;

      const icon = topicName.includes('agentic') ? '🔶' : '🔷';

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${icon} *${topicName.toUpperCase()}* (${articles.length} new article${articles.length > 1 ? 's' : ''})`
        }
      });

      for (const result of articles) {
        const sentimentEmoji = this.getSentimentEmoji(result.analysis.sentiment_score);
        const sentimentText = this.getSentimentText(result.analysis.sentiment_score);

        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*<${result.article.url}|${result.article.title}>*\n` +
                  `${sentimentEmoji} Sentiment: ${sentimentText} (${result.analysis.sentiment_score.toFixed(2)})\n` +
                  `_${result.analysis.summary}_\n` +
                  `*Themes:* ${result.analysis.themes.join(', ')}\n` +
                  `*Source:* ${result.article.source}`
          }
        });
      }

      blocks.push({ type: 'divider' });
    }

    // Stats section
    if (digest.stats.total > 0) {
      const avgSentimentEmoji = this.getSentimentEmoji(digest.stats.avgSentiment);
      const avgSentimentText = this.getSentimentText(digest.stats.avgSentiment);

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `📈 *Quick Stats*\n` +
                `• Total articles processed: ${digest.stats.total}\n` +
                `• Average sentiment: ${avgSentimentEmoji} ${avgSentimentText} (${digest.stats.avgSentiment.toFixed(2)})`
        }
      });
    } else {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '📭 No new articles found today'
        }
      });
    }

    return blocks;
  }

  private getSentimentEmoji(score: number): string {
    if (score >= 0.5) return '😊';
    if (score >= 0.2) return '🙂';
    if (score >= -0.2) return '😐';
    if (score >= -0.5) return '😟';
    return '😞';
  }

  private getSentimentText(score: number): string {
    if (score >= 0.5) return 'Positive';
    if (score >= 0.2) return 'Slightly positive';
    if (score >= -0.2) return 'Neutral';
    if (score >= -0.5) return 'Slightly negative';
    return 'Negative';
  }
}
