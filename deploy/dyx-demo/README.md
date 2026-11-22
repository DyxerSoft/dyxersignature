# Despliegue de demostración — dyx-demo

**Objetivo:** publicar `https://signature.dyxersoft.com` en el túnel Cloudflare ya existente sin tocar otras aplicaciones.

## Topología comprobada previamente

- Caddy: `dyx-edge-proxy`, red Docker `dyx-edge`, binding del host `127.0.0.1:8080` a su puerto 80.
- Caddyfile persistente: `/srv/docker-data/stacks/edge/Caddyfile`.
- Cloudflared: servicio systemd con túnel gestionado por Cloudflare Zero Trust; su host público debe dirigir a **HTTP `http://localhost:8080`** (no HTTPS interno).
- Directorio de esta aplicación: `/srv/docker-data/stacks/dyxersignature/repo`; secretos fuera de Git en `/srv/docker-data/stacks/dyxersignature/secrets/staging.env`.

La aplicación no publica puertos de host; Caddy resuelve `signature-frontend:80` y `signature-seaweedfs:8333` en la red externa `dyx-edge`. API, base de datos y demás servicios se ejecutan en una red exclusiva del proyecto; la API conserva salida HTTPS a Stellar Testnet.

## Primera instalación

```bash
sudo install -d -m 0755 -o "$USER" -g "$(id -gn)" /srv/docker-data/stacks/dyxersignature
cd /srv/docker-data/stacks/dyxersignature
git clone https://github.com/DyxerSoft/dyxersignature.git repo
cd repo
bash deploy/dyx-demo/deploy.sh
```

La herramienta crea el archivo de secretos solo si falta, con contraseñas generadas aleatoriamente, y nunca las imprime. Puede solicitar la contraseña del acceso básico al sitio (guardar en un gestor de contraseñas). Guarda un backup del Caddyfile, comprueba `caddy validate`, recarga el proxy y realiza smoke tests locales. **No modifica rutas de otros proyectos.**

### Stellar Testnet

Para completar anclajes reales, rellenar `STELLAR_PUBLIC_KEY` y `STELLAR_SECRET_SEED` en el archivo `secrets/staging.env` del servidor y reiniciar el servicio API. Nunca almacenar semillas en Git. Utilizar exclusivamente una cuenta Testnet de demostración.

### Cloudflare

En **Cloudflare Zero Trust → Networks → Tunnels → dyx-demo-tunnel → Public Hostnames**, la ruta `signature.dyxersoft.com` debe usar servicio `http://localhost:8080`. El origen Caddy usa encabezado Host para enrutar; no hay que crear un puerto nuevo para la firma. El equipo debe verificar que el registro DNS/túnel está publicado. **No modificar las nueve rutas existentes.**

### Verificación

Desde el servidor:

```bash
sudo docker compose -p dyxsignature --env-file /srv/docker-data/stacks/dyxersignature/secrets/staging.env -f deploy/dyx-demo/compose.yml ps
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: signature.dyxersoft.com' http://127.0.0.1:8080/
curl -sS -o /dev/null -w '%{http_code}\n' https://signature.dyxersoft.com/
```

El primer código HTTP debe ser **401** sin credenciales. Si la ruta Cloudflare existe, el segundo también puede devolver **401**: esto indica que el sitio está accesible pero protegido. Probar con las credenciales `demo` y la contraseña elegida para obtener **200**, abrir la aplicación y completar un flujo de prueba. Un `401` por sí solo no prueba que el flujo funcional esté operativo.

### Actualizar `main`

```bash
cd /srv/docker-data/stacks/dyxersignature/repo
bash deploy/dyx-demo/deploy.sh
```

El script hace `git fetch`, `git switch main` y `git pull --ff-only`, abortando si el árbol Git local tiene cambios no confirmados. Reutiliza secretos y almacenamiento persistente. No ejecuta `docker compose down -v`.

**Seguridad:** el perfil actual crea tokens de administrador de demostración solamente en Development, por lo que el Caddyfile con `basic_auth` es obligatorio. No usar este despliegue como producción real con datos personales. La ruta de objetos S3 solo concede lectura a URLs prefirmadas válidas; debe verificarse su funcionamiento real antes de mostrar documentos sensibles.
