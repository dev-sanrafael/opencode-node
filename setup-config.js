#!/usr/bin/env node
// ============================================================
//  setup-config.js - Configuracion interactiva de API key
//  Ejecutar: node setup-config.js
// ============================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { createInterface } from 'readline';

const configDir = join(homedir(), '.opencode-termux');
const configFile = join(configDir, 'config.json');

const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
});

function ask(question) {
    return new Promise(resolve => rl.question(question, resolve));
}

async function main() {
    console.log('\n📋 OpenCode Termux - Configuracion de API Key');
    console.log('═══════════════════════════════════════════════\n');

    let config = {};
    if (existsSync(configFile)) {
        try {
            config = JSON.parse(readFileSync(configFile, 'utf-8'));
            console.log('(Configuracion existente encontrada. Se sobreescribira.)');
        } catch {}
    }

    console.log('Proveedores de IA disponibles:');
    console.log('  1. Anthropic (Claude) - https://console.anthropic.com/');
    console.log('  2. OpenAI (GPT)      - https://platform.openai.com/\n');

    const providerChoice = await ask('Elige proveedor [1/2] (default: 1): ');

    if (providerChoice.trim() === '2') {
        config.provider = 'openai';
        console.log('\nObten tu API key en: https://platform.openai.com/api-keys\n');
        const key = await ask('OpenAI API Key: ');
        if (!key.trim()) {
            console.log('❌ API key requerida. Abortando.');
            rl.close();
            process.exit(1);
        }
        config.apiKey = key.trim();

        const modelChoice = await ask('Modelo (default: gpt-4o): ');
        config.model = modelChoice.trim() || 'gpt-4o';

    } else {
        config.provider = 'anthropic';
        console.log('\nObten tu API key en: https://console.anthropic.com/settings/keys\n');
        const key = await ask('Anthropic API Key: ');
        if (!key.trim()) {
            console.log('❌ API key requerida. Abortando.');
            rl.close();
            process.exit(1);
        }
        config.apiKey = key.trim();

        console.log('\nModelos disponibles:');
        console.log('  - claude-sonnet-4-20250514  (recomendado, balance velocidad/calidad)');
        console.log('  - claude-opus-4-20250514    (maxima calidad, mas lento)');
        console.log('  - claude-3-5-haiku-20241022 (mas rapido y economico)\n');

        const modelChoice = await ask('Modelo (default: claude-sonnet-4-20250514): ');
        config.model = modelChoice.trim() || 'claude-sonnet-4-20250514';
    }

    // Guardar
    if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });
    writeFileSync(configFile, JSON.stringify(config, null, 2));

    console.log(`\n✅ Configuracion guardada en: ${configFile}`);
    console.log('   Ejecuta: opencode-termux  para iniciar el asistente.\n');

    rl.close();
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
