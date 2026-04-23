(function () {
  const links = Array.from(document.querySelectorAll(".vx-nav-link"));
  const currentPath = window.location.pathname;

  links.forEach((link) => {
    const href = link.getAttribute("href");
    if (href && currentPath.startsWith(href)) {
      link.style.background = "rgba(255, 255, 255, 0.12)";
      link.style.color = "#fff";
    }
  });
})();
