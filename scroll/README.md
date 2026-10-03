# Scroll

A [Claude Glass](https://github.com/n33kos/claude-glass) app: Calcifer's parchment scroll. When Claude
presents something (findings, a plan, a comparison, a diagram), it writes markdown and the scroll
unrolls a new page with it. Earlier pages are a click away on the bottom roller.

```
claude-glass app scroll unroll --title "Short title" --text-file notes.md
claude-glass app scroll append --text-file more.md
```

Markdown with tables, code and ```` ```mermaid ```` diagrams. Titles are in Pinyon Script (a quill
hand), the text in Alegreya, both bundled (SIL Open Font License). The parchment and rollers were
painted to match Calcifer's hearth (`assets/source/`).

Install: link this folder into `~/.claude/claude-glass/apps/scroll` and restart the glass.
