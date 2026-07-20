#!/data/data/com.termux/files/usr/bin/bash
# ============================================================
#  OpenCode Termux - Inicio rapido
#  Inicia servidor + cliente
# ============================================================

OPENCODE_DIR="$HOME/.opencode-termux"

# Verificar instalacion
if [ ! -f "$OPENCODE_DIR/build/node.js" ]; then
    echo "❌ OpenCode no esta instalado."
    echo "   Ejecuta primero: curl -fsSL https://raw.githubusercontent.com/dev-sanrafael/opencode-node/main/setup.sh | bash"
    exit 1
fi

# Configurar API keys desde archivo si existe
if [ -f "$HOME/.opencode-termux.env" ]; then
    source "$HOME/.opencode-termux.env"
fi

echo "OpenCode Termux"
echo "=============="
echo ""

# Verificar si hay API keys configuradas
if [ -z "$ANTHROPIC_API_KEY" ] && [ -z "$OPENAI_API_KEY" ]; then
    echo "⚠  No se detectaron API keys."
    echo ""
    echo "Configura una de estas variables:"
    echo "  export ANTHROPIC_API_KEY=\"sk-ant-...\""
    echo "  export OPENAI_API_KEY=\"sk-...\""
    echo ""
    echo "Puedes guardarlas en ~/.opencode-termux.env"
    echo ""
fi

# Verificar si ya hay un servidor corriendo
if curl -sf -o /dev/null http://127.0.0.1:4096/api/session 2>/dev/null; then
    echo "✅ Servidor ya esta corriendo. Conectando..."
    exec node "$OPENCODE_DIR/opencode-cli.js" "$@"
fi

# Iniciar servidor en background
echo "Iniciando servidor..."
node "$OPENCODE_DIR/opencode-server.js" &
SERVER_PID=$!

# Esperar a que este listo
echo -n "Esperando servidor"
for i in $(seq 1 10); do
    if curl -sf -o /dev/null http://127.0.0.1:4096/api/session 2>/dev/null; then
        echo " listo!"
        break
    fi
    echo -n "."
    sleep 1
done

# Iniciar cliente
node "$OPENCODE_DIR/opencode-cli.js" "$@"

# Limpiar al salir
echo ""
echo "Deteniendo servidor..."
kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null
