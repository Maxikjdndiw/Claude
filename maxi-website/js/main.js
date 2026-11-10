/*
  Maxi's scrapbook: small bits of behaviour.
  - footer year
  - cycling route draws itself when it scrolls into view
  - postcard stack fans out on tap (hover is pure CSS)
  - accessible lightbox: arrows, Escape, focus trap, swipe, captions
  No libraries, no tracking.
*/
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ---------- Footer year ---------- */
  var yearEl = document.querySelector("[data-year]");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ---------- Route line ---------- */
  var route = document.querySelector(".route");
  if (route) {
    if (reduceMotion.matches || !("IntersectionObserver" in window)) {
      route.classList.add("is-drawn");
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            route.classList.add("is-drawn");
            io.disconnect();
          }
        });
      }, { threshold: 0.45 });
      io.observe(route);
    }
  }

  /* ---------- Postcards: first tap fans, second tap opens ---------- */
  var postcards = document.querySelector("[data-postcards]");
  var canHover = window.matchMedia("(hover: hover)");
  if (postcards) {
    postcards.addEventListener("click", function (e) {
      if (canHover.matches) return;
      if (!postcards.classList.contains("is-fanned")) {
        e.preventDefault();
        e.stopPropagation();
        postcards.classList.add("is-fanned");
      }
    }, true);
    document.addEventListener("click", function (e) {
      if (!postcards.contains(e.target)) postcards.classList.remove("is-fanned");
    });
  }

  /* ---------- Lightbox ---------- */
  var dialog = document.getElementById("lightbox");
  if (!dialog || typeof dialog.showModal !== "function") return; // links still open the big photo

  var img = dialog.querySelector(".lightbox__img");
  var captionEl = dialog.querySelector(".lightbox__caption");
  var countEl = dialog.querySelector(".lightbox__count");
  var prevBtn = dialog.querySelector(".lightbox__prev");
  var nextBtn = dialog.querySelector(".lightbox__next");
  var closeBtn = dialog.querySelector(".lightbox__close");

  var groups = {};
  var current = { items: [], index: 0 };
  var opener = null;

  // Photos on the page, grouped by tile
  document.querySelectorAll("a.lb[data-group]").forEach(function (a) {
    var group = a.getAttribute("data-group");
    if (group === "travel") return; // travel uses the full list below
    var pic = a.querySelector("img");
    (groups[group] = groups[group] || []).push({
      src: a.getAttribute("href"),
      fallback: pic ? pic.getAttribute("src") : "",
      w: +a.getAttribute("data-w"),
      h: +a.getAttribute("data-h"),
      caption: a.getAttribute("data-caption") || "",
      alt: pic ? pic.getAttribute("alt") : "",
      night: a.classList.contains("film--night"),
      link: a
    });
  });

  // All 18 travel photos
  var travelData = document.getElementById("gallery-travel");
  if (travelData) {
    try { groups.travel = JSON.parse(travelData.textContent); } catch (err) { groups.travel = []; }
  }

  function show(index) {
    var items = current.items;
    if (!items.length) return;
    current.index = (index + items.length) % items.length;
    var item = items[current.index];

    img.classList.add("is-loading");
    img.classList.toggle("is-night", !!item.night);
    img.width = item.w || 1200;
    img.height = item.h || 1600;
    img.alt = item.alt || "";
    img.onload = function () { img.classList.remove("is-loading"); };
    img.onerror = function () {
      if (item.fallback && img.getAttribute("src") !== item.fallback) img.src = item.fallback;
    };
    img.src = item.src;

    captionEl.textContent = item.caption;
    countEl.textContent = (current.index + 1) + " / " + items.length;
    var single = items.length < 2;
    prevBtn.hidden = single;
    nextBtn.hidden = single;

    // warm up the neighbours
    [1, -1].forEach(function (step) {
      var n = items[(current.index + step + items.length) % items.length];
      if (n && n !== item) { var pre = new Image(); pre.src = n.src; }
    });
  }

  function open(group, index, from) {
    current.items = groups[group] || [];
    if (!current.items.length) return;
    opener = from || document.activeElement;
    show(index || 0);
    dialog.showModal();
    document.documentElement.style.overflow = "hidden";
    closeBtn.focus();
  }

  function close() {
    if (dialog.open) dialog.close();
  }

  dialog.addEventListener("close", function () {
    document.documentElement.style.overflow = "";
    img.removeAttribute("src");
    if (opener && typeof opener.focus === "function") opener.focus();
  });

  // Click on a photo
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a.lb[data-group]");
    if (!a || e.defaultPrevented) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; // let people open in a new tab
    e.preventDefault();
    var group = a.getAttribute("data-group");
    var index;
    if (group === "travel") {
      index = +a.getAttribute("data-index") || 0;
    } else {
      index = groups[group].findIndex(function (it) { return it.link === a; });
    }
    open(group, index, a);
  });

  // "See all" buttons
  document.querySelectorAll("[data-open-gallery]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      open(btn.getAttribute("data-open-gallery"), 0, btn);
    });
  });

  prevBtn.addEventListener("click", function () { show(current.index - 1); });
  nextBtn.addEventListener("click", function () { show(current.index + 1); });
  closeBtn.addEventListener("click", close);

  // Click on the dark area closes
  dialog.addEventListener("click", function (e) {
    if (e.target === dialog) close();
  });

  // Keyboard: arrows, Escape (native), focus trap
  dialog.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight") { e.preventDefault(); show(current.index + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); show(current.index - 1); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "Tab") {
      var focusable = [closeBtn, prevBtn, nextBtn].filter(function (b) { return !b.hidden; });
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (focusable.indexOf(document.activeElement) === -1) { e.preventDefault(); first.focus(); }
    }
  });

  // Swipe on touch screens
  var startX = null, startY = null;
  dialog.addEventListener("pointerdown", function (e) {
    if (e.pointerType === "mouse") return;
    startX = e.clientX; startY = e.clientY;
  });
  dialog.addEventListener("pointerup", function (e) {
    if (startX === null) return;
    var dx = e.clientX - startX, dy = e.clientY - startY;
    startX = startY = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      show(current.index + (dx < 0 ? 1 : -1));
    }
  });
  dialog.addEventListener("pointercancel", function () { startX = startY = null; });
})();
