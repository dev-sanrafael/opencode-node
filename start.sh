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

# ----- Guarda FAIL-CLOSED de autenticacion -----
# Si el servidor se va a exponer en red (sin loopback) y no hay password,
# se abororta con un error claro en lugar de arrancar sin autenticacion.
HOSTNAME_ARG="127.0.0.1"
prev=""
for a in "$@"; do
    if [ "$prev" = "--hostname" ]; then
        HOSTNAME_ARG="$a"
        break
    fi
    prev="$a"
done

case "$HOSTNAME_ARG" in
    127.0.0.1|localhost|::1)
        # loopback: se permite sin password
        ;;
    *)
        if [ -z "$OPENCODE_SERVER_PASSWORD" ]; then
            echo "❌ ERROR: se va a exponer el servidor en $HOSTNAME_ARG sin password."
            echo "   Define OPENCODE_SERVER_PASSWORD antes de exponerlo en red:"
            echo "     export OPENCODE_SERVER_PASSWORD=tu-password-seguro"
            echo "   O inicia solo en loopback (127.0.0.1)."
            exit 1
        fi
        ;;
esac

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
