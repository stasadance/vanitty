# Plugins

Vanitty plugins are JavaScript (or compiled TypeScript) packages. Each one runs in its own Web Worker with no DOM, network, storage or Tauri access, so a broken or malicious plugin can't touch the app or your files. It talks to Vanitty only through the API passed to `activate`.

## Installing

In `settings.json`:

```jsonc
// From npm
"plugins": ["vanitty-plugin-example"],
// From folders in <config dir>/plugins/local/<name>
"localPlugins": ["hello"]
```

Plugins restart when this list changes.

## Writing one

A plugin is a CommonJS package whose `main` exports `activate(vanitty)` and optionally `deactivate()`:

```js
exports.activate = (vanitty) => {
    vanitty.commands.register("greet", () => vanitty.terminals.write("echo hi\r"));
    vanitty.ui.setHeaderItem("status", { text: "hi", command: "hello:greet" });
};
```

Bind its commands like any other in `keybindings.json`:

```json
[{ "key": "ctrl+alt+h", "command": "hello:greet" }]
```

See [`examples/plugins/hello`](../examples/plugins/hello) for a complete one, and [`src/plugins/api.d.ts`](../src/plugins/api.d.ts) for the full typed API:

- `commands.register`, `commands.execute`
- `terminals.list`, `active`, `write`, and events for open, close, active, title, output and input
- `config.get`, `config.onDidChange`
- `window.showNotification`
- `ui.setHeaderItem`

`require` works for files inside the package and its npm dependencies. Node built-ins aren't available apart from small `path` and `os` shims.
