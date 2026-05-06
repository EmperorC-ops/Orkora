#!/usr/bin/env bash
# Mints a fresh set of secrets for an Orkora deploy.
#
# Prints them as KEY=VALUE lines so they can be piped into Render / Vercel /
# .env files without further massaging. Existing values are NOT read.
#
# Usage:
#   ./scripts/rotate-secrets.sh                  # all secrets
#   ./scripts/rotate-secrets.sh jwt              # JWT keypair only
#   ./scripts/rotate-secrets.sh pepper ticket    # any subset
#
# Requires: openssl 1.1+ (for genrsa, rand). On macOS the system openssl
# works; on Linux any distro openssl works.
#
# We deliberately do not write to .env or any file. The user pastes the
# output into their secret manager. Keeps an audit trail in the user's
# shell history rather than on disk.

set -euo pipefail

usage() {
  cat <<EOF
Usage: rotate-secrets.sh [jwt|pepper|ticket|all]

  jwt     Mint a fresh RSA-2048 JWT keypair (private + public, PEM)
  pepper  Mint REFRESH_TOKEN_PEPPER (32 random bytes, base64)
  ticket  Mint TICKET_SIGNING_SECRET (32 random bytes, base64)
  all     All of the above (default)

Output is printed to stdout as KEY=VALUE lines suitable for paste into a
secret manager. Multi-line PEMs are surrounded by triple-quote sentinels
so they can be re-imported cleanly. Existing .env files are not touched.
EOF
}

mint_pepper() {
  local val
  val=$(openssl rand -base64 32 | tr -d '\n')
  echo "REFRESH_TOKEN_PEPPER=${val}"
}

mint_ticket() {
  local val
  val=$(openssl rand -base64 32 | tr -d '\n')
  echo "TICKET_SIGNING_SECRET=${val}"
}

mint_jwt() {
  local tmpdir
  tmpdir=$(mktemp -d)
  trap "rm -rf '${tmpdir}'" EXIT
  openssl genrsa -out "${tmpdir}/private.pem" 2048 >/dev/null 2>&1
  openssl rsa -in "${tmpdir}/private.pem" -pubout -out "${tmpdir}/public.pem" >/dev/null 2>&1
  echo "JWT_PRIVATE_KEY=\"\"\""
  cat "${tmpdir}/private.pem"
  echo "\"\"\""
  echo "JWT_PUBLIC_KEY=\"\"\""
  cat "${tmpdir}/public.pem"
  echo "\"\"\""
}

if [[ ${#@} -eq 0 ]]; then
  set -- all
fi

for arg in "$@"; do
  case "${arg}" in
    jwt) mint_jwt ;;
    pepper) mint_pepper ;;
    ticket) mint_ticket ;;
    all)
      mint_jwt
      mint_pepper
      mint_ticket
      ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: ${arg}" >&2; usage; exit 2 ;;
  esac
done
