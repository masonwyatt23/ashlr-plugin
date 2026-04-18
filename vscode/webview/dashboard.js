/**
 * ashlr dashboard webview — client-side JS.
 *
 * Runs in the restricted VS Code webview sandbox. No external requests.
 * Responsibilities:
 *   - Animate bar fills on load (width transition already in CSS).
 *   - Handle clicks on external links (open via vscode.postMessage if needed).
 *   - Nothing else — data is server-rendered by dashboard-webview.ts.
 */

(function () {
  "use strict";

  // Trigger bar animations after initial paint
  window.addEventListener("DOMContentLoaded", function () {
    // Force reflow so CSS transitions fire from 0
    var fills = document.querySelectorAll(".bar-fill");
    fills.forEach(function (el) {
      var target = el.style.width;
      el.style.width = "0%";
      // rAF ensures the browser paints the 0% state first
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          el.style.width = target;
        });
      });
    });
  });
})();
