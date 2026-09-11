import type { ProjectConfig } from '../config/schema';

/**
 * Fails the run when the store's configured search engine is unreachable.
 *
 * A dead OpenSearch/Elasticsearch does not take the storefront down — the
 * homepage, cart and checkout all keep working. What breaks is every category
 * listing and every search, and they break as selector timeouts: "expected 1
 * product tile, found 0". That reads as a broken theme or a broken suite, and
 * it cost three separate diagnosis cycles in one day before this existed.
 *
 * Checked through `shell.exec` rather than from the test runner's host,
 * because the engine is usually only addressable from inside the store's own
 * network (`opensearch:9200` on a compose network, for instance). The hooks
 * reject on a non-zero exit, which is what turns this into a hard failure.
 *
 * Reads the engine's host and port from the store's own configuration rather
 * than assuming: `catalog/search/<engine>_server_hostname`, falling back to
 * Magento's own defaults when the store has never overridden them.
 *
 * A third-party engine may keep its connection details somewhere else
 * entirely. Smile ElasticSuite is the one we hit: it sets
 * `catalog/search/engine` to `elasticsuite` and stores its servers under
 * `smile_elasticsuite_core_base_settings/es_client/servers`, so the
 * `catalog/search/elasticsuite_server_hostname` this guard used to look for
 * does not exist and never will. That made the guard refuse to run against a
 * perfectly healthy store — the one failure mode it must never produce — so it
 * now falls through to the engine's own path before giving up.
 */
export async function assertSearchEngineReachable(config: ProjectConfig): Promise<void> {
  if (!config.shell?.exec) {
    console.log('[e2e-core] No shell.exec hook configured — skipping search engine check.');
    return;
  }

  // Magento's own config, not raw core_config_data.
  //
  // A store that has never overridden `catalog/search/engine` has no row for
  // it, and the effective value comes from config.xml — so reading the table
  // directly means guessing the engine, then looking up a hostname key that
  // does not exist, then probing a default host that was never the right one.
  // A real store here (elasticsearch7_server_hostname set, engine unset) would
  // have been reported unreachable while perfectly healthy, which is the one
  // failure mode this guard must never produce.
  //
  // Bootstrapping Magento costs a second or two and gives the values the store
  // actually uses, defaults included.
  const script = [
    '<?php',
    'require "app/bootstrap.php";',
    'try {',
    '  $bootstrap = \\Magento\\Framework\\App\\Bootstrap::create(BP, $_SERVER);',
    '  $objectManager = $bootstrap->getObjectManager();',
    '  $scopeConfig = $objectManager->get(\\Magento\\Framework\\App\\Config\\ScopeConfigInterface::class);',
    '} catch (Throwable $e) {',
    '  fwrite(STDERR, "cannot bootstrap Magento: " . $e->getMessage() . "\n");',
    '  exit(1);',
    '}',
    '$engine = (string) $scopeConfig->getValue("catalog/search/engine");',
    'if ($engine === "") {',
    '  fwrite(STDERR, "no catalog/search/engine configured\n");',
    '  exit(1);',
    '}',
    '$host = (string) $scopeConfig->getValue("catalog/search/" . $engine . "_server_hostname");',
    '$port = (string) $scopeConfig->getValue("catalog/search/" . $engine . "_server_port");',
    '// Engines that keep their connection details outside catalog/search.',
    '// ElasticSuite: one or more "host:port" entries, comma separated.',
    'if ($host === "") {',
    '  $servers = (string) $scopeConfig->getValue("smile_elasticsuite_core_base_settings/es_client/servers");',
    '  if ($servers !== "") {',
    '    $first = trim(explode(",", $servers)[0]);',
    '    $parts = explode(":", $first);',
    '    $host = $parts[0];',
    '    if (isset($parts[1]) && $parts[1] !== "") { $port = $parts[1]; }',
    '  }',
    '}',
    'if ($host === "") { $host = "localhost"; }',
    'if ($port === "") { $port = "9200"; }',
    '$socket = @fsockopen($host, (int) $port, $errno, $errstr, 5);',
    'if (!$socket) {',
    '  fwrite(STDERR, "search engine " . $engine . " at " . $host . ":" . $port . " is unreachable (" . $errstr . ")\n");',
    '  exit(1);',
    '}',
    'fclose($socket);',
    'echo "search engine " . $engine . " at " . $host . ":" . $port . " is reachable\n";',
  ].join('\n');

  const encoded = Buffer.from(script, 'utf-8').toString('base64');

  try {
    await config.shell.exec(`echo ${encoded} | base64 -d | php`);
  } catch {
    throw new Error(
      '[e2e-core] REFUSING TO RUN: the store\'s configured search engine is not reachable ' +
        'from the store itself.\n' +
        'Every category listing and every search would fail as a selector timeout — ' +
        '"expected products, found none" — which looks like a broken theme rather than ' +
        'a missing service.\n' +
        'On Warden: `warden env up` (the search container is easy to leave stopped). ' +
        'On the docker stack: tests/docker/run.sh up <target>.\n' +
        'Then reindex: bin/magento indexer:reindex catalogsearch_fulltext',
    );
  }
}
