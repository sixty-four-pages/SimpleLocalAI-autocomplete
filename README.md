# Simple Local AI: Autocomplete (v0.1.3)

Простой и прозрачный мост между вашим VS Code и локальными LLM (llama.cpp, Ollama и др.). 

Это расширение создано для тех, кому не нужны «черные ящики» и облачные подписки.\
Вы полностью управляете промптом и только вы определяете, какие данные получает модель.

## 🚀 Философия проекта
* **Одна функция:** Только Inline Completion. Никаких чатов, агентов и индексации ваших файлов в фоне.
* **Прозрачность:** Вы можете проконтролировать каждый байт, который улетает в модель и приходит обратно через локальный лог.
* **Управляемость:** Вы можете настроить FIM-шаблоны (Fill-In-the-Middle) под конкретную модель и ваши предпочтения.

## ✨ Возможности
* **Система пресетов:** Переключайтесь между моделями (Qwen, DeepSeek, Llama) через `Ctrl+Shift+P` -> `Select AI Preset`.
* **Динамические шаблоны:** Поддержка переменных `{prefix}`, `{suffix}`, `{relativePath}` и `{lang}` в промпте.
* **Advanced JSON Params:** Прямая передача `temperature`, `top_p`, `n_predict` и других параметров в API.
* **Статус-бар:** Визуальная индикация текущей активной модели.

## 📦 Установка
1. Скачайте собранный `.vsix` файл из раздела **releases**,\
или соберите проект (вам понадобится установленный **vsce**)
    * `npm install -g @vscode/vsce`
    * `npm run build`
2. Установите полученный `.vsix` в VS Code.
3. Для лучшего опыта
    * включите `editor.inlineSuggest.enabled`
    * отключите `editor.suggest.snippetsPreventQuickSuggestions`

## 🛠 Настройка : Общая

* **simple-local-ai.completion.enabled : boolean**\
включить/выключить работу расширения, так же клик по **StatusBar**
* **simple-local-ai.completion.enabledLogging : boolean**\
включить/выключить запись логов работы, лог доступен в каталоге расширения `sixty-four-pages.simple-local-ai-completion\ai_debug.log`,\
в хранилище данных расширений **VSCode** (если вы используете **Codium** вместо `Code` смотрите `VSCodium` соответственно)
    * **Windows:** `%APPDATA%\Code\User\globalStorage\`
    * **Linux:** `~/.config/Code/User/globalStorage/`
    * **macOS:** `~/Library/Application Support/Code/User/globalStorage/`

* **simple-local-ai.completion.debounceMs: number**\
пауза (ms) в наборе до отправки запроса в модель
* **simple-local-ai.completion.selectedPreset : string**\
выбранная предустановка с параметрами модели,\
используйте предустановки входящие в поставку, или создавайте свои.\
*если предустановка с указанным именем не задана, будет использована первая по порядку*
* **simple-local-ai.completion.presets: [Object,...]**\
в комплект входит конфигурация для **qwen2.5-coder-7b-instruct**

## 🛠 Настройка : Параметры модели

Работа с LLM моделью настраивается через массив предустановок в `settings.json`.
* **name** - имя для задания в **selectedPreset**
* **endpoint** - адрес и порт, где запущена модель
* **requestHeaders** - дополнительные заголовки, будут добавлены в запрос
* **promptTemplate** - шаблон промпта, специфичен для каждой модели
* **stopTokens** - токены по которым будет остановлена генерация
* **modelParameters** - дополнительные параметры, пердаваемые в модель: temperature, top_p, top_k, n_predict...
* **prefixLength** - длина строки кода перед курсором
* **suffixLength** - длина строки кода после курсора

Доступные переменные в шаблоне:
* `{prefix}` — код перед курсором.
* `{suffix}` — код после курсора.
* `{relativePath}` — путь к файлу относительно корня проекта.
* `{lang}` — идентификатор языка (js, python, cpp и т.д.).

Пример предустановки
```json
"simple-local-ai.completion.selectedPreset": "Qwen 2.5 Coder"
"simple-local-ai.completion.presets": [
  {
    "name": "Qwen 2.5 Coder",
    "endpoint": "http://localhost:8081/completion",
    "promptTemplate": "<|file_separator|>// Path: {relativePath}\n// Language: {lang}\n<|fim_prefix|>{prefix}<|fim_suffix|>{suffix}<|fim_middle|>",
    "stop_tokens": ["<|file_separator|>", "<|endoftext|>", "\n\n"],
    "modelParameters": { "temperature": 0.2, "top_p": 0.9, "top_k": 40, "n_predict": 64 },
    "prefixLength": 1000,
    "suffixLength": 500
  }
]
```

### 🏆 Почему это лучше альтернатив?

Большинство расширений на рынке скрывают от вас детали реализации. **Simple Local AI: Autocomplete** дает вам чистый инструмент. Если автодополнение работает плохо — вы просто правите шаблон или параметры модели в настройках, а не ждете обновления от разработчика.

### ⚙️ Дополнительная информация

#### Установка и запуск локальных LLM

Предполагается, что вы уже установили и запустили модель, которую будете использовать.\
Если это не так, предлагаю небольшую инструкцию.
1. Устанавливаем **llama.cpp**\
  Из https://github.com/ggml-org/llama.cpp/releases скачиваем нужный вам дистрибутив,\
  я устанавливал `llama-b8646-bin-win-cuda-12.4-x64.zip` и `cudart-llama-bin-win-cuda-12.4-x64.zip`
  Распаковываем файлы туда, откуда вам будет удобно запускать программу. \
2. Скачиваем файл модели, например https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF\
  Мне подошла модель с 6-битеым квантованием
3. Запускаем модель, например так
```cmd
d:
cd d:\super\llama\llama-bin
start llama-server.exe -m ../models/qwen2.5-coder-7b-instruct-q6_k.gguf -ngl 35 -t 6 -fa on --host 127.0.0.1 --port 8081
```
4. Если используем CUDA, очень хорошо убедиться что CUDA установлен и работает. В логе запуска должно быть что-то вроде:
```
ggml_cuda_init: found 1 CUDA devices:
  Device 0: NVIDIA GeForce RTX 5060 Ti, compute capability 12.0, VMM: yes
```
5. Если все сделано правильно, модель должна быть запущена и доступна по адресу `http://127.0.0.1:8081`

##### Модели, которые показались мне интересными

И шаблоны для работы с которыми есть настройках по-умолчанию.

* **Qwen 2.5 Coder 0.5B** \
  https://huggingface.co/bartowski/Qwen2.5-Coder-0.5B-GGUF скачивал в Q8_0 \
  запуск: `llama-server.exe -m ../models/Qwen2.5-Coder-0.5B-Q8_0.gguf -c 4096 --host 127.0.0.1 --port 8082 -t 4` \
  занимает совсем немного места, и достаточно быстро отвечает даже в CPU режиме

* **Qwen 2.5 Coder 1.5B CodeFIM** \
  https://huggingface.co/Etherll/Qwen2.5-Coder-1.5B-CodeFIM-Q8_0-GGUF
  запуск: `llama-server.exe -m ../models/qwen2.5-coder-1.5b-codefim-q8_0.gguf -c 4096 --host 127.0.0.1 --port 8082 -t 4` \
  https://huggingface.co/Etherll/Qwen2.5-Coder-1.5B-CodeFIM \
  A small finetune over https://huggingface.co/datasets/Etherll/code-fim-v2 dataset on top of Qwen/Qwen2.5-Coder-1.5B to generate code FIM ( Fill-in-the-Middle )

* **Star Coder 2 3B** \
  https://huggingface.co/second-state/StarCoder2-3B-GGUF скачивал в Q8_0 \
  запуск: `llama-server.exe -m ../models/starcoder2-3b-Q8_0.gguf -c 4096 --host 127.0.0.1 --port 8082 -t 4`

* **Refact-1.6B FIM** \
  https://huggingface.co/oblivious/Refact-1.6B-fim-GGUF
  TODO

* **Jet Brains Mellum 4B** \
  https://huggingface.co/JetBrains/Mellum-4b-base-gguf скачивал в Q8_0 \
  запуск: `llama-server.exe -m ../models/mellum-4b-base.Q8_0.gguf -c 4096 --host 127.0.0.1 --port 8082 -t 4`

#### Классы моделей: base vs SFT vs instruct

Разберем классы моделей с оценкой в контексте автодополнения (**Fill In the Middle**)

##### Base (pretrained)

Модель после предобучения (next-token prediction), без дообучения под инструкции.
* максимальная «сырая» энтропия — хорошо моделирует распределение текста
* не следует инструкциям («напиши функцию…» может проигнорировать)
* лучше всего понимает структуру кода как статистику

Для FIM: лучший кандидат (в теории), но требует правильного prompting (спец-токены, формат)

##### SFT (Supervised Fine-Tuning)

Модель прошла дообучение на парах `prompt → ответ`
* начинает понимать «сделай X»
* становится более «детерминированной»
* теряет часть гибкости **base**

Для FIM: компромисс, иногда ломает «чистое» распределение текста, но может лучше понимать intent редактирования

##### Instruct (instruction-tuned + RLHF/DPO)

SFT + выравнивание (RLHF / DPO / preference tuning)
* следует инструкциям
* «разговорная»
* часто добавляет лишний текст («Sure, here is the code…»)

Для FIM часто хуже потому что:  модель пытается «помочь», а не «продолжить», может игнорировать suffix, вставляет комментарии/объяснения


---
