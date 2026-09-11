#!/bin/sh
# Installs Magento into the stack. Idempotent: re-running against an installed
# store is a no-op unless FORCE_REINSTALL=1.
#
# Runs INSIDE the php container:  docker compose exec -T php e2e-install
set -eu

MAGE=/var/www/html/bin/magento
BASE_URL="${BASE_URL:-http://localhost:8080/}"
ADMIN_USER="${ADMIN_USER:-playwright}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Password1}"
ADMIN_EMAIL="${ADMIN_EMAIL:-playwright@example.com}"

cd /var/www/html

# Already-installed stores skip setup:install and everything that depends on a
# fresh database — but NOT the steps below it, which are idempotent and which a
# stack may legitimately need adding after the fact. Exiting outright here is
# what stopped the Hyva install from ever running on a stack that already had
# Magento: the only way to add Hyva was a full FORCE_REINSTALL, which is not
# what "idempotent" should mean.
FRESH_INSTALL=1
if [ "${FORCE_REINSTALL:-0}" != "1" ] && php "$MAGE" setup:db:status >/dev/null 2>&1; then
  echo "[e2e-install] Magento is already installed — skipping setup:install."
  FRESH_INSTALL=0
fi

if [ "$FRESH_INSTALL" = "1" ]; then

echo "[e2e-install] Installing Magento at ${BASE_URL}"
# --cleanup-database: a half-finished install leaves partial schema behind, and
# the next attempt dies on "Duplicate entry 'pending' for key 'PRIMARY'". The
# database here is disposable, so always start it from clean rather than
# leaving a retried CI job wedged.
php "$MAGE" setup:install \
  --cleanup-database \
  --base-url="${BASE_URL}" \
  --db-host=db --db-name=magento --db-user=magento --db-password=magento \
  --admin-firstname=E2E --admin-lastname=Test \
  --admin-email="${ADMIN_EMAIL}" \
  --admin-user="${ADMIN_USER}" --admin-password="${ADMIN_PASSWORD}" \
  --language=en_US --currency=USD --timezone=UTC \
  --use-rewrites=1 \
  --search-engine=opensearch --opensearch-host=opensearch --opensearch-port=9200 \
  --session-save=redis --session-save-redis-host=redis \
  --cache-backend=redis --cache-backend-redis-server=redis \
  --page-cache=redis --page-cache-redis-server=redis \
  --no-interaction

# Mailpit, so the transactional-email tests have somewhere to read from.
php "$MAGE" config:set system/smtp/transport smtp
php "$MAGE" config:set system/smtp/host mailpit
php "$MAGE" config:set system/smtp/port 1025

# Sample data. Both distros resolve it from a KEYLESS mirror — no Adobe
# marketplace credentials anywhere in this stack.
if [ "${WITH_SAMPLE_DATA:-1}" = "1" ]; then
  echo "[e2e-install] Deploying sample data"
  php "$MAGE" sampledata:deploy || {
    echo "[e2e-install] sampledata:deploy failed — check the composer mirror is reachable" >&2
    exit 1
  }
  php "$MAGE" setup:upgrade --no-interaction
fi

# Developer mode, deliberately.
#
# The image ships static content already deployed, but `setup:upgrade` (which
# sample data requires) clears pub/static in production mode, leaving the
# storefront 500ing on "Unable to retrieve deployment version of static files".
# The alternatives are re-running static-content:deploy on every install, which
# costs minutes, or developer mode, which generates static on demand. Developer
# mode also matches how the suite is run against real dev environments and
# surfaces real exceptions instead of an error-reference hash.
php "$MAGE" deploy:mode:set developer

# Turn the built-in (Redis) full page cache OFF.
#
# Magento 2.4.7 pointed `Magento\Framework\App\PageCache\IdentifierInterface`
# at `IdentifierForSave`, which builds the cache key from the request's HTTP
# *context* only — unlike the framework's own `Identifier`, it never reads the
# X-Magento-Vary cookie. On a cache LOOKUP that context is still empty (the
# plugin that fills it runs later, on action dispatch), so the built-in cache
# serves one entry to every visitor whatever their context. Switching currency
# is accepted by the session and then invisible: the redirect back, and every
# page after it, is a HIT of the page rendered in the base currency. Confirmed
# on this image — a request carrying a junk X-Magento-Vary cookie still HITs.
#
# Real stores front Magento with Varnish, whose VCL hashes that cookie
# explicitly, which is why this never bites them. Rather than exercise a cache
# that cannot vary, the stack runs without it; block, collection and config
# caching all stay on. Costs ~0.4s per storefront page here.
php "$MAGE" cache:disable full_page

php "$MAGE" indexer:reindex
php "$MAGE" cache:flush


fi   # end fresh-install-only section
# Hyva, on the hyva target only.
#
# The base images do not ship Hyva - it is commercial - so the theme is pulled
# in here from the licensed Private Packagist repo.
#
# Gated on THEME, not just on the credentials: installing Hyva switches
# design/theme/theme_id, and CI hands the credentials to every job, so a
# credentials-only gate would leave the Luma and Mage-OS targets asserting
# Luma selectors against a Hyva storefront. Missing credentials on the hyva
# target is a hard failure rather than a skip - a silently-skipped install
# yields a Luma store that the Hyva suite fails against for the wrong reason.
if [ "${THEME:-luma}" != "hyva" ]; then
  echo "[e2e-install] THEME=${THEME:-luma} - not installing Hyva"
elif [ -n "${HYVA_COMPOSER_USER:-}" ] && [ -n "${HYVA_COMPOSER_PASS:-}" ] && [ -n "${HYVA_COMPOSER_REPO:-}" ]; then
  # Matched on the output, not the exit code: `module:status` exits 0 even for
  # a module that does not exist ("Hyva_Theme : Module does not exist"), so an
  # exit-code check reports Hyva present on a store that has never seen it —
  # and the Hyva suite then runs against a Luma storefront, which is the exact
  # failure this whole target exists to avoid.
  if php "$MAGE" module:status Hyva_Theme 2>/dev/null | grep -q 'Module is enabled'; then
    echo "[e2e-install] Hyva already present"
  else
    echo "[e2e-install] Installing Hyva"
    composer config repositories.private-packagist composer "${HYVA_COMPOSER_REPO}"
    # Host taken from the repo URL rather than hardcoded: auth keyed to a
    # host the repo does not live on is simply never sent, and the failure
    # arrives as an opaque 403 from composer require.
    hyva_host=$(printf '%s' "${HYVA_COMPOSER_REPO}" | sed -E 's#^[a-z]+://([^/]+).*#\1#')
    composer config --auth "http-basic.${hyva_host}" \
      "${HYVA_COMPOSER_USER}" "${HYVA_COMPOSER_PASS}"
    # magento2-luma-checkout as well: Hyva ships no checkout of its own, and
    # its layout strips the stock checkout block, so without this the checkout
    # page renders a "No Checkout module installed." placeholder.
    composer require --no-interaction \
      hyva-themes/magento2-default-theme:^1.5 \
      hyva-themes/magento2-luma-checkout:^1.1
    php "$MAGE" setup:upgrade --no-interaction
  fi

  # Read from the theme table, not from a CLI command: Magento ships no
  # `theme:list` (it has theme:uninstall only), so the obvious-looking
  # command silently resolved nothing. Credentials and table prefix come
  # from env.php so this holds on any store, not just this stack's.
  #
  # Resolved, not guessed, and fatal if it does not resolve: a config:set
  # with an empty id leaves the store on Luma while the Hyva suite runs
  # against it, which reads as "every Hyva selector is broken".
  theme_id=$(php -r '
    $config = include "app/etc/env.php";
    $db = $config["db"]["connection"]["default"];
    $prefix = $config["db"]["table_prefix"] ?? "";
    $pdo = new PDO(
      "mysql:host={$db["host"]};dbname={$db["dbname"]}",
      $db["username"],
      $db["password"]
    );
    $stmt = $pdo->prepare("SELECT theme_id FROM {$prefix}theme WHERE theme_path = ? LIMIT 1");
    $stmt->execute(["Hyva/default"]);
    echo (string) $stmt->fetchColumn();
  ' 2>/dev/null || true)
  if [ -z "$theme_id" ]; then
    echo "[e2e-install] Hyva is installed but no Hyva/default row in the theme table" >&2
    php "$MAGE" theme:list >&2 || true
    exit 1
  fi
  php "$MAGE" config:set design/theme/theme_id "$theme_id"
else
  echo "[e2e-install] THEME=hyva but no HYVA_COMPOSER_* credentials" >&2
  exit 1
fi

# Warm the store before handing it to the suite.
#
# Developer mode compiles LESS and generates static assets on first request:
# cold, the homepage takes ~24s and the admin ~20s here, which blows a test's
# action timeout and looks like a broken selector rather than a cold cache.
# Warm, the same pages serve in 1-8s. Costs under a minute, once.
#
# Only unauthenticated routes can be warmed from here: 2FA is still enabled at
# install time (the suite's own seed disables it), so a curl login lands on the
# 2FA setup screen and never reaches an admin page. The admin's heavier forms —
# the product edit form above all — therefore stay cold until the first run
# touches them, which is why the very first suite run after a from-scratch
# install can lose a slow admin save that a re-run passes.
echo "[e2e-install] Warming the store"
for route in "" "admin" "customer/account/login/" "customer/account/create/" \
             "customer/account/forgotpassword/" "checkout/cart/" "checkout/"; do
  curl -fsS -o /dev/null --max-time 180 "http://nginx/${route}" || \
    echo "[e2e-install]   warning: /${route} did not warm" >&2
done

echo "[e2e-install] Done."
