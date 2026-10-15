const TZ = "America/Sao_Paulo";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const EPOCH_MS = Date.parse("2026-10-12T12:00:00.000Z");
const DEVS = ["Luciano", "Edu Tomazini", "Dudu", "Nihad", "Rivail", "Henrique"];
const STORE_KEY = "monitor-masters:developer";
const STORE_PREF_KEY = "monitor-masters:store";
const STORES = ["all", "shapermint", "truekind"];

const APPS = {
  shapermint: {
    id: "560c52e1-427e-4084-810b-7c2d20ef317d",
    service: "shapermint-storefront",
    label: "Shapermint",
  },
  truekind: {
    id: "5feb0eec-b06b-4e21-8807-249a9a57c11d",
    service: "truekind-storefront",
    label: "Truekind",
  },
};

const LOCALES = {
  "en-us": { label: "EN-US", country: '"United States"', prefix: "" },
  "en-ca": { label: "EN-CA", country: "Canada", prefix: "/en-CA" },
  "en-gb": { label: "EN-GB", country: '"United Kingdom"', prefix: "/en-GB" },
  "en-au": { label: "EN-AU", country: "Australia", prefix: "/en-AU" },
};

const DUTIES = [
  {
    id: "collections",
    title: "Collections",
    surface: "collections",
    stores: { shapermint: ["en-us", "en-ca", "en-gb", "en-au"], truekind: ["en-us", "en-ca"] },
  },
  {
    id: "homepage",
    title: "Homepage",
    surface: "homepage",
    stores: { shapermint: ["en-us", "en-ca", "en-gb", "en-au"], truekind: ["en-us", "en-ca"] },
  },
  {
    id: "products",
    title: "Products",
    surface: "products",
    stores: { shapermint: ["en-us", "en-ca", "en-gb", "en-au"], truekind: ["en-us", "en-ca"] },
  },
  {
    id: "landing",
    title: "Landing pages",
    surface: "landing",
    stores: { shapermint: ["en-us", "en-ca", "en-gb", "en-au"], truekind: ["en-us", "en-ca"] },
  },
  {
    id: "errors",
    title: "Frontend errors",
    surface: "errors",
    stores: { shapermint: ["all"], truekind: ["all"] },
  },
  {
    id: "dashboard",
    title: "Main dashboard",
    surface: "dashboard",
    stores: { shapermint: ["dashboard"], truekind: ["dashboard"] },
  },
];

const state = {
  you: loadYou(),
  store: loadStore(),
  weekIndex: null,
};

function loadYou() {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    return DEVS.includes(saved) ? saved : null;
  } catch {
    return null;
  }
}

function loadStore() {
  try {
    const saved = localStorage.getItem(STORE_PREF_KEY);
    return STORES.includes(saved) ? saved : "all";
  } catch {
    return "all";
  }
}

function spParts(date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  parts.hour = String(Number(parts.hour) % 24).padStart(2, "0");
  return parts;
}

function offsetMs(date) {
  const p = spParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - date.getTime();
}

function zonedToUtc(year, month, day, hour, minute) {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  let utc = guess - offsetMs(new Date(guess));
  const corrected = guess - offsetMs(new Date(utc));
  if (corrected !== utc) utc = corrected;
  return new Date(utc);
}

function periodStart(now = new Date()) {
  const p = spParts(now);
  const anchor = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)));
  let back = (anchor.getUTCDay() + 6) % 7;
  if (back === 0 && Number(p.hour) < 9) back = 7;
  anchor.setUTCDate(anchor.getUTCDate() - back);
  return zonedToUtc(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, anchor.getUTCDate(), 9, 0);
}

function weekIndex(start) {
  return Math.round((start.getTime() - EPOCH_MS) / WEEK_MS);
}

function mod(value, size) {
  return ((value % size) + size) % size;
}

function assignmentFor(index) {
  return DEVS.map((name, devIndex) => ({
    name,
    duty: DUTIES[mod(devIndex - index, DUTIES.length)],
  }));
}

function viewName(surface, locale) {
  const prefix = LOCALES[locale].prefix;
  if (surface === "homepage") return prefix || "/";
  const path = { collections: "/collections/*", products: "/products/*", landing: "/pages/*" }[surface];
  return prefix ? `${prefix}${path}` : path;
}

function queryFor(store, surface, locale) {
  const app = APPS[store];
  if (surface === "errors") {
    return `@application.id:${app.id} @session.type:user env:prod service:${app.service}`;
  }
  const loc = LOCALES[locale];
  const view = viewName(surface, locale);
  if (surface === "homepage") {
    return `@application.id:${app.id} @session.type:user @view.name:${view} @geo.country:${loc.country}`;
  }
  return `@application.id:${app.id} @session.type:user @type:view env:prod service:${app.service} @geo.country:${loc.country} -@device.type:(Bot OR Other) @view.name:${view}`;
}

function rumUrl(query, days) {
  const to = Date.now();
  const from = to - days * 24 * 60 * 60 * 1000;
  const params = new URLSearchParams({
    query,
    agg_m: "@view.loading_time",
    fromUser: "false",
    from_ts: String(from),
    to_ts: String(to),
    live: "true",
  });
  return `https://trafilea.datadoghq.com/rum/performance-monitoring?${params}`;
}

function dashboardUrl(store) {
  const to = Date.now();
  const from = to - 7 * 24 * 60 * 60 * 1000;
  const params = new URLSearchParams({
    fromUser: "true",
    overlay: "changes",
    overlay_category: "apm",
    refresh_mode: "sliding",
    from_ts: String(from),
    to_ts: String(to),
    live: "true",
  });
  if (store === "truekind") {
    params.set("tpl_var_application.id[0]", APPS.truekind.id);
    params.set("tpl_var_application[0]", "storefront-truekind");
    params.set("tpl_var_service[0]", "*");
    params.set("tpl_var_store_name[0]", "*");
    params.set("view", "spans");
    params.set("paused", "false");
    return `https://trafilea.datadoghq.com/dashboard/k4x-w3v-ihi?${params}`;
  }
  return `https://trafilea.datadoghq.com/dashboard/fii-s5j-4sr/te---nova-shapermint?${params}`;
}

function linksFor(store, duty) {
  const slots = duty.stores[store] || [];
  if (slots.length === 0) return [];
  if (slots[0] === "dashboard") {
    return [{ label: "Open dashboard", href: dashboardUrl(store) }];
  }
  if (slots[0] === "all") {
    return [{ label: "Open in Datadog", href: rumUrl(queryFor(store, "errors"), 61) }];
  }
  return slots.map((locale) => ({
    label: LOCALES[locale].label,
    href: rumUrl(queryFor(store, duty.surface, locale), 7),
  }));
}

function formatWhen(date, withTime) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: withTime ? "numeric" : undefined,
    hour: withTime ? "2-digit" : undefined,
    minute: withTime ? "2-digit" : undefined,
    hourCycle: "h23",
  }).format(date);
}

function formatClock(date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function formatRemaining(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  if (days > 0) return `${days}d ${hh}h ${mm}m`;
  return `${hh}h ${mm}m ${ss}s`;
}

function initials(name) {
  return name.split(" ").slice(0, 2).map((part) => part[0]).join("");
}

function hue(name) {
  const hues = [18, 152, 42, 200, 278, 330];
  return hues[DEVS.indexOf(name)] ?? 18;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function openInTabs(hrefs) {
  for (const href of hrefs) {
    const opened = window.open(href, "_blank", "noopener,noreferrer");
    if (opened) opened.opener = null;
  }
}

function renderNames() {
  const root = document.querySelector("#names");
  root.replaceChildren();
  const anyone = el("button", `chip${state.you ? "" : " is-on"}`, "Everyone");
  anyone.type = "button";
  anyone.setAttribute("aria-pressed", String(!state.you));
  anyone.addEventListener("click", () => setYou(null));
  root.appendChild(anyone);
  for (const name of DEVS) {
    const button = el("button", `chip${state.you === name ? " is-on" : ""}`, name);
    button.type = "button";
    button.setAttribute("aria-pressed", String(state.you === name));
    button.addEventListener("click", () => setYou(name));
    root.appendChild(button);
  }
}

function setYou(name) {
  state.you = name;
  try {
    if (name) localStorage.setItem(STORE_KEY, name);
    else localStorage.removeItem(STORE_KEY);
  } catch {
    /* private mode */
  }
  render();
}

function renderRoster() {
  const roster = document.querySelector("#roster");
  const people = assignmentFor(state.weekIndex);
  const you = people.find((person) => person.name === state.you);
  const headline = document.querySelector("#headline");
  if (you) {
    headline.replaceChildren(
      document.createTextNode(`${you.name.split(" ")[0]}, your duty is `),
      el("em", "duty-title", you.duty.title),
      document.createTextNode("."),
    );
  } else {
    headline.textContent = "This week’s Datadog checks";
  }
  document.querySelector("#subhead").textContent = you
    ? ""
    : "Pick your name to mark your card. The assignment is the same for the whole team.";

  roster.classList.toggle("is-focused", Boolean(you));
  roster.replaceChildren();
  for (const person of people) {
    if (you && person.name !== you.name) continue;
    const card = el("article", `card${person.name === state.you ? " is-you" : ""}`);
    const top = el("div", "card-top");
    const who = el("div", "who");
    const avatar = el("span", "avatar", initials(person.name));
    avatar.style.background = `hsl(${hue(person.name)} 72% 68%)`;
    who.append(avatar, el("p", "name", person.name));
    top.appendChild(who);
    if (person.name === state.you) top.appendChild(el("span", "you-tag", "You"));
    card.append(top, el("h3", "duty", person.duty.title));

    for (const store of ["shapermint", "truekind"]) {
      if (state.store !== "all" && state.store !== store) continue;
      const links = linksFor(store, person.duty);
      const block = el("div", "store");
      const label = el("p", "store-label");
      const dot = el("span", `dot ${store}`);
      label.append(dot, document.createTextNode(APPS[store].label));
      block.appendChild(label);
      if (links.length === 0) {
        block.appendChild(el("p", "note", "No Truekind link for this duty."));
      } else {
        const row = el("div", "links");
        for (const link of links) {
          const a = el("a", "link", link.label);
          a.href = link.href;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.setAttribute(
            "aria-label",
            `${APPS[store].label} ${person.duty.title} ${link.label}`,
          );
          row.appendChild(a);
        }
        block.appendChild(row);
      }
      card.appendChild(block);
    }
    const open = el("button", "open-all", "Open all links");
    open.type = "button";
    open.title = "Opens each check in a new tab";
    open.addEventListener("click", () => {
      openInTabs([...card.querySelectorAll("a.link")].map((anchor) => anchor.href));
    });
    const actions = el("div", "card-actions");
    actions.appendChild(open);
    card.appendChild(actions);
    roster.appendChild(card);
  }
}

function renderAhead(start) {
  const root = document.querySelector("#ahead");
  root.replaceChildren();
  for (let step = 1; step <= 5; step += 1) {
    const when = new Date(start.getTime() + step * WEEK_MS);
    const row = el("div", "week");
    const time = document.createElement("time");
    time.dateTime = when.toISOString();
    time.textContent = formatWhen(when, true);
    const pairs = el("div", "pairs");
    for (const person of assignmentFor(state.weekIndex + step)) {
      const bit = el("span");
      bit.append(el("b", null, person.name), document.createTextNode(` ${person.duty.title}`));
      pairs.appendChild(bit);
    }
    row.append(time, pairs);
    root.appendChild(row);
  }
}

function renderClocks(now, start) {
  const next = new Date(start.getTime() + WEEK_MS);
  document.querySelector("#clock").textContent = formatClock(now);
  document.querySelector("#period-range").textContent =
    `${formatWhen(start, true)} → ${formatWhen(next, true)}`;
  document.querySelector("#countdown").textContent = formatRemaining(next.getTime() - now.getTime());
}

function syncStoreButtons() {
  document.querySelectorAll(".seg").forEach((item) => {
    const on = item.dataset.store === state.store;
    item.classList.toggle("is-on", on);
    item.setAttribute("aria-pressed", String(on));
  });
}

function render() {
  const now = new Date();
  const start = periodStart(now);
  state.weekIndex = weekIndex(start);
  renderNames();
  syncStoreButtons();
  renderClocks(now, start);
  renderRoster();
  renderAhead(start);
}

document.querySelectorAll(".seg").forEach((button) => {
  button.addEventListener("click", () => {
    state.store = STORES.includes(button.dataset.store) ? button.dataset.store : "all";
    try {
      localStorage.setItem(STORE_PREF_KEY, state.store);
    } catch {
      /* private mode */
    }
    render();
  });
});

render();
setInterval(() => {
  const now = new Date();
  const start = periodStart(now);
  const index = weekIndex(start);
  if (index !== state.weekIndex) render();
  else renderClocks(now, start);
}, 1000);
