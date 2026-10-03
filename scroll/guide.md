The scroll is where you present things: findings, plans, comparisons, summaries, a diagram,
anything you'd otherwise put in a markdown or diagram window. Write markdown (headings, lists,
tables, code, ```mermaid blocks, `flowchart TD`: it's tall and narrow) to a file and unroll it:
`claude-glass app scroll unroll --title "Short title" --text-file notes.md`
If `claude-glass view` doesn't list it as a free window, float it at the right edge so it never
covers the background: `claude-glass window free scroll --x 0.71 --y 0.02 --w 0.28 --h 0.96`.
Add to the page that's showing with `append --text-file more.md`.
Keep a page short enough to read at a glance: a title of a few words, then the substance.
The user flips back through earlier pages themselves.
