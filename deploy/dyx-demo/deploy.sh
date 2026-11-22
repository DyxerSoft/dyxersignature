#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT=/srv/docker-data/stacks/dyxersignature
REPO="$ROOT/repo"
SECRETS="$ROOT/secrets/staging.env"
HASH_FILE="$ROOT/secrets/caddy-basic-auth.hash"
CADDYFILE=/srv/docker-data/stacks/edge/Caddyfile
COMPOSE="$REPO/deploy/dyx-demo/compose.yml"
TEMPLATE="$REPO/deploy/dyx-demo/Caddyfile.signature.template"

fail() { echo "ERROR: $*" >&2; exit 1; }
msg() { echo "[DyxerSignature] $*"; }

for cmd in git openssl curl sudo docker; do command -v "$cmd" >/dev/null || fail "No existe $cmd"; done
[[ -d "$REPO/.git" ]] || fail "Clona el repositorio en $REPO"
sudo docker network inspect dyx-edge >/dev/null 2>&1 || fail 'No existe red dyx-edge'
[[ "$(sudo docker inspect -f '{{.State.Running}}' dyx-edge-proxy 2>/dev/null)" == true ]] || fail 'Caddy dyx-edge-proxy no está activo'
cd "$REPO"
[[ -z "$(git status --porcelain)" ]] || fail 'Árbol Git local tiene modificaciones: no sobrescribir'
git fetch origin main
git switch main
git pull --ff-only origin main
[[ -f "$COMPOSE" && -f "$TEMPLATE" ]] || fail 'No están los archivos de deploy en main'

sudo install -d -m 0750 -o "$(id -un)" -g "$(id -gn)" "$ROOT/secrets" "$ROOT/storage"
sudo install -d "$ROOT/storage/postgres" "$ROOT/storage/seaweedfs"
if [[ ! -f "$SECRETS" ]]; then
  msg 'Generando secretos para dyx-demo sin imprimirlos ni subirlos a Git.'
  cat > "$SECRETS" <<ENVFILE
SIGNATURE_DATA_ROOT=$ROOT/storage
POSTGRES_PASSWORD=$(openssl rand -hex 32)
AUTH_JWT_SIGNING_KEY=$(openssl rand -hex 32)
S3_ADMIN_ACCESS_KEY=sigadmin$(openssl rand -hex 8)
S3_ADMIN_SECRET_KEY=$(openssl rand -hex 32)
S3_ACCESS_KEY=sigapi$(openssl rand -hex 8)
S3_SECRET_KEY=$(openssl rand -hex 32)
S3_PUBLIC_URL=https://signature.dyxersoft.com
STELLAR_PUBLIC_KEY=
STELLAR_SECRET_SEED=
ENVFILE
fi
chmod 600 "$SECRETS"
if ! grep -Eq '^STELLAR_SECRET_SEED=[A-Za-z0-9]+' "$SECRETS"; then
  msg 'AVISO: cuenta Stellar Testnet sin configurar; anclajes reales pendientes.'
fi

dc() { sudo docker compose -p dyxsignature --env-file "$SECRETS" -f "$COMPOSE" "$@"; }
msg 'Desplegando DyxerSignature sin publicar puertos de host.'
dc up -d --build
ready=0
for attempt in $(seq 1 60); do
  if dc exec -T frontend wget -qO- http://api:8080/api/v1/health >/dev/null 2>&1; then ready=1; break; fi
  sleep 2
done
if [[ "$ready" != 1 ]]; then
  dc ps
  dc logs --tail=80 api postgres seaweedfs
  fail 'No hay health del backend. Caddy no se alteró.'
fi

if [[ ! -s "$HASH_FILE" ]]; then
  [[ -t 0 ]] || fail 'Se requiere terminal interactiva para elegir contraseña de sitio.'
  echo 'Contraseña privada para el usuario demo (mínimo 14 caracteres):'
  IFS= read -r -s -p 'Contraseña: ' site_password
  echo
  [[ "$(printf '%s' "$site_password" | wc -c)" -ge 14 ]] || fail 'Contraseña demasiado corta'
  auth_hash="$(sudo docker exec dyx-edge-proxy caddy hash-password --plaintext "$site_password")" || fail 'Fallo al calcular hash'
  unset site_password
  printf '%s\n' "$auth_hash" > "$HASH_FILE"
  chmod 600 "$HASH_FILE"
else
  auth_hash="$(cat "$HASH_FILE")"
fi

sudo test -f "$CADDYFILE" || fail 'Caddyfile no encontrado'
if sudo grep -Fq 'signature.dyxersoft.com' "$CADDYFILE"; then
  msg 'Caddy ya contiene signature.dyxersoft.com; no se sobrescribe.'
else
  backup="$CADDYFILE.bak.signature.$(date +%Y%m%d%H%M%S)"
  sudo cp -p "$CADDYFILE" "$backup"
  temp="$(mktemp)"
  trap 'rm -f "$temp"' EXIT
  sed "s|__SIGNATURE_PASSWORD_HASH__|$auth_hash|g" "$TEMPLATE" > "$temp"
  printf '\n' | sudo tee -a "$CADDYFILE" >/dev/null
  sudo tee -a "$CADDYFILE" < "$temp" >/dev/null
  if ! sudo docker exec dyx-edge-proxy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null; then
    sudo cat "$backup" | sudo tee "$CADDYFILE" >/dev/null
    fail "Caddy inválido, restaurado backup: $backup"
  fi
  if ! sudo docker exec dyx-edge-proxy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile; then
    sudo cat "$backup" | sudo tee "$CADDYFILE" >/dev/null
    sudo docker exec dyx-edge-proxy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile || true
    fail 'Caddy falló; se recuperó la versión anterior.'
  fi
  msg "Caddy recargado. Backup: $backup"
fi

health_status="$(curl --max-time 10 -sS -o /dev/null -w '%{http_code}' -H 'Host: signature.dyxersoft.com' http://127.0.0.1:8080/api/v1/health)"
root_status="$(curl --max-time 10 -sS -o /dev/null -w '%{http_code}' -H 'Host: signature.dyxersoft.com' http://127.0.0.1:8080/)"
msg "Health local: HTTP $health_status (esperado 200); sitio sin login: HTTP $root_status (esperado 401)."
[[ "$health_status" == 200 ]] || fail 'Caddy no llega a API'
[[ "$root_status" == 401 ]] || fail 'Sitio desprotegido: NO publicar sin autenticación'
public_status="$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' https://signature.dyxersoft.com/ 2>/dev/null || true)"
msg "Acceso público por Cloudflare: HTTP $public_status (esperado 401)"
if [[ "$public_status" != 401 ]]; then
  msg 'Pendiente: Cloudflare Zero Trust > dyx-demo-tunnel > Public Hostname signature.dyxersoft.com -> http://localhost:8080'
fi
dc ps
msg 'Demo protegida con usuario demo. Verifica el flujo de firma desde el navegador.'
