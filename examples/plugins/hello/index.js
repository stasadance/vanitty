// A tiny Vanitty plugin: counts commands you run and adds a "say hello" command.
// Copy this folder to <config dir>/plugins/local/hello and add
// "localPlugins": ["hello"] to settings.json.

/** @param {import("../../../src/plugins/api").VanittyAPI} vanitty */
exports.activate = (vanitty) => {
    let commands = 0;
    const show = () =>
        vanitty.ui.setHeaderItem("count", {
            text: `⌘ ${commands}`,
            tooltip: "Commands run",
            command: "hello:greet",
        });
    show();

    vanitty.terminals.onInput(({ data }) => {
        if (data !== "\r") {
            return;
        }

        commands++;
        show();
    });

    vanitty.commands.register("greet", () => vanitty.terminals.write("echo hello from a plugin\r"));
};
