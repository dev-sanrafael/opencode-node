#!/usr/bin/env node
// ============================================================
//  OpenCode CLI - Cliente para OpenCode Server en Termux
//  Se conecta al servidor local (localhost:4096) via API REST
// ============================================================

import { homedir } from "os";
import { join, resolve } from "path";
import { createInterface } from "readline";
import { writeFileSync, existsSync, mkdirSync, readFileSync } from "fs";

// ============================================================
//  Config
// ============================================================

const SERVER_URL = process.env.OPENCODE_URL || "http://127.0.0.1:4096";
const PASSWORD = process.env.OPENCODE_SERVER_PASSWORD || "";
const CONFIG_DIR = join(homedir(), ".opencode-termux");
const HISTORY_FILE = join(CONFIG_DIR, "cli-history.txt");

// ============================================================
//  Utilidades
// ============================================================

const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

function dim(s) { return c.dim + s + c.reset; }
function green(s) { return c.green + s + c.reset; }
function red(s) { return c.red + s + c.reset; }
function cyan(s) { return c.cyan + s + c.reset; }
function yellow(s) { return c.yellow + s + c.reset; }
function bold(s) { return c.bold + s + c.reset; }

// ============================================================
//  HTTP API Client
// ============================================================

async function api(method, path, body = null) {
  const url = `${SERVER_URL}/api/${path}`;
  const headers = {
    "Content-Type": "application/json",
    "x-opencode-directory": encodeURIComponent(process.cwd()),
  };
  if (PASSWORD) headers["Authorization"] = `Bearer ${PASSWORD}`;

  const opts = { method, headers };
  if (body && method !== "GET") {
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(url, opts);

  // Para SSE (Server-Sent Events), devolver el stream
  if (res.headers.get("content-type")?.includes("text/event-stream")) {
    return { stream: res.body };
  }

  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`${res.status}: ${text.substring(0, 200)}`);
    err.status = res.status;
    throw err;
  }

  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// Stream de eventos SSE
async function* streamSSE(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.slice(6));
          yield data;
        } catch {}
      }
    }
  }
}

// ============================================================
//  Comandos
// ============================================================

async function cmdHelp() {
  console.log(`
${bold("OpenCode CLI")} - Conectado a ${cyan(SERVER_URL)}

${bold("Comandos:")}
  ${cyan("/help")}               Esta ayuda
  ${cyan("/dir [ruta]")}         Listar archivos del directorio actual
  ${cyan("/file <ruta>")}        Leer archivo y mostrarlo
  ${cyan("/read <ruta>")}        Leer archivo via API de OpenCode
  ${cyan("/sessions")}           Listar sesiones activas
  ${cyan("/new")}                Crear nueva sesion
  ${cyan("/prompt <texto>")}     Enviar prompt al asistente
  ${cyan("/revert <id>")}        Revertir sesion a un mensaje
  ${cyan("/todo")}               Ver TODOs de la sesion actual
  ${cyan("/status")}             Estado del servidor
  ${cyan("/exit, /quit")}        Salir

${dim("Tip: El texto que escribas sin / se envia como prompt a la sesion activa.")}
${dim("Necesitas tener una sesion activa primero (usa /new).")}
`);
}

async function cmdDir(args) {
  const dirPath = resolve(args || ".");
  try {
    const entries = await api("GET", `file/read?path=${encodeURIComponent(dirPath)}`);
    console.log(entries);
  } catch (err) {
    if (err.status === 404) {
      // Intentar listar directorio local
      const { readdirSync } = await import("fs");
      try {
        const items = readdirSync(dirPath, { withFileTypes: true });
        console.log(`\n${bold(dirPath)}/`);
        for (const item of items) {
          const suffix = item.isDirectory() ? "/" : "";
          console.log(`  ${item.isDirectory() ? cyan(item.name + suffix) : item.name}`);
        }
        console.log("");
      } catch (e) {
        console.log(red("Directorio no encontrado: " + dirPath));
      }
    } else {
      console.log(red("Error: " + err.message));
    }
  }
}

async function cmdFile(args) {
  if (!args) {
    console.log(red("Uso: /file <ruta>"));
    return;
  }
  const filePath = resolve(args);
  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const header = `\n${cyan(filePath)} ${dim(`(${lines.length} lineas)`)}\n${dim("─".repeat(60))}`;
    console.log(header);
    if (lines.length > 50) {
      console.log(lines.slice(0, 50).join("\n"));
      console.log(dim(`\n... ${lines.length - 50} lineas mas. Usa /read para ver completo.`));
    } else {
      console.log(content);
    }
    console.log(dim("─".repeat(60)) + "\n");
  } catch (err) {
    console.log(red("Error al leer archivo: " + err.message));
  }
}

async function cmdRead(args) {
  if (!args) {
    console.log(red("Uso: /read <ruta>"));
    return;
  }
  const filePath = resolve(args);
  try {
    const result = await api("GET", `file/read?path=${encodeURIComponent(filePath)}`);
    if (typeof result === "string") {
      console.log("\n" + result + "\n");
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (err) {
    console.log(red("Error: " + err.message));
  }
}

async function cmdSessions() {
  try {
    const sessions = await api("GET", "session");
    if (Array.isArray(sessions) && sessions.length === 0) {
      console.log(dim("No hay sesiones activas. Usa /new para crear una."));
      return;
    }
    console.log(`\n${bold("Sesiones:")}`);
    for (const s of (Array.isArray(sessions) ? sessions : [])) {
      const title = s.title || s.id?.substring(0, 12) || "sin titulo";
      const time = s.time?.created ? new Date(s.time.created).toLocaleString() : "";
      console.log(`  ${cyan(title)}  ${dim(time)}  ${dim("id: " + s.id)}`);
    }
    console.log("");
  } catch (err) {
    console.log(red("Error al listar sesiones: " + err.message));
  }
}

async function cmdNew() {
  try {
    // Intenta crear una nueva sesion via la API
    const result = await api("POST", "session", {
      title: "Termux CLI Session",
    });

    let sessionId = "";
    // La API puede devolver {id:"..."} o {data:{id:"..."}}
    if (result?.id) {
      sessionId = result.id;
    } else if (result?.data?.id) {
      sessionId = result.data.id;
    } else if (typeof result === "string") {
      try {
        const parsed = JSON.parse(result);
        sessionId = parsed.id || parsed.data?.id || "";
      } catch {
        sessionId = result;
      }
    }

    if (sessionId) {
      globalState.currentSession = sessionId;
      console.log(green(`\n[✓] Sesion creada: ${cyan(sessionId)}\n`));
    } else {
      console.log(green("\n[✓] Sesion creada\n"));
      console.log(dim("Respuesta: " + JSON.stringify(result).substring(0, 200)));
    }
  } catch (err) {
    console.log(red("Error al crear sesion: " + err.message));
    console.log(dim("Asegurate de que el servidor este corriendo en " + SERVER_URL));
  }
}

async function cmdStatus() {
  try {
    // Health check simple
    const res = await fetch(`${SERVER_URL}/api/session`, {
      headers: PASSWORD ? { Authorization: `Bearer ${PASSWORD}` } : {},
    });
    if (res.ok) {
      console.log(green(`\n✅ Servidor OpenCode: ONLINE`));
      console.log(`   URL: ${cyan(SERVER_URL)}`);
      if (globalState.currentSession) {
        console.log(`   Sesion activa: ${cyan(globalState.currentSession)}`);
      }
      console.log("");
    } else {
      console.log(yellow(`\n⚠ Servidor responde pero con error: ${res.status}\n`));
    }
  } catch (err) {
    console.log(red(`\n❌ No se puede conectar al servidor: ${err.message}`));
    console.log(dim("   Ejecuta en otra terminal: node opencode-server.js\n"));
  }
}

// ============================================================
//  Estado global
// ============================================================

const globalState = {
  currentSession: null,
};

// ============================================================
//  Loop principal
// ============================================================

async function sendPrompt(text) {
  if (!globalState.currentSession) {
    console.log(yellow("No hay sesion activa. Creando una nueva..."));
    await cmdNew();
    if (!globalState.currentSession) return;
  }

  try {
    // Enviar prompt via SSE
    const { stream } = await api("POST", `session/${globalState.currentSession}/prompt`, {
      messages: [{ role: "user", content: text }],
    });

    if (stream) {
      console.log(dim("\n" + "─".repeat(50)));
      let lastText = "";
      for await (const event of streamSSE(stream)) {
        if (event.type === "message" || event.type === "assistant") {
          const content = event.content || event.text || event.delta || "";
          if (content && content !== lastText) {
            process.stdout.write(content);
            lastText = content;
          }
        } else if (event.type === "tool_use" || event.type === "tool") {
          const toolName = event.name || event.tool || "herramienta";
          console.log(dim(`\n[Ejecutando: ${toolName}]`));
        } else if (event.type === "done" || event.type === "complete") {
          break;
        }
      }
      console.log(dim("\n" + "─".repeat(50)) + "\n");
    } else {
      console.log(dim("\n[Respuesta recibida]\n"));
    }
  } catch (err) {
    console.log(red("\nError al enviar prompt: " + err.message));
    if (err.status === 404) {
      console.log(yellow("La sesion puede haber expirado. Crea una nueva con /new"));
    }
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
${bold("OpenCode CLI")} - Cliente terminal para OpenCode Server

${cyan("Uso:")}
  opencode-cli.js              Iniciar sesion interactiva
  opencode-cli.js --help       Esta ayuda

${cyan("Variables de entorno:")}
  OPENCODE_URL                 URL del servidor (default: http://127.0.0.1:4096)
  OPENCODE_SERVER_PASSWORD     Contraseña del servidor

${cyan("Requisitos:")}
  - Servidor OpenCode corriendo (node opencode-server.js)
  - Node.js >= 18
`);
    return;
  }

  // Verificar conexion
  console.log(dim("Conectando a " + SERVER_URL + "...\n"));

  let serverOk = false;
  try {
    const res = await fetch(`${SERVER_URL}/api/session`, {
      headers: PASSWORD ? { Authorization: `Bearer ${PASSWORD}` } : {},
      signal: AbortSignal.timeout(5000),
    });
    serverOk = res.ok || res.status === 401;
  } catch {}

  if (serverOk) {
    console.log(green("Conectado al servidor OpenCode\n"));
  } else {
    console.log(yellow("⚠ No se puede conectar al servidor en " + SERVER_URL));
    console.log(dim("  Asegurate de haber ejecutado: node opencode-server.js\n"));
    console.log(dim("  Algunos comandos no funcionaran hasta que el servidor este activo.\n"));
  }

  // Bienvenida
  console.log(bold("OpenCode CLI") + dim(" v1.0.0 - Modo Termux"));
  console.log(dim("Escribe /help para ver comandos o /new para crear una sesion.\n"));

  // Readline
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    historySize: 100,
  });

  const getPrompt = () => {
    const session = globalState.currentSession
      ? ` [${globalState.currentSession.substring(0, 8)}]`
      : "";
    return green("> ") + dim(session) + " ";
  };

  rl.on("line", async (input) => {
    const trimmed = input.trim();
    if (!trimmed) {
      rl.setPrompt(getPrompt());
      rl.prompt();
      return;
    }

    // Slash commands
    if (trimmed.startsWith("/")) {
      const parts = trimmed.split(/\s+/);
      const cmd = parts[0].toLowerCase();
      const args = parts.slice(1).join(" ");

      switch (cmd) {
        case "/help": case "/h": case "/?":
          await cmdHelp();
          break;
        case "/dir": case "/ls":
          await cmdDir(args);
          break;
        case "/file": case "/f":
          await cmdFile(args);
          break;
        case "/read": case "/r":
          await cmdRead(args);
          break;
        case "/sessions": case "/s":
          await cmdSessions();
          break;
        case "/new": case "/n":
          await cmdNew();
          break;
        case "/status": case "/health":
          await cmdStatus();
          break;
        case "/exit": case "/quit": case "/q":
          console.log(dim("\n¡Hasta luego!\n"));
          rl.close();
          process.exit(0);
        case "/prompt": case "/p":
          if (args) await sendPrompt(args);
          else console.log(red("Uso: /prompt <texto>"));
          break;
        default:
          console.log(red("Comando desconocido: " + cmd + ". Usa /help."));
      }
    } else {
      // Enviar como prompt a la sesion activa
      await sendPrompt(trimmed);
    }

    rl.setPrompt(getPrompt());
    rl.prompt();
  });

  // Ctrl+C graceful
  let ctrlCCount = 0;
  rl.on("SIGINT", () => {
    ctrlCCount++;
    if (ctrlCCount >= 2) {
      console.log(dim("\nSaliendo..."));
      process.exit(0);
    }
    console.log(dim("\nPresiona Ctrl+C de nuevo para salir, o /exit."));
    rl.setPrompt(getPrompt());
    rl.prompt();
    setTimeout(() => { ctrlCCount = 0; }, 2000);
  });

  rl.setPrompt(getPrompt());
  rl.prompt();
}

main().catch(err => {
  console.error(red("Error fatal: " + err.message));
  process.exit(1);
});
