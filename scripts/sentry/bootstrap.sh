#!/usr/bin/env bash
# =============================================================================
# Sentry bootstrap for the scrollr-secrets Kubernetes Secret.
#
# Run this ONCE per cluster to populate the three shared Sentry env vars
# that every backend service consumes via secretKeyRef:
#
#   - SENTRY_USER_SALT  — random 32-byte hex. Used to anonymize Logto subs
#                         in Sentry events as sha256(sub+salt)[:8]. MUST NOT
#                         be rotated — rotation un-clusters every historical
#                         Sentry event.
#   - ENVIRONMENT       — typically "production".
#   - GIT_SHA           — initial placeholder; the deploy.yml workflow
#                         overwrites this on every deploy with the actual
#                         commit SHA, so the initial value here doesn't
#                         matter much.
#
# After running this script, restart all deployments so pods re-read the
# Secret:
#
#   kubectl rollout restart deployment -n scrollr
#
# USAGE
#
#   scripts/sentry/bootstrap.sh                  # interactive, prompts to confirm
#   scripts/sentry/bootstrap.sh --yes            # non-interactive, salt is auto-generated
#   scripts/sentry/bootstrap.sh --salt <hex>     # use a specific salt (recovery)
#   scripts/sentry/bootstrap.sh --help
#
# ENVIRONMENT
#
#   NAMESPACE     k8s namespace (default: scrollr)
#   SECRET_NAME   secret name (default: scrollr-secrets)
#   ENVIRONMENT   Sentry environment tag (default: production)
#
# EXIT STATUS
#
#   0  Patch applied successfully.
#   1  Patch failed (kubectl error, missing secret, etc.).
#   2  Usage error.
#
# SAFETY
#
#   - Will NOT overwrite SENTRY_USER_SALT if it already exists (refuses to
#     proceed without --force-rotate-salt, which is intentionally clunky).
#   - Will overwrite ENVIRONMENT and GIT_SHA without prompting (these are
#     safe to change).
#   - Prints the generated salt to stdout exactly once. Save it.
# =============================================================================

set -euo pipefail

NAMESPACE="${NAMESPACE:-scrollr}"
SECRET_NAME="${SECRET_NAME:-scrollr-secrets}"
ENVIRONMENT="${ENVIRONMENT:-production}"
INITIAL_GIT_SHA="bootstrap"

assume_yes=false
override_salt=""
force_rotate_salt=false

usage() {
    sed -n '2,/^# =\{20,\}$/p' "$0" | sed 's/^# \{0,1\}//'
    exit "${1:-2}"
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --yes|-y)
            assume_yes=true
            shift
            ;;
        --salt)
            override_salt="$2"
            shift 2
            ;;
        --force-rotate-salt)
            force_rotate_salt=true
            shift
            ;;
        --help|-h)
            usage 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            usage 2
            ;;
    esac
done

# --- Preflight ---------------------------------------------------------------

if ! command -v kubectl >/dev/null 2>&1; then
    echo "kubectl not found in PATH" >&2
    exit 1
fi

if ! kubectl get secret "$SECRET_NAME" -n "$NAMESPACE" >/dev/null 2>&1; then
    echo "ERROR: secret/$SECRET_NAME not found in namespace $NAMESPACE." >&2
    echo "Create the secret first from k8s/secrets.yaml.template:" >&2
    echo "  cp k8s/secrets.yaml.template k8s/secrets.yaml" >&2
    echo "  # fill in values, base64-encode each, then:" >&2
    echo "  kubectl apply -f k8s/secrets.yaml" >&2
    exit 1
fi

# --- Salt handling -----------------------------------------------------------

existing_salt_b64=$(kubectl get secret "$SECRET_NAME" -n "$NAMESPACE" \
    -o jsonpath='{.data.SENTRY_USER_SALT}' 2>/dev/null || echo "")

if [[ -n "$existing_salt_b64" ]] && [[ "$force_rotate_salt" != "true" ]]; then
    echo "SENTRY_USER_SALT is already set in $NAMESPACE/$SECRET_NAME."
    echo ""
    echo "Rotating the salt UN-CLUSTERS every historical Sentry event for"
    echo "this project. If you really need to rotate, re-run with:"
    echo "  $0 --force-rotate-salt"
    echo ""
    echo "Updating ENVIRONMENT only (salt unchanged)..."
    skip_salt=true
else
    skip_salt=false
    if [[ -n "$override_salt" ]]; then
        if ! [[ "$override_salt" =~ ^[0-9a-fA-F]{64}$ ]]; then
            echo "ERROR: --salt must be a 64-char hex string (32 bytes)" >&2
            exit 2
        fi
        salt="$override_salt"
        salt_source="(supplied via --salt)"
    else
        if ! command -v openssl >/dev/null 2>&1; then
            echo "openssl not found; pass --salt <hex> or install openssl" >&2
            exit 1
        fi
        salt=$(openssl rand -hex 32)
        salt_source="(generated)"
    fi
fi

# --- Confirmation ------------------------------------------------------------

if [[ "$assume_yes" != "true" ]]; then
    echo "About to patch secret/$SECRET_NAME in namespace $NAMESPACE:"
    if [[ "$skip_salt" != "true" ]]; then
        echo "  SENTRY_USER_SALT = <new 32-byte hex> $salt_source"
    fi
    echo "  ENVIRONMENT      = $ENVIRONMENT"
    echo "  GIT_SHA          = $INITIAL_GIT_SHA   (overwritten by every deploy)"
    echo ""
    read -r -p "Proceed? [y/N] " response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 0
    fi
fi

# --- Patch -------------------------------------------------------------------

# Build the JSON patch operations. Use `add` for keys that may not exist;
# Kubernetes accepts `add` for both new and existing JSON pointer targets
# in a Secret's data map.
ops=()

if [[ "$skip_salt" != "true" ]]; then
    salt_b64=$(printf '%s' "$salt" | base64 | tr -d '\n')
    ops+=("{\"op\":\"add\",\"path\":\"/data/SENTRY_USER_SALT\",\"value\":\"$salt_b64\"}")
fi

env_b64=$(printf '%s' "$ENVIRONMENT" | base64 | tr -d '\n')
ops+=("{\"op\":\"add\",\"path\":\"/data/ENVIRONMENT\",\"value\":\"$env_b64\"}")

git_sha_b64=$(printf '%s' "$INITIAL_GIT_SHA" | base64 | tr -d '\n')
ops+=("{\"op\":\"add\",\"path\":\"/data/GIT_SHA\",\"value\":\"$git_sha_b64\"}")

patch="[$(IFS=,; echo "${ops[*]}")]"

kubectl patch secret "$SECRET_NAME" -n "$NAMESPACE" --type='json' -p="$patch"

# --- Confirm + print salt for the caller to save -----------------------------

echo ""
echo "✓ Patch applied to secret/$SECRET_NAME in namespace $NAMESPACE."

if [[ "$skip_salt" != "true" ]]; then
    echo ""
    echo "================================================================================"
    echo "SAVE THIS SALT NOW — it will NOT be shown again."
    echo "================================================================================"
    echo ""
    echo "  SENTRY_USER_SALT=$salt"
    echo ""
    echo "Store it in your password manager. If you lose it, you cannot recover"
    echo "the mapping between Sentry user IDs and Logto subs. If you rotate it,"
    echo "every historical Sentry event un-clusters."
    echo "================================================================================"
fi

echo ""
echo "Next steps:"
echo "  1. Roll all deployments so pods pick up the new secret:"
echo "       kubectl rollout restart deployment -n $NAMESPACE"
echo "       kubectl rollout status deployment -n $NAMESPACE --timeout=300s"
echo ""
echo "  2. Smoke-test one service. Easiest is the marketing site —"
echo "     open https://myscrollr.com in incognito, DevTools console:"
echo "       throw new Error('Sentry smoke test')"
echo "     Within 60s the issue should appear in"
echo "       https://relentnet.sentry.io/projects/scrollr-web/"
echo ""
echo "  3. On the next deploy via .github/workflows/deploy.yml, GIT_SHA will be"
echo "     overwritten with the actual commit SHA. The current placeholder"
echo "     ('$INITIAL_GIT_SHA') is fine until then — releases will tag as"
echo "     '...@$INITIAL_GIT_SHA' for any events generated before that deploy."
