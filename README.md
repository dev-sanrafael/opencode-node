# OpenCode Termux

**AI Coding Assistant para Android con Termux**

Ejecuta un asistente de programacion con IA (Claude o GPT) directamente en tu celular Android, compatible con arquitecturas **ARM 32-bit (armv7l)** y 64-bit (aarch64).

## ¿Por que existe?

El binario oficial de OpenCode requiere **Bun**, que no tiene soporte para ARM de 32 bits. Este proyecto usa **Node.js** (disponible en Termux para armv7l) para conectarse directamente a las APIs de Anthropic y OpenAI, brindando una experiencia similar optimizada para pantalla tactil y teclado Android.

## Instalacion (en Termux)

### 1. Actualizar Termux y clonar el repo

```bash
pkg update -y
pkg install -y git
git clone https://github.com/dev-sanrafael/opencode-termux.git
cd opencode-termux
```

### 2. Ejecutar el instalador

```bash
chmod +x setup.sh
./setup.sh
```

Esto instalara:
- Node.js LTS (compatible con 32-bit)
- Dependencias npm (@anthropic-ai/sdk, openai, chalk)
- Configuracion de teclas extra en Termux (ESC, TAB, CTRL, flechas, etc.)
- Comando global `opencode-termux`

### 3. Configurar API key

```bash
opencode-termux --setup
```

Elegi entre Anthropic (Claude) u OpenAI (GPT) e ingresa tu API key.

### 4. Iniciar

```bash
opencode-termux
```

## Uso

### Comandos disponibles

| Comando | Descripcion |
|---------|-------------|
| `/file <ruta>` | Leer archivo y agregarlo al contexto |
| `/files` | Ver archivos en contexto |
| `/drop <ruta>` | Quitar archivo del contexto |
| `/dir [ruta]` | Listar directorio |
| `/write <ruta>` | Guardar ultima respuesta en archivo |
| `/clear` | Limpiar contexto de conversacion |
| `/model <nombre>` | Cambiar modelo de IA |
| `/key` | Cambiar API key |
| `/save` | Guardar sesion actual |
| `/load` | Cargar ultima sesion |
| `/cwd <ruta>` | Cambiar directorio de trabajo |
| `/history` | Ver historial de mensajes |
| `/help` | Mostrar ayuda |
| `/exit` | Salir |

### Flujo de trabajo tipico

```
> /dir src/
  Mostrando archivos del proyecto...

> /file src/index.js
  [✓] Archivo agregado al contexto (150 lineas)

> Explicame como funciona este codigo y sugiere mejoras
  [Respuesta de la IA...]

> /write sugerencias.md
  [✓] Escrito: sugerencias.md
```

## Teclas extra de Termux

El instalador configura automaticamente una barra de teclas extra:

```
[ESC] [/] [-] [$] [>] [|] [UP] [DEL]
[TAB] [CTRL] [ALT] [.] [*] [LEFT] [DOWN] [RIGHT]
```

## Requisitos

- **Termux** (desde F-Droid, NO Play Store)
- **Node.js >= 18** (instalado por setup.sh)
- **API key** de Anthropic (Claude) u OpenAI (GPT)
- **~200 MB** de espacio libre

## Compatibilidad

| Arquitectura | Soporte |
|-------------|---------|
| ARM 32-bit (armv7l) | ✅ Completo |
| ARM 64-bit (aarch64) | ✅ Completo |
| x86_64 | ✅ Completo |

## Variables de entorno

```bash
# API key (alternativa al archivo de config)
export OPENCODE_TERMUX_KEY="sk-ant-..."
```

## Solucion de problemas

### "Error al conectar con anthropic/openai"
- Verifica tu API key: `opencode-termux --setup`
- Revisa tu conexion a internet
- Confirma que tu API key tiene creditos disponibles

### "node: command not found"
- Ejecuta `pkg install nodejs-lts` manualmente

### Las teclas extra no aparecen
- Cierra Termux completamente y vuelve a abrirlo
- O ejecuta: `termux-reload-settings`

### npm install falla en 32-bit
- Asegurate de usar `nodejs-lts` (no `nodejs`)
- Si falla, intenta: `npm install --no-optional`

## Licencia

MIT
