// The scene's images: the painting without its hanging things, the log he hugs (and where it sits),
// and the hanging things that sway, each with the hook it hangs from. Positions are fractions of
// the painting. Each path carries ?v=<content hash> so an open glass never shows a stale copy.
// The pot that stood at the bottom left is painted out of this copy, because the kindling pot
// prop stands in its place and the old one showed underneath it. assets/hearth-bare.jpg is
// kept untouched beside it as the original.
window.HEARTH_SRC = 'assets/hearth-bare-nopot.jpg?v=634fe272';
window.LOG_SRC = 'assets/log.png?v=d9e922d9';
window.LOG_RECT = {"x": 0.3659018987341772, "y": 0.6898584905660378, "w": 0.26700949367088606, "h": 0.20047169811320756};
// Props that show how much of the plan's allowance is left. Not hung and not swaying — they sit
// on the stone. Each was painted INTO this very picture by handing the model the bare hearth, then
// cut back out, so the perspective, palette and light are the scene's own rather than a prop's.
window.PROPS = [
 { "id": "logs",
   "x": 0.674238, "y": 0.690264, "w": 0.269145, "h": 0.286557,
   // Six hand-cut states in twenties: what is left of the week. Logs come off the right-hand end,
   // so the pile's left edge and base never move and the composition does not drift as it empties.
   "levels": {
    "0": "assets/props/logs-0.png?v=88e80f61",
    "20": "assets/props/logs-20.png?v=c011628a",
    "40": "assets/props/logs-40.png?v=1a7a16c4",
    "60": "assets/props/logs-60.png?v=e96e6cc8",
    "80": "assets/props/logs-80.png?v=12af14fe",
    "100": "assets/props/logs-100.png?v=3820c5f7"
   } },
 { "id": "kindling",
   "x": 0.110759, "y": 0.566038, "w": 0.229430, "h": 0.424528,
   // Eleven hand-cut states, 0 to 100 in tens: what is left of the five-hour window. Hand-painted
   // rather than generated — every attempt to have a model take sticks away put more back.
   "levels": {
    "0": "assets/props/kindling-0.png?v=fef31e5c",
    "10": "assets/props/kindling-10.png?v=d3240a90",
    "20": "assets/props/kindling-20.png?v=93454f90",
    "30": "assets/props/kindling-30.png?v=ac1c9052",
    "40": "assets/props/kindling-40.png?v=4d916455",
    "50": "assets/props/kindling-50.png?v=88cb9d7b",
    "60": "assets/props/kindling-60.png?v=34251acd",
    "70": "assets/props/kindling-70.png?v=3480d289",
    "80": "assets/props/kindling-80.png?v=6041ac21",
    "90": "assets/props/kindling-90.png?v=2d27917f",
    "100": "assets/props/kindling-100.png?v=15ef4413"
   } }
];
window.SWAY = [
 {
  "id": "lavender",
  "src": "assets/sway/lavender.png?v=b111a4e3",
  "x": 0.14240506329113925,
  "y": 0.2358490566037736,
  "w": 0.10680379746835443,
  "h": 0.3125,
  "px": 0.19679588607594936,
  "py": 0.26975235849056606,
  "amount": 1.0
 },
 {
  "id": "firehook",
  "src": "assets/sway/firehook.png?v=3b101268",
  "x": 0.19382911392405064,
  "y": 0.2358490566037736,
  "w": 0.07021360759493671,
  "h": 0.3744103773584906,
  "px": 0.23833069620253164,
  "py": 0.2668042452830189,
  "amount": 0.4
 },
 {
  "id": "rosemary",
  "src": "assets/sway/rosemary.png?v=34184da6",
  "x": 0.2254746835443038,
  "y": 0.2358490566037736,
  "w": 0.10284810126582279,
  "h": 0.3154481132075472,
  "px": 0.2719541139240506,
  "py": 0.26975235849056606,
  "amount": 1.0
 },
 {
  "id": "thyme",
  "src": "assets/sway/thyme.png?v=c43ae0aa",
  "x": 0.6566455696202531,
  "y": 0.22995283018867924,
  "w": 0.10284810126582279,
  "h": 0.2830188679245283,
  "px": 0.7130142405063291,
  "py": 0.2653301886792453,
  "amount": 1.0
 },
 {
  "id": "sage",
  "src": "assets/sway/sage.png?v=79ced580",
  "x": 0.7614715189873418,
  "y": 0.2329009433962264,
  "w": 0.1127373417721519,
  "h": 0.294811320754717,
  "px": 0.8182357594936709,
  "py": 0.2668042452830189,
  "amount": 0.9
 },
 {
  "id": "tansy",
  "src": "assets/sway/tansy.png?v=77cb917f",
  "x": 0.8386075949367089,
  "y": 0.2830188679245283,
  "w": 0.08306962025316456,
  "h": 0.22995283018867924,
  "px": 0.8757911392405063,
  "py": 0.3139740566037736,
  "amount": 1.1
 },
 {
  "id": "mint",
  "src": "assets/sway/mint.png?v=bf9db6ea",
  "x": 0.8920094936708861,
  "y": 0.24764150943396226,
  "w": 0.10087025316455696,
  "h": 0.28891509433962265,
  "px": 0.9444224683544303,
  "py": 0.2800707547169811,
  "amount": 0.95
 }
];
