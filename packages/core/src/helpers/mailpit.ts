import { expect } from '@playwright/test';

export interface MailpitQuerySegment {
  key?: string;
  value: string;
}

export class MailpitQuery {
  segments: MailpitQuerySegment[] = [];

  add(segment: MailpitQuerySegment): this {
    this.segments.push(segment);
    return this;
  }

  /**
   * Builds a Mailpit search query string.
   * Examples:
   *   subject:"Welcome to Main Website Store" to:"user@example.com"
   *   subject:"Contact Form" someUniqueToken
   */
  toString(): string {
    return this.segments
      .map((s) => (s.key ? `${s.key}:"${s.value}"` : s.value))
      .join(' ')
      .trim();
  }
}

/** The subset of Mailpit's search response the suite reads. */
export interface MailpitSearchResult {
  messages_count: number;
  messages: Array<Record<string, unknown>>;
}

export class Mailpit {
  readonly baseUrl: string;

  constructor(mailpitUrl: string) {
    if (!mailpitUrl) {
      throw new Error('mailpitUrl is required to initialise the Mailpit client');
    }
    this.baseUrl = mailpitUrl.replace(/\/+$/, '');
  }

  // ponytail: a plain fetch against Mailpit's documented search endpoint.
  // The mailpit-api client this replaced dragged in axios, ws, isomorphic-ws,
  // form-data and follow-redirects to do the same single GET.
  async searchInbox(query: MailpitQuery): Promise<MailpitSearchResult> {
    const url = `${this.baseUrl}/api/v1/search?query=${encodeURIComponent(query.toString())}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Mailpit search failed: ${response.status} ${response.statusText} (${url})`,
      );
    }
    return (await response.json()) as MailpitSearchResult;
  }

  /**
   * The first link in the newest message matching `segments` whose URL matches
   * `pattern`.
   *
   * Polls like `waitForMessage` does: until it arrives, a mail that is merely
   * slow is indistinguishable from one that is never coming.
   *
   * Magento's own templates are HTML, so the href arrives HTML-escaped and a
   * reset link's `&token=` reads as `&amp;token=`. Following that verbatim
   * lands on a page Magento treats as having no token at all, which reads
   * like an expired link rather than a badly parsed one - so the entities are
   * decoded here.
   */
  async findLinkInMessage(
    segments: MailpitQuerySegment[],
    pattern: RegExp,
    options: { timeout?: number; message?: string } = {},
  ): Promise<string> {
    const query = new MailpitQuery();
    for (const segment of segments) query.add(segment);

    let link: string | undefined;
    await expect
      .poll(
        async () => {
          const { messages } = await this.searchInbox(query);
          const id = messages[0]?.ID;
          if (typeof id !== 'string') return false;

          const response = await fetch(`${this.baseUrl}/api/v1/message/${id}`);
          if (!response.ok) return false;
          const body = (await response.json()) as { HTML?: string; Text?: string };

          // Both parts: Magento ships HTML, but a store that has replaced the
          // template with a plain-text one still has to be reachable.
          const found = `${body.HTML ?? ''}\n${body.Text ?? ''}`.match(pattern)?.[0];
          link = found?.replace(/&amp;/g, '&');
          return Boolean(link);
        },
        {
          message:
            options.message ??
            `Mailpit should receive a message matching ${query} carrying a link matching ${pattern}`,
          timeout: options.timeout ?? 15_000,
        },
      )
      .toBeTruthy();

    return link as string;
  }

  /**
   * Polls the inbox until a message matching every segment arrives.
   * Segments with a `key` match that header (`subject`, `to`, ...); a segment
   * without one is a free-text search over the message body.
   *
   *   await mailpit.waitForMessage([
   *     { key: 'subject', value: 'Invoice for your Main Website Store order' },
   *     { key: 'to', value: customerEmail },
   *     { value: orderNumber },
   *   ])
   */
  async waitForMessage(
    segments: MailpitQuerySegment[],
    options: { timeout?: number; message?: string } = {},
  ): Promise<void> {
    const query = new MailpitQuery();
    for (const segment of segments) query.add(segment);

    await expect
      .poll(async () => (await this.searchInbox(query)).messages_count > 0, {
        message: options.message ?? `Mailpit should receive a message matching: ${query}`,
        timeout: options.timeout ?? 15_000,
      })
      .toBeTruthy();
  }
}
