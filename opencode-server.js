#!/usr/bin/env node
// ============================================================
//  OpenCode Server - Entry point para Node.js
//  Ejecuta el servidor headless de OpenCode en Termux/Android
// ============================================================

import { Server } from "./build/node.js";

const args = process.argv.slice(2);

// Parsear argumentos
let port = 4096;
let hostname = "127.0.0.1";
let password = process.env.OPENCODE_SERVER_PASSWORD || "";

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--port" && args[i + 1]) {
    port = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === "--hostname" && args[i + 1]) {
    hostname = args[i + 1];
    i++;
  } else if (args[i] === "--password" && args[i + 1]) {
    password = args[i + 1];
    process.env.OPENCODE_SERVER_PASSWORD = password;
    i++;
  } else if (args[i] === "--help" || args[i] === "-h") {
    console.log(`
OpenCode Server - Modo headless para Termux/Android

Uso: node opencode-server.js [opciones]

Opciones:
  --port <n>        Puerto (default: 4096)
  --hostname <h>    Hostname (default: 127.0.0.1)
  --password <p>    Contraseña del servidor
  --help, -h        Esta ayuda

Variables de entorno:
  OPENCODE_SERVER_PASSWORD   Contraseña del servidor
  ANTHROPIC_API_KEY          API key de Anthropic (Claude)
  OPENAI_API_KEY             API key de OpenAI
  OPENCODE_CONFIG            Ruta a archivo de config

Ejemplo:
  export ANTHROPIC_API_KEY="sk-ant-..."
  export OPENCODE_SERVER_PASSWORD="mipassword"
  node opencode-server.js --port 4096 --hostname 0.0.0.0
`);
    process.exit(0);
  }
}

// Banner
console.log("");
console.log("  ╔══════════════════════════════════════╗");
console.log("  ║       OpenCode Server (Node.js)      ║");
console.log("  ╚══════════════════════════════════════╝");
console.log("");

if (!password) {
  console.log("⚠  ADVERTENCIA: OPENCODE_SERVER_PASSWORD no esta definido.");
  console.log("   El servidor se ejecuta SIN autenticacion.");
  console.log("   Configuralo con: export OPENCODE_SERVER_PASSWORD=tu-password");
  console.log("");
}

console.log(`Iniciando servidor en ${hostname}:${port}...`);

try {
  const listener = await Server.listen({
    port,
    hostname,
    mdns: false,
  });

  console.log(`✅ Servidor iniciado: http://${listener.hostname}:${listener.port}`);
  console.log(`   API: http://${listener.hostname}:${listener.port}/api`);
  console.log("");
  console.log("Conectate desde otra terminal:");
  console.log(`   node opencode-cli.js`);
  console.log("");
  console.log("Presiona Ctrl+C para detener.");
  console.log("");

  // Mantener el proceso vivo
  process.on("SIGINT", async () => {
    console.log("\nDeteniendo servidor...");
    await listener.stop();
    console.log("Servidor detenido.");
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await listener.stop();
    process.exit(0);
  });

} catch (err) {
  console.error(`❌ Error al iniciar el servidor: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
}
