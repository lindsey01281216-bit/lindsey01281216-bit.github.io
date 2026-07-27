/*
 * V4 demo board renderer. Single source of truth: 80_Exports/Website/works.json,
 * exposed to the site via /data/works.json. Renders three things:
 *   - [data-tally]      : the headline counts on the case page (uses inventory totals)
 *   - .demo-grid[data-demos]      : featured demos under each tier on the case page (capped)
 *   - .demo-grid[data-demos-all]  : the full list on a /case/<tier>/ subpage (no cap)
 * "As many demos as there are" comes straight from the works array, no padding.
 * If works.json cannot be read, whatever markup is already in place stays.
 */
(function () {
  var FEATURED_CAP = 3;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function badge(w) {
    if (w.github) return '<a class="demo-gh" href="' + esc(w.github) + '" target="_blank" rel="noopener">GitHub</a>';
    if (w.source === "open") return '<span class="demo-gh">Open source</span>';
    if (w.source === "closed") return '<span class="demo-gh demo-gh-closed">Closed source</span>';
    return "";
  }

  function pipelineLine(steps) {
    return (
      '<p class="demo-pipeline">' +
      steps.map(esc).join(' <span class="demo-arrow">→</span> ') +
      "</p>"
    );
  }

  function card(w, copy) {
    var o = (copy && copy[w.name]) || null;
    var title = o && o.displayName ? o.displayName : w.name;
    var mid =
      o && o.pipeline && o.pipeline.length
        ? pipelineLine(o.pipeline)
        : '<p class="demo-desc">' + esc(o && o.desc ? o.desc : w.desc) + "</p>";
    var media =
      o && o.image
        ? '<div class="demo-media"><img src="/data/demos/' + esc(o.image) + '" alt="' + esc(title) + ' demo"></div>'
        : '<div class="demo-media">Demo</div>';
    return (
      '<div class="demo-card">' +
      media +
      '<div class="demo-body">' +
      '<p class="demo-title">' + esc(title) + "</p>" +
      mid +
      badge(w) +
      "</div></div>"
    );
  }

  function empty(label) {
    return '<div class="demo-empty">' + esc(label) + "</div>";
  }

  Promise.all([
    fetch("/data/works.json", { cache: "no-store" }).then(function (r) {
      return r.ok ? r.json() : Promise.reject(r.status);
    }),
    fetch("/data/demo-copy.json", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .catch(function () { return {}; })
  ])
    .then(function (res) {
      var data = res[0];
      var copy = res[1] || {};
      var counts = data.inventory || data.tally || {};
      document.querySelectorAll("[data-tally]").forEach(function (el) {
        var k = el.getAttribute("data-tally");
        if (counts[k] != null) el.textContent = counts[k];
      });

      var by = { skill: [], system: [], agent: [] };
      (data.works || []).forEach(function (w) { if (by[w.type]) by[w.type].push(w); });

      document.querySelectorAll(".demo-grid[data-demos]").forEach(function (grid) {
        var t = grid.getAttribute("data-demos");
        var items = (by[t] || []).slice(0, FEATURED_CAP);
        grid.innerHTML = items.length
          ? items.map(function (w) { return card(w, copy); }).join("")
          : empty("Demos coming soon");
      });

      document.querySelectorAll(".demo-grid[data-demos-all]").forEach(function (grid) {
        var t = grid.getAttribute("data-demos-all");
        var items = by[t] || [];
        grid.innerHTML = items.length
          ? items.map(function (w) { return card(w, copy); }).join("")
          : empty("No demos on the board yet");
        document.querySelectorAll('[data-count="' + t + '"]').forEach(function (el) {
          el.textContent = items.length;
        });
      });
    })
    .catch(function () {});
})();
