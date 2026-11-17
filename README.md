# jsondbg

This is a quick extension that adds a `View as JSON` on to the debugger variable context menu.

Debug variable visualizers are not built-in to VS Code. Interested? Please upvote: <https://github.com/microsoft/vscode/issues/197287>

It will display a webview with rendered view of the JSON string as a structured view:

![Example JSON Rendering](https://github.com/user-attachments/assets/e244c48e-2d84-4a8a-8bde-9f3195dab80e)

## Usage

1. Start a debug session and pause at a breakpoint.
2. In the **Variables** view, right-click a variable that holds a JSON string.
3. Choose **View as JSON**. The value opens in a panel titled `JSON: <variable name>`, where you can switch between view, tree, form, code and text modes.

The variable value can be raw JSON or a string literal as debuggers usually display it:

- double-quoted with escapes, e.g. `"{\"name\":\"value\"}"` (C#, Java, Go)
- single-quoted with escapes, e.g. `'{\n  "name": "value"\n}'` (JavaScript, Python)

If the value is not valid JSON, an error explains why and points at the failing position when possible.

## Development

```bash
npm ci
npm run compile   # build to ./out
npm run lint
npm test          # compile, lint and run the unit tests
```

Press `F5` in VS Code to launch an Extension Development Host with the extension loaded.

## Credits
JSON rendering provided by [jsoneditor](https://www.npmjs.com/package/jsoneditor)
