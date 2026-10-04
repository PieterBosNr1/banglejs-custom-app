// PROTOTYPE — throwaway. Three structurally different bwmusic screens.
// Each entry is Espruino source run on the emulator by render.cjs.
// Shared: `st` = {track, artist, album, state, vol} is injected before the variant runs.

const icons = `
function icPlay(x,y,s){g.fillPoly([x-s*0.6,y-s,x-s*0.6,y+s,x+s,y]);}
function icPause(x,y,s){var w=s*0.55;g.fillRect(x-s*0.8,y-s,x-s*0.8+w,y+s);g.fillRect(x+s*0.8-w,y-s,x+s*0.8,y+s);}
function icNext(x,y,s){g.fillPoly([x-s,y-s,x-s,y+s,x,y]);g.fillPoly([x,y-s,x,y+s,x+s,y]);g.fillRect(x+s,y-s,x+s+2,y+s);}
function icPrev(x,y,s){g.fillPoly([x+s,y-s,x+s,y+s,x,y]);g.fillPoly([x,y-s,x,y+s,x-s,y]);g.fillRect(x-s-2,y-s,x-s,y+s);}
function icPlus(x,y,s){g.fillRect(x-s,y-1,x+s,y+1);g.fillRect(x-1,y-s,x+1,y+s);}
function icMinus(x,y,s){g.fillRect(x-s,y-1,x+s,y+1);}
function clamp(lines,n,w){if(lines.length<=n)return lines;lines=lines.slice(0,n);lines[n-1]=fit(lines[n-1]+"...",w,g.getFont());return lines;}
function fit(t,w,font){g.setFont(font);if(g.stringWidth(t)<=w)return t;while(t.length&&g.stringWidth(t+"...")>w)t=t.slice(0,-1);return t+"...";}
`;

module.exports = {
  // A — Pebble classic: content left, 3-slot action bar on the right edge.
  // Touch: top slot vol+, middle play/pause, bottom vol-. Swipe L/R = next/prev. BTN1 = exit.
  A: {
    name: "Pebble action bar",
    controls: "Right action bar: tap top = vol+, middle = play/pause, bottom = vol−. Swipe ←/→ = next/prev. BTN = exit.",
    src: icons + `
function draw(){
  var r=Bangle.appRect; g.reset().clearRect(r);
  var bw=30, cx=r.x2-bw; // action bar
  g.fillRect(cx,r.y,r.x2,r.y2);
  g.setColor(g.theme.bg);
  var my=(r.y+r.y2)/2;
  icPlus(cx+15,r.y+22,7);
  if(st.state=="play")icPause(cx+15,my,8);else icPlay(cx+15,my,8);
  icMinus(cx+15,r.y2-22,7);
  g.setColor(g.theme.fg);
  var w=cx-r.x-12, x=r.x+6;
  if(!st.track){g.setFont("12x20").setFontAlign(-1,0).drawString("No music",x,my-10);
    g.setFont("6x15").drawString("Start playback\\non your phone",x,my+20);return;}
  g.setFontAlign(-1,-1);
  var lines=g.setFont("Vector:22").wrapString(st.track,w);lines=clamp(lines,3,w);
  var y=r.y+10; lines.forEach(function(l){g.drawString(l,x,y);y+=24;});
  g.setFont("6x15").drawString(fit(st.artist,w,"6x15"),x,y+6);
  g.drawString(fit(st.album||"",w,"6x15"),x,y+24);
  g.setFontAlign(-1,1).drawString(st.state=="play"?"Playing":"Paused",x,r.y2-4);
}`,
  },

  // B — Typography only: huge track title, no on-screen controls at all.
  // Tap anywhere = play/pause, swipe L/R = next/prev, swipe up/down = volume. BTN1 = exit.
  B: {
    name: "Gesture-only, big type",
    controls: "No buttons on screen. Tap anywhere = play/pause. Swipe ←/→ = next/prev. Swipe ↑/↓ = volume. BTN = exit.",
    src: icons + `
function draw(){
  var r=Bangle.appRect; g.reset().clearRect(r);
  var x=r.x+8, w=r.w-16;
  if(!st.track){g.setFont("Vector:26").setFontAlign(0,0).drawString("—",r.x+r.w/2,(r.y+r.y2)/2-10);
    g.setFont("6x15").drawString("Nothing playing",r.x+r.w/2,(r.y+r.y2)/2+18);return;}
  g.setFontAlign(-1,-1);
  g.setFont("6x15").drawString(fit(st.artist.toUpperCase(),w,"6x15"),x,r.y+8);
  g.fillRect(x,r.y+26,x+24,r.y+27);
  var lines=g.setFont("Vector:30").wrapString(st.track,w);lines=clamp(lines,3,w);
  var y=r.y+34; lines.forEach(function(l){g.drawString(l,x,y);y+=32;});
  // tiny status glyph bottom-left
  g.setFont("6x8").setFontAlign(-1,1).drawString(st.state=="play"?"PLAYING":"PAUSED",x,r.y2-6);
  g.setFont("6x8").setFontAlign(1,1).drawString("vol "+st.vol,r.x2-8,r.y2-6);
}`,
  },

  // C — Media-player grid: text block on top, three big outlined touch targets below.
  // Tap prev / play-pause / next boxes. Swipe up/down = volume. BTN1 = exit.
  C: {
    name: "Control row",
    controls: "Bottom row of 3 big buttons: prev, play/pause, next. Swipe ↑/↓ = volume. BTN = exit.",
    src: icons + `
function draw(){
  var r=Bangle.appRect; g.reset().clearRect(r);
  var x=r.x+6, w=r.w-12, cx=r.x+r.w/2;
  var by=r.y2-56; // button row top
  if(!st.track){g.setFont("12x20").setFontAlign(0,0).drawString("No music",cx,(r.y+by)/2);}
  else{
    g.setFontAlign(0,-1);
    var lines=g.setFont("12x20").wrapString(st.track,w);lines=clamp(lines,2,w);
    var y=r.y+8; lines.forEach(function(l){g.drawString(l,cx,y);y+=22;});
    g.setFont("6x15").drawString(fit(st.artist,w,"6x15"),cx,y+2);
    if(st.album)g.setFont("6x8").drawString(fit(st.album,w,"6x8"),cx,y+18);
  }
  // volume ticks
  var vy=by-12; for(var i=0;i<10;i++){var tx=cx-50+i*10; if(i<st.vol/10)g.fillRect(tx,vy,tx+7,vy+4);else g.drawRect(tx,vy,tx+7,vy+4);}
  // buttons
  var bw=(r.w-16)/3;
  for(var b=0;b<3;b++){var bx=r.x+4+b*(bw+4);
    if(b==1){g.fillRect(bx,by,bx+bw,r.y2-4);g.setColor(g.theme.bg);}else g.drawRect(bx,by,bx+bw,r.y2-4);
    var ix=bx+bw/2, iy=(by+r.y2-4)/2;
    if(b==0)icPrev(ix,iy,9);else if(b==2)icNext(ix,iy,9);else if(st.state=="play")icPause(ix,iy,10);else icPlay(ix,iy,10);
    g.setColor(g.theme.fg);}
}`,
  },
};
