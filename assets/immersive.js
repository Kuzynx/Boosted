/* Boosted — immersive homepage interactions
   WebGL boost field, intro loader, custom cursor, magnetic buttons, scroll reveals.
   Progressive enhancement: if this script (or WebGL) fails, the static page still works. */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var root = document.documentElement;

  /* ---------------------------------------------------------------------------
     Intro loader — counts up, then wipes away to reveal the hero.
  --------------------------------------------------------------------------- */
  function initLoader() {
    var loader = document.getElementById('loader');
    if (!loader) { document.body.classList.add('loaded'); return; }

    var countEl = loader.querySelector('.loader-count');
    var barEl = loader.querySelector('.loader-bar span');

    if (reduceMotion) { finish(); return; }

    var current = 0;
    var target = 12;          // creeps forward while assets load
    var done = false;

    // Once the window finishes loading, race to 100.
    window.addEventListener('load', function () { target = 100; });
    // Safety net: never trap the user behind the loader.
    setTimeout(function () { target = 100; }, 4500);

    (function tick() {
      current += (target - current) * 0.08 + 0.4;
      if (current > target) current = target;
      var v = Math.min(100, Math.round(current));
      if (countEl) countEl.textContent = v;
      if (barEl) barEl.style.transform = 'scaleX(' + (v / 100) + ')';
      if (v >= 100 && !done) { done = true; setTimeout(finish, 350); return; }
      requestAnimationFrame(tick);
    })();

    function finish() {
      loader.classList.add('done');
      document.body.classList.add('loaded');
      setTimeout(function () { if (loader.parentNode) loader.parentNode.removeChild(loader); }, 1000);
    }
  }

  /* ---------------------------------------------------------------------------
     Custom cursor — instant dot + eased ring that grows over interactive targets.
  --------------------------------------------------------------------------- */
  function initCursor() {
    if (!finePointer || reduceMotion) return;
    var dot = document.querySelector('.cursor-dot');
    var ring = document.querySelector('.cursor-ring');
    if (!dot || !ring) return;

    root.classList.add('has-custom-cursor');

    var mx = window.innerWidth / 2, my = window.innerHeight / 2;
    var rx = mx, ry = my;

    window.addEventListener('mousemove', function (e) {
      mx = e.clientX; my = e.clientY;
      dot.style.transform = 'translate(' + mx + 'px,' + my + 'px)';
    });

    (function follow() {
      rx += (mx - rx) * 0.18;
      ry += (my - ry) * 0.18;
      ring.style.transform = 'translate(' + rx + 'px,' + ry + 'px)';
      requestAnimationFrame(follow);
    })();

    var hot = 'a, button, summary, .magnetic, .feature-card, .phone';
    document.addEventListener('mouseover', function (e) {
      if (e.target.closest(hot)) root.classList.add('cursor-hover');
    });
    document.addEventListener('mouseout', function (e) {
      if (e.target.closest(hot)) root.classList.remove('cursor-hover');
    });
    document.addEventListener('mousedown', function () { root.classList.add('cursor-down'); });
    document.addEventListener('mouseup', function () { root.classList.remove('cursor-down'); });
  }

  /* ---------------------------------------------------------------------------
     Magnetic elements — drift toward the pointer when it's near.
  --------------------------------------------------------------------------- */
  function initMagnetic() {
    if (!finePointer || reduceMotion) return;
    var els = document.querySelectorAll('.magnetic');
    els.forEach(function (el) {
      var strength = parseFloat(el.getAttribute('data-magnetic')) || 0.4;
      el.addEventListener('mousemove', function (e) {
        var r = el.getBoundingClientRect();
        var x = e.clientX - (r.left + r.width / 2);
        var y = e.clientY - (r.top + r.height / 2);
        el.style.transform = 'translate(' + x * strength + 'px,' + y * strength + 'px)';
      });
      el.addEventListener('mouseleave', function () {
        el.style.transform = 'translate(0,0)';
      });
    });
  }

  /* ---------------------------------------------------------------------------
     Scroll reveals — fade/slide sections in as they enter the viewport.
  --------------------------------------------------------------------------- */
  function initReveal() {
    var els = document.querySelectorAll('.reveal');
    if (!els.length) return;
    if (reduceMotion || !('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.classList.add('in'); });
      return;
    }
    root.classList.add('reveal-ready'); // hides .reveal until observed
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ---------------------------------------------------------------------------
     WebGL boost field — particles streaking past the camera, brand colours.
     Evokes the "boost" / speed feel. Gracefully skipped without Three.js.
  --------------------------------------------------------------------------- */
  function initBoostField() {
    var canvas = document.getElementById('bg-canvas');
    if (!canvas || reduceMotion || typeof window.THREE === 'undefined') return;
    var THREE = window.THREE;

    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (e) { return; } // no WebGL — CSS gradient fallback remains
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1400);

    var DEPTH = 1200;
    var COUNT = window.innerWidth < 768 ? 1100 : 2600;
    var positions = new Float32Array(COUNT * 3);
    var colors = new Float32Array(COUNT * 3);
    var speeds = new Float32Array(COUNT);

    var red = new THREE.Color(0xff2d55);
    var hot = new THREE.Color(0xffd1dc);
    var spread = 800;

    for (var i = 0; i < COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * spread;
      positions[i * 3 + 1] = (Math.random() - 0.5) * spread;
      positions[i * 3 + 2] = -Math.random() * DEPTH;
      speeds[i] = 1.4 + Math.random() * 3.2;
      var c = Math.random() > 0.82 ? hot : red;
      var shade = 0.45 + Math.random() * 0.55;
      colors[i * 3] = c.r * shade;
      colors[i * 3 + 1] = c.g * shade;
      colors[i * 3 + 2] = c.b * shade;
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    var mat = new THREE.PointsMaterial({
      size: 4.5,
      map: makeSprite(THREE),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });

    var points = new THREE.Points(geo, mat);
    scene.add(points);

    var tx = 0, ty = 0, cx = 0, cy = 0;
    window.addEventListener('mousemove', function (e) {
      tx = (e.clientX / window.innerWidth - 0.5);
      ty = (e.clientY / window.innerHeight - 0.5);
    });

    var pos = geo.attributes.position.array;
    var running = true;
    document.addEventListener('visibilitychange', function () {
      running = !document.hidden;
      if (running) requestAnimationFrame(loop);
    });

    function loop() {
      if (!running) return;
      for (var j = 0; j < COUNT; j++) {
        pos[j * 3 + 2] += speeds[j];
        if (pos[j * 3 + 2] > camera.position.z) {
          pos[j * 3] = (Math.random() - 0.5) * spread;
          pos[j * 3 + 1] = (Math.random() - 0.5) * spread;
          pos[j * 3 + 2] = -DEPTH;
        }
      }
      geo.attributes.position.needsUpdate = true;

      cx += (tx - cx) * 0.04;
      cy += (ty - cy) * 0.04;
      camera.position.x = cx * 120;
      camera.position.y = -cy * 120;
      camera.lookAt(0, 0, -DEPTH * 0.5);
      points.rotation.z += 0.0004;

      renderer.render(scene, camera);
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    window.addEventListener('resize', function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  // Soft round glow sprite drawn on a canvas (no external texture needed).
  function makeSprite(THREE) {
    var c = document.createElement('canvas');
    c.width = c.height = 64;
    var ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    var tex = new THREE.Texture(c);
    tex.needsUpdate = true;
    return tex;
  }

  /* ---------------------------------------------------------------------------
     Kinetic hero — split the wordmark into letters for a staggered reveal.
  --------------------------------------------------------------------------- */
  function initKineticText() {
    var el = document.querySelector('[data-split]');
    if (!el) return;
    var text = el.textContent;
    el.textContent = '';
    el.setAttribute('aria-label', text);
    for (var i = 0; i < text.length; i++) {
      var span = document.createElement('span');
      span.className = 'char';
      span.textContent = text[i];
      span.setAttribute('aria-hidden', 'true');
      if (!reduceMotion) span.style.transitionDelay = (0.04 * i) + 's';
      el.appendChild(span);
    }
  }

  /* --------------------------------------------------------------------------- */
  function boot() {
    initKineticText();
    initLoader();
    initCursor();
    initMagnetic();
    initReveal();
    initBoostField();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
