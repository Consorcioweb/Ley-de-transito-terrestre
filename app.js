/* Ley de Transporte Terrestre — lógica de consulta */
(function () {
  "use strict";
  var D = window.LEY_DATA;
  if (!D) return;

  /* ---------- utilidades ---------- */
  function $(s, c) { return (c || document).querySelector(s); }
  function $all(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
  function norm(s) {
    return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }
  /* mapa carácter-a-carácter para resaltar sin importar tildes */
  function normMap(text) {
    var out = "", map = [];
    for (var i = 0; i < text.length; i++) {
      var base = text[i].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
      for (var j = 0; j < base.length; j++) { out += base[j]; map.push(i); }
    }
    return { norm: out, map: map };
  }
  function hl(text, terms) {
    if (!terms || !terms.length) return esc(text);
    var nm = normMap(text), ranges = [];
    terms.forEach(function (t) {
      if (!t) return;
      var idx = 0;
      while ((idx = nm.norm.indexOf(t, idx)) !== -1) {
        ranges.push([nm.map[idx], nm.map[idx + t.length - 1] + 1]);
        idx += t.length;
      }
    });
    if (!ranges.length) return esc(text);
    ranges.sort(function (a, b) { return a[0] - b[0]; });
    var merged = [ranges[0]];
    for (var i = 1; i < ranges.length; i++) {
      var last = merged[merged.length - 1];
      if (ranges[i][0] <= last[1]) last[1] = Math.max(last[1], ranges[i][1]);
      else merged.push(ranges[i]);
    }
    var html = "", pos = 0;
    merged.forEach(function (r) {
      html += esc(text.slice(pos, r[0])) + "<mark>" + esc(text.slice(r[0], r[1])) + "</mark>";
      pos = r[1];
    });
    return html + esc(text.slice(pos));
  }
  function blocksText(blocks) {
    var parts = [];
    blocks.forEach(function (b) {
      if (b.p) parts.push(b.p);
      if (b.ol) parts.push(b.ol.join(" "));
      if (b.lv) parts.push(b.lv.map(function (x) { return x[1]; }).join(" "));
    });
    return parts.join(" ");
  }
  var toastTimer = null;
  function toast(msg) {
    var t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2600);
  }

  /* ---------- contexto de cada artículo ---------- */
  var ARTS = [], DISP = [], TITULOS = [];
  var curTit = null, curCap = null;
  D.items.forEach(function (it) {
    if (it.t === "titulo") {
      curTit = { num: it.num, nombre: it.nombre, caps: [], arts: [] };
      curCap = null;
      TITULOS.push(curTit);
    } else if (it.t === "cap") {
      curCap = { num: it.num, nombre: it.nombre, arts: [] };
      curTit.caps.push(curCap);
    } else if (it.t === "art") {
      it._tit = curTit; it._cap = curCap;
      ARTS.push(it);
      curTit.arts.push(it);
      if (curCap) curCap.arts.push(it);
    } else if (it.t === "disp") {
      DISP.push(it);
    }
  });
  var ART_BY_N = {};
  ARTS.forEach(function (a) { ART_BY_N[a.n] = a; });
  var MAX_ART = ARTS.length;

  /* índice de búsqueda */
  ARTS.forEach(function (a) {
    a._text = norm((a.ep || "") + " " + blocksText(a.b));
    a._epN = norm(a.ep || "");
  });
  DISP.forEach(function (d) {
    d._text = norm(d.nombre + " " + d.label + " " + blocksText(d.b));
  });

  /* ---------- renderizado ---------- */
  function sevBadge(ep) {
    if (!/^sanciones/i.test(ep || "")) return "";
    var e = norm(ep);
    if (e.indexOf("muy graves") !== -1) return '<span class="sev-badge sev-muy">Muy graves</span>';
    if (e.indexOf("menos graves") !== -1) return '<span class="sev-badge sev-menos">Menos graves</span>';
    if (e.indexOf("graves") !== -1) return '<span class="sev-badge sev-graves">Graves</span>';
    if (e.indexOf("leves") !== -1) return '<span class="sev-badge sev-leves">Leves</span>';
    return "";
  }
  function renderBlocks(blocks, terms) {
    var h = "";
    blocks.forEach(function (b) {
      if (b.p) h += "<p>" + hl(b.p, terms) + "</p>";
      if (b.ol) {
        h += "<ol>" + b.ol.map(function (li) { return "<li>" + hl(li, terms) + "</li>"; }).join("") + "</ol>";
      }
      if (b.lv) {
        h += '<div class="lv">' + b.lv.map(function (x) {
          return '<div class="lv-item lv-' + x[0] + '">' + hl(x[1], terms) + "</div>";
        }).join("") + "</div>";
      }
    });
    return h;
  }
  var ICON_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
  var ICON_LINK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>';

  function artCard(a) {
    var ctx = "Título " + a._tit.num + (a._cap ? " · Capítulo " + a._cap.num : "");
    return '<article class="art-card" id="articulo-' + a.n + '" data-n="' + a.n + '">' +
      '<header class="art-head">' +
        '<div class="art-num" aria-hidden="true"><span class="k">Art.</span><span class="v">' + a.n + "</span></div>" +
        '<div class="art-title-wrap"><p class="art-ep">' + esc(a.ep || "") + sevBadge(a.ep) + "</p>" +
        '<p class="art-ctx">' + esc(ctx) + "</p></div>" +
        '<div class="art-actions">' +
          '<button class="icon-btn act-copy" title="Copiar artículo" aria-label="Copiar artículo ' + a.n + '">' + ICON_COPY + "</button>" +
          '<button class="icon-btn act-link" title="Copiar enlace" aria-label="Copiar enlace del artículo ' + a.n + '">' + ICON_LINK + "</button>" +
        "</div>" +
      "</header>" +
      '<div class="art-body">' + renderBlocks(a.b, null) + "</div>" +
    "</article>";
  }
  function dispShort(d) {
    if (d.id === "derogatoria") return "D";
    if (d.id === "final") return "F";
    return d.id.split("-")[1];
  }
  function dispCard(d) {
    return '<article class="art-card disp-card" id="disp-' + d.id + '" data-disp="' + d.id + '">' +
      '<header class="art-head">' +
        '<div class="art-num" aria-hidden="true"><span class="k">Disp.</span><span class="v">' + dispShort(d) + "</span></div>" +
        '<div class="art-title-wrap"><p class="art-ep">' + esc(d.nombre) + "</p>" +
        '<p class="art-ctx">Disposiciones · ' + esc(d.label) + "</p></div>" +
        '<div class="art-actions">' +
          '<button class="icon-btn act-copy" title="Copiar disposición" aria-label="Copiar ' + esc(d.nombre) + '">' + ICON_COPY + "</button>" +
        "</div>" +
      "</header>" +
      '<div class="art-body">' + renderBlocks(d.b, null) + "</div>" +
    "</article>";
  }

  function buildContent() {
    var h = "", openTit = false, openCap = false, openDisp = false, openSec = false, walkTit = null;
    function closeCap() { if (openCap) { h += "</div>"; openCap = false; } }
    function closeTit() { closeCap(); if (openTit) { h += "</section>"; openTit = false; } }
    function closeSec() { if (openSec) { h += "</div>"; openSec = false; } }
    D.items.forEach(function (it) {
      if (it.t === "titulo") {
        closeTit();
        var t = TITULOS.filter(function (x) { return x.num === it.num; })[0];
        walkTit = t;
        var first = t.arts[0].n, last = t.arts[t.arts.length - 1].n;
        h += '<section class="titulo-block" id="titulo-' + it.num + '" data-titulo="' + it.num + '">' +
          '<div class="titulo-head"><div class="titulo-roman"><span>' + it.num + "</span></div>" +
          '<div class="t-txt"><p class="t-kicker">Título ' + it.num + "</p><h2>" + esc(it.nombre) + "</h2>" +
          '<p class="t-range">Artículos ' + first + " al " + last + " · " + t.arts.length + " artículos</p></div></div>";
        openTit = true;
      } else if (it.t === "cap") {
        closeCap();
        var c = null;
        walkTit.caps.forEach(function (x) { if (x.num === it.num) c = x; });
        var rng = c && c.arts.length ? " · arts. " + c.arts[0].n + "–" + c.arts[c.arts.length - 1].n : "";
        h += '<div class="cap-group" id="cap-' + walkTit.num + '-' + it.num + '" data-cap="' + esc(it.nombre) + '">' +
          '<div class="cap-head"><span class="cap-pill">Capítulo ' + it.num + "</span><h3>" + esc(it.nombre) + esc(rng) + "</h3></div>";
        openCap = true;
      } else if (it.t === "art") {
        h += artCard(it);
      } else if (it.t === "sec") {
        closeTit();
        closeSec();
        if (!openDisp) { h += '<section id="disp-section"><a id="disposiciones" class="anchor" style="position:absolute;top:0" aria-hidden="true"></a>'; openDisp = true; }
        h += '<div class="sec-group"><div class="sec-head"><span class="sec-sign">§</span><h2>' + esc(it.nombre) + "</h2></div>";
        openSec = true;
      } else if (it.t === "disp") {
        h += dispCard(it);
      } else if (it.t === "cierre") {
        closeSec();
        h += '<div class="cierre-note" id="cierre">' + renderBlocks(it.b, null) + "</div>";
      }
    });
    closeSec();
    if (openDisp) h += "</section>";
    closeTit();
    $("#ley-content").innerHTML = h;
  }

  function buildIndex() {
    var h = "";
    TITULOS.forEach(function (t) {
      h += '<div class="idx-titulo" data-idx-titulo="' + t.num + '">' +
        '<a href="#titulo-' + t.num + '"><span class="idx-roman">' + t.num + "</span>" +
        '<span class="idx-name">' + esc(t.nombre) + "</span>" +
        '<span class="idx-count" data-count-titulo="' + t.num + '">' + t.arts.length + "</span></a>";
      if (t.caps.length) {
        h += '<ul class="idx-caps">' + t.caps.map(function (c) {
          var target = "#cap-" + t.num + "-" + c.num;
          return '<li><a href="' + target + '" data-cap-link="' + esc(c.nombre) + '">Cap. ' + c.num + " · " + esc(c.nombre) + "</a></li>";
        }).join("") + "</ul>";
      }
      h += "</div>";
    });
    $("#index-tree").innerHTML = h;
  }

  function buildHero() {
    $("#gaceta-badge").textContent = "Gaceta Oficial N° 38.985 · 1° de agosto de 2008";
    var desc = D.meta.descripcion;
    $("#hero-desc").innerHTML = esc(desc).replace(
      "Sistema Nacional de Transporte Terrestre",
      "<strong>Sistema Nacional de Transporte Terrestre</strong>"
    );
    var nCaps = D.items.filter(function (i) { return i.t === "cap"; }).length;
    $("#hero-stats").innerHTML =
      '<div class="stat"><b>' + ARTS.length + "</b><span>Artículos</span></div>" +
      '<div class="stat s-blue"><b>' + TITULOS.length + "</b><span>Títulos</span></div>" +
      '<div class="stat s-green"><b>' + nCaps + "</b><span>Capítulos</span></div>" +
      '<div class="stat s-red"><b>' + DISP.length + "</b><span>Disposiciones</span></div>";
    $("#footer-src").textContent = D.meta.gaceta + " · " + D.meta.fecha + ".";
    $("#goto-n").max = MAX_ART;
    $("#goto-n").placeholder = "1–" + MAX_ART;
  }

  /* ---------- búsqueda ---------- */
  var state = { mode: "browse", terms: [], artN: null, matches: [] };
  var ORD = { primera: 1, segunda: 2, tercera: 3, cuarta: 4, quinta: 5, sexta: 6, septima: 7, octava: 8 };

  function setHash(h) {
    try { history.replaceState(null, "", h); } catch (e) { /* file:// */ }
  }
  function parseQuery(raw) {
    var q = norm(raw.trim()).replace(/[°º]/g, "").replace(/\s+/g, " ");
    if (!q) return { mode: "browse" };
    var m = q.match(/^(?:(?:art(?:iculo)?\.?|n(?:umero|ro)?\.?)\s*)?(\d{1,3})$/);
    if (m) {
      var n = parseInt(m[1], 10);
      if (n >= 1 && n <= MAX_ART) return { mode: "art", n: n };
      return { mode: "none" };
    }
    if (/(derogatoria|transitoria|disposicion final|^final$)/.test(q)) {
      var ids = [];
      if (/derogatoria/.test(q)) ids.push("derogatoria");
      if (/transitoria/.test(q)) {
        var om = q.match(/(primera|segunda|tercera|cuarta|quinta|sexta|septima|octava)/);
        var nm = q.match(/(\d{1,2})\s*$/);
        if (om) ids.push("transitoria-" + ORD[om[1]]);
        else if (nm && ORD2(nm[1])) ids.push("transitoria-" + nm[1]);
        else for (var i = 1; i <= 8; i++) ids.push("transitoria-" + i);
      }
      if (/final/.test(q)) ids.push("final");
      if (ids.length) return { mode: "disp", ids: ids };
    }
    var STOP = { de:1, la:1, el:1, los:1, las:1, en:1, y:1, a:1, del:1, por:1, para:1, con:1, un:1, una:1, o:1, que:1, se:1, su:1, al:1, lo:1, es:1, son:1, sus:1, e:1, u:1 };
    var all = q.split(" ").filter(function (t) { return t.length > 0; });
    var terms = all.filter(function (t) { return !STOP[t] && t.length > 1; });
    if (!terms.length) terms = all;
    return { mode: "text", terms: terms };
  }
  function ORD2(s) { var n = parseInt(s, 10); return n >= 1 && n <= 8; }

  function setVisible(el, vis) { el.classList.toggle("hidden", !vis); }

  function applySearch(raw, opts) {
    opts = opts || {};
    var parsed = parseQuery(raw);
    state.mode = parsed.mode;
    state.terms = parsed.terms || [];
    state.artN = parsed.n || null;

    var matchArts = {}, matchDisps = {};
    if (parsed.mode === "art") matchArts[parsed.n] = true;
    else if (parsed.mode === "disp") parsed.ids.forEach(function (id) { matchDisps[id] = true; });
    else if (parsed.mode === "text") {
      ARTS.forEach(function (a) {
        var ok = parsed.terms.every(function (t) { return a._text.indexOf(t) !== -1; });
        if (ok) matchArts[a.n] = true;
      });
      DISP.forEach(function (d) {
        var ok = parsed.terms.every(function (t) { return d._text.indexOf(t) !== -1; });
        if (ok) matchDisps[d.id] = true;
      });
    }

    var searching = parsed.mode !== "browse";
    var anyVisible = false;

    $all("#ley-content .art-card").forEach(function (card) {
      var isArt = card.hasAttribute("data-n");
      var vis;
      if (!searching) vis = true;
      else if (isArt) vis = !!matchArts[card.getAttribute("data-n")];
      else vis = !!matchDisps[card.getAttribute("data-disp")];
      setVisible(card, vis);
      if (vis) anyVisible = true;
      if (isArt) {
        var a = ART_BY_N[card.getAttribute("data-n")];
        var terms = vis && parsed.mode === "text" ? parsed.terms : null;
        $(".art-body", card).innerHTML = renderBlocks(a.b, terms);
        $(".art-ep", card).innerHTML = (terms ? hl(a.ep || "", terms) : esc(a.ep || "")) + sevBadge(a.ep);
      } else {
        var d = DISP.filter(function (x) { return x.id === card.getAttribute("data-disp"); })[0];
        var dTerms = vis && parsed.mode === "text" ? parsed.terms : null;
        $(".art-body", card).innerHTML = renderBlocks(d.b, dTerms);
        $(".art-ep", card).innerHTML = dTerms ? hl(d.nombre, dTerms) : esc(d.nombre);
      }
    });

    /* grupos y títulos */
    $all("#ley-content .cap-group").forEach(function (g) {
      var vis = !searching || $all(".art-card:not(.hidden)", g).length > 0;
      setVisible(g, vis);
    });
    $all("#ley-content .titulo-block").forEach(function (t) {
      var vis = !searching || $all(".art-card:not(.hidden)", t).length > 0;
      setVisible(t, vis);
    });
    $all("#ley-content .sec-group").forEach(function (g) {
      var vis = !searching || $all(".art-card:not(.hidden)", g).length > 0;
      setVisible(g, vis);
    });
    var dispSec = $("#disp-section");
    if (dispSec) setVisible(dispSec, !searching || $all(".art-card:not(.hidden)", dispSec).length > 0);
    var cierre = $("#cierre");
    if (cierre) setVisible(cierre, !searching);

    /* barra de resultados */
    var bar = $("#results-bar"), txt = $("#results-text"), jumper = $("#art-jumper");
    var nArts = Object.keys(matchArts).length, nDisps = Object.keys(matchDisps).length;
    $("#no-results").classList.toggle("show", searching && !anyVisible);
    if (!searching) {
      bar.classList.remove("show");
      jumper.classList.add("hidden");
    } else {
      bar.classList.add("show");
      if (parsed.mode === "art") {
        var a = ART_BY_N[parsed.n];
        $("#results-icon").textContent = "📍";
        txt.innerHTML = 'Mostrando el <b>Artículo ' + parsed.n + "</b> — " + esc(a.ep || "") +
          ' <span style="opacity:.75">(Título ' + a._tit.num + (a._cap ? ", Capítulo " + a._cap.num : "") + ")</span>";
        jumper.classList.remove("hidden");
        $("#art-prev").disabled = parsed.n <= 1;
        $("#art-next").disabled = parsed.n >= MAX_ART;
      } else if (parsed.mode === "disp") {
        $("#results-icon").textContent = "📍";
        txt.innerHTML = "Mostrando <b>" + nDisps + "</b> disposición" + (nDisps === 1 ? "" : "es") + " de la ley.";
        jumper.classList.add("hidden");
      } else if (parsed.mode === "none") {
        $("#results-icon").textContent = "🚧";
        txt.innerHTML = "El artículo <b>" + esc(raw.trim()) + "</b> no existe: la ley tiene artículos del 1 al " + MAX_ART + ".";
        jumper.classList.add("hidden");
      } else {
        $("#results-icon").textContent = "🔎";
        var total = nArts + nDisps;
        txt.innerHTML = "<b>" + total + "</b> resultado" + (total === 1 ? "" : "s") + " para «" + esc(raw.trim()) + "»" +
          (nDisps ? " · " + nArts + " artículos y " + nDisps + " disposiciones" : " en " + nArts + " artículo" + (nArts === 1 ? "" : "s")) + ".";
        jumper.classList.add("hidden");
      }
    }

    /* contadores del índice */
    TITULOS.forEach(function (t) {
      var badge = $('[data-count-titulo="' + t.num + '"]');
      if (!badge) return;
      if (!searching) { badge.textContent = t.arts.length; badge.classList.remove("hit"); }
      else {
        var c = t.arts.filter(function (a) { return matchArts[a.n]; }).length;
        badge.textContent = c;
        badge.classList.toggle("hit", c > 0);
      }
    });

    $("#q-clear").classList.toggle("show", raw.trim().length > 0);

    /* desplazamiento y hash */
    if (parsed.mode === "art") {
      $("#goto-n").value = parsed.n;
      setHash("#articulo-" + parsed.n);
      if (opts.scroll !== false) scrollToEl($("#articulo-" + parsed.n), true);
    } else if (parsed.mode === "disp" && opts.scroll !== false) {
      var first = $("#disp-" + parsed.ids[0]);
      if (first) scrollToEl(first, true);
    } else if (parsed.mode === "text" && opts.scroll && anyVisible) {
      var firstCard = $("#ley-content .art-card:not(.hidden)");
      if (firstCard) scrollToEl(firstCard, false);
    } else if (parsed.mode === "browse") {
      setHash(location.pathname + location.search);
    }
  }

  function scrollToEl(el, flash) {
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    if (flash) {
      el.classList.remove("flash");
      void el.offsetWidth;
      el.classList.add("flash");
    }
  }

  /* ---------- copiar ---------- */
  function copyText(text, msg) {
    function done() { toast(msg); }
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); done(); }
      catch (e) { toast("No se pudo copiar en este navegador."); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else fallback();
  }
  function artPlainText(a) {
    var lines = ["Artículo " + a.n + (a.ep ? " (" + a.ep + ")" : ""), ""];
    a.b.forEach(function (b) {
      if (b.p) lines.push(b.p);
      if (b.ol) b.ol.forEach(function (li, i) { lines.push((i + 1) + ". " + li); });
      if (b.lv) b.lv.forEach(function (x) { lines.push("  ".repeat(x[0]) + x[1]); });
      lines.push("");
    });
    lines.push("— Ley de Transporte Terrestre, Gaceta Oficial N° 38.985 (01/08/2008)");
    return lines.join("\n");
  }

  /* ---------- eventos ---------- */
  function init() {
    buildHero();
    buildContent();
    buildIndex();

    var q = $("#q"), debounce = null;
    q.addEventListener("input", function () {
      clearTimeout(debounce);
      debounce = setTimeout(function () { applySearch(q.value); }, 220);
    });
    q.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { clearTimeout(debounce); applySearch(q.value, { scroll: true }); }
      if (e.key === "Escape") { q.value = ""; applySearch(""); q.blur(); }
    });
    $("#q-clear").addEventListener("click", function () { q.value = ""; applySearch(""); q.focus(); });
    $("#show-all").addEventListener("click", function () { q.value = ""; applySearch(""); });
    $("#nav-search").addEventListener("click", function () {
      $("#searchbar").scrollIntoView({ behavior: "smooth" });
      setTimeout(function () { q.focus(); }, 350);
    });
    $("#goto-btn").addEventListener("click", gotoArticle);
    $("#goto-n").addEventListener("keydown", function (e) { if (e.key === "Enter") gotoArticle(); });
    function gotoArticle() {
      var n = parseInt($("#goto-n").value, 10);
      if (!n || n < 1 || n > MAX_ART) { toast("Indica un número de artículo del 1 al " + MAX_ART + "."); return; }
      q.value = "artículo " + n;
      applySearch(q.value, { scroll: true });
    }
    $("#art-prev").addEventListener("click", function () {
      if (state.artN > 1) { q.value = "artículo " + (state.artN - 1); applySearch(q.value); }
    });
    $("#art-next").addEventListener("click", function () {
      if (state.artN < MAX_ART) { q.value = "artículo " + (state.artN + 1); applySearch(q.value); }
    });
    $all("#chips .chip").forEach(function (ch) {
      ch.addEventListener("click", function () {
        q.value = ch.getAttribute("data-q");
        applySearch(q.value, { scroll: true });
      });
    });

    /* copiar / enlace (delegación) */
    $("#ley-content").addEventListener("click", function (e) {
      var btn = e.target.closest(".act-copy, .act-link");
      if (!btn) return;
      var card = btn.closest(".art-card");
      if (card.hasAttribute("data-n")) {
        var a = ART_BY_N[card.getAttribute("data-n")];
        if (btn.classList.contains("act-copy")) copyText(artPlainText(a), "Artículo " + a.n + " copiado al portapapeles.");
        else {
          var url = location.href.split("#")[0] + "#articulo-" + a.n;
          copyText(url, "Enlace del artículo " + a.n + " copiado.");
        }
      } else {
        var d = DISP.filter(function (x) { return x.id === card.getAttribute("data-disp"); })[0];
        copyText(d.nombre + "\n\n" + blocksText(d.b), d.nombre + " copiada al portapapeles.");
      }
    });

    /* índice móvil */
    var panel = $("#index-panel"), scrim = $("#scrim"), menuBtn = $("#menu-btn");
    function setDrawer(open) {
      panel.classList.toggle("open", open);
      scrim.classList.toggle("show", open);
      menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
      menuBtn.textContent = open ? "✕" : "☰";
    }
    menuBtn.addEventListener("click", function () { setDrawer(!panel.classList.contains("open")); });
    scrim.addEventListener("click", function () { setDrawer(false); });
    panel.addEventListener("click", function (e) {
      if (e.target.closest("a") && window.innerWidth <= 1020) setDrawer(false);
    });

    /* teclado global */
    document.addEventListener("keydown", function (e) {
      var tag = (document.activeElement && document.activeElement.tagName) || "";
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        $("#searchbar").scrollIntoView({ behavior: "smooth" });
        setTimeout(function () { q.focus(); }, 300);
      }
    });

    /* offset de anclaje según altura real de las barras fijas */
    var barsH = 0;
    function syncOffsets() {
      barsH = $("#nav").offsetHeight + $("#searchbar").offsetHeight;
      document.documentElement.style.scrollPaddingTop = (barsH + 14) + "px";
    }
    syncOffsets();
    var resizeT = null;
    window.addEventListener("resize", function () {
      clearTimeout(resizeT);
      resizeT = setTimeout(syncOffsets, 150);
    });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(syncOffsets);

    /* progreso, subir, scrollspy */
    var toTop = $("#to-top"), progress = $("#progress");
    var navLinks = $all("#nav nav a");
    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        var y = window.scrollY || document.documentElement.scrollTop;
        var max = document.documentElement.scrollHeight - window.innerHeight;
        progress.style.width = (max > 0 ? (y / max) * 100 : 0) + "%";
        toTop.classList.toggle("show", y > 700);

        var dispSec = $("#disp-section");
        var section = "inicio";
        var heroBottom = $("#hero").offsetTop + $("#hero").offsetHeight;
        if (y > heroBottom - 120) section = "consultar";
        if (dispSec && !dispSec.classList.contains("hidden") &&
            dispSec.getBoundingClientRect().top < window.innerHeight * 0.5) section = "disposiciones";
        navLinks.forEach(function (a) {
          a.classList.toggle("active", a.getAttribute("data-nav") === section);
        });

        /* título activo en el índice */
        var heads = $all("#ley-content .titulo-block:not(.hidden)");
        var activeTit = null;
        for (var i = 0; i < heads.length; i++) {
          if (heads[i].getBoundingClientRect().top < barsH + 40) activeTit = heads[i].getAttribute("data-titulo");
        }
        $all("#index-tree .idx-titulo > a").forEach(function (a) {
          a.classList.toggle("active", activeTit !== null && a.getAttribute("href") === "#titulo-" + activeTit);
        });
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    toTop.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });

    /* hash inicial y navegación por hash */
    function handleHash(h) {
      if (/^#articulo-\d+$/.test(h)) {
        var n = parseInt(h.slice(10), 10);
        if (ART_BY_N[n] && state.artN !== n) {
          q.value = "artículo " + n;
          applySearch(q.value, { scroll: false });
          setTimeout(function () { scrollToEl($("#articulo-" + n), true); }, 120);
        }
      } else if (h) {
        var target = $(h);
        if (target) {
          if (state.mode !== "browse" && (target.classList.contains("hidden") || target.closest(".hidden"))) {
            q.value = "";
            applySearch("");
          }
          setTimeout(function () { scrollToEl(target, false); }, 120);
        }
      }
    }
    window.addEventListener("hashchange", function () { handleHash(location.hash); });
    handleHash(location.hash);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();