#!/usr/bin/env node
// ============================================================
//  OpenCode Termux
//  AI Coding Assistant optimizado para Termux en Android
//  Compatible con ARM 32-bit (armv7l) y 64-bit (aarch64)
// ============================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { homedir } from 'os';
import { join, relative, resolve, dirname, basename } from 'path';
import { createInterface } from 'readline';
import { createHash, randomUUID } from 'crypto';

// ============================================================
//  CONFIGURACION
// ============================================================

const CONFIG_DIR = join(homedir(), '.opencode-termux');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const HISTORY_FILE = join(CONFIG_DIR, 'history.json');

function loadConfig() {
  if (!existsSync(CONFIG_FILE)) return null;
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

function saveConfig(config) {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// ============================================================
//  COLORES (chalk fallback manual para evitar dep pesada)
// ============================================================

const color = (() => {
  try {
    return (await import('chalk')).default;
  } catch {
    return {
      cyan: (s) => `\x1b[36m${s}\x1b[0m`,
      green: (s) => `\x1b[32m${s}\x1b[0m`,
      yellow: (s) => `\x1b[33m${s}\x1b[0m`,
      red: (s) => `\x1b[31m${s}\x1b[0m`,
      blue: (s) => `\x1b[34m${s}\x1b[0m`,
      magenta: (s) => `\x1b[35m${s}\x1b[0m`,
      gray: (s) => `\x1b[90m${s}\x1b[0m`,
      dim: (s) => `\x1b[2m${s}\x1b[0m`,
      bold: (s) => `\x1b[1m${s}\x1b[0m`,
    };
  }
})();

// ============================================================
//  PROVEEDORES AI
// ============================================================

async function createClient(config) {
  if (config.provider === 'openai') {
    const { default: OpenAI } = await import('openai');
    return {
      type: 'openai',
      client: new OpenAI({ apiKey: config.apiKey }),
      model: config.model || 'gpt-4o',
    };
  } else {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    return {
      type: 'anthropic',
      client: new Anthropic({ apiKey: config.apiKey }),
      model: config.model || 'claude-sonnet-4-20250514',
    };
  }
}

async function chat(ai, messages, onToken) {
  const systemMsg = messages.find(m => m.role === 'system');
  const chatMessages = messages.filter(m => m.role !== 'system');

  if (ai.type === 'openai') {
    const stream = await ai.client.chat.completions.create({
      model: ai.model,
      messages: systemMsg
        ? [{ role: 'system', content: systemMsg.content }, ...chatMessages]
        : chatMessages,
      stream: true,
      max_tokens: 8192,
    });
    let full = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (delta) {
        full += delta;
        onToken(delta);
      }
    }
    return full;
  } else {
    const stream = await ai.client.messages.stream({
      model: ai.model,
      max_tokens: 8192,
      system: systemMsg ? [{ type: 'text', text: systemMsg.content }] : undefined,
      messages: chatMessages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    });
    let full = '';
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.text) {
        full += event.delta.text;
        onToken(event.delta.text);
      }
    }
    return full;
  }
}

// ============================================================
//  SISTEMA DE ARCHIVOS
// ============================================================

function safeReadFile(filepath) {
  const resolved = resolve(filepath);
  try {
    const stats = statSync(resolved);
    if (stats.size > 500_000) {
      return `[Archivo demasiado grande: ${(stats.size / 1024).toFixed(1)} KB. Solo se muestran las primeras 500 lineas]\n\n` +
        readFileSync(resolved, 'utf-8').split('\n').slice(0, 500).join('\n') +
        '\n\n[... truncado ...]';
    }
    return readFileSync(resolved, 'utf-8');
  } catch (err) {
    return `[Error al leer archivo: ${err.message}]`;
  }
}

function safeWriteFile(filepath, content) {
  const resolved = resolve(filepath);
  const dir = dirname(resolved);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(resolved, content, 'utf-8');
}

function listDir(dirpath) {
  const resolved = resolve(dirpath || '.');
  try {
    const entries = readdirSync(resolved, { withFileTypes: true });
    return entries.map(e => {
      const suffix = e.isDirectory() ? '/' : '';
      return `${e.name}${suffix}`;
    }).sort((a, b) => {
      const aDir = a.endsWith('/');
      const bDir = b.endsWith('/');
      if (aDir && !bDir) return -1;
      if (!aDir && bDir) return 1;
      return a.localeCompare(b);
    });
  } catch (err) {
    return [`Error: ${err.message}`];
  }
}

// ============================================================
//  GESTION DE CONTEXTO
// ============================================================

const MAX_HISTORY = 30; // Maximos mensajes en contexto
let contextFiles = {};   // Archivos cargados como contexto: { path: content }

function buildSystemPrompt(cwd) {
  const filesContext = Object.entries(contextFiles)
    .map(([path, content]) => {
      const ext = path.split('.').pop();
      return `<file path="${path}">\n${content}\n</file>`;
    })
    .join('\n\n');

  const filesSection = filesContext
    ? `\n\nArchivos en contexto:\n${filesContext}\n`
    : '';

  return `Eres un asistente de programacion ejecutandose en Termux (Android).
Trabajas en el directorio: ${cwd}

Responde de forma concisa y directa. Cuando escribas codigo, usa bloques de codigo con el lenguaje especificado.
Puedes leer y escribir archivos del sistema. El usuario puede usar comandos como /file para darte contexto.${filesSection}`;
}

// ============================================================
//  COMANDOS SLASH
// ============================================================

function handleCommand(input, cwd) {
  const parts = input.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1).join(' ');

  switch (cmd) {
    case '/help':
    case '/ayuda':
    case '/h':
      return {
        type: 'output',
        text: `
${color.bold('Comandos disponibles:')}

  ${color.cyan('/file <ruta>')}     Leer archivo y agregarlo al contexto de la conversacion
  ${color.cyan('/files')}           Mostrar archivos en contexto
  ${color.cyan('/drop <ruta>')}     Quitar archivo del contexto
  ${color.cyan('/dir [ruta]')}      Listar directorio actual
  ${color.cyan('/write <ruta>')}    Guardar la ultima respuesta en un archivo
  ${color.cyan('/clear')}           Limpiar contexto de la conversacion
  ${color.cyan('/model <nombre>')}  Cambiar modelo (requiere reiniciar)
  ${color.cyan('/history')}         Mostrar historial de mensajes
  ${color.cyan('/save')}            Guardar sesion actual
  ${color.cyan('/load')}            Cargar ultima sesion guardada
  ${color.cyan('/key')}             Cambiar API key
  ${color.cyan('/cwd <ruta>')}      Cambiar directorio de trabajo
  ${color.cyan('/exit, /quit')}     Salir

${color.dim('Consejo: Usa /file para darle contexto al asistente sobre tu proyecto.')}
${color.dim('Las teclas extra de Termux te dan acceso a TAB, CTRL, ESC, etc.')}
`.trim(),
      };

    case '/file':
    case '/f':
      if (!args) return { type: 'error', text: 'Uso: /file <ruta-del-archivo>' };
      {
        const path = resolve(args);
        const content = safeReadFile(path);
        contextFiles[path] = content;
        const lines = content.split('\n').length;
        return {
          type: 'output',
          text: `${color.green('[✓]')} Archivo agregado al contexto: ${color.cyan(args)} (${lines} lineas)`,
        };
      }

    case '/files':
      if (Object.keys(contextFiles).length === 0) {
        return { type: 'output', text: color.dim('No hay archivos en contexto. Usa /file <ruta> para agregar.') };
      }
      return {
        type: 'output',
        text: Object.keys(contextFiles).map(f => `  ${color.cyan(f)}`).join('\n'),
      };

    case '/drop':
      if (!args) return { type: 'error', text: 'Uso: /drop <ruta-del-archivo>' };
      {
        const path = resolve(args);
        if (contextFiles[path]) {
          delete contextFiles[path];
          return { type: 'output', text: `${color.green('[✓]')} Archivo removido del contexto` };
        }
        return { type: 'error', text: 'Archivo no encontrado en contexto' };
      }

    case '/dir':
    case '/ls':
      {
        const target = args || '.';
        const entries = listDir(target);
        const cols = process.stdout.columns || 80;
        const maxLen = Math.max(...entries.map(e => e.length)) + 2;
        const itemsPerRow = Math.max(1, Math.floor(cols / maxLen));
        let output = `${color.bold(target)}/\n`;
        for (let i = 0; i < entries.length; i += itemsPerRow) {
          output += entries.slice(i, i + itemsPerRow)
            .map(e => e.endsWith('/') ? color.blue(e) : e)
            .map(e => e.padEnd(maxLen))
            .join('') + '\n';
        }
        return { type: 'output', text: output.trimEnd() };
      }

    case '/clear':
    case '/c':
      contextFiles = {};
      return { type: 'clear', text: '' };

    case '/write':
    case '/w':
      if (!args) return { type: 'error', text: 'Uso: /write <ruta-del-archivo>' };
      return { type: 'write', path: args };

    case '/model':
      if (!args) {
        const config = loadConfig();
        return { type: 'output', text: `Modelo actual: ${color.cyan(config?.model || 'no configurado')}` };
      }
      {
        const config = loadConfig() || {};
        config.model = args;
        saveConfig(config);
        return { type: 'output', text: `${color.green('[✓]')} Modelo cambiado a: ${color.cyan(args)} (reinicia para aplicar)` };
      }

    case '/key':
      return { type: 'key', text: '' };

    case '/cwd':
    case '/cd':
      if (!args) return { type: 'output', text: `Directorio actual: ${color.cyan(cwd)}` };
      {
        const newCwd = resolve(args);
        if (existsSync(newCwd)) {
          process.chdir(newCwd);
          return { type: 'output', text: `${color.green('[✓]')} Directorio: ${color.cyan(newCwd)}` };
        }
        return { type: 'error', text: `Directorio no encontrado: ${args}` };
      }

    case '/history':
      return { type: 'history', text: '' };

    case '/save':
      return { type: 'save', text: '' };

    case '/load':
      return { type: 'load', text: '' };

    case '/exit':
    case '/quit':
    case '/q':
      return { type: 'exit', text: '' };

    default:
      return { type: 'error', text: `Comando desconocido: ${cmd}. Usa /help para ver comandos.` };
  }
}

// ============================================================
//  PERSISTENCIA DE SESION
// ============================================================

function saveSession(messages, cwd) {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  const session = {
    timestamp: new Date().toISOString(),
    cwd,
    messages: messages.slice(-50), // ultimas 50
  };
  writeFileSync(HISTORY_FILE, JSON.stringify(session, null, 2));
}

function loadSession() {
  if (!existsSync(HISTORY_FILE)) return null;
  try {
    return JSON.parse(readFileSync(HISTORY_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

// ============================================================
//  EXTRACCION DE BLOQUES DE CODIGO
// ============================================================

function extractCodeBlocks(text) {
  const blocks = [];
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    blocks.push({ language: match[1] || 'text', code: match[2].trim() });
  }
  return blocks;
}

// ============================================================
//  INTERFAZ PRINCIPAL
// ============================================================

async function main() {
  const args = process.argv.slice(2);

  // --- Comandos rapidos ---
  if (args.includes('--setup') || args.includes('-s')) {
    const { spawn } = await import('child_process');
    const setupScript = join(CONFIG_DIR, 'setup-config.js');
    if (existsSync(setupScript)) {
      spawn('node', [setupScript], { stdio: 'inherit', cwd: CONFIG_DIR });
    } else {
      console.log(color.red('setup-config.js no encontrado. Ejecuta setup.sh primero.'));
    }
    return;
  }

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
${color.bold('OpenCode Termux')} - AI Coding Assistant para Android

${color.cyan('Uso:')}
  opencode-termux              Iniciar sesion interactiva
  opencode-termux --setup      Configurar API key
  opencode-termux --help       Esta ayuda

${color.cyan('Primer uso:')}
  1. Ejecuta ${color.bold('opencode-termux --setup')} para configurar tu API key
  2. Ejecuta ${color.bold('opencode-termux')} para iniciar

${color.cyan('Requisitos:')}
  - Termux actualizado
  - Node.js >= 18 (nodejs-lts)
  - API key de Anthropic (Claude) u OpenAI (GPT)
`);
    return;
  }

  // --- Cargar configuracion ---
  const config = loadConfig();
  if (!config || !config.apiKey) {
    console.log(color.yellow('\n⚠ No se encontro configuracion de API key.\n'));
    console.log('Ejecuta:  ' + color.bold('opencode-termux --setup'));
    console.log('O define: ' + color.bold('export OPENCODE_TERMUX_KEY="tu-api-key"'));
    console.log('');
    process.exit(1);
  }

  // --- Inicializar ---
  console.log(color.dim('\nIniciando OpenCode Termux...\n'));

  let ai;
  try {
    ai = await createClient(config);
  } catch (err) {
    console.log(color.red(`Error al conectar con ${config.provider}: ${err.message}`));
    console.log(color.yellow('Verifica tu API key con: opencode-termux --setup'));
    process.exit(1);
  }

  const cwd = process.cwd();
  let messages = [{ role: 'system', content: buildSystemPrompt(cwd) }];
  let lastResponse = '';

  // Intentar cargar sesion previa
  const savedSession = loadSession();
  if (savedSession && savedSession.messages?.length > 0) {
    console.log(color.dim(`[Sesion previa encontrada: ${savedSession.timestamp}]`));
    console.log(color.dim('Usa /load para cargarla o escribe para empezar de nuevo.\n'));
  }

  // --- Bienvenida ---
  console.log(color.bold('OpenCode Termux') + color.dim(' v1.0.0'));
  console.log(color.dim(`Proveedor: ${config.provider}  |  Modelo: ${ai.model}`));
  console.log(color.dim(`Directorio: ${cwd}`));
  console.log(color.dim('Escribe /help para ver comandos. Escribe tu consulta.\n'));

  // --- Readline ---
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    historySize: 100,
    removeHistoryDuplicates: true,
  });

  const prompt = () => {
    const fileCount = Object.keys(contextFiles).length;
    const indicator = fileCount > 0 ? ` [${fileCount} files]` : '';
    return color.green('> ') + color.dim(indicator) + ' ';
  };

  // Manejar Ctrl+C graceful
  let exiting = false;
  rl.on('SIGINT', () => {
    if (exiting) {
      console.log(color.dim('\nSaliendo...'));
      process.exit(0);
    }
    console.log(color.dim('\n\nPresiona Ctrl+C de nuevo para salir, o /exit.'));
    rl.prompt();
    exiting = true;
    setTimeout(() => { exiting = false; }, 2000);
  });

  // --- Loop principal ---
  const ask = () => {
    rl.setPrompt(prompt());
    rl.prompt();
  };

  rl.on('line', async (input) => {
    const trimmed = input.trim();
    if (!trimmed) {
      ask();
      return;
    }

    // --- Slash commands ---
    if (trimmed.startsWith('/')) {
      const result = handleCommand(trimmed, cwd);

      switch (result.type) {
        case 'output':
          console.log('\n' + result.text + '\n');
          break;
        case 'error':
          console.log(color.red('[✗] ') + result.text + '\n');
          break;
        case 'exit':
          console.log(color.dim('\n¡Hasta luego!\n'));
          rl.close();
          process.exit(0);
        case 'clear':
          messages = [{ role: 'system', content: buildSystemPrompt(cwd) }];
          console.log(color.green('\n[✓] Contexto limpiado\n'));
          break;
        case 'write':
          if (lastResponse) {
            const blocks = extractCodeBlocks(lastResponse);
            if (blocks.length > 0) {
              safeWriteFile(result.path, blocks[0].code);
              console.log(color.green(`\n[✓] Escrito: ${result.path} (${blocks[0].code.split('\n').length} lineas)\n`));
            } else {
              safeWriteFile(result.path, lastResponse);
              console.log(color.green(`\n[✓] Escrito: ${result.path}\n`));
            }
          } else {
            console.log(color.red('\n[✗] No hay respuesta anterior para guardar\n'));
          }
          break;
        case 'key':
          {
            console.log(color.yellow('\nCambiando API key...\n'));
            const answer = await new Promise(resolve => {
              rl.question('Nueva API Key: ', resolve);
            });
            if (answer.trim()) {
              const cfg = loadConfig() || {};
              cfg.apiKey = answer.trim();
              saveConfig(cfg);
              ai = await createClient(cfg);
              console.log(color.green('\n[✓] API key actualizada\n'));
            }
          }
          break;
        case 'history':
          console.log(color.dim('\n--- Historial de mensajes ---'));
          messages.filter(m => m.role !== 'system').forEach((m, i) => {
            const role = m.role === 'user' ? color.green('Tu') : color.cyan('IA');
            const preview = m.content.substring(0, 80).replace(/\n/g, ' ');
            console.log(color.dim(`  ${i + 1}. ${role}: ${preview}...`));
          });
          console.log('');
          break;
        case 'save':
          saveSession(messages, cwd);
          console.log(color.green('\n[✓] Sesion guardada\n'));
          break;
        case 'load':
          if (savedSession) {
            messages = savedSession.messages;
            if (savedSession.cwd && existsSync(savedSession.cwd)) {
              process.chdir(savedSession.cwd);
            }
            console.log(color.green('\n[✓] Sesion cargada\n'));
          } else {
            console.log(color.dim('\nNo hay sesion guardada.\n'));
          }
          break;
      }

      ask();
      return;
    }

    // --- Chat normal ---
    messages.push({ role: 'user', content: trimmed });

    // Limitar historial
    const sysMsg = messages.find(m => m.role === 'system');
    const chatMsgs = messages.filter(m => m.role !== 'system');
    if (chatMsgs.length > MAX_HISTORY) {
      const keep = chatMsgs.slice(-MAX_HISTORY);
      messages = sysMsg ? [sysMsg, ...keep] : keep;
    }

    // Actualizar system prompt con archivos en contexto
    messages[0] = { role: 'system', content: buildSystemPrompt(cwd) };

    // Llamar a la IA
    console.log(color.dim('\n---\n'));
    let tokenCount = 0;
    const startTime = Date.now();

    try {
      // Stream
      process.stdout.write(''); // flush
      const response = await chat(ai, messages, (token) => {
        process.stdout.write(token);
        tokenCount++;
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(color.dim(`\n\n[${tokenCount} tokens | ${elapsed}s]`));
      console.log('');

      messages.push({ role: 'assistant', content: response });
      lastResponse = response;

    } catch (err) {
      console.log(color.red(`\n\n[Error: ${err.message}]\n`));
      // Quitar el mensaje del usuario que fallo
      messages.pop();
    }

    ask();
  });

  ask();

  // Manejar cierre limpio
  rl.on('close', () => {
    saveSession(messages, cwd);
  });
}

main().catch(err => {
  console.error(color.red(`Error fatal: ${err.message}`));
  process.exit(1);
});
