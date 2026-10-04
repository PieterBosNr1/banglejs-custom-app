{
  // Storage file "bwmusic" (lib.js); tsconfig paths maps it for type checking.
  const lib = require("bwmusic");
  const ELLIPSIS = "...";

  // App state, global so the boot hook and tests can reach it.
  // m: model from lib.js; title: title lines last drawn; draws: redraw count.
  const app = { m: lib.initial(), title: /** @type {string[]} */ ([]), draws: 0 };
  global.bwmusic = app;

  /** Shorten `t` with "..." until it fits `w` in the current font. */
  const fit = function (/** @type {string} */ t, /** @type {number} */ w) {
    if (g.stringWidth(t) <= w) return t;
    while (t.length && g.stringWidth(t + ELLIPSIS) > w) t = t.slice(0, -1);
    return t + ELLIPSIS;
  };

  /** Wrap `t` to at most `n` lines of width `w` in the current font. */
  const clamp = function (/** @type {string} */ t, /** @type {number} */ w, /** @type {number} */ n) {
    const lines = g.wrapString(t, w);
    if (lines.length <= n) return lines;
    const out = lines.slice(0, n);
    out[n - 1] = fit(out[n - 1] + ELLIPSIS, w);
    return out;
  };

  /** @typedef {(x: number, y: number, s: number) => void} Icon */
  /** @type {Icon} */
  const icPlay = function (x, y, s) {
    g.fillPoly([x - s * 0.6, y - s, x - s * 0.6, y + s, x + s, y]);
  };
  /** @type {Icon} */
  const icPause = function (x, y, s) {
    const w = s * 0.55;
    g.fillRect(x - s * 0.8, y - s, x - s * 0.8 + w, y + s);
    g.fillRect(x + s * 0.8 - w, y - s, x + s * 0.8, y + s);
  };
  /** @type {Icon} */
  const icNext = function (x, y, s) {
    g.fillPoly([x - s, y - s, x - s, y + s, x, y]);
    g.fillPoly([x, y - s, x, y + s, x + s, y]);
    g.fillRect(x + s, y - s, x + s + 2, y + s);
  };
  /** @type {Icon} */
  const icPrev = function (x, y, s) {
    g.fillPoly([x + s, y - s, x + s, y + s, x, y]);
    g.fillPoly([x, y - s, x, y + s, x - s, y]);
    g.fillRect(x - s - 2, y - s, x - s, y + s);
  };

  // Layout C: text block on top, ⏮ ⏯ ⏭ row at the bottom (middle filled).
  const draw = function () {
    const r = Bangle.appRect;
    const m = app.m;
    const w = r.w - 12;
    const cx = r.x + (r.w >> 1);
    const by = lib.buttonsTop(r);
    app.draws++;
    g.reset().setColor(g.theme.fg).setBgColor(g.theme.bg).clearRect(r.x, r.y, r.x2, r.y2);
    if (m.track && lib.hasTrack(m)) {
      const t = m.track;
      g.setFontAlign(0, -1).setFont12x20();
      app.title = clamp(t.track, w, 2);
      let y = r.y + 8;
      app.title.forEach(function (l) {
        g.drawString(l, cx, y);
        y += 22;
      });
      g.setFont6x15(1).drawString(fit(t.artist, w), cx, y + 2);
      if (t.album) g.setFont("6x8").drawString(fit(t.album, w), cx, y + 18);
    } else {
      app.title = [];
      g.setFontAlign(0, 0).setFont12x20().drawString("No music", cx, (r.y + by) >> 1);
    }
    const bw = (r.w - 16) / 3;
    const iy = (by + r.y2 - 4) >> 1;
    for (let b = 0; b < 3; b++) {
      const bx = r.x + 4 + b * (bw + 4);
      const ix = bx + bw / 2;
      if (b === 1) {
        g.fillRect(bx, by, bx + bw, r.y2 - 4);
        g.setColor(g.theme.bg);
        if (m.state === "play") icPause(ix, iy, 10);
        else icPlay(ix, iy, 10);
        g.setColor(g.theme.fg);
      } else {
        g.drawRect(bx, by, bx + bw, r.y2 - 4);
        if (b === 0) icPrev(ix, iy, 9);
        else icNext(ix, iy, 9);
      }
    }
  };

  /** @param {GBEvent} e */
  const onEvent = function (e) {
    const m = lib.reduce(app.m, e);
    if (m === app.m) return;
    app.m = m;
    if (e.t !== "audio") draw();
  };

  // Deferred like gbmusic so we wrap GB after android.boot.js: outermost wrapper.
  setTimeout(function () {
    const prev = global.GB;
    global.GB = function (/** @type {GBEvent} */ e) {
      if (e.t === "musicinfo" || e.t === "musicstate") return onEvent(e);
      if (e.t === "audio") onEvent(e);
      if (prev) setTimeout(prev, 0, e);
    };
  }, 1);

  /** Send a command to the phone's player; Bangle.musicControl comes from the android app. */
  const send = function (/** @type {string} */ c) {
    if (c && Bangle.musicControl) Bangle.musicControl(c);
  };

  // BTN1: release before LONG_MS = playpause; held for LONG_MS = exit.
  const LONG_MS = 1000;
  /** @type {TimeoutId|undefined} */
  let hold;
  const btnWatch = setWatch(
    function (e) {
      if (e.state) {
        hold = setTimeout(function () {
          hold = undefined;
          load();
        }, LONG_MS);
      } else if (hold) {
        clearTimeout(hold);
        hold = undefined;
        send("playpause");
      }
    },
    BTN1,
    { repeat: true, edge: "both", debounce: 25 },
  );

  Bangle.setUI({
    mode: "custom",
    touch: function (_b, xy) {
      if (xy) send(lib.tapCommand(xy.x, xy.y, Bangle.appRect));
    },
    swipe: function (lr) {
      send(lib.swipeCommand(lr));
    },
    remove: function () {
      clearWatch(btnWatch);
      if (hold) clearTimeout(hold);
    },
  });
  g.clear();
  Bangle.loadWidgets();
  Bangle.drawWidgets();
  draw();
}
