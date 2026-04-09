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


"description": "Шаблон FIM-запроса. Используйте {prefix}, {suffix}, {relativePath} и {lang} как подстановочные знаки."
"description": "Токены, на которых модель должна остановиться"
*/

const vscode = require('vscode');
const path = require('node:path');
const fs = require('node:fs');

/* implement request logging
 * message - object to write or (false) to close log
 */
function createLogger(fsPath) {
    let logStream;
    return function (message) {
        if (vscode.workspace.getConfiguration('simple-local-ai.completion').get('enabledLogging') && !!message) {
            if (! logStream) {
                logStream = fs.createWriteStream(
                    path.join(fsPath, 'ai_debug.log'),
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
}

let saveLog;

/** @param {vscode.ExtensionContext} context */
async function activate(context) {
    const ACCEPTANCE_COOLDOWN = 1500;
    let lastAcceptedTimestamp;

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

    saveLog = createLogger(context.globalStorageUri.fsPath);

    const statusBarCtrl = (() => {
        const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        statusBarItem.command = 'simple-local-ai.completion.toggleEnabled';

        const ctrl = {
            setOff:     0,
            setOn:      1,
            setError:   2,
            setReady:   3,
            setReq:     4,
            setRes:     5,
            command:    statusBarItem.command,
            update(status, tooltip) {
                const presetName = vscode.workspace.getConfiguration('simple-local-ai.completion').get('presetSelected')
                switch (status) {
                    case ctrl.setOff:
                        statusBarItem.text = "$(circle-slash) ai.completion: OFF";
                        statusBarItem.color = new vscode.ThemeColor('descriptionForeground');
                        statusBarItem.tooltip = "Кликни, чтобы включить ИИ";
                        break;
                    case ctrl.setOn:
                        statusBarItem.text = `$(primitive-dot) ${presetName}`;
                        statusBarItem.color = undefined;
                        statusBarItem.tooltip = "Кликни, чтобы выключить ИИ";
                        break;
                    case ctrl.setReady:
                        statusBarItem.text = `$(primitive-dot) ${presetName}`;
                        statusBarItem.color = undefined;
                        statusBarItem.tooltip = "Кликни, чтобы выключить ИИ";
                        break;
                    case ctrl.setReq:
                        statusBarItem.text = "$(sync~spin) Thinking...";
                        statusBarItem.color = undefined;
                        statusBarItem.tooltip = "Кликни, чтобы выключить ИИ";
                        break;
                    case ctrl.setRes:
                        statusBarItem.text = `$(check) ${presetName}`;
                        statusBarItem.color = undefined;
                        statusBarItem.tooltip = "Кликни, чтобы выключить ИИ";
                        break;
                    case ctrl.setError:
                        statusBarItem.text = `$(error) ai.completion:ERROR`;
                        statusBarItem.color = new vscode.ThemeColor('errorForeground');
                        statusBarItem.tooltip = "Кликни, чтобы выключить ИИ";
                        break;
                }
            }
        }

        ctrl.update(vscode.workspace.getConfiguration('simple-local-ai.completion').get('enabled') ? 1 : 0);
        statusBarItem.show();
        context.subscriptions.push(statusBarItem);

        // Слушаем изменение настроек, чтобы сразу обновить статус-бар
        context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('simple-local-ai.completion.enabled')) {
                ctrl.update(vscode.workspace.getConfiguration('simple-local-ai.completion').get('enabled') ? 1 : 0);
            }
        }));

        return ctrl;
    })();

    const provider = {};
    provider.provideInlineCompletionItems = async function (document, position, context, token) {
        try {
            // Если пользователь уже выбирает что-то из выпадающего списка (IntelliSense),
            // лучше не мешать, чтобы не было "каши" на экране.
            if (context.selectedCompletionInfo) {
                return [];

            }

            // после принятия предложения, мы должны "замерзнуть" на некоторое время, чтобы не было "каши" на экране.            
            if (Date.now() - lastAcceptedTimestamp < ACCEPTANCE_COOLDOWN) {
                return { items: [] };
            }

            // Получаем текущие настройки
            const config = vscode.workspace.getConfiguration('simple-local-ai.completion');

            // ПРОВЕРКА РУБИЛЬНИКА
            if (!config.get('enabled')) return[];

            // Перед паузой debounce (просто готовность)
            // statusBarItem.text = "$(circuit-board) Llama: Ready";
            // statusBarItem.color = undefined;

            // Задержка перед посылкой запроса
            await new Promise(resolve => setTimeout(resolve, config.get('debounceMs'))); 
            if (token.isCancellationRequested) return[];

            // Ищем выбранный пресет
            const activePreset = (() => {
                const selectedName = config.get('presetSelected');
                const allPresets = config.get('presetSource') || [];
                return (allPresets.find(p => p.name === selectedName)) || allPresets[0];
            })();

            // Собираем параметры для подстановки
            const offset = document.offsetAt(position);
            const params = {
                relativePath:   vscode.workspace.asRelativePath(document.uri),
                lang:           document.languageId,
                prefix:         document.getText().substring(Math.max(0, offset - activePreset.prefixLength), offset),
                suffix:         document.getText().substring(offset, offset + activePreset.suffixLength),
            };

            // Формируем запрос по шаблону
            const prompt = activePreset.promptTemplate.replace(/\{(.+?)\}/g, (match, key) => {
                return params[key] !== undefined ? params[key] : match;
            });

            // ФАЗА: ЗАПРОС
            statusBarCtrl.update(statusBarCtrl.setReq);
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

            // ФАЗА: УСПЕХ
            statusBarCtrl.update(statusBarCtrl.setRes);
            // Возвращаем статус в Ready через секунду
            setTimeout(() => statusBarCtrl.update(statusBarCtrl.setReady), 1000);

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
            return [item];
        } catch (err) {
            // ФАЗА: ОШИБКА
            statusBarCtrl.update(statusBarCtrl.setError, `$err.message`);
            console.error('Llama.cpp connection error:', err);
            return [];
        }
    }

    // Регистрируем провайдер для всех языков программирования
    context.subscriptions.push(
        vscode.languages.registerInlineCompletionItemProvider({ pattern: '**/*' }, provider)
    );

    // Создаем команду для переключения (Toggle)
    context.subscriptions.push(vscode.commands.registerCommand(statusBarCtrl.command, () => {
        const config = vscode.workspace.getConfiguration('simple-local-ai.completion');
        const isEnabled = config.get('enabled');

        // Инвертируем состояние в настройках пользователя
        config.update('enabled', !isEnabled, vscode.ConfigurationTarget.Global);
    }));

    // создаем команду для сохранения в лог принятия completion
    context.subscriptions.push(vscode.commands.registerCommand('simple-local-ai.completion.accepted', (trace) => {
        lastAcceptedTimestamp = Date.now();
        trace && saveLog({trace, accepted: true});
    }));

    // создаем команду для выбора пресета
    context.subscriptions.push(vscode.commands.registerCommand('simple-local-ai.completion.selectPreset', async () => {
        const config = vscode.workspace.getConfiguration('simple-local-ai.completion');
        const presets = config.get('presetSource') || [];

        if (presets.length === 0) {
            vscode.window.showWarningMessage("Список пресетов пуст!");
            return;
        }

        // Выводим список имен для выбора
        const items = presets.map(p => p.name);
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Выберите модель для автокомплита'
        });

        if (selected) {
            // Сохраняем выбор в настройки пользователя (Global)
            await config.update('presetSelected', selected, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(`Активная модель: ${selected}`);
        }
    }));
}

function deactivate() {
    saveLog(false);
}

module.exports = { activate, deactivate };