#!/usr/bin/env bash
# One entrypoint for the E2E stack, used identically by a developer and by CI.
#
#   tests/docker/run.sh up   luma|hyva|mageos   boot the stack and install Magento
#   tests/docker/run.sh test luma|hyva|mageos [playwright args…]
#   tests/docker/run.sh down luma|hyva|mageos   tear it down, volumes included
#   tests/docker/run.sh logs luma|hyva|mageos
#
# Each target owns its .env.<target>: its image, its ports, its compose project
# and the THEME whose suite it runs. They are separate stacks because installing
# Hyvä switches the store's theme, so a shared database would leave whichever
# target installed last deciding which markup the other one asserts against.
# Hyvä is commercial — the hyva target needs HYVA_COMPOSER_* credentials.
set -euo pipefail

# Absolute path to this script, resolved BEFORE the cd. The usage text is
# printed by sed-ing this file, and "$0" is relative to the caller's cwd — so
# after the cd it points at nothing and usage died with "No such file".
script="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
cd "$(dirname "$script")"

cmd="${1:-}"; target="${2:-luma}"; shift 2 2>/dev/null || true
env_file=".env.${target}"
[[ -f "$env_file" ]] || { echo "Unknown target '${target}' (expected an existing ${env_file})" >&2; exit 2; }
project="e2e-${target}"

compose() { docker compose --project-name "$project" --env-file "$env_file" "$@"; }

# shellcheck disable=SC1090
set -a; source "$env_file"; set +a

wait_for_http() {
  local url="$1" tries="${2:-60}"
  echo "Waiting for ${url}"
  for _ in $(seq "$tries"); do
    if curl -fsS -o /dev/null "$url"; then echo "  up"; return 0; fi
    sleep 5
  done
  echo "  never became ready" >&2
  compose logs --tail=50 nginx php >&2 || true
  return 1
}

# Guard against something else on the host owning the published Mailpit port.
#
# macOS resolves `localhost` to ::1 first, and a host-level process bound to
# *:8025 (Homebrew's own mailpit, for one) keeps that port even though Docker
# reports the container as published on 0.0.0.0. The suite then reads an empty
# inbox from the wrong Mailpit while Magento happily delivers to the right one,
# and only the five mail-dependent tests fail — with no hint as to why. Compare
# the database path Mailpit reports inside the container with the one seen
# through the published port: same instance, same path.
assert_mailpit_is_ours() {
  local inside outside
  inside=$(compose exec -T mailpit wget -qO- "http://localhost:8025/api/v1/info" 2>/dev/null \
    | sed -n 's/.*"Database":"\([^"]*\)".*/\1/p')
  outside=$(curl -fsS "http://localhost:${MAILPIT_HTTP_PORT}/api/v1/info" 2>/dev/null \
    | sed -n 's/.*"Database":"\([^"]*\)".*/\1/p')

  if [ -z "$outside" ]; then
    echo "Mailpit is not answering on http://localhost:${MAILPIT_HTTP_PORT}" >&2
    return 1
  fi
  if [ "$inside" != "$outside" ]; then
    cat >&2 <<EOF
Port ${MAILPIT_HTTP_PORT} is served by a DIFFERENT Mailpit than this stack's.
  in the container: ${inside}
  on localhost:${MAILPIT_HTTP_PORT}: ${outside}
Something else on this host owns that port. Stop it, or set MAILPIT_HTTP_PORT
in ${env_file} to a free one and re-run \`docker/run.sh up ${target}\`.
EOF
    return 1
  fi
}

# Every compose service still running?
#
# A service that dies mid-run does not fail the suite — it fails whichever
# tests happened to need it, which reads as a pile of unrelated product bugs.
# OpenSearch is the usual casualty: it is the largest process in the stack and
# so the kernel's first pick under memory pressure, and losing it fails every
# category and search test at once with selector errors that say nothing about
# the cause. Checked before AND after the run, because a check that only runs
# up front cannot tell "never started" from "died at test 40".
assert_services_up() {
  local when="$1" bad="" svc state cid
  for svc in $(compose config --services); do
    state=$(compose ps --all --format '{{.State}}' "$svc" 2>/dev/null | head -1)
    [ "$state" = "running" ] && continue
    bad="${bad} ${svc}(${state:-missing})"
  done
  [ -z "$bad" ] && return 0

  echo "Stack services not running ${when}:${bad}" >&2
  for svc in $(compose config --services); do
    cid=$(compose ps --all -q "$svc" 2>/dev/null | head -1)
    [ -n "$cid" ] || continue
    docker inspect "$cid" \
      --format "  {{.Name}}: exit={{.State.ExitCode}} oom={{.State.OOMKilled}}" 2>/dev/null \
      | grep -v "exit=0 oom=false" >&2 || true
  done
  return 1
}

case "$cmd" in
  up)
    compose up -d --wait
    compose exec -T php e2e-install
    wait_for_http "http://localhost:${NGINX_PORT}/"
    assert_mailpit_is_ours
    ;;
  test)
    wait_for_http "http://localhost:${NGINX_PORT}/" 12
    assert_mailpit_is_ours
    assert_services_up "before the run"
    rc=0
    ( cd ../project
      PLAYWRIGHT_BASE_URL="http://localhost:${NGINX_PORT}" \
      MAILPIT_URL="http://localhost:${MAILPIT_HTTP_PORT}" \
      NGINX_PORT="${NGINX_PORT}" \
      E2E_THEME="${THEME}" \
      COMPOSE_PROJECT="${project}" \
      COMPOSE_ENV_FILE="${env_file}" \
      npx playwright test "$@" ) || rc=$?
    if ! assert_services_up "after the run"; then
      cat >&2 <<'EOF'

A service died DURING the run. Any failures above are that, not product bugs —
re-run once the stack is healthy before believing the report.
EOF
      exit 1
    fi
    exit "$rc"
    ;;
  down)   compose down -v ;;
  logs)   compose logs "$@" ;;
  *)      sed -n '2,12p' "$script"; exit 2 ;;
esac
