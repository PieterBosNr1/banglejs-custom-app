{
  const draw = function () {
    const r = Bangle.appRect;
    g.reset().setColor(g.theme.fg).setBgColor(g.theme.bg).clearRect(r.x, r.y, r.x2, r.y2);
    g.setFont12x20().setFontAlign(0, 0).drawString("Hello", (r.x + r.x2) >> 1, (r.y + r.y2) >> 1);
  };

  Bangle.setUI({
    mode: "custom",
    btn: function () {
      load();
    },
  });
  g.clear();
  Bangle.loadWidgets();
  Bangle.drawWidgets();
  draw();
}
