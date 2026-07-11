const screenButtons = [...document.querySelectorAll("[data-screen-target]")];
const screens = [...document.querySelectorAll("[data-screen]")];

function selectScreen(screenId, updateHash = true) {
  const nextScreen = screens.some((screen) => screen.dataset.screen === screenId) ? screenId : "home";

  for (const screen of screens) {
    const active = screen.dataset.screen === nextScreen;
    screen.hidden = !active;
    screen.setAttribute("aria-hidden", String(!active));
  }

  for (const button of screenButtons) {
    const active = button.dataset.screenTarget === nextScreen;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }

  if (updateHash) {
    history.replaceState(null, "", `#${nextScreen}`);
  }

  document.title = nextScreen === "routes"
    ? "Svozové trasy | Kaiser UI pilot"
    : "Přehled systému | Kaiser UI pilot";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

for (const button of screenButtons) {
  button.addEventListener("click", () => selectScreen(button.dataset.screenTarget));
}

window.addEventListener("hashchange", () => selectScreen(location.hash.slice(1), false));
selectScreen(location.hash.slice(1), false);
