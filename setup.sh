#!/data/data/com.termux/files/usr/bin/bash
# ============================================================
#  OpenCode Termux - Instalador completo
#  OpenCode nativo en Termux via Node.js
#  Compatible: ARM 32-bit (armv7l) y 64-bit (aarch64)
# ============================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║     OpenCode Termux - Instalador        ║"
echo "  ║   AI Coding Assistant para Android      ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${NC}"

# ----- Verificar arquitectura -----
ARCH=$(uname -m)
echo -e "${YELLOW}[*] Arquitectura: ${ARCH}${NC}"

if [ "$ARCH" = "armv7l" ] || [ "$ARCH" = "armv8l" ]; then
    echo -e "${YELLOW}[*] Detectado ARM 32-bit. Usando nodejs-lts.${NC}"
    NODE_PKG="nodejs-lts"
else
    NODE_PKG="nodejs"
fi

# ----- Actualizar paquetes -----
echo -e "${YELLOW}[*] Actualizando repositorios...${NC}"
pkg update -y -o Dpkg::Options::="--force-confnew"

# ----- Instalar dependencias del sistema -----
echo -e "${YELLOW}[*] Instalando paquetes...${NC}"
pkg install -y $NODE_PKG git curl wget which termux-api

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}[✗] Error: No se pudo instalar Node.js${NC}"
    exit 1
fi

NODE_VERSION=$(node -v)
echo -e "${GREEN}[✓] Node.js: ${NODE_VERSION}${NC}"

# Verificar npm
if ! command -v npm &> /dev/null; then
    pkg install -y npm
fi

# ----- Configurar almacenamiento -----
echo -e "${YELLOW}[*] Configurando acceso al almacenamiento...${NC}"
if [ ! -d "$HOME/storage" ]; then
    termux-setup-storage
    echo -e "${YELLOW}    Acepta los permisos de almacenamiento y presiona ENTER...${NC}"
    read -r
fi

# ----- Configurar teclas extra de Termux -----
echo -e "${YELLOW}[*] Configurando barra de teclas extra...${NC}"
mkdir -p "$HOME/.termux"

cat > "$HOME/.termux/termux.properties" << 'EOF'
# OpenCode Termux - Configuracion de teclas extra
extra-keys = [ \
  ['ESC','/','-','$','>','|','UP','DEL'], \
  ['TAB','CTRL','ALT','.','*','LEFT','DOWN','RIGHT'] \
]
extra-keys-style = always
terminal-cursor-style = bar
use-black-ui = true
bell-character = ignore
enforce-char-based-input = true
ctrl-space-workaround = true
EOF

termux-reload-settings 2>/dev/null || true
echo -e "${GREEN}[✓] Teclas extra configuradas${NC}"

# ----- Directorio de instalacion -----
INSTALL_DIR="$HOME/.opencode-termux"
mkdir -p "$INSTALL_DIR"

# ----- Descargar build pre-compilado -----
GITHUB_REPO="dev-sanrafael/opencode-node"
RELEASE_URL="https://github.com/${GITHUB_REPO}/releases/latest/download"
FALLBACK_URL="https://raw.githubusercontent.com/${GITHUB_REPO}/build-assets/build"

echo -e "${YELLOW}[*] Descargando build de OpenCode...${NC}"

cd "$INSTALL_DIR"

# Descargar archivos del build (intenta Release primero, fallback a rama)
BUILD_FILES=("node.js" "node.js.map" "photon_rs_bg-bq08arze.wasm" "tree-sitter-3jzf13jk.wasm" "tree-sitter-bash-hq5s6fxb.wasm" "tree-sitter-powershell-ryb2ffqs.wasm")

mkdir -p build
for file in "${BUILD_FILES[@]}"; do
    echo -e "    Descargando ${file}..."
    curl -fSL -o "build/${file}" "${RELEASE_URL}/${file}" 2>/dev/null || \
    curl -fSL -o "build/${file}" "${FALLBACK_URL}/${file}" 2>/dev/null || {
        echo -e "${RED}[✗] Error descargando ${file}${NC}"
        echo -e "${YELLOW}    Puedes construir el build manualmente en una PC:${NC}"
        echo -e "    git clone https://github.com/anomalyco/opencode && cd opencode"
        echo -e "    bun install && cd packages/opencode && bun script/build-node.ts"
        echo -e "    Copia dist/node/* a ~/.opencode-termux/build/"
        exit 1
    }
done

echo -e "${GREEN}[✓] Build descargado${NC}"

# ----- Instalar dependencias npm -----
echo -e "${YELLOW}[*] Instalando dependencias Node.js...${NC}"
echo -e "${YELLOW}    (Compilando modulos nativos para ${ARCH} - esto puede tardar)${NC}"

# Instalar solo jsonc-parser (JS puro, el resto son modulos nativos que fallan en Termux)
cat > "$INSTALL_DIR/package.json" << JSONEOF
{
  "name": "opencode-termux-runtime",
  "type": "module",
  "private": true,
  "dependencies": {
    "jsonc-parser": "^3.3.0"
  }
}
JSONEOF

cd "$INSTALL_DIR"
npm install --no-audit --no-fund 2>&1 | tail -10

# Crear stubs para modulos nativos que no compilan en Termux
mkdir -p "$INSTALL_DIR/node_modules/@lydell/node-pty"
cat > "$INSTALL_DIR/node_modules/@lydell/node-pty/index.js" << 'PTYEOF'
export function spawn() { throw new Error("PTY no soportado en Termux"); }
export default { spawn() { throw new Error("PTY no soportado en Termux"); } }
PTYEOF

mkdir -p "$INSTALL_DIR/node_modules/better-sqlite3/lib"
cat > "$INSTALL_DIR/node_modules/better-sqlite3/package.json" << 'SQLITEEOF'
{"name":"better-sqlite3","version":"0.0.0-stub","type":"commonjs","main":"./lib/index.js"}
SQLITEEOF
cat > "$INSTALL_DIR/node_modules/better-sqlite3/lib/index.js" << 'SQLEOF'
function Database() { throw new Error("better-sqlite3 no soportado en Termux. Se usa storage JSON."); }
module.exports = Database;
module.exports.default = Database;
SQLEOF

echo -e "${GREEN}[✓] Dependencias instaladas${NC}"

# ----- Configurar scripts principales -----
echo -e "${YELLOW}[*] Configurando scripts...${NC}"

# Descargar opencode-server.js y opencode-cli.js del repo
SCRIPT_BASE="https://raw.githubusercontent.com/${GITHUB_REPO}/main"
curl -fSL -o "$INSTALL_DIR/opencode-server.js" "${SCRIPT_BASE}/opencode-server.js" 2>/dev/null
curl -fSL -o "$INSTALL_DIR/opencode-cli.js" "${SCRIPT_BASE}/opencode-cli.js" 2>/dev/null

# Si falla, crear versiones minimas
if [ ! -s "$INSTALL_DIR/opencode-server.js" ]; then
    cat > "$INSTALL_DIR/opencode-server.js" << 'SRVEOF'
#!/usr/bin/env node
import { Server } from "./build/node.js";
const port = parseInt(process.argv[3] || "4096", 10);
const hostname = process.argv[5] || "127.0.0.1";
console.log("OpenCode Server iniciando en " + hostname + ":" + port + "...");
const listener = await Server.listen({ port, hostname, mdns: false });
console.log("Servidor listo: http://" + listener.hostname + ":" + listener.port);
process.on("SIGINT", async () => { await listener.stop(); process.exit(0); });
SRVEOF
fi

if [ ! -s "$INSTALL_DIR/opencode-cli.js" ]; then
    cat > "$INSTALL_DIR/opencode-cli.js" << 'CLIEOF'
#!/usr/bin/env node
import { createInterface } from "readline";
const SERVER = process.env.OPENCODE_URL || "http://127.0.0.1:4096";
const PWD = process.env.OPENCODE_SERVER_PASSWORD || "";
const c = { dim: "\x1b[2m", green: "\x1b[32m", cyan: "\x1b[36m", reset: "\x1b[0m", bold: "\x1b[1m" };

async function api(path, body) {
  const h = { "Content-Type": "application/json", "x-opencode-directory": process.cwd() };
  if (PWD) h.Authorization = "Bearer " + PWD;
  const r = await fetch(SERVER + "/api/" + path, { method: body ? "POST" : "GET", headers: h, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(t.substring(0, 200));
  return t ? JSON.parse(t) : null;
}

async function* stream(path, body) {
  const h = { "Content-Type": "application/json", "x-opencode-directory": process.cwd() };
  if (PWD) h.Authorization = "Bearer " + PWD;
  const r = await fetch(SERVER + "/api/" + path, { method: "POST", headers: h, body: JSON.stringify(body) });
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const l of lines) {
      if (l.startsWith("data: ")) { try { yield JSON.parse(l.slice(6)); } catch {} }
    }
  }
}

let session = null;
const rl = createInterface({ input: process.stdin, output: process.stdout });
console.log(c.bold + "OpenCode CLI" + c.reset + c.dim + " v1.0.0" + c.reset);
console.log(c.dim + "Servidor: " + SERVER + c.reset);
console.log(c.dim + "/help para ayuda, escribe tu prompt" + c.reset + "\n");

rl.on("line", async (line) => {
  const t = line.trim();
  if (!t) { rl.prompt(); return; }
  if (t.startsWith("/exit")) { rl.close(); process.exit(0); }
  if (t.startsWith("/help")) {
    console.log("\n" + c.bold + "Comandos:" + c.reset);
    console.log("  " + c.cyan + "/new" + c.reset + "     Crear sesion");
    console.log("  " + c.cyan + "/file <r>" + c.reset + " Leer archivo");
    console.log("  " + c.cyan + "/help" + c.reset + "    Ayuda");
    console.log("  " + c.cyan + "/exit" + c.reset + "    Salir\n");
    rl.prompt(); return;
  }
  if (t === "/new") {
    try {
      const r = await api("session", { title: "Termux" });
      session = r.id;
      console.log(c.green + "[✓] Sesion: " + c.cyan + session + c.reset + "\n");
    } catch(e) { console.log(c.red + "Error: " + e.message + c.reset); }
    rl.prompt(); return;
  }
  if (!session) {
    try {
      const r = await api("session", { title: "Termux" });
      session = r.id;
    } catch(e) { console.log(c.red + "Error: servidor no disponible" + c.reset); rl.prompt(); return; }
  }
  try {
    const s = stream("session/" + session + "/prompt", { messages: [{ role: "user", content: t }] });
    console.log(c.dim + "---" + c.reset);
    let out = "";
    for await (const e of s) {
      const txt = e.content || e.text || e.delta || "";
      if (txt && txt !== out) { process.stdout.write(txt); out = txt; }
    }
    console.log(c.dim + "\n---" + c.reset + "\n");
  } catch(e) { console.log(c.red + "Error: " + e.message + c.reset); }
  rl.prompt();
});

rl.prompt();
CLIEOF
fi

chmod +x "$INSTALL_DIR"/opencode-server.js "$INSTALL_DIR"/opencode-cli.js

# ----- Crear comandos globales -----
BIN_DIR="$HOME/bin"
mkdir -p "$BIN_DIR"

cat > "$BIN_DIR/opencode-server" << 'SHEOF'
#!/data/data/com.termux/files/usr/bin/bash
cd "$HOME/.opencode-termux"
exec node opencode-server.js "$@"
SHEOF

cat > "$BIN_DIR/opencode-cli" << 'SHEOF'
#!/data/data/com.termux/files/usr/bin/bash
cd "$HOME/.opencode-termux"
exec node opencode-cli.js "$@"
SHEOF

cat > "$BIN_DIR/opencode" << 'SHEOF'
#!/data/data/com.termux/files/usr/bin/bash
OPENCODE_DIR="$HOME/.opencode-termux"
cd "$OPENCODE_DIR"

# Cargar API keys si existe el archivo
if [ -f "$HOME/.opencode.env" ]; then
    source "$HOME/.opencode.env"
fi

# Si el servidor ya esta corriendo, solo abre el cliente
if curl -sf http://127.0.0.1:4096/api/session > /dev/null 2>&1; then
    exec node opencode-cli.js "$@"
fi

# Iniciar servidor en background
echo "Iniciando OpenCode Server..."
node opencode-server.js &
SERVER_PID=$!
sleep 3

# Iniciar cliente
node opencode-cli.js "$@"

# Al salir, detener servidor
kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null
SHEOF

chmod +x "$BIN_DIR"/opencode-server "$BIN_DIR"/opencode-cli "$BIN_DIR"/opencode

# Agregar al PATH
if ! grep -q "export PATH=\"\$HOME/bin:\$PATH\"" "$HOME/.bashrc" 2>/dev/null; then
    echo 'export PATH="$HOME/bin:$PATH"' >> "$HOME/.bashrc"
fi

# ----- Resumen -----
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║    OpenCode Termux - Instalacion completa  ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${CYAN}Comandos disponibles:${NC}"
echo -e "    ${YELLOW}opencode-server${NC}   Iniciar servidor OpenCode"
echo -e "    ${YELLOW}opencode-cli${NC}       Conectar al servidor"
echo -e "    ${YELLOW}opencode${NC}           Servidor + Cliente en uno"
echo ""
echo -e "  ${CYAN}Primer uso:${NC}"
echo -e "    1. Configura tu API key:"
echo -e "       ${YELLOW}export ANTHROPIC_API_KEY=\"sk-ant-...\"${NC}"
echo -e "    2. Configura password del servidor:"
echo -e "       ${YELLOW}export OPENCODE_SERVER_PASSWORD=\"tupassword\"${NC}"
echo -e "    3. Inicia:"
echo -e "       ${YELLOW}opencode${NC}"
echo ""
echo -e "  ${CYAN}Nota:${NC} Agrega los exports a tu ~/.bashrc para que"
echo -e "  persistan entre sesiones."
echo ""
echo -e "  ${CYAN}Si las teclas extra no aparecen:${NC}"
echo -e "    Cierra Termux y vuelve a abrirlo."
echo ""
