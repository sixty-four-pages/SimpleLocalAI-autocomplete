'use strict';

/**
 * @typedef {Object} LoggerController
 * @property {function(Object): (string|undefined)} log - Записать сообщение
 * @property {function(): void} enable - Включить запись
 * @property {function(): void} disable - Выключить запись и закрыть стрим
 */

const fs = require('node:fs');
const path = require('path');
const vscode = require('vscode');

/**
 * Creates a work folder if it does not exist
 * @param {Context} context
 */
exports.createWorkFolder = function(context) {
    return fs.promises.stat(context.globalStorageUri.fsPath)
    .catch(
        err => fs.promises.mkdir(context.globalStorageUri.fsPath, { recursive: true }).then(() => undefined)
    )
    .then(stat => {
        if (stat && !stat.isDirectory) {
            throw new Error(`${context.globalStorageUri.fsPath} should be directory`);
        }
    });
}

/**
 * @param {string} storagePath - Путь к папке логов (context.extensionPath или context.globalStoragePath)
 * @returns {LoggerController}
 */
exports.initLogger = function(storagePath) {
    let logStream = null;
    const logFilePath = path.join(storagePath, 'ai_debug.log');

    const ctrl = {
        log: (message) => {
            if (!logStream || !message) return undefined;

            const base = {
                timestamp: new Date().toISOString(),
                trace: message.trace || `tx.${Date.now().toString(36)}`
            };

            const entry = Object.assign(base, message);
            logStream.write(JSON.stringify(entry, null, 2) + '\n');
            
            return base.trace;
        },

        enable: () => {
            if (logStream) {
                return;
            }
            logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
        },

        disable: () => {
            if (! logStream) {
                return;
            }
            logStream.end();
            logStream = null;
        }
    };

    return ctrl;
};

/**
 * Initializes the status bar item, returns a ctrl object with methods to show status bar
 * @returns {{
 * getItem: () => vscode.StatusBarItem,
 * showStatus: (config) => void,
 * showThinking: (config) => void,
 * showSuccess: (config) => void,
 * showError: (config) => void,
 * }} 
 */
exports.initStatusBarCtrl = function() {
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.show();

    var presetName = '';

    const ctrl = {
        getItem: () => statusBarItem,
        showStatus: (config) => {
            if (config.get('enabled')) {
                presetName = config.get('presetSelected');
                statusBarItem.text = `$(primitive-dot) ${presetName}`;
                statusBarItem.color = undefined;
                statusBarItem.tooltip = "Кликни, чтобы выключить ИИ";
            } else {
                statusBarItem.text = "$(circle-slash) ai.completion: OFF";
                statusBarItem.color = new vscode.ThemeColor('descriptionForeground');
                statusBarItem.tooltip = "Кликни, чтобы включить ИИ";
            }
        },
        showThinking: (config) => {
            presetName = config.get('presetSelected');
            statusBarItem.text = "$(sync~spin) Thinking...";
            statusBarItem.color = undefined;
        },
        showSuccess: (text) => {
            statusBarItem.text = `$(check) ${presetName} ${text}`;
            statusBarItem.color = undefined;
        },
        showError: () => {
            statusBarItem.text = `$(error) ${presetName}`;
            statusBarItem.color = new vscode.ThemeColor('errorForeground');
        }
    }
    return ctrl;
};

/**
 * Build prompt from document at current position
 * @param {object} activePreset
 * @param {vscode.TextDocument} document
 * @param {vscode.Position} position
 * @returns {string}
 */
function buildPrompt(activePreset, document, position) {
    const currentLine = document.lineAt(position.line).text;
    const params = {
        relativePath: vscode.workspace.asRelativePath(document.uri),
        lang: document.languageId,
        prefix: currentLine.substring(0, position.character),
        suffix: currentLine.substring(position.character),
    }
    
    /**
     * Проверка лимита
     */
    if (params.prefix.length + params.suffix.length > activePreset.prefixLength + activePreset.suffixLength) {
        return;
    }
    
    for (let pLine = position.line - 1; pLine >= 0; pLine--) {
        const lineText = document.lineAt(pLine).text + "\n";
        
        // Проверка лимита
        if (params.prefix.length + lineText.length > activePreset.prefixLength) {
            break;
        }
        
        params.prefix = lineText + params.prefix;
    }

    for (let sLine = position.line + 1; sLine < document.lineCount; sLine++) {
        const lineText = "\n" + document.lineAt(sLine).text;
        
        if (params.suffix.length + lineText.length > activePreset.suffixLength) {
            break;
        }
        
        params.suffix = params.suffix + lineText;
    }

    // Формируем запрос по шаблону
    const prompt = activePreset.promptTemplate.replace(/\{(.+?)\}/g, (match, key) => {
        return params[key] !== undefined ? params[key] : match;
    });

    // console.log('prefix: ', params.prefix);
    // console.log('suffix: ', params.suffix);
    
    return prompt;
}

exports.createProvider = function (getConfiguration, statusBarCtrl, saveLog) {
    const ACCEPTANCE_COOLDOWN = 1500;
    let lastAcceptedTimestamp;
    const provider = {};
    provider.provideInlineCompletionItems = async function (document, position, context, token) {
        const offer = [];
        try {

            // Если пользователь уже выбирает что-то из выпадающего списка (IntelliSense),
            // лучше не мешать, чтобы не было "каши" на экране.
            if (context.selectedCompletionInfo) {
                return offer;
            }

            // после принятия предложения, мы должны "замерзнуть" на некоторое время, чтобы не было "каши" на экране.            
            if (Date.now() - lastAcceptedTimestamp < ACCEPTANCE_COOLDOWN) {
                return offer;
            }

            // Получаем текущие настройки
            const config = getConfiguration();

            // ПРОВЕРКА РУБИЛЬНИКА
            if (!config.get('enabled')) return offer;

            // Перед паузой debounce (просто готовность)
            // statusBarItem.text = "$(circuit-board) Llama: Ready";
            // statusBarItem.color = undefined;

            // Задержка перед посылкой запроса
            await new Promise(resolve => setTimeout(resolve, config.get('debounceMs'))); 
            if (token.isCancellationRequested) return offer;

            // Ищем выбранный пресет
            const activePreset = (() => {
                const selectedName = config.get('presetSelected');
                const allPresets = config.get('presetSource') || [];
                return (allPresets.find(p => p.name === selectedName)) || allPresets[0];
            })();

            // ФАЗА: ЗАПРОС
            statusBarCtrl.showThinking(config);
            if (!activePreset) throw new Error('No active preset selected');

            const prompt = buildPrompt(activePreset, document, position);
            
            const reqBody = {
                prompt: prompt,
                stop: activePreset.stopTokens,
                stream: false,
                ...activePreset.modelParameters
            };
            const timestamp = Date.now();
            const response = await fetch(activePreset.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...activePreset.requestHeaders},
                body: JSON.stringify(reqBody)
            });

            if (!response.ok) return[];

            const data = await response.json();

            // console.log('data:', JSON.stringify(data, null, '  '), '-----');

            // ФАЗА: УСПЕХ
            statusBarCtrl.showSuccess(`$(arrow-small-right) ${data.tokens_evaluated}+${data.tokens_predicted}`);
            // Возвращаем статус в Ready через секунду
            // setTimeout(() => statusBarCtrl.update(statusBarCtrl.setReady), 1000);

            const trace = saveLog({
                ...reqBody,
                result:    data.content,
                timeToRequest: (Date.now() - timestamp)
            });
            
            // 3. Возвращаем результат в редактор
            const item = new vscode.InlineCompletionItem(data.content);
            item.range = new vscode.Range(position, position); // Явно говорим: "вставляй сюда"
            item.command = {
                command: 'simple-local-ai.completion.accepted',
                title: 'Completion Accepted',
                arguments: [trace] // Передаем идентификатор запроса, если он был
            };
            offer.push(item);
        } catch (err) {
            // ФАЗА: ОШИБКА
            console.error('Error:', err);
            statusBarCtrl.showError(`$err.message`);
        }
        return offer;
    }

    const acceptanceHandler = (trace) => {
        lastAcceptedTimestamp = Date.now();
        trace && saveLog({trace, accepted: true});
    }

    return [provider, acceptanceHandler];
};
