# Ask Claude Code to install ashlr for you

Copy everything in the block below and paste it into a Claude Code session. Claude Code will run the install end-to-end.

---

````
Install the ashlr-plugin for me:

1. Run in a terminal:
   curl -fsSL https://plugin.ashlr.ai/install.sh | bash

2. Then inside this session, run these two slash commands:
   /plugin marketplace add masonwyatt23/ashlr-plugin
   /plugin install ashlr@ashlr-marketplace

3. Restart this Claude Code session.

4. Verify by running:
   /ashlr-status

If /ashlr-status reports that the MCP server is reachable and lists
the core-efficiency library version, we're done.

Source: https://github.com/masonwyatt23/ashlr-plugin
Landing: https://plugin.ashlr.ai/
License: MIT · No account · Zero telemetry
````

---

That's it. Claude Code will execute the shell command, then the slash commands, then ask you to restart, then verify. If anything fails partway, it'll show you the error and you can decide what to do.

## If you'd rather do it manually

Three commands, two of them inside Claude Code:

```bash
# 1. terminal
curl -fsSL https://plugin.ashlr.ai/install.sh | bash
```

```
# 2. inside Claude Code
/plugin marketplace add masonwyatt23/ashlr-plugin
/plugin install ashlr@ashlr-marketplace
```

Restart Claude Code. Run `/ashlr-status` to verify.
