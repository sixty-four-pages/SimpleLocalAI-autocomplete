const vscode = require('vscode');

/** @param {vscode.ExtensionContext} context */
function activate(context) {

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
            const n_predict = config.get('maxTokens');
            const temperature = config.get('temperature');

            // 1. Собираем контекст: 1000 символов до и 500 после курсора
            const offset = document.offsetAt(position);
            const prefix = document.getText().substring(Math.max(0, offset - 1000), offset);
            const suffix = document.getText().substring(offset, offset + 500);

            // 2. Формируем FIM-запрос для Qwen2.5 (специфичные токены модели)
            // Формат: <|fim_prefix|>...<|fim_suffix|>...<|fim_middle|>
            const prompt = `<|fim_prefix|>${prefix}<|fim_suffix|>${suffix}<|fim_middle|>`;

            try {
                // ФАЗА: ЗАПРОС
                statusBarItem.text = "$(sync~spin) Llama: Thinking...";
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        prompt: prompt,
                        n_predict, // Короткие ответы быстрее и точнее
                        temperature, // Меньше хаоса
                        stop: ["<|file_separator|>", "<|fim_prefix|>", "<|fim_suffix|>", "<|fim_middle|>", "\n\n"],
                        stream: false
                    })
                });

                if (!response.ok) return;

                const data = await response.json();

                // ФАЗА: УСПЕХ
                statusBarItem.text = "$(check) Llama: Done";
                // Возвращаем статус в Ready через секунду
                setTimeout(() => { statusBarItem.text = "$(circuit-board) Llama: Ready"; }, 1000);
                
                // 3. Возвращаем результат в редактор
                const item = new vscode.InlineCompletionItem(data.content);
                item.range = new vscode.Range(position, position); // Явно говорим: "вставляй сюда"
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