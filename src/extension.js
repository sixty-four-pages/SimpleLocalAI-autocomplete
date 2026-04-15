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
const tools = require('./tools.js');

const root = {
    logger: null
}



/** @param {vscode.ExtensionContext} context */
async function activate(context) {

    const getConfiguration = () => vscode.workspace.getConfiguration('simple-local-ai.completion');

    await tools.createWorkFolder(context);

    root.logger = tools.initLogger(context.globalStorageUri.fsPath);

    const statusBarCtrl = tools.initStatusBarCtrl();
    statusBarCtrl.showStatus(getConfiguration());
    // Создаем команду для переключения (Toggle)
    statusBarCtrl.getItem().command = 'simple-local-ai.completion.toggleEnabled';
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'simple-local-ai.completion.toggleEnabled',
            () => {
                // Инвертируем состояние в настройках пользователя
                const config = getConfiguration();
                config.update('enabled', !config.get('enabled'), vscode.ConfigurationTarget.Global);
            }
        )
    );
    // Слушаем изменение настроек, чтобы сразу обновить статус-бар
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('simple-local-ai.completion.enabled')) {
                statusBarCtrl.showStatus(getConfiguration());
            }
            if (e.affectsConfiguration('simple-local-ai.completion.enabledLogging')) {
                getConfiguration().get('enabledLogging')
                    ? root.logger.enable()
                    : root.logger.disable();
            }
        })
    );

    const [provider, acceptanceHandler] = tools.createProvider(getConfiguration, statusBarCtrl, root.logger.log);

    // Регистрируем провайдер для всех языков программирования
    context.subscriptions.push(
        vscode.languages.registerInlineCompletionItemProvider(
            { pattern: '**/*' },
            provider
        )
    );

    // создаем команду для сохранения в лог принятия completion
    context.subscriptions.push(vscode.commands.registerCommand(
        'simple-local-ai.completion.accepted',
        acceptanceHandler
    ));

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
    root.logger.disable();
}

module.exports = { activate, deactivate };