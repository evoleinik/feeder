import Imap from 'imap';
import { simpleParser } from 'mailparser';
import { Config } from './types';

interface EmailMessage {
  subject: string;
  from: string;
  html: string;
  date: Date;
}

export class EmailFetcher {
  private config: Config['imap'];

  constructor(config: Config['imap']) {
    this.config = config;
  }

  async fetchGoogleAlerts(): Promise<EmailMessage[]> {
    return new Promise((resolve, reject) => {
      const imap = new Imap({
        user: this.config.user,
        password: this.config.password,
        host: this.config.host,
        port: this.config.port,
        tls: true,
        tlsOptions: { rejectUnauthorized: false }
      });

      const messages: EmailMessage[] = [];

      imap.once('ready', () => {
        imap.openBox('INBOX', false, (err, box) => {
          if (err) {
            imap.end();
            return reject(err);
          }

          // Search for unread emails from Google Alerts
          imap.search(['UNSEEN', ['FROM', 'googlealerts-noreply@google.com']], (err, results) => {
            if (err) {
              imap.end();
              return reject(err);
            }

            if (!results || results.length === 0) {
              console.log('No new Google Alerts emails found');
              imap.end();
              return resolve([]);
            }

            const fetch = imap.fetch(results, { bodies: '' });

            fetch.on('message', (msg) => {
              msg.on('body', (stream: any) => {
                simpleParser(stream, (err: any, parsed: any) => {
                  if (err) {
                    console.error('Error parsing email:', err);
                    return;
                  }

                  if (parsed.html) {
                    messages.push({
                      subject: parsed.subject || '',
                      from: parsed.from?.text || '',
                      html: parsed.html as string,
                      date: parsed.date || new Date()
                    });
                  }
                });
              });

              msg.once('attributes', (attrs) => {
                // Mark as read
                imap.addFlags(attrs.uid, ['\\Seen'], (err) => {
                  if (err) console.error('Error marking email as read:', err);
                });
              });
            });

            fetch.once('error', (err) => {
              console.error('Fetch error:', err);
              imap.end();
              reject(err);
            });

            fetch.once('end', () => {
              imap.end();
            });
          });
        });
      });

      imap.once('error', (err: Error) => {
        console.error('IMAP error:', err);
        reject(err);
      });

      imap.once('end', () => {
        resolve(messages);
      });

      imap.connect();
    });
  }
}
