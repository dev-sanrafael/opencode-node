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
