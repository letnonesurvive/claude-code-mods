#!/usr/bin/env bash
# Sets up the Claude Code mods of this repository on a machine.
#
#   ./install.sh            register every mod here in ~/.zshrc
#   ./install.sh --iterm    also make iTerm2 hotkeys work on non-Latin layouts
#   ./install.sh --dry-run  show what would change, write nothing
#
# Safe to run again: each step is skipped when already applied.
set -euo pipefail

MODS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ZSHRC="${ZDOTDIR:-$HOME}/.zshrc"
ITERM_DOMAIN="com.googlecode.iterm2"
WITH_ITERM=0
DRY_RUN=0

for arg in "$@"; do
  case "$arg" in
    --iterm) WITH_ITERM=1 ;;
    --dry-run) DRY_RUN=1 ;;
    -h | --help)
      sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 2
      ;;
  esac
done

say() { printf '==> %s\n' "$*"; }

# --- 1. Register the mods -------------------------------------------------

dirs=""
for manifest in "$MODS_DIR"/*/.claude-plugin/plugin.json; do
  [ -f "$manifest" ] || continue
  mod="$(dirname "$(dirname "$manifest")")"
  # Keep the line portable between machines: $HOME stays unexpanded.
  dirs="${dirs:+$dirs:}${mod/#$HOME/\$HOME}"
done

if [ -z "$dirs" ]; then
  echo "No mods found in $MODS_DIR" >&2
  exit 1
fi

line="export CLAUDE_CODE_PLUGIN_DIRS=\"$dirs\""

if [ -f "$ZSHRC" ] && grep -qF "$line" "$ZSHRC"; then
  say "$ZSHRC already registers the mods"
elif [ -f "$ZSHRC" ] && grep -q '^[^#]*CLAUDE_CODE_PLUGIN_DIRS=' "$ZSHRC"; then
  say "$ZSHRC sets CLAUDE_CODE_PLUGIN_DIRS differently; left as is. Expected:"
  echo "    $line"
elif [ "$DRY_RUN" = 1 ]; then
  say "Would append to $ZSHRC:"
  echo "    $line"
else
  printf '\n# Claude Code — mods loaded in every session\n%s\n' "$line" >>"$ZSHRC"
  say "Added the mods to $ZSHRC (open a new terminal to pick it up)"
fi

if command -v claude >/dev/null 2>&1; then
  for manifest in "$MODS_DIR"/*/.claude-plugin/plugin.json; do
    mod="$(dirname "$(dirname "$manifest")")"
    if claude plugin validate "$mod" >/dev/null 2>&1; then
      say "$(basename "$mod"): valid"
    else
      say "$(basename "$mod"): does not validate on this Claude Code; run: claude plugin validate $mod"
    fi
  done
else
  say "claude is not on PATH; skipped validating the mods"
fi

# --- 2. iTerm2: hotkeys on non-Latin keyboard layouts ----------------------
#
# With extended key reporting on, iTerm2 sends ctrl+<Cyrillic letter> as that
# letter, so ctrl+x on a Russian layout never matches. Turning the reporting
# off restores the control codes; shift+enter then needs a mapping of its own,
# sent as LF (what ctrl+j sends, Claude Code's newline).

if [ "$WITH_ITERM" = 1 ]; then
  if ! defaults read "$ITERM_DOMAIN" >/dev/null 2>&1; then
    echo "iTerm2 preferences not found; start iTerm2 once, then run again." >&2
    exit 1
  fi

  # A running iTerm2 writes its own copy of the preferences back on quit.
  if [ "$DRY_RUN" = 0 ] && pgrep -x iTerm2 >/dev/null 2>&1; then
    echo "Quit iTerm2 and run this from Terminal.app: ./install.sh --iterm" >&2
    exit 1
  fi

  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  defaults export "$ITERM_DOMAIN" "$tmp/before.plist"

  /usr/bin/python3 - "$tmp/before.plist" "$tmp/after.plist" <<'PY'
import plistlib
import sys

SHIFT_ENTER = "0xd-0x20000-0x24"
SEND_LF = {"Action": 11, "Apply Mode": 0, "Escaping": 2, "Text": "0a", "Version": 2}

with open(sys.argv[1], "rb") as f:
    prefs = plistlib.load(f)

for profile in prefs.get("New Bookmarks", []):
    changes = []
    if profile.get("Allow modifyOtherKeys") is not False:
        profile["Allow modifyOtherKeys"] = False
        changes.append("extended key reporting off")
    keys = profile.setdefault("Keyboard Map", {})
    if keys.get(SHIFT_ENTER) != SEND_LF:
        keys[SHIFT_ENTER] = SEND_LF
        changes.append("shift+enter sends LF")
    print(f"    profile {profile.get('Name')!r}: {', '.join(changes) or 'already set'}")

with open(sys.argv[2], "wb") as f:
    plistlib.dump(prefs, f)
PY

  if [ "$DRY_RUN" = 1 ]; then
    say "Dry run: iTerm2 preferences not written"
  elif cmp -s <(plutil -convert xml1 -o - "$tmp/before.plist") <(plutil -convert xml1 -o - "$tmp/after.plist"); then
    say "iTerm2 already configured"
  else
    backup="$HOME/iterm2-prefs-backup-$(date +%Y%m%d-%H%M%S).plist"
    cp "$tmp/before.plist" "$backup"
    defaults import "$ITERM_DOMAIN" "$tmp/after.plist"
    say "iTerm2 configured (backup: $backup)"
  fi
fi

say "Done. In Claude Code, /context-bar toggles the context bar."
