#!/data/data/com.termux/files/usr/bin/bash
# ============================================================
#  OpenCode Termux - Script de instalacion
#  Para dispositivos Android con Termux (ARM 32/64-bit)
# ============================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║       OpenCode Termux Installer          ║"
echo "  ║   AI Coding Assistant para Android       ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${NC}"

# ----- Verificar arquitectura -----
ARCH=$(uname -m)
echo -e "${YELLOW}[*] Arquitectura detectada: ${ARCH}${NC}"

# ----- Actualizar paquetes -----
echo -e "${YELLOW}[*] Actualizando repositorios...${NC}"
pkg update -y

# ----- Instalar dependencias del sistema -----
echo -e "${YELLOW}[*] Instalando paquetes del sistema...${NC}"
pkg install -y nodejs-lts git curl which termux-api

# Verificar Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    echo -e "${GREEN}[✓] Node.js instalado: ${NODE_VERSION}${NC}"
else
    echo -e "${RED}[✗] Error: No se pudo instalar Node.js${NC}"
    echo -e "${YELLOW}    Intentando con nodejs (latest)...${NC}"
    pkg install -y nodejs
    if command -v node &> /dev/null; then
        echo -e "${GREEN}[✓] Node.js instalado: $(node -v)${NC}"
    else
        echo -e "${RED}[✗] Fallo la instalacion de Node.js. Abortando.${NC}"
        exit 1
    fi
fi

# Verificar npm
if ! command -v npm &> /dev/null; then
    echo -e "${YELLOW}[*] Instalando npm...${NC}"
    pkg install -y npm
fi

# ----- Configurar acceso a almacenamiento -----
echo -e "${YELLOW}[*] Configurando acceso al almacenamiento...${NC}"
if [ ! -d "$HOME/storage" ]; then
    termux-setup-storage
    echo -e "${YELLOW}    Se abrira un dialogo de permisos. Acepta para continuar.${NC}"
    echo -e "${YELLOW}    Presiona ENTER cuando hayas aceptado los permisos...${NC}"
    read -r
fi

# ----- Configurar teclas extra de Termux -----
echo -e "${YELLOW}[*] Configurando barra de teclas extra...${NC}"
TERMUX_PROPS="$HOME/.termux/termux.properties"
mkdir -p "$HOME/.termux"

cat > "$TERMUX_PROPS" << 'EOF'
# OpenCode Termux - Configuracion de teclas extra
# Reinicia Termux o ejecuta "termux-reload-settings" para aplicar

# Barra de teclas extra (fila adicional sobre el teclado)
extra-keys = [ \
  ['ESC','/','-','$','>','|','UP','DEL'], \
  ['TAB','CTRL','ALT','.','*','LEFT','DOWN','RIGHT'] \
]

# Estilo
extra-keys-style = always
terminal-cursor-style = bar
use-black-ui = true

# Comportamiento
bell-character = ignore
terminal-margin-horizontal = 2
terminal-margin-vertical = 2
enforce-char-based-input = true

# Ctrl+Space sending (para algunos atajos)
ctrl-space-workaround = true
EOF

echo -e "${GREEN}[✓] Teclas extra configuradas${NC}"

# ----- Configurar directorio del proyecto -----
INSTALL_DIR="$HOME/.opencode-termux"
mkdir -p "$INSTALL_DIR"

# ----- Crear package.json local -----
echo -e "${YELLOW}[*] Creando configuracion del proyecto...${NC}"
cat > "$INSTALL_DIR/package.json" << 'JSONEOF'
{
  "name": "opencode-termux",
  "version": "1.0.0",
  "description": "AI Coding Assistant para Termux en Android",
  "main": "opencode-termux.js",
  "type": "module",
  "scripts": {
    "start": "node opencode-termux.js",
    "setup": "node setup-config.js"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "openai": "^4.73.0",
    "chalk": "^5.3.0"
  }
}
JSONEOF

# ----- Instalar dependencias npm -----
echo -e "${YELLOW}[*] Instalando dependencias Node.js (esto puede tardar)...${NC}"
cd "$INSTALL_DIR"
npm install --no-audit --no-fund 2>&1 | tail -5

echo -e "${GREEN}[✓] Dependencias instaladas${NC}"

# ----- Crear script de configuracion de API key -----
cat > "$INSTALL_DIR/setup-config.js" << 'JSEOF'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { createInterface } from 'readline';

const configDir = join(homedir(), '.opencode-termux');
const configFile = join(configDir, 'config.json');

const rl = createInterface({
    input: process.stdin,
    output: process.stdout
});

function ask(question) {
    return new Promise(resolve => rl.question(question, resolve));
}

async function setup() {
    console.log('\n📋 Configuracion de API Key');
    console.log('═══════════════════════════\n');

    let config = {};
    if (existsSync(configFile)) {
        try {
            config = JSON.parse(readFileSync(configFile, 'utf-8'));
            console.log('(Se encontro configuracion existente)');
        } catch {}
    }

    // Proveedor
    console.log('Proveedores disponibles:');
    console.log('  1. Anthropic (Claude) - Recomendado');
    console.log('  2. OpenAI (GPT)\n');

    const providerChoice = await ask('Elige proveedor [1/2] (default: 1): ');
    if (providerChoice === '2') {
        config.provider = 'openai';
        console.log('\nConsigue tu API key en: https://platform.openai.com/api-keys');
        config.apiKey = await ask('OpenAI API Key: ');
        const modelChoice = await ask('Modelo [gpt-4o/gpt-4o-mini/o3-mini] (default: gpt-4o): ');
        config.model = modelChoice || 'gpt-4o';
    } else {
        config.provider = 'anthropic';
        console.log('\nConsigue tu API key en: https://console.anthropic.com/settings/keys');
        config.apiKey = await ask('Anthropic API Key: ');
        const modelChoice = await ask('Modelo [claude-sonnet-4-20250514/claude-3-5-haiku-20241022] (default: claude-sonnet-4-20250514): ');
        config.model = modelChoice || 'claude-sonnet-4-20250514';
    }

    if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });
    writeFileSync(configFile, JSON.stringify(config, null, 2));
    console.log(`\n✅ Configuracion guardada en: ${configFile}\n`);
    rl.close();
}

setup();
JSEOF

# ----- Crear enlace simbolico -----
echo -e "${YELLOW}[*] Creando comando global...${NC}"
BIN_DIR="$HOME/bin"
mkdir -p "$BIN_DIR"

cat > "$BIN_DIR/opencode-termux" << 'SHEOF'
#!/data/data/com.termux/files/usr/bin/bash
INSTALL_DIR="$HOME/.opencode-termux"
cd "$INSTALL_DIR"
exec node opencode-termux.js "$@"
SHEOF

chmod +x "$BIN_DIR/opencode-termux"

# Agregar al PATH si no esta
if ! grep -q "export PATH=\"\$HOME/bin:\$PATH\"" "$HOME/.bashrc" 2>/dev/null; then
    echo 'export PATH="$HOME/bin:$PATH"' >> "$HOME/.bashrc"
fi

# ----- Aplicar config de teclas -----
echo -e "${YELLOW}[*] Recargando configuracion de Termux...${NC}"
termux-reload-settings 2>/dev/null || true

# ----- Resumen -----
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║      Instalacion completada con exito      ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${CYAN}Siguiente paso:${NC}"
echo -e "    1. Ejecuta:  ${YELLOW}opencode-termux --setup${NC}"
echo -e "       (o: ${YELLOW}node ~/.opencode-termux/setup-config.js${NC})"
echo -e "    2. Ingresa tu API key de Anthropic/OpenAI"
echo -e "    3. Ejecuta:  ${YELLOW}opencode-termux${NC}"
echo ""
echo -e "  ${CYAN}Comandos utiles:${NC}"
echo -e "    ${YELLOW}opencode-termux${NC}          Iniciar asistente"
echo -e "    ${YELLOW}opencode-termux --setup${NC}   Reconfigurar API key"
echo -e "    ${YELLOW}opencode-termux --help${NC}    Mostrar ayuda"
echo ""
echo -e "  ${CYAN}Nota:${NC} Si es la primera vez, cierra Termux y"
echo -e "  vuelve a abrirlo para que se apliquen las teclas extra."
echo ""
