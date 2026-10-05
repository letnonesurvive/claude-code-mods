# Claude Code mods

Personal [Claude Code](https://claude.com/claude-code) mods and the setup around them.

## Install

```sh
git clone <repo-url> ~/.claude/mods && ~/.claude/mods/install.sh
```

Open a new terminal afterwards. The script registers every mod of this
repository through `CLAUDE_CODE_PLUGIN_DIRS` in `~/.zshrc` and is safe to run
again. Update with `git -C ~/.claude/mods pull`.

Mods are an early-access Claude Code feature: the API may change between
releases. Written against Claude Code 2.1.286.

## Mods

### context-bar

A band above the prompt, toggled with `/context-bar` (the choice is remembered
across sessions):

- the context window as a stacked bar, one color per category as `/context`
  draws them, with tokens and share per category;
- the subscription limits (`session`, `week`) with the time until each resets.

The breakdown is estimated locally; it sends no token-count requests, so the
figures may differ slightly from `/context`.

## iTerm2: hotkeys on a non-Latin layout

On a Russian layout `ctrl+ч` (the `ctrl+x` key) does not trigger Claude Code
hotkeys in iTerm2, because iTerm2 reports the Cyrillic letter. To fix it, quit
iTerm2 and run from Terminal.app:

```sh
~/.claude/mods/install.sh --iterm
```

For every profile this turns off "Apps can change how keys are reported" and
maps `shift+enter` to send LF, which keeps it inserting a newline. The previous
preferences are saved to `~/iterm2-prefs-backup-*.plist`. Add `--dry-run` to
see what would change.
