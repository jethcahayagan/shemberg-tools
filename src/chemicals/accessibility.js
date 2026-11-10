// Presentation preferences live separately from the laboratory records.
export function displayPreference(storage) {
  try {
    const value = (storage ?? globalThis.localStorage).getItem(
      "shemberg-qa-text-size",
    );
    return ["100", "112.5", "125"].includes(value) ? value : "112.5";
  } catch {
    return "112.5";
  }
}
export function applyTextSize(value, root = document.documentElement) {
  root.style.fontSize =
    (["100", "112.5", "125"].includes(value) ? value : "112.5") + "%";
}
export function organizeInventory(root) {
  const nav = root.querySelector("nav");
  const navigation = document.createElement("label");
  navigation.className = "compact-navigation";
  navigation.textContent = "Open section";
  const picker = document.createElement("select");
  picker.id = "section-picker";
  picker.setAttribute("aria-label", "Open section");
  for (const button of nav.querySelectorAll("[data-nav]")) {
    const option = document.createElement("option");
    option.value = button.dataset.nav;
    option.textContent = button.textContent;
    option.selected = button.classList.contains("active");
    picker.append(option);
  }
  picker.onchange = () => {
    nav.querySelector(`[data-nav="${picker.value}"]`).click();
    document.getElementById("section-picker")?.focus();
  };
  navigation.append(picker);
  nav.before(navigation);
  const settings = document.createElement("details");
  settings.className = "settings-menu";
  const settingsTitle = document.createElement("summary");
  settingsTitle.textContent = "Text size and app details";
  settings.append(
    settingsTitle,
    root.querySelector(".text-size-control"),
    root.querySelector(".sidebar-bottom"),
  );
  nav.after(settings);
  settings.open = !matchMedia("(max-width:70rem)").matches;
  for (const actions of root.querySelectorAll(
    ".inventory-table .row-actions",
  )) {
    const secondary = [...actions.children].filter(
      (node) => !node.matches("[data-withdraw],[data-detail],[data-quantity]"),
    );
    if (!secondary.length) continue;
    const more = document.createElement("details");
    more.className = "row-more";
    const summary = document.createElement("summary");
    summary.textContent = "More actions";
    more.append(summary, ...secondary);
    actions.append(more);
  }
  const filters = root.querySelector("#search-chem")?.closest(".filters");
  if (filters) {
    const details = document.createElement("details");
    details.id = "filter-options";
    details.className = "filter-options";
    const summary = document.createElement("summary");
    summary.textContent = "Filter and sort";
    const group = document.createElement("div");
    group.className = "filter-grid";
    for (const select of [...filters.querySelectorAll("select")]) {
      const label = document.createElement("label"),
        text = document.createElement("span");
      text.textContent = select
        .getAttribute("aria-label")
        .replace(/^Filter /, "");
      label.append(text, select);
      group.append(label);
      if (select.selectedIndex > 0) details.open = true;
    }
    details.append(summary, group);
    filters.after(details);
    const input = filters.querySelector(".search");
    const caption = document.createElement("span");
    caption.textContent = "Find a chemical or bottle";
    input.prepend(caption);
  }
  root.querySelectorAll(".table-wrap").forEach((wrap) => {
    wrap.tabIndex = 0;
    wrap.setAttribute("role", "region");
    wrap.setAttribute(
      "aria-label",
      "Inventory records; scroll across for more columns",
    );
  });
}

if (typeof matchMedia === "function")
  matchMedia("(max-width:70rem)").addEventListener("change", (event) => {
    const settings = document.querySelector(".settings-menu");
    if (settings) settings.open = !event.matches;
  });

export function guideBottleForm(form) {
  const doc = form.ownerDocument;
  const actions = form.querySelector(".dialog-actions");
  const submit = actions.querySelector("[type=submit]");
  const make = (tag, cls, text) => {
    const el = doc.createElement(tag);
    if (cls) el.className = cls;
    if (text) el.textContent = text;
    return el;
  };
  const titles = [
    "Chemical details",
    "Container and dates",
    "Quantity and record",
  ];
  const steps = titles.map((title) => {
    const section = make("section", "form-step"),
      heading = make("h3", "", title);
    heading.tabIndex = -1;
    section.append(heading);
    return section;
  });
  const grids = steps.map((step) => {
    const grid = make("div", "form-grid");
    step.append(grid);
    return grid;
  });
  const main = form.querySelector(":scope > .form-grid");
  const identity = new Set([
    "name",
    "concentration",
    "phase",
    "purity",
    "stockGroup",
    "standardDate",
    "restandardDate",
  ]);
  for (const node of [...main.children]) {
    const name = node.querySelector("input,select")?.name;
    grids[name === "analyst" ? 2 : identity.has(name) ? 0 : 1].append(node);
  }
  main.remove();
  for (const node of [...form.children]) {
    if (node === actions) continue;
    const name = node.querySelector("input,select")?.name;
    const step =
      node.matches(".notice,.catalog-picker") ||
      (node.matches("details") && node.querySelector("[name=formula]"))
        ? 0
        : node.matches(".form-section") || ["notes", "reason"].includes(name)
          ? 2
          : 1;
    steps[step].append(node);
  }
  const bar = make("div", "form-view");
  const label = make("label", "", "Form view");
  const view = make("select");
  view.id = "form-view";
  view.setAttribute("aria-label", "Form view");
  for (const [value, text] of [
    ["guided", "Step by step"],
    ["all", "All fields together"],
  ]) {
    const option = make("option", "", text);
    option.value = value;
    view.append(option);
  }
  label.append(view);
  bar.append(label);
  const progress = make("p", "form-progress");
  progress.setAttribute("aria-live", "polite");
  bar.append(progress);
  const back = make("button", "button secondary", "Back");
  back.type = "button";
  back.dataset.stepBack = "";
  const next = make("button", "button primary", "Next");
  next.type = "button";
  next.dataset.stepNext = "";
  actions.insertBefore(back, submit);
  actions.insertBefore(next, submit);
  form.prepend(bar, ...steps);
  let current = 0;
  const draw = (focus = false) => {
    const all = view.value === "all";
    steps.forEach((step, i) => (step.hidden = !all && i !== current));
    back.hidden = all || current === 0;
    next.hidden = all || current === steps.length - 1;
    submit.hidden = !all && current !== steps.length - 1;
    progress.textContent = all
      ? "All bottle details"
      : `Step ${current + 1} of ${steps.length}`;
    if (focus) {
      steps[current].querySelector("h3").focus();
      steps[current].scrollIntoView({ block: "start", behavior: "instant" });
    }
  };
  const reveal = (control) => {
    const index = steps.findIndex((step) => step.contains(control));
    if (index >= 0) current = index;
    draw();
    let node = control.parentElement;
    while (node && node !== form) {
      if (node.tagName === "DETAILS") node.open = true;
      node = node.parentElement;
    }
    control.focus();
    control.reportValidity();
  };
  const validate = (container) => {
    const opened = form.elements.opened,
      openedBy = form.elements.openedBy;
    if (opened && openedBy) {
      opened.setCustomValidity(
        openedBy.value.trim() && !opened.value
          ? "Enter the date this bottle was opened."
          : "",
      );
      openedBy.setCustomValidity(
        opened.value && !openedBy.value.trim()
          ? "Enter who opened this bottle."
          : "",
      );
    }
    const invalid = [
      ...container.querySelectorAll("input,select,textarea"),
    ].find((control) => !control.disabled && !control.checkValidity());
    if (invalid) {
      reveal(invalid);
      return false;
    }
    return true;
  };
  next.onclick = () => {
    if (validate(steps[current])) {
      current++;
      draw(true);
    }
  };
  back.onclick = () => {
    current--;
    draw(true);
  };
  view.onchange = () => draw();
  form.noValidate = true;
  form.addEventListener(
    "submit",
    (event) => {
      if (view.value === "guided" && current < steps.length - 1) {
        event.preventDefault();
        event.stopImmediatePropagation();
        next.click();
        return;
      }
      if (!validate(form)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
  draw();
}
