# Local AI Autocomplete (v0.1.0)

Простой и прозрачный мост между вашим VS Code и локальными LLM (llama.cpp, Ollama и др.). 

Это расширение создано для тех, кому не нужны «черные ящики» и облачные подписки. Только автодополнение, только локальный запуск, полный контроль над промптом.

## 🚀 Философия проекта
* **Одна функция — одна задача:** Только Inline Completion. Никаких чатов, агентов и индексации ваших файлов в фоне.
* **Прозрачность:** Вы видите каждый байт, который улетает в модель и приходит обратно через локальный лог.
* **Контролируемость:** Вы сами настраиваете FIM-шаблоны (Fill-In-the-Middle) под конкретную модель.

## ✨ Возможности
* **Система пресетов:** Переключайтесь между моделями (Qwen, DeepSeek, Llama) через `Ctrl+Shift+P` -> `Select AI Preset`.
* **Динамические шаблоны:** Поддержка переменных `{prefix}`, `{suffix}`, `{relativePath}` и `{lang}` в промпте.
* **Advanced JSON Params:** Прямая передача `temperature`, `top_p`, `n_predict` и других параметров в API.
* **Статус-бар:** Визуальная индикация текущей активной модели.

## 🛠 Настройка

Расширение работает через массив пресетов в `settings.json`.

### Пример конфига для Qwen2.5-Coder (llama.cpp):
```json
"myLocalAI.presets": [
  {
    "name": "Qwen 2.5 Coder",
    "endpoint": "http://localhost:8080/completion",
    "promptTemplate": "<|file_separator|>// Path: {relativePath}\n// Language: {lang}\n<|fim_prefix|>{prefix}<|fim_suffix|>{suffix}<|fim_middle|>",
    "stop_tokens": ["<|file_separator|>", "<|endoftext|>", "\n"],
    "modelParameters": {
      "temperature": 0.2,
      "top_p": 0.9,
      "n_predict": 64
    }
  }
],
"myLocalAI.selectedPreset": "Qwen 2.5 Coder"
```

### Доступные переменные в шаблоне:
* `{prefix}` — код перед курсором.
* `{suffix}` — код после курсора.
* `{relativePath}` — путь к файлу относительно корня проекта.
* `{lang}` — идентификатор языка (js, python, cpp и т.д.).

## 🔍 Отладка и Логи
Никакой магии. Все запросы и ответы пишутся в JSON-формате в файл `ai_debug.log`.

**Где искать логи:**
* **Linux:** `~/.config/Code/User/globalStorage/my-local-ai/ai_debug.log`
* **Windows:** `%APPDATA%\Code\User\globalStorage\my-local-ai\ai_debug.log`

Или через палитру команд: `My Local AI: Open Debug Log`.

## 📦 Установка
1. Соберите проект, вам понадобится установленный **vsce**
    * `npm install -g @vscode/vsce`
    * `npm run build`
2. Установите полученный `.vsix` в VS Code.
3. Настройте эндпоинт вашей локальной модели.

для лучшего опыта добавьте в settings.json:

```json
{
  "editor.inlineSuggest.enabled": true,
  "editor.suggest.snippetsPreventQuickSuggestions": false
}
```


---

### Почему это лучше альтернатив?
Большинство расширений на рынке скрывают от вас детали реализации. **Local AI Autocomplete** дает вам чистый инструмент. Если автодополнение работает плохо — вы просто правите шаблон или параметры модели в настройках, а не ждете обновления от разработчика.
