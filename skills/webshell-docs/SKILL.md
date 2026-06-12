---
name: webshell-docs
description: Создание, поиск и редактирование страниц во встроенной базе документов WebShell. Используй этот skill, когда пользователь просит создать страницу, конспект, базу знаний, документ, план, материал курса или работать с локальным Notion-подобным редактором в панели агентов.
---

# WebShell Docs

Встроенный редактор документов в панели агентов - это локальная Notion-подобная база страниц. Не используй настоящий Notion, если пользователь говорит про документы, страницы, конспекты, базу знаний или материалы внутри WebShell/панели.

API находится по адресу из переменной окружения `WEB_SHELL_API_URL`. Если переменной нет, используй `http://127.0.0.1:8787`.

Для работы используй скрипт:

```bash
python "$HERMES_HOME/skills/webshell-docs/scripts/webshell_docs.py" list
python "$HERMES_HOME/skills/webshell-docs/scripts/webshell_docs.py" search "запрос"
python "$HERMES_HOME/skills/webshell-docs/scripts/webshell_docs.py" get DOC_ID
python "$HERMES_HOME/skills/webshell-docs/scripts/webshell_docs.py" create --title "Название" --content "Markdown текст"
python "$HERMES_HOME/skills/webshell-docs/scripts/webshell_docs.py" create --title "Дочерняя страница" --parent-id DOC_ID --content "Markdown текст"
python "$HERMES_HOME/skills/webshell-docs/scripts/webshell_docs.py" update DOC_ID --title "Новое название" --content "Новый Markdown текст"
python "$HERMES_HOME/skills/webshell-docs/scripts/webshell_docs.py" delete DOC_ID
```

Правила:

- Пиши содержимое страниц в Markdown.
- Перед обновлением существующей страницы сначала найди или прочитай ее.
- Для больших текстов используй `--content-file path/to/file.md`, чтобы не ломать команду кавычками.
- Создавай дочерние страницы через `--parent-id`, когда пользователь просит структуру, разделы или базу знаний.
- После создания или изменения страницы коротко сообщи название страницы и `id`.
