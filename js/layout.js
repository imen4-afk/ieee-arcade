/*
 * IEEE Arcade – shared layout
 * ---------------------------
 * One place for the Student Branch links and the footer shown on every page.
 *
 * Include it with the path back to the site root, e.g. from games/2048/:
 *   <footer id="site-footer" class="site-footer"></footer>
 *   <script src="../../js/layout.js" data-root="../../"></script>
 *
 * It also fills any element with data-player-chip with the visitor's nickname
 * (when js/arcade.js is loaded before it).
 */
(function () {
  "use strict";

  // ---- Student Branch info (edit here, used by every page) ----
  var SB = {
    name: "IEEE ISIMA Student Branch",
    website: "https://isima.ieee.tn/",
    membershipForm: "https://ieee.surveysparrow.com/s/new-members-form/tt-8HzKpStrcHDon1c1tDGSBk",
    email: "ieee.sb.isima@gmail.com",
    social: [
      { label: "Facebook",  url: "https://www.facebook.com/ieee.isima.sb" },
      { label: "Instagram", url: "https://www.instagram.com/ieee.isima.sb/" },
      { label: "LinkedIn",  url: "https://www.linkedin.com/company/ieee-isima-sb/" }
    ]
  };
  window.SB_INFO = SB;

  var script = document.currentScript;
  var root = (script && script.getAttribute("data-root")) || "";

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    for (var key in attrs) node.setAttribute(key, attrs[key]);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // Logo <img> with a text fallback if the file is missing.
  function logo(src, alt, fallbackText) {
    var wrap = el("span", { "class": "sb-logo" });
    var img = el("img", { "class": "logo-img", src: root + src, alt: alt });
    var fallback = el("span", { "class": "logo-fallback" }, fallbackText);
    fallback.hidden = true;
    img.addEventListener("error", function () { img.hidden = true; fallback.hidden = false; });
    wrap.appendChild(img);
    wrap.appendChild(fallback);
    return wrap;
  }

  function buildFooter(footer) {
    footer.innerHTML = "";
    footer.appendChild(logo("assets/img/sb-logo-white.png", SB.name + " logo", "IEEE ISIMA SB"));

    var social = el("div", { "class": "footer-social" });
    SB.social.forEach(function (s) {
      social.appendChild(el("a", { href: s.url, target: "_blank", rel: "noopener" }, s.label));
    });
    social.appendChild(el("a", { href: SB.website, target: "_blank", rel: "noopener" }, "Website"));
    footer.appendChild(social);

    var mail = el("p");
    mail.appendChild(el("a", { href: "mailto:" + SB.email, style: "color:inherit" }, SB.email));
    footer.appendChild(mail);
    footer.appendChild(el("p", {}, "© 2026 " + SB.name));
  }

  function fillPlayerChips() {
    var name = "";
    try { name = window.IEEEArcade ? window.IEEEArcade.getNickname() : ""; } catch (e) { name = ""; }
    var chips = document.querySelectorAll("[data-player-chip]");
    for (var i = 0; i < chips.length; i++) {
      chips[i].textContent = name ? "👤 " + name : "Not logged in";
    }
  }

  // "📅" link to the events page in the top bar of every user page (except events.html itself)
  function addEventsLink() {
    var bar = document.querySelector(".topbar");
    if (!bar || document.getElementById("events-page")) return;
    var link = el("a", { "class": "topbar-icon", href: root + "events.html", title: "Upcoming events", "aria-label": "Upcoming events" }, "📅");
    var chip = bar.querySelector("[data-player-chip]");
    bar.insertBefore(link, chip || null);
  }

  function init() {
    var footer = document.getElementById("site-footer");
    if (footer) buildFooter(footer);
    addEventsLink();
    fillPlayerChips();
  }

  // js/arcade.js fires this when the server no longer accepts the player's token:
  // go to the hub's login screen (the hub itself handles it without reloading).
  window.addEventListener("ieeearcade:loggedout", function () {
    if (document.getElementById("auth")) return;
    window.location.href = root + "index.html?login=1";
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
