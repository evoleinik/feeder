import { IncomingWebhook } from '@slack/webhook';
import { IntelligenceBrief } from './types';

export class SlackMessenger {
  private webhook: IncomingWebhook;
  private briefTitle: string;

  constructor(webhookUrl: string, briefTitle: string) {
    this.webhook = new IncomingWebhook(webhookUrl);
    this.briefTitle = briefTitle;
  }

  async sendIntelligenceBrief(brief: IntelligenceBrief): Promise<void> {
    if (brief.article_count === 0) {
      await this.sendEmptyBrief(brief.date);
      return;
    }

    const blocks: any[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `:newspaper: ${this.briefTitle} - ${brief.date}`
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${brief.article_count} articles analyzed*`
        }
      },
      {
        type: 'divider'
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*:bulb: Executive Summary*\n${brief.executive_summary}`
        }
      }
    ];

    // Key Developments
    if (brief.key_developments.length > 0) {
      const developmentsText = brief.key_developments.map((dev, idx) => {
        const takeawaysText = dev.key_takeaways?.length
          ? '\n' + dev.key_takeaways.map(t => `    • ${t}`).join('\n')
          : '';
        const sourcesText = dev.sources.map(s => `<${s.url}|${s.source}>`).join(' • ');
        return `${idx + 1}. ${dev.development}${takeawaysText}\n    _Sources: ${sourcesText}_`;
      }).join('\n\n');

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*:star: Key Developments*\n${developmentsText}`
        }
      });
    }

    // Sentiment & Trends
    blocks.push({
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*:chart_with_upwards_trend: Sentiment*\n${brief.sentiment_summary}`
        },
        {
          type: 'mrkdwn',
          text: `*:telescope: Trends*\n${brief.trends}`
        }
      ]
    });

    // What to Watch
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*:eyes: What to Watch*\n${brief.what_to_watch}`
      }
    });

    await this.webhook.send({
      blocks,
      text: `${this.briefTitle} - ${brief.date}`
    });

    console.log('Intelligence brief sent to Slack successfully');
  }

  private async sendEmptyBrief(date: string): Promise<void> {
    await this.webhook.send({
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `:newspaper: ${this.briefTitle} - ${date}`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: ':mailbox_with_no_mail: No new articles found today'
          }
        }
      ],
      text: `${this.briefTitle} - ${date} (No articles)`
    });

    console.log('Empty brief sent to Slack');
  }
}
