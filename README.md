# OpenCode Termux

**OpenCode nativo en Android via Termux**

Ejecuta el servidor oficial de OpenCode (anomalyco/opencode) en tu celular Android usando Node.js. Compatible con arquitecturas **ARM 32-bit (armv7l)** y 64-bit (aarch64).

> A diferencia de otras soluciones que simulan OpenCode, este proyecto ejecuta el **código real de OpenCode** compilado para Node.js. El servidor headless se comunica con los mismos modelos de IA (Claude, GPT) y expone la misma API REST.

## ¿Cómo funciona?

```
┌──────────────────────────────────────┐
│  Termux (Android)                    │
│                                      │
│  ┌──────────────┐   ┌─────────────┐  │
│  │ opencode-     │   │ opencode-   │  │
│  │ server.js     │◄──│ cli.js      │  │
│  │ (Node.js)     │   │ (Terminal)  │  │
│  │ Puerto 4096   │   │             │  │
│  └──────┬───────┘   └─────────────┘  │
│         │                            │
│    API Anthropic / OpenAI            │
└─────────┼────────────────────────────┘
          │
     ☁️ Internet
```

1. **OpenCode Server**: El servidor oficial de OpenCode compilado para Node.js, ejecutándose en Termux
2. **Cliente CLI**: Terminal interactiva que se comunica con el servidor via API REST
3. **Tus API keys**: Anthropic (Claude) u OpenAI (GPT) para la IA

## Instalación rápida

```bash
# En Termux:
curl -fsSL https://raw.githubusercontent.com/dev-sanrafael/opencode-node/main/setup.sh | bash
```

## Instalación manual

```bash
# 1. Clonar el repo
pkg update -y && pkg install -y git nodejs-lts
git clone https://github.com/dev-sanrafael/opencode-node.git
cd opencode-termux

# 2. Ejecutar instalador
chmod +x setup.sh
./setup.sh
```

## Configuración

```bash
# Configura tus API keys (agrega a ~/.bashrc para que persistan)
export ANTHROPIC_API_KEY="sk-ant-api03-..."
export OPENCODE_SERVER_PASSWORD="tu-password-seguro"

# O usa OpenAI
export OPENAI_API_KEY="sk-..."
```

## Seguridad

- **Password obligatorio fuera de loopback**: el servidor **se niega a arrancar** sin `OPENCODE_SERVER_PASSWORD` (o `--password`) cuando el hostname no es loopback (`127.0.0.1`/`localhost`/`::1`). Solo se permite arrancar sin password en loopback, y en ese caso se muestra una advertencia.
- **No expongas `0.0.0.0` sin autenticación**: exponer el servidor en LAN o internet sin password permite que cualquiera use tu API key a tu cargo. Para exponerlo en `0.0.0.0`/LAN es **obligatorio** definir un password fuerte:
  ```bash
  export OPENCODE_SERVER_PASSWORD="una-password-larga-y-aleatoria"
  node opencode-server.js --hostname 0.0.0.0
  ```
- **API keys fuera del repo**: guarda tus API keys en `~/.opencode.env` (no en `~/.bashrc`, no en el repo) y dale permisos restrictivos:
  ```bash
  touch ~/.opencode.env
  chmod 600 ~/.opencode.env
  echo 'export ANTHROPIC_API_KEY="sk-ant-..."' >> ~/.opencode.env
  echo 'export OPENCODE_SERVER_PASSWORD="tu-password"' >> ~/.opencode.env
  # El cliente/servidor cargan ~/.opencode.env automáticamente.
  ```
  > El archivo `~/.opencode.env` está en `.gitignore`; nunca lo comitees.
- **HTTP plano en LAN**: la API opera por HTTP plano en LAN. Cualquiera en tu red que pueda alcanzar el puerto podrá leer las solicitudes/respuestas (incluidos prompts y respuestas de la IA). Preferí usarlo solo en loopback, o canalizá el acceso por SSH tunneling/TLS si es imprescindible exponerlo.

## Uso

```bash
# Iniciar servidor + cliente (todo en uno)
opencode

# O por separado:
# Terminal 1 - Servidor
opencode-server

# Terminal 2 - Cliente
opencode-cli
```

### Comandos del cliente

| Comando | Descripción |
|---------|-------------|
| `/new` | Crear nueva sesión |
| `/file <ruta>` | Leer archivo |
| `/sessions` | Listar sesiones |
| `/help` | Mostrar ayuda |
| `/exit` | Salir |
| `texto...` | Enviar prompt a la IA |

## Requisitos

- **Termux** (desde [F-Droid](https://f-droid.org/packages/com.termux/), NO Play Store)
- **Node.js >= 18** (instalado por setup.sh)
- **~500 MB** espacio libre
- **API key** de Anthropic (Claude) u OpenAI

## Compatibilidad

| Arquitectura | Soporte |
|-------------|---------|
| ARM 32-bit (armv7l) | ✅ nodejs-lts |
| ARM 64-bit (aarch64) | ✅ nodejs |
| x86_64 | ✅ nodejs |

## Construir desde cero

Si prefieres compilar el build tú mismo (requiere PC con Bun):

```bash
git clone https://github.com/anomalyco/opencode.git
cd opencode
bun install
cd packages/opencode
bun script/build-node.ts
# El build estará en dist/node/
```

Copia `dist/node/*` a `~/.opencode-termux/build/` en tu dispositivo.

## Variables de entorno

| Variable | Descripción |
|----------|-------------|
| `ANTHROPIC_API_KEY` | API key de Anthropic Claude |
| `OPENAI_API_KEY` | API key de OpenAI |
| `OPENCODE_SERVER_PASSWORD` | Contraseña del servidor |
| `OPENCODE_URL` | URL del servidor (default: http://127.0.0.1:4096) |
| `OPENCODE_CONFIG` | Ruta a archivo de configuración |

## Teclas extra de Termux

El instalador configura automáticamente:

```
[ESC] [/] [-] [$] [>] [|] [UP] [DEL]
[TAB] [CTRL] [ALT] [.] [*] [LEFT] [DOWN] [RIGHT]
```

## Solución de problemas

### "Cannot find package @lydell/node-pty"
```bash
cd ~/.opencode-termux && npm install
```

### El servidor no inicia
- Verifica que el puerto 4096 no esté en uso
- Revisa los logs con `node opencode-server.js` directamente

### "Error al crear sesión"
- Confirma que las API keys están configuradas
- Verifica conexión a internet

### npm install falla en 32-bit
- Usa `nodejs-lts` (no `nodejs`):
  ```bash
  pkg install nodejs-lts
  ```

## Licencia

MIT
