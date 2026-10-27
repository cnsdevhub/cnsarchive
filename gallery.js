/* cns.archive — the walk.
   Everything here is built from the painting list that the build puts into index.html.
   No libraries. Nothing in this file needs editing to add paintings or rooms. */
(function () {
  'use strict';

  var root = document.documentElement;
  var $ = function (id) { return document.getElementById(id); };

  if (!(window.CSS && CSS.supports && window.requestAnimationFrame && $('gallery-data'))) {
    fallback();
    return;
  }
  root.classList.add('gallery');
  try {
    start();
  } catch (err) {
    console.error(err);
    fallback();
  }

  /* If anything can't run, show the plain list instead. */
  function fallback() {
    var main = $('fallback');
    var intro = $('intro');
    var outro = $('outro');
    var signoff = $('signoff');
    if (main && intro && intro.parentNode !== document.body) document.body.insertBefore(intro, main);
    if (main && signoff && signoff.parentNode !== document.body) main.after(signoff);
    if (main && outro && outro.parentNode !== document.body) (signoff || main).after(outro);
    [intro, outro, signoff].forEach(function (n) { if (n) { n.classList.remove('on-wall'); n.removeAttribute('style'); } });
    root.classList.remove('js', 'gallery', 'lit', 'is-locked', 'is-close');
  }

  function start() {
    var data = JSON.parse($('gallery-data').textContent);
    var P = data.paintings;
    if (!P || !P.length) throw new Error('No paintings in the data.');

    var rooms = data.rooms.map(function (r, ri) {
      return { name: r.name, items: P.map(function (p, i) { return p.room === ri ? i : -1; }).filter(function (i) { return i >= 0; }) };
    });

    var walk = $('walk'), stage = $('stage'), wall = $('wall'), track = $('track'),
      veil = $('veil'), intro = $('intro'), outro = $('outro'), hint = $('hint'), finder = $('finder'),
      finderRoom = $('finder-room'), finderLine = $('finder-line'), finderMarker = $('finder-marker'),
      allbtn = $('allbtn'), overview = $('overview'), closeup = $('closeup'), cuText = $('cu-text'),
      cuTitle = $('cu-title'), cuMeta = $('cu-meta'), cuNote = $('cu-note'), cuAlt = $('cu-alt'),
      announcer = $('announce');

    var reducedMQ = matchMedia('(prefers-reduced-motion: reduce)');
    var reduced = reducedMQ.matches;
    if (reducedMQ.addEventListener) reducedMQ.addEventListener('change', function (e) { reduced = e.matches; });
    var coarse = matchMedia('(pointer: coarse)').matches;
    var webpLikely = CSS.supports('aspect-ratio', '1');

    var wallRGB = P.map(function (p) { return hexToRGB(p.wall || '#2b2a25'); });
    var shownWall = wallRGB[0].slice();
    var snapWall = true;

    // How long the camera takes to walk up to a painting, move to the next, and step back (ms).
    var CLOSER = 1250, NEXT = 1100, BACK = 1050;

    /* ---------------------------------------------------------------- build the wall */

    var pieces = P.map(buildPiece);
    var floorEl = document.createElement('div');
    floorEl.className = 'floor';
    track.prepend(floorEl);
    $('grain').style.backgroundImage = 'url(' + grain() + ')';
    $('grain').style.backgroundSize = Math.round(256 / Math.min(3, window.devicePixelRatio || 1)) + 'px';
    intro.classList.add('on-wall');
    outro.classList.add('on-wall');
    track.append(intro, outro);
    var signoff = $('signoff'), lastSignoff = -1;
    // where the signature sits on the drawing, in the drawing's 712 × 712 units:
    // its top-left corner, its width, and a slight tilt so the "C" follows her shoulder
    var SIG = { left: 91, top: 531, width: 393, tilt: 2 };
    if (signoff) track.append(signoff);
    // tabbing to the email walks to the end of the wall
    var contact = outro.querySelector('a');
    if (contact) contact.addEventListener('focus', function () { if (!cu.open) walkTo(L.endX, { jump: false }); });

    /* Where a new room begins, its sign is printed on the wall:
       Room 2 / Collection Two / 3 paintings */
    var roomSigns = [];
    rooms.forEach(function (room, ri) {
      if (ri === 0) return;
      var sign = document.createElement('div');
      sign.className = 'roomsign on-wall';
      var num = document.createElement('p');
      num.className = 'roomsign__number';
      num.textContent = 'Room ' + (ri + 1);
      var name = document.createElement('p');
      name.className = 'roomsign__name';
      name.textContent = room.name;
      var count = document.createElement('p');
      count.className = 'roomsign__count';
      count.textContent = room.items.length + (room.items.length === 1 ? ' painting' : ' paintings');
      sign.append(num, name, count);
      track.append(sign);
      roomSigns.push(sign);
    });

    function buildPiece(p, i) {
      var fig = document.createElement('figure');
      fig.className = 'piece';
      var pool = document.createElement('div');
      pool.className = 'pool';
      var frame = document.createElement('div');
      frame.className = 'frame';
      var canvas = document.createElement('div');
      canvas.className = 'canvas';
      var ph = document.createElement('div');
      ph.className = 'ph';
      ph.style.backgroundImage = 'url(' + placeholder(p.lq) + ')';
      var pic = document.createElement('picture');
      var source = document.createElement('source');
      source.type = 'image/webp';
      var img = document.createElement('img');
      img.alt = p.alt || p.title + ', a painting by Cansu';
      img.width = p.dims[900][0];
      img.height = p.dims[900][1];
      img.decoding = 'async';
      img.draggable = false;
      pic.append(source, img);
      canvas.append(ph, pic);
      frame.append(canvas);

      var look = document.createElement('button');
      look.type = 'button';
      look.className = 'look';
      look.setAttribute('aria-label', 'Look closer at “' + p.title + '”');

      var cap = document.createElement('figcaption');
      cap.className = 'label';
      var t = document.createElement('span');
      t.className = 'label__title';
      t.textContent = p.title;
      var m = document.createElement('span');
      m.className = 'label__meta';
      m.append(p.date, document.createElement('br'), p.medium + ', ' + p.size);
      cap.append(t, m);

      fig.append(pool, frame, look, cap);
      track.append(fig);

      look.addEventListener('click', function () { openCloseup(i, { push: true }); });
      look.addEventListener('focus', function () {
        // keyboard focus walks to the painting; a click opens it from where you stand
        var keyboard = true;
        try { keyboard = look.matches(':focus-visible'); } catch (e) { /* older browsers */ }
        if (keyboard && !cu.open && !quietFocus) walkTo(L.xs[i], { jump: false });
      });
      img.addEventListener('load', function () { fig.classList.add('is-loaded'); });
      img.addEventListener('error', function () { console.warn('Could not load', img.currentSrc || img.src); });
      return { fig: fig, img: img, source: source, look: look, ph: ph, mid: false, large: false };
    }

    /* ---------------------------------------------------------------- layout */

    var L = {};

    function layout() {
      var vw = stage.clientWidth;
      var vh = stage.clientHeight;
      var mobile = vw < 720;
      var slot = mobile ? vw * 0.98 : clamp(vw * 0.56, 560, 1000);
      var ref = mobile ? vw * 0.62 : clamp(vw * 0.245, 270, 460); // shown width of a 30 cm side
      var perCm = ref / 30;
      var floorY = Math.round(vh * (mobile ? 0.83 : 0.86));
      var eye = vh * (mobile ? 0.41 : 0.43);
      var labelRoom = 96;
      var maxW = mobile ? vw * 0.86 : Math.min(vw * 0.42, 640);
      var maxH = Math.max(80, Math.min(vh * (mobile ? 0.38 : 0.44), 2 * (floorY - labelRoom - eye)));
      var minW = mobile ? vw * 0.42 : 170;

      var geo = P.map(function (p) {
        var w = p.cm ? (p.ar >= 1 ? Math.max(p.cm[0], p.cm[1]) : Math.min(p.cm[0], p.cm[1])) * perCm : ref * (p.ar >= 1 ? 1 : 0.75);
        var h = w / p.ar;
        if (w > maxW) { w = maxW; h = w / p.ar; }
        if (h > maxH) { h = maxH; w = h * p.ar; }
        if (w < minW && h < maxH) { w = Math.min(minW, maxH * p.ar); h = w / p.ar; }
        var f = Math.round(clamp(w * 0.022, 4, mobile ? 6 : 9));
        var W = Math.round(w + 2 * f);
        var H = Math.round(h + 2 * f);
        var jitter = (hash01(p.slug) - 0.5) * vh * 0.05;
        var cy = clamp(eye + jitter, H / 2 + 48, floorY - labelRoom - H / 2);
        return { W: W, H: H, f: f, cy: Math.round(cy), x: 0 };
      });

      var xs = [];
      var roomStarts = []; // where each new room begins, and where its sign hangs
      var x = 0;
      P.forEach(function (p, i) {
        if (i === 0) x = (mobile ? vw * 0.28 : vw * 0.08) + geo[0].W / 2;
        else if (p.room !== P[i - 1].room) {
          // the room sign hangs between the two rooms, with a calm gap on each side
          var signW = (roomSigns[roomStarts.length] && roomSigns[roomStarts.length].offsetWidth) || vw * 0.25;
          var gap = mobile ? vw * 0.14 : slot * 0.2;
          var signX = xs[i - 1] + geo[i - 1].W / 2 + gap + signW / 2;
          roomStarts.push({ room: p.room, x: signX - signW / 2, sign: signX });
          x = Math.max(signX + signW / 2 + gap + geo[i].W / 2, xs[i - 1] + slot);
        } else x = xs[i - 1] + slot;
        xs.push(Math.round(x));
        geo[i].x = Math.round(x);
      });
      // the very end: a line drawing of the painter, signed like a sketch. She hangs a little
      // closer to the last painting than the paintings hang to each other.
      var drawSize = mobile ? Math.min(vw * 0.78, vh * 0.4) : Math.min(vh * 0.6, vw * 0.36);
      var last = xs.length - 1;
      var endX = Math.round(mobile ? xs[last] + slot * 1.05 : xs[last] + geo[last].W / 2 + (slot - ref) * 0.75 + drawSize * 0.37);
      var drawX = endX;
      var total = endX;

      // the places the walk comes to rest: the start, each painting, each room sign, the end
      var stops = [{ x: 0, kind: 'start' }];
      xs.forEach(function (sx, i) { stops.push({ x: sx, kind: 'painting', i: i }); });
      roomStarts.forEach(function (r) { stops.push({ x: r.sign, kind: 'room', room: r.room }); });
      stops.push({ x: endX, kind: 'end' });
      stops.sort(function (a, b) { return a.x - b.x; });

      var perSlot = clamp(vh * 0.95, 560, 1100);
      var ratio = perSlot / slot;

      L = { vw: vw, vh: vh, mobile: mobile, slot: slot, floorY: floorY, eye: eye, geo: geo, xs: xs, roomStarts: roomStarts, endX: endX, total: total, drawX: drawX, stops: stops, ratio: ratio };
      L.stacked = vw < 1100 && vh > vw * 1.05; // close-up text goes below the painting
      L.safeTop = measureSafeTop();
      closeup.classList.toggle('is-stacked', L.stacked);

      floorEl.style.left = Math.round(-vw * 3) + 'px';
      floorEl.style.width = Math.round(endX + vw * 6) + 'px';
      floorEl.style.top = floorY + 'px';
      floorEl.style.height = Math.round(vh * 3) + 'px';
      floorEl.style.setProperty('--fh', vh - floorY + 'px');

      geo.forEach(function (g, i) {
        var s = pieces[i].fig.style;
        s.left = g.x + 'px';
        s.top = g.cy + 'px';
        s.setProperty('--w', g.W + 'px');
        s.setProperty('--h', g.H + 'px');
        s.setProperty('--f', g.f + 'px');
      });

      // wall text
      var introW = mobile ? vw * 0.8 : Math.min(vw * 0.56, 980);
      placeText(intro, mobile ? -vw / 2 + 26 : -vw * 0.38, eye - vh * 0.02, introW);
      if (signoff) {
        // her head at the height of the paintings; her shoulders fade out below
        var drawTop = eye - drawSize * (mobile ? 0.42 : 0.44);
        signoff.style.setProperty('--x', Math.round(drawX - drawSize / 2) + 'px');
        signoff.style.setProperty('--y', Math.round(drawTop) + 'px');
        signoff.style.setProperty('--s', Math.round(drawSize) + 'px');
        // the signature grows out of the drawing: the curve of the "C" lies along her left
        // shoulder (SIG is measured in the drawing's own 712 × 712 units)
        var u = drawSize / 712;
        var sigX = drawX - drawSize / 2 + SIG.left * u, sigY = drawTop + SIG.top * u;
        placeText(outro, sigX, sigY, SIG.width * u);
        outro.style.setProperty('--tilt', SIG.tilt + 'deg');
        // the email hangs centered under the whole drawing, like the labels under the paintings
        outro.style.setProperty('--cx', Math.round(drawX - sigX) + 'px');
        outro.style.setProperty('--cy', Math.round(drawTop + drawSize - sigY + clamp(vh * 0.02, 14, 22)) + 'px');
        lastSignoff = -1;
      } else placeText(outro, endX - drawSize * 0.25, eye - drawSize * 0.12, drawSize * 0.5);

      roomSigns.forEach(function (sign, k) {
        sign.style.setProperty('--x', Math.round(roomStarts[k].sign) + 'px');
        sign.style.setProperty('--y', Math.round(eye) + 'px');
      });

      L.finderW = finderLine.clientWidth;
      curRoom = -1; // rebuild dots
      lastNear = -1;
    }

    function placeText(el, x, y, w) {
      el.style.setProperty('--x', Math.round(x) + 'px');
      el.style.setProperty('--y', Math.round(y) + 'px');
      el.style.setProperty('--tw', Math.round(w) + 'px');
    }

    /* ---------------------------------------------------------------- camera */

    var c = 0;           // where the visitor stands, in wall pixels
    var v = 0;           // walking speed
    var target = 0;      // where the scroll says they should be
    var running = false;
    var lastT = 0;
    var lastTransform = '';
    var lastWall = '';
    var lastNear = -1;
    var curRoom = -1;
    var curDot = -1;
    var moved = false;
    var quietFocus = false;
    var stepping = false; // reduced motion: a fade is in progress
    var shownStop = -1;
    var glide = null;     // a gentle, timed move of the target (landing, arrow keys, dots)
    var ownY = -1;        // the scroll position we set ourselves, so we don't mistake it for the visitor

    /* The walk's own scroll position. The page itself never scrolls: while it scrolled under the
       wall, Safari sometimes lost part of the wall for a moment, which flickered black. The wheel,
       the trackpad, the keys and your finger move this number instead, and the walk follows it
       just as it used to follow the page. */
    var sy = 0;
    function setY(y) { sy = clamp(Math.round(y), 0, Math.ceil(L.total * L.ratio)); }

    var cu = { open: false, i: -1, p: 0, anim: null, nav: null, cam: null, aim: null, returnY: 0, wheel: 0, wheelX: 0 };
    var textTimer = 0;

    function kick() {
      if (running) return;
      running = true;
      lastT = performance.now();
      requestAnimationFrame(frame);
    }

    function frame(t) {
      var dt = Math.min(0.05, Math.max(0.001, (t - lastT) / 1000));
      lastT = t;
      var busy = false;

      if (glide) {
        var gk = clamp((t - glide.t0) / glide.dur, 0, 1);
        if (glide.v0) {
          // carries on at the speed of the flick, then eases to a stop
          var g2 = gk * gk, g3 = g2 * gk;
          target = (2 * g3 - 3 * g2 + 1) * glide.from + (g3 - 2 * g2 + gk) * glide.v0 * glide.dur / 1000 + (3 * g2 - 2 * g3) * glide.to;
        } else target = lerp(glide.from, glide.to, (1 - Math.cos(Math.PI * gk)) / 2);
        if (glide.direct) { c = target; v = 0; } // after a finger drag the wall follows the curve itself
        if (gk >= 1) { glide = null; ownY = -1; } else busy = true;
      }

      if (reduced) {
        c = target; v = 0;
      } else {
        var omega = coarse ? 7.5 : 5.6; // weight of the walk: lower is heavier
        var d = c - target;
        var e = Math.exp(-omega * dt);
        var nc = target + (d + (v + omega * d) * dt) * e;
        v = (v - omega * (v + omega * d) * dt) * e;
        c = nc;
        if (Math.abs(target - c) < 0.08 && Math.abs(v) < 0.5) { c = target; v = 0; } else busy = true;
      }

      if (cu.anim) {
        var a = cu.anim;
        var k = a.dur > 0 ? Math.min(1, (t - a.t0) / a.dur) : 1;
        cu.p = a.from + (a.to - a.from) * k;
        if (k >= 1) { cu.anim = null; a.done && a.done(); } else busy = true;
      }
      if (cu.nav) {
        var n = cu.nav;
        var q = n.dur > 0 ? Math.min(1, (t - n.t0) / n.dur) : 1;
        var eq = easeInOut(q);
        cu.cam = { S: lerp(n.from.S, n.to.S, eq), tx: lerp(n.from.tx, n.to.tx, eq), ty: lerp(n.from.ty, n.to.ty, eq) };
        if (q >= 1) { cu.nav = null; sharpen(); } else busy = true;
      }

      var tw = cu.open ? wallRGB[cu.i] : wallAt(c);
      var kw = snapWall ? 1 : 1 - Math.exp(-dt * (cu.open || cu.p > 0 ? 2.4 : 16));
      snapWall = false;
      var diff = 0;
      for (var q = 0; q < 3; q++) {
        shownWall[q] += (tw[q] - shownWall[q]) * kw;
        diff = Math.max(diff, Math.abs(tw[q] - shownWall[q]));
      }
      if (diff > 0.25) busy = true;

      render();
      if (busy) requestAnimationFrame(frame);
      else running = false;
    }

    function render() {
      var vw = L.vw, vh = L.vh;
      var S = 1, fx = c, fy = vh / 2, sx = vw / 2, sy = vh / 2;

      var tx = sx - S * fx, ty = sy - S * fy;
      if (cu.p > 0 && cu.cam) {
        // the camera moves straight in: position and scale blend together
        var e = easeInOut(cu.p);
        var C = cu.cam;
        tx = lerp(tx, C.tx, e);
        ty = lerp(ty, C.ty, e);
        S = lerp(S, C.S, e);
      }
      var tf = 'translate3d(' + tx.toFixed(2) + 'px,' + ty.toFixed(2) + 'px,0) scale(' + S.toFixed(5) + ')';
      if (tf !== lastTransform) { track.style.transform = tf; lastTransform = tf; }


      if (signoff) {
        // she and her signature appear as you walk up, like a drawing coming out of the wall
        var near = clamp(1 - Math.abs(c - L.endX) / (L.slot * 0.7), 0, 1);
        near = Math.round(near * near * (3 - 2 * near) * 100) / 100;
        if (near !== lastSignoff) {
          signoff.style.setProperty('--near', near);
          outro.style.setProperty('--near', near);
          lastSignoff = near;
        }
      }

      var col = 'rgb(' + Math.round(shownWall[0]) + ',' + Math.round(shownWall[1]) + ',' + Math.round(shownWall[2]) + ')';
      if (col !== lastWall) { wall.style.backgroundColor = col; lastWall = col; }

      updateFinder();
      loadAround(nearestPainting(c));
    }

    function wallAt(x) {
      var xs = L.xs, n = xs.length;
      var rgb;
      if (x <= xs[0]) rgb = wallRGB[0];
      else if (x >= xs[n - 1]) rgb = wallRGB[n - 1];
      else {
        var j = nearestBelow(x);
        var t = (x - xs[j]) / (xs[j + 1] - xs[j]);
        t = t * t * (3 - 2 * t);
        var a = wallRGB[j], b = wallRGB[j + 1];
        rgb = [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
      }
      return rgb;
    }

    function nearestBelow(x) {
      var xs = L.xs, lo = 0, hi = xs.length - 1;
      while (lo < hi) {
        var mid = (lo + hi + 1) >> 1;
        if (xs[mid] <= x) lo = mid; else hi = mid - 1;
      }
      return lo;
    }

    function nearestPainting(x) {
      var j = nearestBelow(x);
      if (j < L.xs.length - 1 && Math.abs(L.xs[j + 1] - x) < Math.abs(L.xs[j] - x)) j++;
      return j;
    }

    function roomAt(x) {
      var r = 0;
      for (var i = 0; i < L.roomStarts.length; i++) if (x >= L.roomStarts[i].x) r = L.roomStarts[i].room;
      return r;
    }

    /* After a zoom, ask the browser to redraw the wall sharply at the new scale. */
    function sharpen() {
      track.style.willChange = 'auto';
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { track.style.willChange = ''; });
      });
    }

    /* ---------------------------------------------------------------- images */

    function loadAround(i) {
      if (i === lastNear) return;
      lastNear = i;
      for (var j = i - 1; j <= i + 2; j++) loadMid(j);
    }

    function loadMid(j) {
      var pc = pieces[j];
      if (!pc || pc.mid) return;
      pc.mid = true;
      pc.source.srcset = P[j].base + '-900.webp';
      pc.img.src = P[j].base + '-900.jpg';
    }

    function loadLarge(j) {
      var pc = pieces[j];
      if (!pc || pc.large) return;
      pc.large = true;
      loadMid(j);
      var cur = pc.img.currentSrc || '';
      var webp = cur ? /\.webp(\?|$)/.test(cur) : webpLikely;
      var im = new Image();
      im.decoding = 'async';
      im.src = P[j].base + '-1800.' + (webp ? 'webp' : 'jpg');
      var ready = im.decode ? im.decode() : new Promise(function (res, rej) { im.onload = res; im.onerror = rej; });
      ready.then(function () {
        pc.source.srcset = P[j].base + '-1800.webp';
        pc.img.src = P[j].base + '-1800.jpg';
      }).catch(function () { pc.large = false; });
    }

    function grain() {
      try {
        var cv = document.createElement('canvas');
        cv.width = cv.height = 256;
        var ctx = cv.getContext('2d');
        var d = ctx.createImageData(256, 256);
        for (var k = 0; k < d.data.length; k += 4) {
          var g = (Math.random() * 255) | 0;
          d.data[k] = d.data[k + 1] = d.data[k + 2] = g;
          d.data[k + 3] = 16;
        }
        ctx.putImageData(d, 0, 0);
        return cv.toDataURL('image/png');
      } catch (e) {
        return '';
      }
    }

    function placeholder(lq) {
      try {
        var w = lq[0], h = lq[1], hex = lq[2];
        var cv = document.createElement('canvas');
        cv.width = w;
        cv.height = h;
        var ctx = cv.getContext('2d');
        var d = ctx.createImageData(w, h);
        for (var k = 0; k < w * h; k++) {
          d.data[k * 4] = parseInt(hex.substr(k * 6, 2), 16);
          d.data[k * 4 + 1] = parseInt(hex.substr(k * 6 + 2, 2), 16);
          d.data[k * 4 + 2] = parseInt(hex.substr(k * 6 + 4, 2), 16);
          d.data[k * 4 + 3] = 255;
        }
        ctx.putImageData(d, 0, 0);
        return cv.toDataURL('image/png');
      } catch (e) {
        return '';
      }
    }

    /* ---------------------------------------------------------------- walking */

    /* The visitor scrolled (wheel, trackpad or keys moved sy): the walk follows. */
    function onScroll() {
      if (cu.open || overview.open) return;
      var y = sy;
      if (ownY >= 0 && Math.abs(y - ownY) <= 1) { ownY = -1; return; } // our own glide, already on its way
      ownY = -1;
      glide = null; // the visitor is scrolling again: they lead
      var x = clamp(y / L.ratio, 0, L.total);
      if (!moved && y > 3) firstMove();
      if (!gesture) { gesture = true; gestureFrom = target; }
      scheduleLanding();
      if (reduced) { stepToNearest(x); return; }
      if (Math.abs(x - target) > 0.5) target = x;
      kick();
    }

    /* Landing: when the scrolling stops, the walk glides on until the nearest painting
       (or room sign) is in the middle. A small nudge is enough to move to the next one. */
    var landTimer = 0, touching = false, gesture = false, gestureFrom = 0;

    function scheduleLanding() {
      clearTimeout(landTimer);
      if (touching) return;
      landTimer = setTimeout(land, coarse ? 140 : 180);
    }

    function land() {
      if (touching || glide || cu.open || overview.open) return;
      gesture = false;
      var x = clamp(sy / L.ratio, 0, L.total);
      var k = nearestStopIndex(x);
      var from = nearestStopIndex(gestureFrom);
      var nudge = x - L.stops[from].x;
      // nudged away from where you stood, but not halfway: carry on to the next one that way
      if (k === from && Math.abs(nudge) > L.slot * 0.1) {
        var next = from + (nudge > 0 ? 1 : -1);
        if (L.stops[next]) k = next;
      }
      var to = L.stops[k].x;
      if (Math.abs(to - x) * L.ratio > 1) scrollToX(to);
    }

    window.addEventListener('touchstart', function () { touching = true; clearTimeout(landTimer); }, { passive: true });
    window.addEventListener('touchend', function () { touching = false; scheduleLanding(); }, { passive: true });
    window.addEventListener('touchcancel', function () { touching = false; scheduleLanding(); }, { passive: true });

    function firstMove() {
      if (moved) return;
      moved = true;
      hint.classList.remove('is-shown');
      hint.classList.add('is-gone');
    }

    /* Walk to a spot on the wall. Far away: a soft fade instead of a long glide. */
    function walkTo(x, opts) {
      opts = opts || {};
      firstMove();
      x = clamp(x, 0, L.total);
      var far = Math.abs(x - c) / L.slot > 2.6;
      if (reduced || (far && opts.jump !== false)) { fadeJump(x); return; }
      scrollToX(x);
    }

    function scrollToX(x, v0) {
      x = clamp(x, 0, L.total);
      ownY = Math.round(x * L.ratio);
      if (reduced) { glide = null; target = x; }
      else if (v0 && v0 * (x - target) > 0) {
        // after a flick: keep its speed, then settle (no overshoot)
        var dist = Math.abs(x - target);
        var secs = clamp((2 * dist) / Math.abs(v0), 0.35, 1);
        var vmax = (2.5 * dist) / secs;
        glide = { from: target, to: x, t0: performance.now(), dur: secs * 1000, v0: clamp(v0, -vmax, vmax) };
      } else {
        // short moves (landing) take about half a second, one painting about a second
        var dur = clamp(450 + (Math.abs(x - target) / L.slot) * 450, 500, 1000);
        glide = { from: target, to: x, t0: performance.now(), dur: dur };
      }
      setY(ownY);
      kick();
    }

    function fadeJump(x) {
      veil.classList.add('is-down');
      setTimeout(function () {
        var side = x >= c ? -1 : 1;
        c = reduced ? x : clamp(x + side * L.slot * 0.35, 0, L.total);
        v = 0;
        glide = null;
        target = x;
        setY(x * L.ratio);
        shownStop = nearestStopIndex(x);
        snapWall = true;
        render();
        veil.classList.remove('is-down');
        kick();
      }, reduced ? 230 : 400);
    }

    /* Reduced motion: hold still at the nearest painting, fade between them. */
    function stepToNearest(x) {
      var k = nearestStopIndex(x);
      if (k === shownStop) return;
      if (shownStop === -1) { shownStop = k; glide = null; target = c = L.stops[k].x; snapWall = true; kick(); return; }
      if (stepping) return;
      stepping = true;
      veil.classList.add('is-down');
      setTimeout(function () {
        var now = nearestStopIndex(clamp(sy / L.ratio, 0, L.total));
        shownStop = now;
        glide = null; target = c = L.stops[now].x;
        snapWall = true;
        kick();
        veil.classList.remove('is-down');
        setTimeout(function () {
          stepping = false;
          stepToNearest(clamp(sy / L.ratio, 0, L.total));
        }, 230);
      }, 230);
    }

    function nearestStopIndex(x) {
      var best = 0, bd = Infinity;
      L.stops.forEach(function (s, k) {
        var d = Math.abs(s.x - x);
        if (d < bd) { bd = d; best = k; }
      });
      return best;
    }

    function step(dir) {
      var from = reduced ? L.stops[Math.max(0, shownStop)].x : glide ? glide.to : target;
      var s = null;
      if (dir > 0) {
        for (var i = 0; i < L.stops.length; i++) if (L.stops[i].x > from + 2) { s = L.stops[i]; break; }
      } else {
        for (var j = L.stops.length - 1; j >= 0; j--) if (L.stops[j].x < from - 2) { s = L.stops[j]; break; }
      }
      if (!s) return;
      walkTo(s.x, { jump: false });
      if (s.kind === 'painting') say('“' + P[s.i].title + '”, ' + P[s.i].date);
      else if (s.kind === 'room') say('Room ' + (s.room + 1) + ', ' + rooms[s.room].name);
      else if (s.kind === 'end') say('The end of the wall');
      else say('The start');
    }

    function goToPainting(i, opts) {
      walkTo(L.xs[i], opts);
      say('“' + P[i].title + '”, ' + P[i].date);
    }

    /* ---------------------------------------------------------------- finder line */

    function updateFinder() {
      var r = roomAt(c);
      var items = rooms[r].items;
      var n = items.length;
      if (r !== curRoom) {
        var first = curRoom === -1;
        curRoom = r;
        curDot = -1;
        buildDots(r);
        if (first) finderRoom.textContent = rooms[r].name;
        else {
          finderRoom.classList.add('is-fading');
          setTimeout(function () {
            finderRoom.textContent = rooms[curRoom].name;
            finderRoom.classList.remove('is-fading');
          }, 350);
        }
      }
      var f = clamp((c - L.xs[items[0]]) / L.slot, -0.5, n - 0.5);
      var w = L.finderW;
      var seg = Math.min(48, (w / n) * 0.8);
      var mx = clamp(((f + 0.5) / n) * w - seg / 2, 0, w - seg);
      finderMarker.style.setProperty('--seg', seg.toFixed(1) + 'px');
      finderMarker.style.transform = 'translateX(' + mx.toFixed(1) + 'px)';
      var d = clamp(Math.round(f), 0, n - 1);
      if (d !== curDot) {
        var dots = finderLine.querySelectorAll('.finder__dot');
        if (dots[curDot]) dots[curDot].removeAttribute('aria-current');
        if (dots[d]) dots[d].setAttribute('aria-current', 'true');
        curDot = d;
      }
    }

    function buildDots(r) {
      finderLine.querySelectorAll('.finder__dot').forEach(function (b) { b.remove(); });
      var items = rooms[r].items;
      var n = items.length;
      var w = L.finderW || finderLine.clientWidth;
      var hit = Math.min(30, w / n);
      finderLine.style.setProperty('--hit', hit.toFixed(1) + 'px');
      finder.setAttribute('aria-label', 'Paintings in ' + rooms[r].name);
      items.forEach(function (i, k) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'finder__dot';
        b.style.left = ((k + 0.5) / n) * 100 + '%';
        b.setAttribute('aria-label', P[i].title);
        b.addEventListener('click', function () { goToPainting(i); });
        finderLine.append(b);
      });
    }

    /* ---------------------------------------------------------------- close-up */

    function closeCam(i) {
      var g = L.geo[i], vw = L.vw, vh = L.vh, S, sx, sy;
      if (!L.stacked) {
        S = clamp(Math.min((vh * 0.56) / g.H, (vw * 0.44) / g.W), 1, 3.4);
        sx = vw * 0.34;
        sy = vh * 0.46;
      } else {
        S = clamp(Math.min((vw - 32) / g.W, (vh * 0.42) / g.H), 1, 3.4);
        sx = vw / 2;
        sy = Math.max(52, vh * 0.09) + L.safeTop + (S * g.H) / 2;
      }
      return { S: S, tx: sx - S * g.x, ty: sy - S * g.cy, sx: sx, sy: sy, w: S * g.W, h: S * g.H };
    }

    function measureSafeTop() {
      var probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none';
      document.body.append(probe);
      var h = probe.offsetHeight;
      probe.remove();
      return h;
    }

    /* The words sit beside the painting (below it on a phone), as wall text. */
    function placePanel() {
      if (cu.i < 0) return;
      var A = closeCam(cu.i), vw = L.vw, vh = L.vh, s = cuText.style;
      stage.style.setProperty('--vx', ((A.sx / vw) * 100).toFixed(1) + '%');
      stage.style.setProperty('--vy', ((A.sy / vh) * 100).toFixed(1) + '%');
      if (L.stacked) {
        s.left = s.width = s.top = '';
        s.setProperty('--cu-top', Math.round(A.sy + A.h / 2 + 26) + 'px');
      } else {
        var left = A.sx + A.w / 2 + Math.max(40, vw * 0.045);
        var width = Math.max(220, Math.min(vw * 0.36, vw - left - Math.max(28, vw * 0.055)));
        s.removeProperty('--cu-top');
        s.left = Math.round(left) + 'px';
        s.width = Math.round(width) + 'px';
        var h = cuText.offsetHeight;
        var top = Math.round(clamp(A.sy - vh * 0.02, h / 2 + vh * 0.06, Math.max(h / 2 + vh * 0.06, vh - 84 - h / 2)));
        s.top = top + 'px';
        closeup.style.setProperty('--gx', Math.round(left + width / 2) + 'px');
        closeup.style.setProperty('--gw', Math.round(width) + 'px');
        closeup.style.setProperty('--gy', top + 'px');
      }
    }

    function showText(delay) {
      clearTimeout(textTimer);
      textTimer = setTimeout(function () { if (cu.open) closeup.classList.add('is-shown'); }, delay);
    }
    function hideText() {
      clearTimeout(textTimer);
      closeup.classList.remove('is-shown');
    }

    function fillText(i) {
      var p = P[i];
      cuTitle.textContent = p.title;
      cuMeta.textContent = '';
      cuMeta.append(p.date, document.createElement('br'), p.medium + ', ' + p.size);
      cuNote.textContent = p.note || '';
      cuAlt.textContent = p.alt || '';
      closeup.querySelector('[data-act="prev"]').disabled = i === 0;
      closeup.querySelector('[data-act="next"]').disabled = i === P.length - 1;
      cuText.scrollTop = 0;
    }

    function setActive(i) {
      pieces.forEach(function (pc, k) { pc.fig.classList.toggle('is-active', k === i); });
    }

    function lockPage(on) {
      root.classList.toggle('is-locked', on);
      [walk, finder, allbtn, $('fallback')].forEach(function (n) {
        if (on) n.setAttribute('inert', ''); else n.removeAttribute('inert');
      });
    }

    function openCloseup(i, opts) {
      opts = opts || {};
      firstMove();
      if (cu.open && cu.i === i) return;
      if (cu.open) { moveCloseup(i - cu.i); return; }

      cu.open = true;
      cu.i = i;
      cu.returnY = sy;
      cu.cam = closeCam(i);
      cu.nav = null;
      loadAround(i);
      loadMid(i);
      loadLarge(i);
      setActive(i);
      lockPage(true);
      root.classList.add('is-close');
      closeup.hidden = false;
      fillText(i);
      placePanel();
      // the words arrive as the camera settles
      showText(reduced ? 260 : opts.instant ? 0 : CLOSER * 0.8);

      if (opts.push) history.pushState({ cu: P[i].slug }, '', '#' + P[i].slug);
      else if (!opts.fromHash) history.replaceState(history.state, '', '#' + P[i].slug);

      var done = function () { sharpen(); };
      if (reduced) {
        veil.classList.add('is-down');
        setTimeout(function () {
          cu.anim = null;
          cu.p = 1;
          render();
          sharpen();
          veil.classList.remove('is-down');
        }, 230);
      } else {
        cu.anim = { from: cu.p, to: 1, t0: performance.now(), dur: opts.instant ? 0 : CLOSER, done: done };
        kick();
      }
      setTimeout(function () { cuTitle.focus({ preventScroll: true }); }, 60);
    }

    function moveCloseup(dir) {
      if (!cu.open) return;
      var j = clamp(cu.i + dir, 0, P.length - 1);
      if (j === cu.i) return;
      var from = cu.cam;
      if (cu.anim) { cu.p = 1; cu.anim = null; }
      hideText();
      cu.i = j;
      loadAround(j);
      loadLarge(j);
      setActive(j);

      // the walk follows underneath, so stepping back lands at this painting
      glide = null; c = target = L.xs[j];
      v = 0;
      cu.returnY = Math.round(L.xs[j] * L.ratio);
      setY(cu.returnY);

      history.replaceState(history.state, '', '#' + P[j].slug);
      say('“' + P[j].title + '”, ' + P[j].date);

      var to = closeCam(j);
      setTimeout(function () {
        if (!cu.open || cu.i !== j) return;
        fillText(j);
        placePanel();
      }, reduced ? 200 : 420);
      showText(reduced ? 480 : NEXT * 0.82);

      if (reduced) {
        veil.classList.add('is-down');
        setTimeout(function () { cu.cam = to; render(); sharpen(); veil.classList.remove('is-down'); }, 230);
      } else {
        cu.nav = { from: from, to: to, t0: performance.now(), dur: NEXT };
        kick();
      }
    }

    function closeCloseup(opts) {
      opts = opts || {};
      if (!cu.open) return;
      cu.open = false;
      var i = cu.i;
      root.classList.remove('is-close');
      hideText();
      lockPage(false);
      setY(cu.returnY); // land at the painting you were looking at last, not the first one
      glide = null;
      target = clamp(cu.returnY / L.ratio, 0, L.total);
      if (Math.abs(target - c) > 1) c = target;
      v = 0;

      if (!opts.fromHistory) {
        if (history.state && history.state.cu) history.back();
        else history.replaceState(null, '', location.pathname + location.search);
      }

      var finish = function () {
        if (cu.open) return;
        closeup.hidden = true;
        cu.i = -1;
        setActive(-1);
        sharpen();
        if (lastInput === 'key') {
          // keyboard visitors land back on the painting they opened
          quietFocus = true;
          pieces[i].look.focus({ preventScroll: true });
          quietFocus = false;
        } else if (closeup.contains(document.activeElement)) document.activeElement.blur();
      };
      if (reduced) {
        veil.classList.add('is-down');
        setTimeout(function () { cu.p = 0; cu.anim = null; render(); finish(); veil.classList.remove('is-down'); }, 230);
      } else {
        cu.anim = { from: cu.p, to: 0, t0: performance.now(), dur: BACK, done: finish };
        kick();
      }
    }

    closeup.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-act]');
      if (b) {
        var act = b.getAttribute('data-act');
        if (act === 'prev') moveCloseup(-1);
        else if (act === 'next') moveCloseup(1);
        else closeCloseup();
        return;
      }
      if (e.target.closest('.closeup__text')) return;
      closeCloseup();
    });

    closeup.addEventListener('wheel', function (e) {
      if (textCanScroll(e.target, e.deltaY)) return;
      e.preventDefault();
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        cu.wheelX += e.deltaX;
        if (Math.abs(cu.wheelX) > 120) { moveCloseup(cu.wheelX > 0 ? 1 : -1); cu.wheelX = 0; }
      } else {
        cu.wheel += e.deltaY;
        if (Math.abs(cu.wheel) > 160) { cu.wheel = 0; closeCloseup(); }
      }
      clearTimeout(cu.wheelTimer);
      cu.wheelTimer = setTimeout(function () { cu.wheel = 0; cu.wheelX = 0; }, 260);
    }, { passive: false });

    function textCanScroll(el, dy) {
      if (!cuText.contains(el)) return false;
      if (cuText.scrollHeight <= cuText.clientHeight + 2) return false;
      if (dy < 0) return cuText.scrollTop > 0;
      return cuText.scrollTop + cuText.clientHeight < cuText.scrollHeight - 1;
    }

    var ct = null;
    closeup.addEventListener('touchstart', function (e) {
      var t = e.touches[0];
      ct = { x: t.clientX, y: t.clientY, inText: cuText.contains(e.target), top: cuText.scrollTop <= 0, scrollable: cuText.scrollHeight > cuText.clientHeight + 2 };
    }, { passive: true });
    closeup.addEventListener('touchmove', function (e) {
      if (ct && ct.inText && ct.scrollable) return;
      e.preventDefault();
    }, { passive: false });
    closeup.addEventListener('touchend', function (e) {
      if (!ct) return;
      var t = e.changedTouches[0];
      var dx = t.clientX - ct.x, dy = t.clientY - ct.y;
      var info = ct;
      ct = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) { moveCloseup(dx < 0 ? 1 : -1); return; }
      if (dy > 70 && dy > Math.abs(dx) && (!info.inText || !info.scrollable || info.top)) closeCloseup();
    }, { passive: true });

    /* ---------------------------------------------------------------- overview */

    var ovBuilt = false;
    var thumbs = [];
    var ovReturnY = 0;

    function buildOverview() {
      ovBuilt = true;
      var wrap = $('overview-rooms');
      rooms.forEach(function (room) {
        var sec = document.createElement('section');
        sec.className = 'overview__room';
        var head = document.createElement('div');
        head.className = 'overview__room-head';
        var h = document.createElement('h3');
        h.className = 'overview__room-name';
        h.textContent = room.name;
        var count = document.createElement('span');
        count.className = 'overview__count';
        count.textContent = room.items.length === 1 ? '1 painting' : room.items.length + ' paintings';
        head.append(h, count);
        var grid = document.createElement('ul');
        grid.className = 'overview__grid';
        room.items.forEach(function (i) {
          var p = P[i];
          var li = document.createElement('li');
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'thumb';
          b.style.setProperty('--ar', p.ar);
          b.setAttribute('aria-label', p.title + ', ' + p.date);
          var fr = document.createElement('span');
          fr.className = 'thumb__frame';
          var cv = document.createElement('span');
          cv.className = 'thumb__canvas';
          var ph = document.createElement('span');
          ph.className = 'ph';
          ph.style.backgroundImage = pieces[i].ph.style.backgroundImage;
          var pic = document.createElement('picture');
          var src = document.createElement('source');
          src.type = 'image/webp';
          src.sizes = '160px';
          src.srcset = p.base + '-400.webp ' + p.dims[400][0] + 'w, ' + p.base + '-900.webp ' + p.dims[900][0] + 'w';
          var img = document.createElement('img');
          img.sizes = '160px';
          img.srcset = p.base + '-400.jpg ' + p.dims[400][0] + 'w, ' + p.base + '-900.jpg ' + p.dims[900][0] + 'w';
          img.src = p.base + '-400.jpg';
          img.width = p.dims[400][0];
          img.height = p.dims[400][1];
          img.alt = '';
          img.loading = 'lazy';
          img.decoding = 'async';
          img.addEventListener('load', function () { img.classList.add('is-loaded'); });
          pic.append(src, img);
          cv.append(ph, pic);
          fr.append(cv);
          var tx = document.createElement('span');
          tx.className = 'thumb__text';
          var tt = document.createElement('span');
          tt.className = 'thumb__title';
          tt.textContent = p.title;
          var td = document.createElement('span');
          td.className = 'thumb__date';
          td.textContent = p.date;
          tx.append(tt, td);
          b.append(fr, tx);
          b.addEventListener('click', function () {
            closeOverview(function () { goToPainting(i, { jump: true }); });
          });
          li.append(b);
          grid.append(li);
          thumbs[i] = { btn: b, li: li, sec: sec };
        });
        sec.append(head, grid);
        wrap.append(sec);
      });

      if (data.collections && data.collections.length) {
        var bar = $('overview-filters');
        bar.hidden = false;
        var names = ['everything'].concat(data.collections);
        names.forEach(function (name, k) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'textbtn';
          b.textContent = name;
          b.setAttribute('aria-pressed', k === 0 ? 'true' : 'false');
          b.addEventListener('click', function () {
            bar.querySelectorAll('button').forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
            filterBy(k === 0 ? null : name);
          });
          bar.append(b);
        });
      }
    }

    function filterBy(name) {
      P.forEach(function (p, i) {
        var hide = name && p.collections.indexOf(name) === -1;
        thumbs[i].li.hidden = !!hide;
      });
      document.querySelectorAll('.overview__room').forEach(function (sec) {
        sec.hidden = !sec.querySelector('li:not([hidden])');
      });
    }

    function openOverview() {
      if (cu.open) return;
      if (!ovBuilt) buildOverview();
      firstMove();
      var here = nearestPainting(c);
      thumbs.forEach(function (t, i) { if (i === here) t.btn.setAttribute('aria-current', 'true'); else t.btn.removeAttribute('aria-current'); });
      ovReturnY = sy;
      root.classList.add('is-locked');
      overview.showModal();
      requestAnimationFrame(function () { overview.classList.add('is-open'); });
      // keyboard visitors start on the painting they're at; for everyone else, no outline
      var inner = overview.querySelector('.overview__inner');
      inner.tabIndex = -1;
      if (lastInput === 'key') thumbs[here].btn.focus({ preventScroll: true });
      else inner.focus({ preventScroll: true });
      var r = thumbs[here].btn.getBoundingClientRect();
      if (r.bottom > window.innerHeight * 0.8) overview.scrollTop += r.top - window.innerHeight * 0.4;
    }

    function closeOverview(then) {
      overview.classList.remove('is-open');
      setTimeout(function () {
        overview.close();
        root.classList.remove('is-locked');
        setY(ovReturnY);
        if (then) then();
      }, reduced ? 120 : 380);
    }

    allbtn.addEventListener('click', openOverview);
    overview.querySelector('[data-close]').addEventListener('click', function () { closeOverview(); });
    overview.addEventListener('cancel', function (e) { e.preventDefault(); closeOverview(); });
    document.querySelector('.skip').addEventListener('click', function (e) { e.preventDefault(); openOverview(); });

    /* ---------------------------------------------------------------- input */


    var lastInput = 'pointer';
    window.addEventListener('keydown', function () { lastInput = 'key'; }, true);
    window.addEventListener('pointerdown', function () { lastInput = 'pointer'; }, true);
    window.addEventListener('touchstart', function () { lastInput = 'pointer'; }, { capture: true, passive: true });

    document.addEventListener('keydown', function (e) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || overview.open) return;
      var k = e.key;
      var onButton = e.target && e.target.tagName === 'BUTTON';
      if (cu.open) {
        if (k === 'Escape') { e.preventDefault(); closeCloseup(); }
        else if (k === 'ArrowRight' || k === 'ArrowDown') { e.preventDefault(); moveCloseup(1); }
        else if (k === 'ArrowLeft' || k === 'ArrowUp') { e.preventDefault(); moveCloseup(-1); }
        else if ((k === ' ' && !onButton) || k === 'PageDown' || k === 'PageUp' || k === 'Home' || k === 'End') e.preventDefault();
        return;
      }
      if (k === 'ArrowRight' || k === 'ArrowDown') { e.preventDefault(); step(1); }
      else if (k === 'ArrowLeft' || k === 'ArrowUp') { e.preventDefault(); step(-1); }
      else if (k === 'Home') { e.preventDefault(); walkTo(0); say('The start'); }
      else if (k === 'End') { e.preventDefault(); walkTo(L.total); say('The end of the wall'); }
      else if ((k === ' ' && !onButton) || k === 'PageDown') { e.preventDefault(); step(k === ' ' && e.shiftKey ? -1 : 1); }
      else if (k === 'PageUp') { e.preventDefault(); step(-1); }
    });

    /* Phones: drag the wall and it follows your finger, sideways or up and down. When you let
       go it carries on a little and lands on a painting. */
    var drag = null, dragEndedAt = 0;
    stage.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1 || cu.open || overview.open) { drag = null; return; }
      drag = { x0: e.touches[0].clientX, y0: e.touches[0].clientY, on: false, from: 0, moved: 0, trail: [] };
    }, { passive: true });
    stage.addEventListener('touchmove', function (e) {
      if (!drag) return;
      if (e.cancelable) e.preventDefault(); // the page never scrolls; the wall moves instead
      var p = e.touches[0];
      var dx = p.clientX - drag.x0, dy = p.clientY - drag.y0;
      if (!drag.on) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        drag.on = true;
        drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'; // up moves on, like scrolling down
        drag.x0 = p.clientX;
        drag.y0 = p.clientY;
        dx = dy = 0;
        glide = null;
        drag.from = target = c; // catch the wall where it is
        v = 0;
        firstMove();
      }
      var d = drag.axis === 'x' ? dx : dy;
      drag.moved = d;
      if (reduced) return; // with reduced motion, a swipe steps to the next painting instead
      target = c = clamp(drag.from - d, 0, L.total);
      var now = performance.now();
      drag.trail.push([now, target]);
      while (drag.trail.length > 2 && now - drag.trail[0][0] > 100) drag.trail.shift();
      kick();
    }, { passive: false });
    function endDrag() {
      if (!drag || !drag.on) { drag = null; return; }
      var d = drag;
      drag = null;
      dragEndedAt = performance.now();
      if (reduced) { if (Math.abs(d.moved) > 48) step(d.moved < 0 ? 1 : -1); return; }
      var a = d.trail[0], b = d.trail[d.trail.length - 1];
      var vel = a && b && b[0] - a[0] > 10 ? ((b[1] - a[1]) / (b[0] - a[0])) * 1000 : 0; // wall px per second
      if (!b || performance.now() - b[0] > 80 || Math.abs(vel) < 60) vel = 0; // finger rested before lifting
      // where the flick would carry the wall, then the nearest painting from there
      var k = nearestStopIndex(target + vel * 0.25);
      var from = nearestStopIndex(d.from);
      var nudge = target - d.from;
      if (k === from && Math.abs(nudge) > L.slot * 0.1 && L.stops[from + (nudge > 0 ? 1 : -1)]) k = from + (nudge > 0 ? 1 : -1);
      scrollToX(L.stops[k].x, vel);
      if (glide) glide.direct = true;
    }
    stage.addEventListener('touchend', endDrag, { passive: true });
    stage.addEventListener('touchcancel', endDrag, { passive: true });
    // a drag that ends on a painting shouldn't also open it
    stage.addEventListener('click', function (e) {
      if (performance.now() - dragEndedAt < 400) { e.stopPropagation(); e.preventDefault(); }
    }, true);

    // the mouse wheel and the trackpad, up and down or sideways, walk along the wall
    window.addEventListener('wheel', function (e) {
      if (cu.open || overview.open || e.ctrlKey) return; // (ctrl: pinch to zoom the page)
      e.preventDefault();
      var unit = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? L.vh : 1; // lines or pages, not pixels
      var d = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * unit;
      if (!d) return;
      setY(sy + d);
      onScroll();
    }, { passive: false });

    // the stage never scrolls sideways on its own (focus can try)
    stage.addEventListener('scroll', function () { stage.scrollLeft = 0; stage.scrollTop = 0; });

    var resizeTimer = 0;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { relayout(); }, 140);
    });

    function relayout(force) {
      if (!force && stage.clientWidth === L.vw && Math.abs(stage.clientHeight - L.vh) < 1) return;
      var k = nearestStopIndex(c);
      var stop = L.stops[k];
      var off = (c - stop.x) / L.slot;
      var key = stop.kind + ':' + (stop.i !== undefined ? stop.i : stop.room !== undefined ? stop.room : '');
      layout();
      var match = L.stops.filter(function (s) { return s.kind + ':' + (s.i !== undefined ? s.i : s.room !== undefined ? s.room : '') === key; })[0] || L.stops[0];
      glide = null; c = target = clamp(match.x + off * L.slot, 0, L.total);
      v = 0;
      lastTransform = '';
      if (cu.open) {
        cu.cam = closeCam(cu.i);
        cu.nav = null;
        cu.returnY = Math.round(L.xs[cu.i] * L.ratio);
        placePanel();
      } else setY(c * L.ratio);
      render();
    }

    /* ---------------------------------------------------------------- links (#the-light-left-on) */

    function slugIndex(s) {
      for (var i = 0; i < P.length; i++) if (P[i].slug === s) return i;
      return -1;
    }

    function syncFromHash() {
      var s = decodeURIComponent(location.hash.slice(1));
      var i = s ? slugIndex(s) : -1;
      if (i >= 0) {
        if (cu.open && cu.i === i) return;
        if (cu.open) { moveCloseup(i - cu.i); return; }
        if (overview.open) { overview.classList.remove('is-open'); overview.close(); root.classList.remove('is-locked'); }
        glide = null; c = target = L.xs[i];
        v = 0;
        setY(c * L.ratio);
        render();
        openCloseup(i, { fromHash: true });
      } else if (cu.open) closeCloseup({ fromHistory: true });
    }
    window.addEventListener('popstate', syncFromHash);
    window.addEventListener('hashchange', syncFromHash);

    /* ---------------------------------------------------------------- start */

    function say(text) {
      announcer.textContent = '';
      setTimeout(function () { announcer.textContent = text; }, 30);
    }

    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    layout();
    if (roomSigns.length && document.fonts && document.fonts.ready) document.fonts.ready.then(function () { relayout(true); });

    var first = slugIndex(decodeURIComponent(location.hash.slice(1)));
    if (first >= 0) {
      root.classList.add('instant', 'lit', 'is-ready');
      moved = true;
      glide = null; c = target = L.xs[first];
      setY(c * L.ratio);
      render();
      openCloseup(first, { fromHash: true, instant: true });
      requestAnimationFrame(function () { requestAnimationFrame(function () { root.classList.remove('instant'); }); });
    } else {
      setY(0);
      render();
      var begin = function () {
        if (root.classList.contains('lit')) return;
        root.classList.add('lit');
        setTimeout(function () { root.classList.add('is-ready'); }, reduced ? 2600 : 5200);
        setTimeout(function () { if (!moved) hint.classList.add('is-shown'); }, reduced ? 2200 : 4600);
      };
      var fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
      Promise.race([fontsReady, new Promise(function (r) { setTimeout(r, 900); })]).then(function () {
        requestAnimationFrame(function () { requestAnimationFrame(begin); });
      });
    }
  }

  /* ---------------------------------------------------------------- small helpers */

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function hexToRGB(h) {
    var n = parseInt(h.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function hash01(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 10000) / 10000;
  }
})();
