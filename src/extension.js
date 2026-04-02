'use strict';

/* some notes
Токены <|fim_prefix|>, <|fim_suffix|> и <|fim_middle|> — это стандарт именно семейства Qwen2.5-Coder.

Другие модели используют свои наборы «магических слов». Если ты завтра решишь попробовать другую модель, промпт придется менять:

Llama 3 / CodeLlama: Используют <PRE>, <SUF>, <MID>.

DeepSeek-Coder: Используют <｜fim begin｜>, <｜fim hole｜>, <｜fim end｜>.

StarCoder: Используют <fim_prefix>, <fim_suffix>, <fim_middle>.


<|file_separator|>
    Это «стена». Она говорит модели: «Всё, что было до этого токена — это другие файлы или системный шум. А вот сейчас начинается чистый лист конкретного файла».
<|fim_prefix|>
    Маркер начала «текста до курсора».
<|fim_suffix|>
    Маркер начала «текста после курсора».
<|fim_middle|>
    Команда «Пли!».
*/

const vscode = require('vscode');
const path = require('node:path');
const fs = require('node:fs');

/** @param {vscode.ExtensionContext} context */
async function activate(context) {

    /* create local storage directory if not exists
     */
    await fs.promises.stat(context.globalStorageUri.fsPath)
    .catch(
        err => fs.promises.mkdir(context.globalStorageUri.fsPath, { recursive: true }).then(() => undefined)
    )
    .then(stat => {
        if (stat && !stat.isDirectory) {
            throw new Error(`${context.globalStorageUri.fsPath} should be directory`);
        }
    });

    /* implement request logging
     */
    let logStream;
    function saveLog(message) {
        if (vscode.workspace.getConfiguration('myLocalAI').get('enabledLogging')) {
            if (! logStream) {
                logStream = fs.createWriteStream(
                    path.join(context.globalStorageUri.fsPath, 'ai_debug.log'),
                    { flags: 'a' }
                );
            }
            const base = {
                timestamp: new Date().toISOString(),
                trace: message.trace || `tx.${Date.now().toString(36)}`
            }
            logStream.write(JSON.stringify(
                Object.assign(base, message), null, '  '
            ) +'\n');
            return base.trace;
        }
        else if (logStream) {
            logStream.end();
            logStream = undefined;
            return '';
        }
    }

    // 1. Создаем команду для переключения (Toggle)
    const toggleCommand = 'myLocalAI.toggleEnabled';
    context.subscriptions.push(vscode.commands.registerCommand(toggleCommand, () => {
        const config = vscode.workspace.getConfiguration('myLocalAI');
        const currentState = config.get('enabled');
        // Инвертируем состояние в настройках пользователя
        config.update('enabled', !currentState, vscode.ConfigurationTarget.Global);
        
        const status = !currentState ? "On" : "Off";
        vscode.window.showInformationMessage(`Local AI: ${status}`);
    }));

    // Слушаем изменение настроек, чтобы сразу обновить статус-бар
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('myLocalAI.enabled')) {
            updateStatusBar(vscode.workspace.getConfiguration('myLocalAI').get('enabled'));
        }
    }));

    // создаем команду для сохранения в лог принятия completion
    context.subscriptions.push(vscode.commands.registerCommand('myLocalAI.logAcceptance', (trace) => {
        saveLog({trace, accepted: true});
    }));

    // 2. Настраиваем статус-бар с поддержкой команды
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = toggleCommand; // При клике вызовется наша команда
    statusBarItem.text = "$(circuit-board) Llama: Ready";
    statusBarItem.tooltip = "Local AI is active and watching your keystrokes";
    // statusBarItem.text = "$(sparkle) Llama: Ready";
    // statusBarItem.tooltip = "Локальный ИИ автокомплит активен";
    updateStatusBar(true);
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Вспомогательная функция для внешнего вида
    function updateStatusBar(enabled) {
        if (enabled) {
            statusBarItem.text = "$(primitive-dot) Llama: ON";
            statusBarItem.color = undefined;
            statusBarItem.tooltip = "Кликни, чтобы выключить ИИ";
        } else {
            statusBarItem.text = "$(circle-slash) Llama: OFF";
            statusBarItem.color = new vscode.ThemeColor('descriptionForeground');
            statusBarItem.tooltip = "Кликни, чтобы включить ИИ";
        }
    }
    
    
    const provider = {
        async provideInlineCompletionItems(document, position, context, token) {
            // Получаем текущие настройки
            const config = vscode.workspace.getConfiguration('myLocalAI');

            // ПРОВЕРКА РУБИЛЬНИКА
            if (!config.get('enabled')) return;

            // Перед паузой debounce (просто готовность)
            // statusBarItem.text = "$(circuit-board) Llama: Ready";
            // statusBarItem.color = undefined;

            // Задержка перед посылкой запроса
            await new Promise(resolve => setTimeout(resolve, config.get('debounceMs'))); 
            if (token.isCancellationRequested) return;

            const endpoint = config.get('endpoint');

            try {
            
                // Собираем параметры для подстановки
                const offset = document.offsetAt(position);
                const params = {
                    relativePath:   vscode.workspace.asRelativePath(document.uri),
                    lang:           document.languageId,
                    prefix:         document.getText().substring(Math.max(0, offset - config.get('prefix_length')), offset),
                    suffix:         document.getText().substring(offset, offset + config.get('suffix_length'))
                };

                // Формируем запрос по шаблону
                const prompt = config.get('promptTemplate').replace(/\{(.+?)\}/g, (match, key) => {
                    return params[key] !== undefined ? params[key] : match;
                });

                // ФАЗА: ЗАПРОС
                statusBarItem.text = "$(sync~spin) Llama: Thinking...";
                const reqBody = {
                    prompt: prompt,
                    stop: config.get('stop_tokens'),
                    stream: false,
                    ...config.get('modelParameters')
                };
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(reqBody)
                });

                if (!response.ok) return;

                const data = await response.json();

                // ФАЗА: УСПЕХ
                statusBarItem.text = "$(check) Llama: Done";
                // Возвращаем статус в Ready через секунду
                setTimeout(() => { statusBarItem.text = "$(circuit-board) Llama: Ready"; }, 1000);

                const trace = saveLog({
                    ...reqBody,
                    result:    data.content
                });
                
                // 3. Возвращаем результат в редактор
                const item = new vscode.InlineCompletionItem(data.content);
                item.range = new vscode.Range(position, position); // Явно говорим: "вставляй сюда"
                trace && (item.command = {
                    command: 'myLocalAI.logAcceptance',
                    title: 'Log Acceptance',
                    arguments: [trace] // Передаем текст, который был принят
                });
                return [item];
            } catch (err) {
                // ФАЗА: ОШИБКА
                statusBarItem.text = "$(warning) Llama: Offline";
                statusBarItem.color = new vscode.ThemeColor('errorForeground');
                console.error('Llama.cpp connection error:', err);
                return [];
            }
        }
    };

    // Регистрируем провайдер для всех языков программирования
    const selector = { pattern: '**/*' };
    context.subscriptions.push(
        vscode.languages.registerInlineCompletionItemProvider(selector, provider)
    );
}

function deactivate() {}

module.exports = { activate, deactivate };