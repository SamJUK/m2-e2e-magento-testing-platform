import type { ProjectConfig } from '../config/schema';
import { loadData } from '../data';

const ATTEMPTS = 5;
const RETRY_DELAY_MS = 3000;

/**
 * Fails the run when the store's search cannot return the products the search
 * tests expect.
 *
 * A dead OpenSearch/Elasticsearch does not take the storefront down. The
 * homepage, cart and checkout all keep working. What breaks is every category
 * listing and every search, and they break as selector timeouts: "expected 1
 * product tile, found 0". That reads as a broken theme or a broken suite, and
 * it cost three separate diagnosis cycles in one day before this existed.
 *
 * Asks the store to search rather than working out where the engine lives.
 * This guard used to read the engine's host from
 * `catalog/search/<engine>_server_hostname` and open a socket to it. Engines
 * keep their connection details wherever they like (ElasticSuite under
 * `smile_elasticsuite_core_base_settings`, Amasty under
 * `amasty_elastic/connection`), so the lookup needed a list of engines that
 * could never be complete, and every engine missing from it made the guard
 * refuse a healthy store, the one failure mode it must never produce.
 * `/V1/search` goes through the same adapter as the storefront whatever the
 * engine, and is anonymous in stock Magento.
 *
 * Passes on hits, not on status. Magento's own OpenSearch adapter catches a
 * connection failure, logs it and returns an empty result, and Amasty's does
 * the same, so a dead engine answers 200 with nothing in it. Zero hits also
 * covers an index that was never built, which fails the search tests just the
 * same and which the socket check could not see.
 */
export async function assertSearchEngineReachable(config: ProjectConfig): Promise<void> {
  const term = loadData({ projectRoot: process.cwd() }).inputs.search.query;
  const url = new URL('rest/V1/search', config.baseUrl.replace(/\/?$/, '/'));
  url.searchParams.set('searchCriteria[requestName]', 'quick_search_container');
  url.searchParams.set('searchCriteria[filterGroups][0][filters][0][field]', 'search_term');
  url.searchParams.set('searchCriteria[filterGroups][0][filters][0][value]', term);

  let problem = '';

  // Retried because an engine that has just started accepts connections before
  // its shards recover, and answers with no hits for a few seconds.
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    if (attempt > 1) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));

    let response: Response;
    try {
      response = await fetch(url, { headers: { Accept: 'application/json' } });
    } catch (error) {
      const cause = (error as Error & { cause?: Error }).cause;
      problem = `${url.origin} is unreachable (${cause?.message ?? (error as Error).message})`;
      continue;
    }

    if (response.status >= 500) {
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      problem = `/V1/search answered ${response.status}${body.message ? `: ${body.message}` : ''}`;
      continue;
    }

    if (!response.ok) {
      // Blocked at the web server, by a WAF, or by a module that locks down
      // anonymous REST. That says nothing about the engine, and refusing here
      // would refuse a healthy store.
      console.warn(
        `[e2e-core] Search check skipped: /V1/search answered ${response.status}, ` +
          'so the search engine could not be checked.',
      );
      return;
    }

    const { total_count: hits } = (await response.json()) as { total_count: number };
    if (hits > 0) {
      console.log(`[e2e-core] Search returned ${hits} results for "${term}".`);
      return;
    }
    problem = `searching for "${term}" returned no products`;
  }

  throw new Error(
    `[e2e-core] REFUSING TO RUN: ${problem}.\n` +
      'Every category listing and every search would fail as a selector timeout, which ' +
      'looks like a broken theme rather than a missing service.\n' +
      'Check the search engine is running (Warden: `warden env up`; the docker stack: ' +
      'tests/docker/run.sh up <target>), then reindex: ' +
      'bin/magento indexer:reindex catalogsearch_fulltext\n' +
      'If the catalogue genuinely has nothing matching, set inputs.search.query in ' +
      'config/inputs.json.',
  );
}
