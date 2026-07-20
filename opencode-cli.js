#!/usr/bin/env node
// ============================================================
//  OpenCode TUI - Interfaz de terminal real para Node.js
//  Conecta al servidor OpenCode y renderiza la TUI completa
//  Compatible con Termux/Android (sin Bun)
// ============================================================

import { createInterface } from "readline";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { resolve, relative } from "path";

// ============================================================
//  Config
// ============================================================
const SERVER_URL = process.env.OPENCODE_URL || "http://127.0.0.1:4096";
const PWD = process.env.OPENCODE_SERVER_PASSWORD || "";
const CWD = process.env.OPENCODE_CWD || process.cwd();

// ============================================================
//  Terminal / ANSI
// ============================================================
const CSI = "\x1b[";
const t = {
  reset: CSI + "0m",
  bold: CSI + "1m",
  dim: CSI + "2m",
  italic: CSI + "3m",
  underline: CSI + "4m",
  black: CSI + "30m",
  red: CSI + "31m",
  green: CSI + "32m",
  yellow: CSI + "33m",
  blue: CSI + "34m",
  magenta: CSI + "35m",
  cyan: CSI + "36m",
  white: CSI + "37m",
  gray: CSI + "90m",
  bgBlack: CSI + "40m",
  bgRed: CSI + "41m",
  bgGreen: CSI + "42m",
  bgYellow: CSI + "43m",
  bgBlue: CSI + "44m",
  bgCyan: CSI + "46m",
  bgWhite: CSI + "47m",
  clear: CSI + "2J",
  clearLine: CSI + "2K",
  cursorTo(x, y) { return CSI + (y || 0) + ";" + (x || 0) + "H"; },
  cursorUp(n) { return CSI + (n || 1) + "A"; },
  cursorDown(n) { return CSI + (n || 1) + "B"; },
  cursorForward(n) { return CSI + (n || 1) + "C"; },
  cursorHide: CSI + "?25l",
  cursorShow: CSI + "?25h",
  altScreen: CSI + "?1049h",
  normalScreen: CSI + "?1049l",
};

function dim(s) { return t.dim + s + t.reset; }
function bold(s) { return t.bold + s + t.reset; }
function green(s) { return t.green + s + t.reset; }
function red(s) { return t.red + s + t.reset; }
function cyan(s) { return t.cyan + s + t.reset; }
function yellow(s) { return t.yellow + s + t.reset; }
function blue(s) { return t.blue + s + t.reset; }
function magenta(s) { return t.magenta + s + t.reset; }
function gray(s) { return t.gray + s + t.reset; }

// ============================================================
//  API Client
// ============================================================
async function api(method, path, body) {
  const url = `${SERVER_URL}/api/${path}`;
  const headers = {
    "Content-Type": "application/json",
    "x-opencode-directory": encodeURIComponent(CWD),
  };
  if (PWD) headers["Authorization"] = `Bearer ${PWD}`;
  const opts = { method, headers };
  if (body && method !== "GET") opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) {
    const err = new Error(`${res.status}: ${(await res.text()).substring(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("text/event-stream")) return { stream: res.body.getReader() };
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ============================================================
//  SSE Stream parser
// ============================================================
async function* streamSSE(body) {
  const reader = body;
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
        try { yield JSON.parse(line.slice(6)); } catch {}
      }
    }
  }
}

// ============================================================
//  Estado de la sesion
// ============================================================
const state = {
  sessionId: null,
  messages: [],
  currentTool: null,
  thinking: false,
  lastContent: "",
  width: process.stdout.columns || 80,
  height: process.stdout.rows || 24,
};

// ============================================================
//  Renderizado TUI
// ============================================================
function hr(char = "─") {
  return gray(char.repeat(Math.min(state.width - 2, 80)));
}

function renderLogo() {
  return [
    cyan(bold("  ╔══════════════════════════════════════╗")),
    cyan(bold("  ║       OpenCode (Node.js TUI)          ║")),
    cyan(bold("  ╚══════════════════════════════════════╝")),
  ].join("\n");
}

function renderMessage(msg) {
  const role = msg.role === "user" ? blue(bold("  You")) : magenta(bold("  AI"));
  const time = msg.time ? gray(new Date(msg.time).toLocaleTimeString()) : "";
  let header = `${role} ${time}`;
  let body = "";

  if (msg.parts) {
    for (const part of msg.parts) {
      if (part.type === "text" || part.text) {
        body += (part.text || part.content || "") + "\n";
      } else if (part.type === "tool_use") {
        body += dim(`  ⚙ ${part.name || "tool"}: ${(part.input ? JSON.stringify(part.input).substring(0, 80) : "")}\n`);
      } else if (part.type === "tool_result") {
        body += dim(`  ✓ ${(part.content || "").substring(0, 120)}\n`);
      }
    }
  } else if (msg.content) {
    body = msg.content;
  }

  return `\n${header}\n${gray("─".repeat(60))}\n${body}`;
}

function renderThinking() {
  return `\n${dim("  Thinking...")}`;
}

function renderToolCall(tool) {
  return `\n${dim(`  ⚙ Running ${tool}...`)}`;
}

function renderStatus() {
  const session = state.sessionId
    ? cyan(state.sessionId.substring(0, 12))
    : dim("no session");
  const msgs = `${state.messages.length} msgs`;
  return gray(`\n┌${"─".repeat(state.width - 2)}┐\n│ ${bold("OpenCode")}  ${dim(CWD.substring(CWD.length - 40))}  │  ${session}  │  ${msgs}  │\n└${"─".repeat(state.width - 2)}┘`);
}

// ============================================================
//  Procesar eventos SSE
// ============================================================
async function processStream(stream) {
  process.stdout.write(t.cursorHide);

  for await (const event of streamSSE(stream)) {
    // El formato exacto depende de la API del servidor
    const type = event.type || event.event || "";

    if (type === "message" || type === "assistant" || type === "content_block_delta") {
      const text = event.content || event.text || event.delta?.text || "";
      if (text) {
        process.stdout.write(text);
        state.lastContent += text;
      }
    } else if (type === "content_block_start") {
      if (event.content_block?.type === "tool_use") {
        state.currentTool = event.content_block.name;
        process.stdout.write(dim(`\n  ⚙ ${state.currentTool} `));
      }
    } else if (type === "tool_use" || type === "tool_call") {
      state.currentTool = event.name || event.tool || "tool";
      process.stdout.write(dim(`\n  ⚙ ${state.currentTool}`));
    } else if (type === "tool_result" || type === "tool_response") {
      process.stdout.write(dim(` ✓`));
      state.currentTool = null;
    } else if (type === "message_start" || type === "assistant_start") {
      process.stdout.write("\n" + magenta(bold("  AI")) + "\n" + gray("─".repeat(60)) + "\n");
      state.lastContent = "";
    } else if (type === "message_stop" || type === "done" || type === "message_complete") {
      process.stdout.write("\n");
    } else if (type === "error") {
      process.stdout.write(red(`\n  ✗ ${event.message || "Error"}\n`));
    } else if (type === "thinking") {
      state.thinking = true;
      process.stdout.write(dim("\n  Thinking..."));
    } else if (event.text || event.content) {
      process.stdout.write(event.text || event.content || "");
    }
  }

  process.stdout.write("\n");
  process.stdout.write(t.cursorShow);
}

// ============================================================
//  Comandos slash
// ============================================================
async function handleCommand(input) {
  const parts = input.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1).join(" ");

  switch (cmd) {
    case "/help":
      process.stdout.write(`\n${bold("Comandos:")}
  ${cyan("/file <ruta>")}  Leer archivo
  ${cyan("/dir")}         Listar directorio
  ${cyan("/sessions")}    Listar sesiones
  ${cyan("/new")}         Nueva sesion
  ${cyan("/clear")}       Limpiar pantalla
  ${cyan("/diff")}        Ver diff de cambios
  ${cyan("/help")}        Ayuda
  ${cyan("/exit")}        Salir
\n`);
      return true;

    case "/file":
      if (!args) { process.stdout.write(red("  Uso: /file <ruta>\n")); return true; }
      try {
        const p = resolve(args);
        const content = readFileSync(p, "utf-8");
        process.stdout.write(`\n${cyan(p)} ${dim(`(${content.split("\\n").length} lines)`)}\n`);
        process.stdout.write(gray("─".repeat(60)) + "\n");
        process.stdout.write(content.substring(0, 2000));
        if (content.length > 2000) process.stdout.write(dim("\n... (truncated)\n"));
        process.stdout.write(gray("\n─".repeat(60)) + "\n");
      } catch (e) {
        process.stdout.write(red(`  ${e.message}\n`));
      }
      return true;

    case "/dir":
      try {
        const { readdirSync } = await import("fs");
        const items = readdirSync(args || ".", { withFileTypes: true });
        const maxLen = Math.max(...items.map(i => i.name.length)) + 2;
        const perRow = Math.max(1, Math.floor(state.width / maxLen));
        let out = `\n${bold(args || ".")}/\n`;
        for (let i = 0; i < items.length; i += perRow) {
          out += items.slice(i, i + perRow).map(e =>
            e.isDirectory() ? blue(e.name.padEnd(maxLen) + "/") : e.name.padEnd(maxLen)
          ).join("") + "\n";
        }
        process.stdout.write(out);
      } catch (e) {
        process.stdout.write(red(`  ${e.message}\n`));
      }
      return true;

    case "/sessions":
      try {
        const sessions = await api("GET", "session");
        if (Array.isArray(sessions)) {
          process.stdout.write(`\n${bold("Sessions:")}\n`);
          for (const s of sessions) {
            const title = s.title || s.id?.substring(0, 12) || "untitled";
            process.stdout.write(`  ${cyan(title)}  ${dim(s.id)}\n`);
          }
        }
        process.stdout.write("\n");
      } catch (e) {
        process.stdout.write(red(`  ${e.message}\n`));
      }
      return true;

    case "/new":
      await createSession();
      return true;

    case "/clear":
      process.stdout.write(t.clear);
      return true;

    case "/exit":
    case "/quit":
      process.stdout.write(t.cursorShow + dim("\n  Goodbye.\n\n"));
      process.exit(0);

    case "/diff":
      process.stdout.write(dim("\n  Diff not available in this mode. Check the server API.\n\n"));
      return true;
  }
  return false;
}

// ============================================================
//  Gestion de sesion
// ============================================================
async function createSession() {
  try {
    const result = await api("POST", "session", { title: "Termux Session" });
    const id = result?.id || result?.data?.id;
    if (id) {
      state.sessionId = id;
      process.stdout.write(green(`\n  ✓ Session: ${cyan(id)}\n\n`));
      return true;
    }
    process.stdout.write(red("\n  Failed to create session\n"));
  } catch (e) {
    process.stdout.write(red(`\n  Error: ${e.message}\n`));
  }
  return false;
}

async function sendPrompt(text) {
  if (!state.sessionId) {
    process.stdout.write(yellow("\n  Creating new session... "));
    const ok = await createSession();
    if (!ok) return;
  }

  // Mostrar el prompt del usuario
  process.stdout.write(`\n${blue(bold("  You"))}\n${gray("─".repeat(60))}\n${text}\n`);

  try {
    const { stream } = await api("POST", `session/${state.sessionId}/prompt`, {
      messages: [{ role: "user", content: text }],
    });

    if (stream) {
      await processStream(stream);
    } else {
      process.stdout.write(dim("\n  [Response received]\n"));
    }
  } catch (e) {
    process.stdout.write(red(`\n  Error: ${e.message}\n`));
    if (e.status === 404) {
      state.sessionId = null;
      process.stdout.write(yellow("  Session expired. Use /new to create a new one.\n"));
    }
  }

  process.stdout.write("\n");
}

// ============================================================
//  Main
// ============================================================
async function main() {
  // Banner
  process.stdout.write(t.clear);
  process.stdout.write(renderLogo() + "\n\n");
  process.stdout.write(dim(`  Server: ${SERVER_URL}\n`));
  process.stdout.write(dim(`  CWD:    ${CWD}\n`));
  process.stdout.write(dim("  Type /help for commands, or just start chatting.\n\n"));

  // Verificar servidor
  try {
    const res = await fetch(`${SERVER_URL}/api/session`, {
      headers: PWD ? { Authorization: `Bearer ${PWD}` } : {},
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok || res.status === 401) {
      process.stdout.write(green("  ✓ Server connected\n\n"));
    }
  } catch {
    process.stdout.write(yellow("  ⚠ Cannot connect to server\n\n"));
  }

  // Readline
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    historySize: 200,
    removeHistoryDuplicates: true,
  });

  // Prompt visual
  const prompt = () => {
    const sess = state.sessionId ? cyan(state.sessionId.substring(0, 8)) : dim("···");
    return `\n${sess} ${green(">")} `;
  };

  rl.on("line", async (input) => {
    const trimmed = input.trim();
    if (!trimmed) {
      rl.setPrompt(prompt());
      rl.prompt();
      return;
    }

    // Slash commands
    if (trimmed.startsWith("/")) {
      const handled = await handleCommand(trimmed);
      rl.setPrompt(prompt());
      rl.prompt();
      if (!handled) process.stdout.write(red("  Unknown command. /help\n"));
      return;
    }

    // Send to AI
    await sendPrompt(trimmed);

    // Footer
    process.stdout.write(renderStatus());

    rl.setPrompt(prompt());
    rl.prompt();
  });

  // Ctrl+C
  let ctrlC = 0;
  rl.on("SIGINT", () => {
    ctrlC++;
    if (ctrlC >= 2 || !state.sessionId) {
      process.stdout.write(t.cursorShow + dim("\n  Goodbye.\n\n"));
      process.exit(0);
    }
    process.stdout.write(dim("\n  Press Ctrl+C again to exit, or /exit.\n"));
    rl.setPrompt(prompt());
    rl.prompt();
    setTimeout(() => { ctrlC = 0; }, 2000);
  });

  // Manejar resize
  process.stdout.on("resize", () => {
    state.width = process.stdout.columns || 80;
    state.height = process.stdout.rows || 24;
  });

  rl.setPrompt(prompt());
  rl.prompt();
}

main().catch(e => {
  process.stdout.write(t.cursorShow + red(`\n  Fatal: ${e.message}\n`));
  process.exit(1);
});
