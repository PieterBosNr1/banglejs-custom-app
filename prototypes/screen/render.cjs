// PROTOTYPE — throwaway. Renders every variant × state on the headless Bangle.js 2
// emulator and writes out/*.png plus out/index.html (a contact sheet).
// Run: node prototypes/screen/render.cjs && open prototypes/screen/out/index.html
const fs = require("fs"), vm = require("vm"), zlib = require("zlib"), path = require("path");
global.require = require; global.__dirname = __dirname;
for (const f of ["emulator_banglejs2.js", "emu_banglejs2.js", "common.js"])
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, "emu", f), "utf8"), { filename: f });
const variants = require("./variants.js");
const OUT = path.join(__dirname, "out");
const out = [], errors = [];
global.onConsoleOutput = (l) => { out.push(l); if (/Uncaught|^ERROR:/.test(l)) errors.push(l); };
global.jsUpdateGfx = () => {}; global.jsRXCallback = () => {};
const tx = (s) => jsTransmitString(s);
const idle = (n = 20) => { for (let i = 0; i < n; i++) jsIdle(); };

function png(file) {
  const rgba = new Uint8Array(GFX_WIDTH * GFX_HEIGHT * 4); jsGetGfxContents(rgba);
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255; // emulator leaves alpha at 0
  const raw = Buffer.alloc((GFX_WIDTH * 4 + 1) * GFX_HEIGHT);
  for (let y = 0; y < GFX_HEIGHT; y++) Buffer.from(rgba.buffer, y * GFX_WIDTH * 4, GFX_WIDTH * 4).copy(raw, y * (GFX_WIDTH * 4 + 1) + 1);
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(GFX_WIDTH, 0); ihdr.writeUInt32BE(GFX_HEIGHT, 4); ihdr[8] = 8; ihdr[9] = 6;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}

const LIGHT = "{fg:0,bg:0xFFFF,fg2:0,bg2:0xFFFF,fgH:0xFFFF,bgH:0,fgW:0,bgW:0xFFFF,dark:false}";
const DARK = "{fg:0xFFFF,bg:0,fg2:0xFFFF,bg2:0,fgH:0,bgH:0xFFFF,fgW:0xFFFF,bgW:0,dark:true}";
const STATES = {
  playing: { theme: LIGHT, st: { track: "Harder, Better, Faster, Stronger", artist: "Daft Punk", album: "Alive 2007", state: "play", vol: 60 } },
  paused: { theme: LIGHT, st: { track: "Teardrop", artist: "Massive Attack", album: "Mezzanine", state: "pause", vol: 40 } },
  empty: { theme: LIGHT, st: { track: "", artist: "", album: "", state: "stop", vol: 50 } },
  dark: { theme: DARK, st: { track: "Harder, Better, Faster, Stronger", artist: "Daft Punk", album: "Alive 2007", state: "play", vol: 60 } },
};
// Fake clock widget so appRect leaves a realistic 24px widget bar.
const WIDGET = `WIDGETS={clk:{area:"tr",width:44,draw:function(){g.reset().setFont("6x8:2").setFontAlign(1,-1).drawString("12:34",this.x+this.width-2,this.y+5);}}};`;

setTimeout(main, 0);
async function main() {
  hwPinValue[BTN1] = 1;
  jsInit(); idle();
  fs.mkdirSync(OUT, { recursive: true });
  const rows = [];
  for (const [key, v] of Object.entries(variants)) {
    const cells = [];
    for (const [sname, s] of Object.entries(STATES)) {
      const app = `g.setTheme(${s.theme});g.reset().clear();${WIDGET}Bangle.drawWidgets();var st=${JSON.stringify(s.st)};${v.src}\ndraw();`;
      tx(`\x10require("Storage").write("proto.app.js",${JSON.stringify(app)})\n`);
      tx(`\x10load("proto.app.js")\n`); idle(40);
      const file = `${key}-${sname}.png`; png(path.join(OUT, file));
      const uri = "data:image/png;base64," + fs.readFileSync(path.join(OUT, file)).toString("base64");
      cells.push(`<figure><img src="${uri}" title="${file}"><figcaption>${sname}</figcaption></figure>`);
    }
    rows.push(`<section><h2>${key} — ${v.name}</h2><p>${v.controls}</p><div class="row">${cells.join("")}</div></section>`);
  }
  fs.writeFileSync(path.join(OUT, "index.html"), `<!doctype html><meta charset="utf-8"><title>bwmusic screen prototype</title>
<style>body{font:15px system-ui;margin:24px;background:#888}h2{margin:24px 0 4px}p{margin:0 0 10px}.row{display:flex;gap:16px;flex-wrap:wrap}
figure{margin:0}img{width:352px;height:352px;image-rendering:pixelated;border-radius:40px;border:10px solid #222;display:block}figcaption{text-align:center}</style>
<h1>bwmusic — screen prototype (Bangle.js 2 emulator, 176×176 @2×)</h1>${rows.join("")}`);
  console.log("errors:", errors.length ? errors : "none");
  console.log("wrote", path.join(OUT, "index.html"));
  jsStopIdle(); process.exit(0);
}
