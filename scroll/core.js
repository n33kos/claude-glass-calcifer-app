// The scroll's pages: each unroll adds one (the newest shows), capped so state stays small.
const MAX_PAGES = 12;

exports.init = () => ({ pages: [], index: -1, seq: 0 });

const text = (args) => String(args.text ?? '').trim();

exports.command = (state, command, args) => {
  if (command === 'unroll') {
    const body = text(args);
    if (!body) throw new Error('scroll: unroll needs --text <markdown> or --text-file <file.md>');
    const page = { title: String(args.title ?? '').trim(), body, at: Date.now() };
    const pages = [...state.pages, page].slice(-MAX_PAGES);
    return { pages, index: pages.length - 1, seq: state.seq + 1 };
  }
  if (command === 'append') {
    const more = text(args);
    if (!more) throw new Error('scroll: append needs --text <markdown> or --text-file <file.md>');
    if (!state.pages.length) return exports.command(state, 'unroll', args);
    const i = state.pages.length - 1;
    const pages = state.pages.map((p, j) => (j === i ? { ...p, body: `${p.body}\n\n${more}` } : p));
    return { ...state, pages, index: i };
  }
  if (command === 'page') {
    const n = Number(args.index);
    if (!Number.isInteger(n) || n < 0 || n >= state.pages.length) throw new Error(`scroll: no page ${args.index} (there are ${state.pages.length})`);
    return { ...state, index: n };
  }
  if (command === 'clear') return { pages: [], index: -1, seq: state.seq + 1 };
  throw new Error(`scroll: unknown command "${command}"`);
};
