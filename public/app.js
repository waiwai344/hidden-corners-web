const state = {
  user: null,
  route: location.hash.replace("#", "") || "/",
  spaces: [],
  categories: [],
  nomads: [],
  atlas: { q: "", city: "", categoryId: "", list: false },
  nomad: { q: "", province: "", city: "" },
  map: { zoom: 1, x: 0, y: 0, dragging: false, startX: 0, startY: 0, originX: 0, originY: 0 },
  meTab: "想去",
  notice: ""
};

const app = document.querySelector("#app");

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || "操作失败，请稍后重试");
  return payload;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function chip(text, index = 0) {
  return `<span class="chip chip-${index % 3}">${esc(text)}</span>`;
}

function categoryChips(categories = []) {
  return `<div class="chip-row">${categories.map((item, index) => chip(item.CategoryName, index)).join("")}</div>`;
}

function dotPosition(item) {
  const minLng = 73, maxLng = 135, minLat = 18, maxLat = 54;
  const x = ((Number(item.Longitude) - minLng) / (maxLng - minLng)) * 78 + 11;
  const y = (1 - (Number(item.Latitude) - minLat) / (maxLat - minLat)) * 64 + 18;
  return `left:${Math.max(6, Math.min(94, x))}%;top:${Math.max(8, Math.min(88, y))}%`;
}

function nav() {
  const active = (href) => state.route === href || (href === "/atlas" && state.route.startsWith("/spaces/"));
  const link = (href, text) => `<a href="#${href}" class="${active(href) ? "active" : ""}">${text}</a>`;
  return `
    <header class="nav">
      <a href="#/" class="brand"><img src="/logo.png" alt="隐角 logo" /><span>隐角 Hidden Corners<small>spatial field notes</small></span></a>
      <nav class="tabs">${link("/", "地图")}${link("/atlas", "图鉴")}${link("/nomads", "游牧")}${link("/me", "我的")}</nav>
      ${state.user ? `<button class="login-btn user-btn" data-logout>退出 ${esc(state.user.Username)}</button>` : `<button class="login-btn" data-auth="login">登录</button>`}
    </header>
  `;
}

function notice() {
  return state.notice ? `<div class="toast">${esc(state.notice)}</div>` : "";
}

function setNotice(message) {
  state.notice = message;
  clearTimeout(window.noticeTimer);
  window.noticeTimer = setTimeout(() => {
    state.notice = "";
    render();
  }, 1800);
}

function loadingPage(text = "正在读取隐角档案...") {
  return `${nav()}<section class="detail"><div class="empty-state"><p>${esc(text)}</p></div></section>${notice()}`;
}

function errorPage(message) {
  return `${nav()}<section class="detail"><div class="empty-state"><p>${esc(message)}</p><button class="plain-btn" data-retry>重新加载</button></div></section>${notice()}`;
}

async function ensureBaseData() {
  if (!state.spaces.length) state.spaces = await api("/api/spaces");
  if (!state.categories.length) state.categories = await api("/api/categories");
}

function mapPage() {
  const dots = state.spaces.map((space, index) => `<button class="map-dot dot-${index % 4}" style="${dotPosition(space)}" data-preview="${space.SpaceID}" data-go="/spaces/${space.SpaceID}" aria-label="${esc(space.SpaceName)}"></button>`).join("");
  return `
    <section class="map-page">
      <div class="map-hero">
        <div class="map-copy">
          <p class="kicker">001 / hidden map</p>
          <h1>在城市缝隙里，重新找到公共生活。</h1>
          <p>这里收录那些没有被流量推到眼前，却真实承载青年文化、独立创作和邻里连接的空间。</p>
        </div>
        <div class="abstract-map" style="transform:${mapTransform()}">${dots}</div>
        <div class="map-tools" aria-label="地图控制">
          <button type="button" data-map-zoom="in">＋</button>
          <button type="button" data-map-zoom="out">－</button>
          <button type="button" data-map-reset>reset</button>
        </div>
        <div class="hover-card" id="hover-card">
          <p class="kicker">hover preview</p>
          <h3>移动到坐标点查看空间</h3>
          <div class="chip-row">${chip("真实数据", 0)}${chip("空间图鉴", 1)}</div>
        </div>
      </div>
      <section class="intro">
        <h2>替代性第三空间，不是消费清单，而是一份城市精神档案。</h2>
        <p>隐角把独立书店、复合空间、音乐现场、共居社区和社区营造项目重新编织为可浏览、可标记、可评价的图鉴。</p>
      </section>
    </section>
  `;
}

function mapTransform() {
  return `translate(${state.map.x}px, ${state.map.y}px) scale(${state.map.zoom})`;
}

function applyMapTransform() {
  const map = document.querySelector(".abstract-map");
  if (map) map.style.transform = mapTransform();
}

function zoomMap(direction) {
  const next = direction === "in" ? state.map.zoom + 0.18 : state.map.zoom - 0.18;
  state.map.zoom = Math.max(0.75, Math.min(2.4, next));
  applyMapTransform();
}

async function atlasPage() {
  const query = new URLSearchParams();
  if (state.atlas.q) query.set("q", state.atlas.q);
  if (state.atlas.city) query.set("city", state.atlas.city);
  if (state.atlas.categoryId) query.set("categoryId", state.atlas.categoryId);
  const spaces = await api(`/api/spaces?${query}`);
  const cities = [...new Set(state.spaces.map((space) => space.City))].slice(0, 16);
  const categories = state.categories.map((category, index) => `<button class="chip chip-${index % 3} ${String(category.CategoryID) === String(state.atlas.categoryId) ? "active-chip" : ""}" data-category="${category.CategoryID}" title="${esc(category.CategoryDesc)}">${esc(category.CategoryName)}</button>`).join("");
  const cityButtons = [`<button class="${!state.atlas.city ? "active" : ""}" data-city="">全部城市</button>`, ...cities.map((city) => `<button class="${state.atlas.city === city ? "active" : ""}" data-city="${esc(city)}">${esc(city)}</button>`)].join("");
  const cards = spaces.length ? spaces.map((space) => state.atlas.list ? spaceRow(space) : spaceCard(space)).join("") : `<div class="empty-state"><p>没有找到对应空间</p><button class="plain-btn" data-clear-atlas>清空筛选</button></div>`;
  return `
    <section class="workspace">
      <div class="page-head"><div><p class="kicker">atlas index</p><h1 class="page-title">空间图鉴</h1></div><button class="plain-btn" data-toggle-list>${state.atlas.list ? "卡片" : "列表"}</button></div>
      <label class="search-wrap"><span></span><input class="search" data-atlas-q value="${esc(state.atlas.q)}" placeholder="搜索空间、城市、简介或分类" /></label>
      <div class="filters">${categories}</div>
      <div class="content-grid">
        <aside class="cities">${cityButtons}</aside>
        <section class="${state.atlas.list ? "space-list" : "cards"}">${cards}</section>
      </div>
    </section>
  `;
}

function spaceCard(space) {
  return `
    <a href="#/spaces/${space.SpaceID}" class="space-card">
      <div><p class="meta">${esc(space.City)} / #${String(space.SpaceID).padStart(3, "0")}</p><h3>${esc(space.SpaceName)}</h3><p>${esc(space.Address)}</p></div>
      ${categoryChips(space.Categories.slice(0, 3))}
    </a>
  `;
}

function spaceRow(space) {
  return `<a href="#/spaces/${space.SpaceID}" class="space-row"><strong>${esc(space.SpaceName)}</strong><span>${esc(space.City)}</span>${categoryChips(space.Categories.slice(0, 3))}</a>`;
}

async function detailPage(id) {
  const detail = await api(`/api/spaces/${id}`);
  return `
    <section class="detail">
      <div class="detail-hero">
        <div><p class="kicker">${esc(detail.City)} / hidden corner</p><h1>${esc(detail.SpaceName)}</h1><div class="chip-row">${chip(detail.Address, 0)}${detail.Categories.map((c, i) => chip(c.CategoryName, i + 1)).join("")}</div></div>
        <div class="score-box"><span>average resonance</span><div class="score">${detail.AverageRating ?? "暂无"}</div><small>${detail.ReviewCount ? `${detail.ReviewCount} 条评价` : "暂无评分"}</small></div>
      </div>
      <div class="detail-body">
        <article>
          <p class="description">${esc(detail.Description)}</p>
          <section class="activity-block"><h2>近期活动</h2>${detail.Activities.length ? detail.Activities.map((a) => `<div class="activity"><span>${esc(a.ActivityName)}</span><time>${esc(a.ActivityDate)}</time><a href="${esc(a.PushLink)}" target="_blank">推文链接</a></div>`).join("") : `<div class="empty-state"><p>暂无活动记录</p></div>`}</section>
        </article>
        <aside class="side-stack">
          <div class="status"><button class="want ${detail.CurrentUserFavorite?.ActionType === "想去" ? "selected" : ""}" data-mark="想去" data-space="${detail.SpaceID}">想去</button><button class="done ${detail.CurrentUserFavorite?.ActionType === "已打卡" ? "selected" : ""}" data-mark="已打卡" data-space="${detail.SpaceID}">已打卡</button></div>
          <button class="primary-btn" data-review="${detail.SpaceID}">添加评价</button>
          <section class="side-note"><h2>空间评价</h2>${detail.Reviews.length ? detail.Reviews.map(reviewCard).join("") : `<div class="empty-state"><p>还没有人留下评价</p></div>`}</section>
        </aside>
      </div>
    </section>
  `;
}

function reviewCard(review) {
  const stars = Array.from({ length: 5 }, (_, index) => `<span>${index < review.Rating ? "★" : "☆"}</span>`).join("");
  return `<article class="review-card"><div class="review-top"><strong>${esc(review.Username || review.SpaceName)}</strong><span>${esc(review.VisitDate)}</span></div><div class="stars">${stars}</div><p>${esc(review.Content)}</p></article>`;
}

async function nomadPage() {
  const query = new URLSearchParams();
  if (state.nomad.q) query.set("q", state.nomad.q);
  if (state.nomad.province) query.set("province", state.nomad.province);
  if (state.nomad.city) query.set("city", state.nomad.city);
  const communities = await api(`/api/nomads?${query}`);
  if (!state.nomads.length) state.nomads = await api("/api/nomads");
  const provinces = [...new Set(state.nomads.map((item) => item.Province))];
  const cities = [...new Set(state.nomads.filter((item) => !state.nomad.province || item.Province === state.nomad.province).map((item) => item.City))];
  return `
    <section class="workspace">
      <div class="page-head"><div><p class="kicker">nomad field</p><h1 class="page-title">游牧社区</h1></div></div>
      <label class="search-wrap"><input class="search" data-nomad-q value="${esc(state.nomad.q)}" placeholder="搜索社区、省份、城市或简介" /></label>
      <div class="filters"><button class="chip chip-0 ${state.nomad.province ? "" : "active-chip"}" data-province="">全部省份</button>${provinces.map((p, i) => `<button class="chip chip-${i % 3} ${state.nomad.province === p ? "active-chip" : ""}" data-province="${esc(p)}">${esc(p)}</button>`).join("")}</div>
      <div class="filters"><button class="chip chip-1 ${state.nomad.city ? "" : "active-chip"}" data-nomad-city="">全部城市</button>${cities.map((c, i) => `<button class="chip chip-${(i + 1) % 3} ${state.nomad.city === c ? "active-chip" : ""}" data-nomad-city="${esc(c)}">${esc(c)}</button>`).join("")}</div>
      ${communities.length ? `<div class="nomad-layout">${communities.map((c) => `<article class="nomad-card"><p class="meta">${esc(c.Province)} / ${esc(c.City)}</p><h3>${esc(c.CommunityName)}</h3><p>${esc(c.Description)}</p><div class="stats"><span class="stat">${c.Capacity} 人</span><span class="stat">¥${c.MonthlyPrice}/月</span></div></article>`).join("")}</div>` : `<div class="empty-state"><p>没有找到对应社区</p><button class="plain-btn" data-clear-nomad>清空筛选</button></div>`}
    </section>
  `;
}

async function mePage() {
  if (!state.user) {
    return `<section class="detail"><div class="profile logged-out"><div><p class="kicker">private field notes</p><h1>建立你的探索档案</h1><p>登录后可以标记想去、已打卡，记录你和城市隐秘角落的相遇。</p></div><button class="primary-btn" data-auth="register">注册/登录</button></div></section>`;
  }
  const favorites = state.meTab === "评价记录" ? [] : await api(`/api/me/favorites?actionType=${encodeURIComponent(state.meTab)}`);
  const reviews = state.meTab === "评价记录" ? await api("/api/me/reviews") : [];
  const trail = await api("/api/me/trail");
  const records = state.meTab === "评价记录"
    ? reviews.length ? reviews.map(reviewCard).join("") : `<div class="empty-state"><p>还没有写过评价</p></div>`
    : favorites.length ? favorites.map((item) => `<a href="#/spaces/${item.SpaceID}" class="record"><div><strong>${esc(item.SpaceName)}</strong>${categoryChips(item.Categories)}</div><time>${item.ActionType === "想去" ? "标记于" : "抵达于"} ${esc(item.ActionDate)}</time></a>`).join("") : `<div class="empty-state"><p>${state.meTab === "想去" ? "还没有标记想去的空间" : "还没有已打卡的空间"}</p></div>`;
  return `
    <section class="detail">
      <div class="profile"><div><p class="kicker">private field notes</p><h1>${esc(state.user.Username)}</h1><div class="chip-row">${chip(state.user.UserType, 0)}${chip(`${age(state.user.BirthDate)}岁`, 1)}${chip(state.user.Gender, 2)}${chip(state.user.HomeCity, 0)}${chip(`注册于 ${state.user.RegisterDate}`, 1)}</div></div><button class="plain-btn" data-logout>退出登录</button></div>
      <div class="me-grid"><div class="trail-map">${trail.map((item) => `<a href="#/spaces/${item.SpaceID}" class="map-dot ${item.ActionType === "已打卡" ? "dot-done" : "dot-want"}" style="${dotPosition(item)}" title="${esc(item.SpaceName)}"></a>`).join("")}</div><section class="side-note records"><div class="record-tabs">${["想去", "已打卡", "评价记录"].map((tab) => `<button class="${state.meTab === tab ? "active" : ""}" data-me-tab="${tab}">${tab}</button>`).join("")}</div>${records}</section></div>
    </section>
  `;
}

function age(birthDate) {
  const birth = new Date(birthDate), now = new Date();
  let value = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) value--;
  return value;
}

function authModal(mode = "login", error = "") {
  const registerFields = mode === "register" ? `
    <label>确认密码<input name="confirmPassword" type="password" /></label>
    <div class="form-grid"><label>性别<select name="gender"><option>女</option><option>男</option><option>非二元</option></select></label><label>出生日期<input name="birthDate" type="date" /></label></div>
    <div class="form-grid"><label>身份<select name="userType"><option>探索者</option><option>创作者</option><option>游民</option></select></label><label>所在城市<input name="homeCity" placeholder="上海" /></label></div>
  ` : "";
  document.body.insertAdjacentHTML("beforeend", `
    <div class="modal-backdrop" data-modal-close>
      <section class="modal" data-modal>
        <div class="modal-head"><div><p class="kicker">private access</p><h2>${mode === "login" ? "登录隐角" : "注册探索档案"}</h2></div><button class="icon-btn" type="button" data-modal-close>×</button></div>
        <form class="auth-form" data-auth-form="${mode}">
          <label>用户名<input name="username" autocomplete="username" /></label>
          <label>密码<input name="password" type="password" /></label>
          ${registerFields}
          ${error ? `<p class="form-error">${esc(error)}</p>` : ""}
          <button class="primary-btn">${mode === "login" ? "登录" : "确认注册"}</button>
        </form>
        <button class="switch-auth" data-auth-switch="${mode === "login" ? "register" : "login"}">${mode === "login" ? "还没有账号？注册一个" : "已有账号？返回登录"}</button>
      </section>
    </div>
  `);
}

function reviewModal(spaceId, error = "") {
  const today = new Date().toISOString().slice(0, 10);
  document.body.insertAdjacentHTML("beforeend", `
    <div class="modal-backdrop" data-modal-close>
      <section class="modal" data-modal>
        <div class="modal-head"><h2>留下评价</h2><button class="icon-btn" type="button" data-modal-close>×</button></div>
        <form class="auth-form" data-review-form="${spaceId}">
          <label>评分<input name="rating" type="range" min="1" max="5" value="5" /></label>
          <div class="rating-hint"><span>1</span><strong>5</strong></div>
          <label>到访日期<input name="visitDate" type="date" value="${today}" required /></label>
          <label>评价内容<textarea name="content" rows="4" required placeholder="写下你和这个空间的相遇"></textarea></label>
          ${error ? `<p class="form-error">${esc(error)}</p>` : ""}
          <button class="primary-btn">确认添加</button>
        </form>
      </section>
    </div>
  `);
}

async function render() {
  try {
    state.route = location.hash.replace("#", "") || "/";
    app.innerHTML = loadingPage();
    await ensureBaseData();
    let content = "";
    if (state.route === "/") content = mapPage();
    else if (state.route === "/atlas") content = await atlasPage();
    else if (state.route.startsWith("/spaces/")) content = await detailPage(state.route.split("/").pop());
    else if (state.route === "/nomads") content = await nomadPage();
    else if (state.route === "/me") content = await mePage();
    else content = mapPage();
    app.innerHTML = `${nav()}${content}${notice()}`;
  } catch (error) {
    app.innerHTML = errorPage(error.message || "页面加载失败，请稍后重试");
  }
}

function closeModal() {
  document.querySelector(".modal-backdrop")?.remove();
}

document.addEventListener("click", async (event) => {
  if (event.target.classList?.contains("modal-backdrop")) {
    closeModal();
    return;
  }
  const target = event.target.closest("button, a");
  if (!target) return;
  if (target.dataset.go) location.hash = target.dataset.go;
  if (target.dataset.mapZoom) zoomMap(target.dataset.mapZoom);
  if (target.dataset.mapReset !== undefined) { state.map.zoom = 1; state.map.x = 0; state.map.y = 0; applyMapTransform(); }
  if (target.dataset.auth) authModal(target.dataset.auth);
  if (target.dataset.authSwitch) { closeModal(); authModal(target.dataset.authSwitch); }
  if (target.dataset.modalClose !== undefined && !event.target.closest("[data-modal]")) closeModal();
  if (target.matches("[data-modal-close]")) closeModal();
  if (target.dataset.retry !== undefined) render();
  if (target.dataset.logout !== undefined) { await api("/api/auth/logout", { method: "POST" }); state.user = null; setNotice("已退出登录"); render(); }
  if (target.dataset.category !== undefined) { state.atlas.categoryId = state.atlas.categoryId === target.dataset.category ? "" : target.dataset.category; render(); }
  if (target.dataset.city !== undefined) { state.atlas.city = target.dataset.city; render(); }
  if (target.dataset.toggleList !== undefined) { state.atlas.list = !state.atlas.list; render(); }
  if (target.dataset.clearAtlas !== undefined) { state.atlas = { q: "", city: "", categoryId: "", list: state.atlas.list }; render(); }
  if (target.dataset.province !== undefined) { state.nomad.province = target.dataset.province; state.nomad.city = ""; render(); }
  if (target.dataset.nomadCity !== undefined) { state.nomad.city = target.dataset.nomadCity; render(); }
  if (target.dataset.clearNomad !== undefined) { state.nomad = { q: "", province: "", city: "" }; render(); }
  if (target.dataset.meTab) { state.meTab = target.dataset.meTab; render(); }
  if (target.dataset.mark) {
    if (!state.user) return authModal("login", "请先登录后再继续");
    await api("/api/favorites", { method: "POST", body: JSON.stringify({ spaceId: Number(target.dataset.space), actionType: target.dataset.mark }) });
    setNotice(`已标记为${target.dataset.mark}`);
    render();
  }
  if (target.dataset.review) {
    if (!state.user) return authModal("login", "请先登录后再继续");
    reviewModal(target.dataset.review);
  }
});

document.addEventListener("mouseover", (event) => {
  const dot = event.target.closest("[data-preview]");
  if (!dot) return;
  const space = state.spaces.find((item) => String(item.SpaceID) === String(dot.dataset.preview));
  const card = document.querySelector("#hover-card");
  if (space && card) card.innerHTML = `<p class="kicker">hover preview</p><h3>${esc(space.SpaceName)}</h3><div class="chip-row">${chip(space.City, 0)}${space.Categories.slice(0, 2).map((c, i) => chip(c.CategoryName, i + 1)).join("")}</div>`;
});

document.addEventListener("wheel", (event) => {
  if (!event.target.closest(".map-hero")) return;
  event.preventDefault();
  zoomMap(event.deltaY < 0 ? "in" : "out");
}, { passive: false });

document.addEventListener("pointerdown", (event) => {
  if (!event.target.closest(".map-hero") || event.target.closest("button, a, input, textarea, select")) return;
  state.map.dragging = true;
  state.map.startX = event.clientX;
  state.map.startY = event.clientY;
  state.map.originX = state.map.x;
  state.map.originY = state.map.y;
});

document.addEventListener("pointermove", (event) => {
  if (!state.map.dragging) return;
  state.map.x = state.map.originX + event.clientX - state.map.startX;
  state.map.y = state.map.originY + event.clientY - state.map.startY;
  applyMapTransform();
});

document.addEventListener("pointerup", () => {
  state.map.dragging = false;
});

document.addEventListener("input", (event) => {
  if (event.target.matches("[data-atlas-q]")) {
    state.atlas.q = event.target.value;
    clearTimeout(window.atlasTimer);
    window.atlasTimer = setTimeout(render, 250);
  }
  if (event.target.matches("[data-nomad-q]")) {
    state.nomad.q = event.target.value;
    clearTimeout(window.nomadTimer);
    window.nomadTimer = setTimeout(render, 250);
  }
});

document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (form.dataset.authForm) {
    event.preventDefault();
    const mode = form.dataset.authForm;
    const payload = Object.fromEntries(new FormData(form).entries());
    try {
      state.user = await api(mode === "login" ? "/api/auth/login" : "/api/auth/register", { method: "POST", body: JSON.stringify(payload) });
      closeModal();
      setNotice(mode === "login" ? "登录成功" : "注册成功");
      if (mode === "register") location.hash = "/me";
      render();
    } catch (error) {
      closeModal();
      authModal(mode, error.message);
    }
  }
  if (form.dataset.reviewForm) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.spaceId = Number(form.dataset.reviewForm);
    try {
      await api("/api/favorites", { method: "POST", body: JSON.stringify({ spaceId: payload.spaceId, actionType: "已打卡" }) });
      await api("/api/reviews", { method: "POST", body: JSON.stringify(payload) });
      closeModal();
      setNotice("评价已保存");
      render();
    } catch (error) {
      closeModal();
      reviewModal(payload.spaceId, error.message);
    }
  }
});

window.addEventListener("hashchange", render);

api("/api/auth/me").then((user) => { state.user = user; }).finally(render);
