import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, NavLink, Route, Routes, useNavigate, useParams } from "react-router-dom";
import * as echarts from "echarts";

type Category = {
  CategoryID: number;
  CategoryName: string;
  CategoryDesc?: string;
};

type Space = {
  SpaceID: number;
  SpaceName: string;
  City: string;
  Address: string;
  Description: string;
  Longitude: number;
  Latitude: number;
  Categories: Category[];
};

type ChinaGeoJson = Record<string, unknown>;

type Review = {
  ReviewID: number;
  Rating: number;
  Content: string;
  VisitDate: string;
  Username?: string;
  SpaceID?: number;
  SpaceName?: string;
  City?: string;
};

type Activity = {
  ActivityID: number;
  ActivityName: string;
  ActivityDate: string;
  PushLink: string;
};

type SpaceDetail = Space & {
  AverageRating: number | null;
  ReviewCount: number;
  CurrentUserFavorite: Favorite | null;
  Reviews: Review[];
  Activities: Activity[];
};

type NomadCommunity = {
  CommunityID: number;
  CommunityName: string;
  Province: string;
  City: string;
  Description: string;
  Capacity: number;
  MonthlyPrice: number;
};

type User = {
  UserID: number;
  Username: string;
  Gender: string;
  BirthDate: string;
  HomeCity: string;
  UserType: string;
  RegisterDate: string;
};

type Favorite = {
  FavoriteID?: number;
  ActionType: "想去" | "已打卡";
  ActionDate: string;
  SpaceID?: number;
  SpaceName?: string;
  City?: string;
  Address?: string;
  Longitude?: number;
  Latitude?: number;
  Categories?: Category[];
};

type AuthMode = "login" | "register";

type MapPreview = {
  space: Space;
  left: number;
  top: number;
};

const markerPalette = ["#fbf1d7", "#fad6b5", "#faadac", "#fcdfe5", "#daf1ee", "#b6e3e7"];
const MAP_MIN_ZOOM = .72;
const MAP_MAX_ZOOM = 18;
const PUBLIC_CACHE_TTL = 10 * 60 * 1000;
const publicCache = new Map<string, { expiresAt: number; value: unknown }>();
const publicInFlight = new Map<string, Promise<unknown>>();

const introAccordionItems = [
  {
    title: "潜入地图",
    body: "通过缩放地图，在城市中漫游，与一个个空间相遇"
  },
  {
    title: "展开卷角",
    body: "浏览详细图鉴档案，收录了100+个替代性第三空间与数字游民社区"
  },
  {
    title: "留下脚印",
    body: "上传、标记、评论替代性第三空间，建立你的个人探索档案"
  }
];

async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const shouldCache = method === "GET" && isPublicCacheable(url);
  const cached = shouldCache ? publicCache.get(url) : null;

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as T;
  }

  const inFlight = shouldCache ? publicInFlight.get(url) : null;
  if (inFlight) {
    return inFlight as Promise<T>;
  }

  const request = requestApi<T>(url, options);

  if (shouldCache) {
    publicInFlight.set(url, request);
    request
      .then((value) => {
        publicCache.set(url, { value, expiresAt: Date.now() + PUBLIC_CACHE_TTL });
      })
      .finally(() => {
        publicInFlight.delete(url);
      });
  }

  return request;
}

async function requestApi<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    },
    ...options
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: "操作失败，请稍后重试" }));
    throw new Error(payload.message ?? "操作失败，请稍后重试");
  }

  return response.json() as Promise<T>;
}

function isPublicCacheable(url: string) {
  const [path, query = ""] = url.split("?");

  if (path === "/china.json" || path === "/api/categories" || path === "/api/nomads" || path === "/api/spaces") {
    return true;
  }

  return (path === "/api/spaces" || path === "/api/nomads") && query.length > 0;
}

function prefetchPublicData() {
  void api<ChinaGeoJson>("/china.json").catch(() => undefined);
  void api<Category[]>("/api/categories").catch(() => undefined);
  void api<Space[]>("/api/spaces").catch(() => undefined);
  void api<NomadCommunity[]>("/api/nomads").catch(() => undefined);
}

function useAsync<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    loader()
      .then((value) => {
        if (alive) setData(value);
      })
      .catch((err: Error) => {
        if (alive) setError(err.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, deps);

  return { data, setData, loading, error };
}

function categoryClass(index: number) {
  return `chip chip-${index % 6}`;
}

function categoryColorClass(category: Pick<Category, "CategoryID">, fallbackIndex = 0) {
  return category.CategoryID > 0 ? categoryClass(category.CategoryID - 1) : categoryClass(fallbackIndex);
}

function CategoryChips({ categories }: { categories: Category[] }) {
  return (
    <div className="chip-row">
      {categories.map((category, index) => (
        <span className={categoryColorClass(category, index)} key={`${category.CategoryID}-${category.CategoryName}`} title={category.CategoryDesc}>
          {category.CategoryName}
        </span>
      ))}
    </div>
  );
}

function buildMapPointData(spaces: Space[]) {
  return spaces.map((space, index) => {
    const categoryKey = space.Categories[0]?.CategoryID ? space.Categories[0].CategoryID - 1 : index;

    return {
      name: space.SpaceName,
      value: [space.Longitude, space.Latitude, index],
      space,
      symbolSize: 9,
      itemStyle: {
        color: markerPalette[Math.abs(categoryKey) % markerPalette.length]
      }
    };
  });
}

function EmptyState({ text, action, onAction }: { text: string; action?: string; onAction?: () => void }) {
  return (
    <div className="empty-state">
      <p>{text}</p>
      {action && <button className="plain-btn" onClick={onAction}>{action}</button>}
    </div>
  );
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");

  useEffect(() => {
    api<User | null>("/api/auth/me").then(setUser).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    let timeoutId: number | null = null;
    let idleId: number | null = null;

    if ("requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(prefetchPublicData, { timeout: 1800 });
    } else {
      timeoutId = globalThis.setTimeout(prefetchPublicData, 500);
    }

    return () => {
      if (idleId !== null && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }

      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
      }
    };
  }, []);

  function openAuth(mode: AuthMode = "login") {
    setAuthMode(mode);
    setAuthOpen(true);
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
  }

  return (
    <div className="shell">
      <NavBar user={user} openAuth={openAuth} logout={logout} />
      <main>
        <Routes>
          <Route path="/" element={<MapPage />} />
          <Route path="/atlas" element={<AtlasPage />} />
          <Route path="/spaces/:id" element={<SpaceDetailPage user={user} openAuth={openAuth} />} />
          <Route path="/nomads" element={<NomadPage />} />
          <Route path="/me" element={<MePage user={user} openAuth={openAuth} logout={logout} />} />
        </Routes>
      </main>
      {authOpen && (
        <AuthModal
          mode={authMode}
          setMode={setAuthMode}
          close={() => setAuthOpen(false)}
          onAuthed={(nextUser) => {
            setUser(nextUser);
            setAuthOpen(false);
          }}
        />
      )}
    </div>
  );
}

function NavBar({ user, openAuth, logout }: { user: User | null; openAuth: (mode?: AuthMode) => void; logout: () => void }) {
  return (
    <header className="nav">
      <Link to="/" className="brand">
        <img src="/logo.png" alt="隐角 logo" />
        <span>
          隐角 Hidden Corners
          <small>spatial field notes</small>
        </span>
      </Link>
      <nav className="tabs" onMouseEnter={prefetchPublicData} onFocus={prefetchPublicData}>
        <NavLink to="/">地图</NavLink>
        <NavLink to="/atlas">图鉴</NavLink>
        <NavLink to="/nomads">游牧</NavLink>
        <NavLink to="/me">我的</NavLink>
      </nav>
      {user ? (
        <div className="account-actions">
          <Link to="/me" className="account-link">
            <span className="account-name">{user.Username}</span>
            <small>个人档案</small>
          </Link>
          <button className="logout-btn" onClick={logout}>退出</button>
        </div>
      ) : (
        <button className="login-btn" onClick={() => openAuth("login")}>登录</button>
      )}
    </header>
  );
}

function AuthModal({ mode, setMode, close, onAuthed }: {
  mode: AuthMode;
  setMode: (mode: AuthMode) => void;
  close: () => void;
  onAuthed: (user: User) => void;
}) {
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());

    try {
      const user = await api<User>(mode === "login" ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      onAuthed(user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <section className="modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <p className="kicker">private access</p>
            <h2>{mode === "login" ? "登录隐角" : "注册探索档案"}</h2>
          </div>
          <button className="icon-btn" onClick={close}>×</button>
        </div>
        <form onSubmit={submit} className="auth-form">
          <label>用户名<input name="username" autoComplete="username" /></label>
          <label>密码<input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>
          {mode === "register" && (
            <>
              <label>确认密码<input name="confirmPassword" type="password" /></label>
              <div className="form-grid">
                <label>性别<select name="gender" defaultValue="女"><option>女</option><option>男</option><option>非二元</option></select></label>
                <label>出生日期<input name="birthDate" type="date" /></label>
              </div>
              <div className="form-grid">
                <label>身份<select name="userType" defaultValue="探索者"><option>探索者</option><option>创作者</option><option>游民</option></select></label>
                <label>所在城市<input name="homeCity" placeholder="上海" /></label>
              </div>
            </>
          )}
          {error && <p className="form-error">{error}</p>}
          <button className="primary-btn" disabled={submitting}>{submitting ? "处理中..." : mode === "login" ? "登录" : "确认注册"}</button>
        </form>
        <button className="switch-auth" onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "还没有账号？注册一个" : "已有账号？返回登录"}
        </button>
      </section>
    </div>
  );
}

function MapPage() {
  const navigate = useNavigate();
  const { data: spaces, loading } = useAsync<Space[]>(() => api("/api/spaces"), []);
  const { data: chinaMap } = useAsync<ChinaGeoJson>(() => api("/china.json"), []);
  const [hovered, setHovered] = useState<MapPreview | null>(null);
  const [introVisible, setIntroVisible] = useState(false);
  const [openIntroItem, setOpenIntroItem] = useState(0);
  const heroRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);
  const hidePreviewTimerRef = useRef<number | null>(null);

  function cancelPreviewHide() {
    if (hidePreviewTimerRef.current) {
      window.clearTimeout(hidePreviewTimerRef.current);
      hidePreviewTimerRef.current = null;
    }
  }

  function schedulePreviewHide() {
    cancelPreviewHide();
    hidePreviewTimerRef.current = window.setTimeout(() => {
      setHovered(null);
      hidePreviewTimerRef.current = null;
    }, 520);
  }

  function showPreview(space: Space, event?: { offsetX?: number; offsetY?: number }) {
    cancelPreviewHide();
    const chartRect = chartRef.current?.getBoundingClientRect();
    const heroRect = heroRef.current?.getBoundingClientRect();

    if (!chartRect || !heroRect || typeof event?.offsetX !== "number" || typeof event?.offsetY !== "number") {
      setHovered({ space, left: 24, top: 24 });
      return;
    }

    const cardWidth = Math.min(360, heroRect.width - 36);
    const cardHeight = 178;
    const rawLeft = chartRect.left - heroRect.left + event.offsetX + 20;
    const rawTop = chartRect.top - heroRect.top + event.offsetY - 18;
    const left = Math.max(18, Math.min(rawLeft, heroRect.width - cardWidth - 18));
    const top = Math.max(18, Math.min(rawTop, heroRect.height - cardHeight - 18));
    setHovered({ space, left, top });
  }

  useEffect(() => () => cancelPreviewHide(), []);

  useEffect(() => {
    function updateIntroVisibility() {
      const threshold = Math.max(180, (heroRef.current?.offsetHeight ?? 0) * .3);
      setIntroVisible(window.scrollY > threshold);
    }

    updateIntroVisibility();
    window.addEventListener("scroll", updateIntroVisibility, { passive: true });
    window.addEventListener("resize", updateIntroVisibility);
    return () => {
      window.removeEventListener("scroll", updateIntroVisibility);
      window.removeEventListener("resize", updateIntroVisibility);
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current || !chinaMap || !spaces?.length) return;

    echarts.registerMap("hidden-china", chinaMap as never);

    const chart = echarts.getInstanceByDom(chartRef.current) ?? echarts.init(chartRef.current, undefined, { renderer: "canvas" });
    const pointData = buildMapPointData(spaces);
    chartInstanceRef.current = chart;
    chart.setOption({
      backgroundColor: "transparent",
      tooltip: {
        show: false
      },
      geo: {
        map: "hidden-china",
        roam: true,
        zoom: 1,
        scaleLimit: { min: MAP_MIN_ZOOM, max: MAP_MAX_ZOOM },
        layoutCenter: ["52%", "53%"],
        layoutSize: "94%",
        aspectScale: .82,
        label: { show: false },
        itemStyle: {
          areaColor: "#DEF1D0",
          borderColor: "rgba(111, 127, 47, .35)",
          borderWidth: 1
        },
        emphasis: {
          label: { show: false },
          itemStyle: {
            areaColor: "#CDEBF1",
            borderColor: "rgba(95, 110, 44, .42)"
          }
        }
      },
      series: [{
        name: "隐藏空间",
        type: "scatter",
        coordinateSystem: "geo",
        cursor: "pointer",
        zlevel: 2,
        itemStyle: {
          color: "#fad6b5",
          borderColor: "rgba(95, 110, 44, .62)",
          borderWidth: 2,
          shadowBlur: 18,
          shadowColor: "rgba(95, 110, 44, .22)"
        },
        emphasis: {
          scale: 1.65,
          itemStyle: {
            borderColor: "#FDF8E2",
            borderWidth: 3,
            shadowBlur: 26,
            shadowColor: "rgba(223, 163, 111, .5)"
          }
        },
        data: pointData
      }]
    }, true);

    const handleMouseOver = (params: any) => {
      if (params.componentSubType === "scatter" && params.data?.space) {
        showPreview(params.data.space, params.event);
      }
    };

    const handleMouseOut = (params: any) => {
      if (params.componentSubType === "scatter" && params.data?.space) {
        schedulePreviewHide();
      }
    };

    const handleClick = (params: any) => {
      if (params.componentSubType === "scatter" && params.data?.space) {
        navigate(`/spaces/${params.data.space.SpaceID}`);
      }
    };

    const handleRoam = () => setHovered(null);
    const resize = () => chart.resize();
    chart.off("mouseover");
    chart.off("mouseout");
    chart.off("globalout");
    chart.off("georoam");
    chart.off("click");
    chart.on("mouseover", handleMouseOver);
    chart.on("mouseout", handleMouseOut);
    chart.on("globalout", schedulePreviewHide);
    chart.on("georoam", handleRoam);
    chart.on("click", handleClick);
    window.addEventListener("resize", resize);

    return () => {
      chart.off("mouseover", handleMouseOver);
      chart.off("mouseout", handleMouseOut);
      chart.off("globalout", schedulePreviewHide);
      chart.off("georoam", handleRoam);
      chart.off("click", handleClick);
      window.removeEventListener("resize", resize);
    };
  }, [chinaMap, navigate, spaces]);

  function zoom(direction: "in" | "out") {
    const chart = chartInstanceRef.current;
    if (!chart) return;

    const option = chart.getOption() as { geo?: Array<{ zoom?: number }> };
    const currentZoom = Number(option.geo?.[0]?.zoom ?? 1);
    const nextZoom = Math.max(MAP_MIN_ZOOM, Math.min(MAP_MAX_ZOOM, currentZoom * (direction === "in" ? 1.28 : .78)));

    chart.setOption({
      geo: {
        zoom: nextZoom
      }
    });
    setHovered(null);
  }

  function resetMap() {
    chartInstanceRef.current?.setOption({
      geo: {
        zoom: 1,
        center: undefined,
        layoutCenter: ["52%", "53%"],
        layoutSize: "94%"
      }
    });
    setHovered(null);
  }

  return (
    <section className="map-page">
      <div className="map-hero" ref={heroRef}>
        <div className="map-copy">
          <p className="kicker">001 / hidden map</p>
          <h1>在城市缝隙里，重新找到公共生活。</h1>
          <p>这里收录那些没有被流量推到眼前，却真实承载青年文化、独立创作和邻里连接的空间。</p>
        </div>
        <div className="abstract-map" aria-label="空间地图">
          <div ref={chartRef} className="echarts-map" />
          {(!chinaMap || loading) && <div className="map-loading">地图边界加载中</div>}
        </div>
        <div className="map-tools" aria-label="地图控制">
          <button type="button" onClick={() => zoom("in")}>＋</button>
          <button type="button" onClick={() => zoom("out")}>－</button>
          <button type="button" onClick={resetMap}>reset</button>
        </div>
        {hovered && (
          <Link
            to={`/spaces/${hovered.space.SpaceID}`}
            className="hover-card"
            style={{ left: hovered.left, top: hovered.top }}
            onMouseEnter={cancelPreviewHide}
            onMouseLeave={schedulePreviewHide}
            onFocus={cancelPreviewHide}
            onBlur={schedulePreviewHide}
          >
            <p className="kicker">hover preview</p>
            <h3>{hovered.space.SpaceName}</h3>
            <p className="hover-city">{hovered.space.City}</p>
            <CategoryChips categories={hovered.space.Categories} />
          </Link>
        )}
      </div>
      <section className={`site-intro ${introVisible ? "intro-visible" : ""}`}>
        <article className="intro-panel intro-welcome">
          <p className="kicker">welcome</p>
          <h2>寻找城市的替代性第三空间<br />——隐角 Hidden Corners，青年文化替代性第三空间图鉴系统</h2>
        </article>
        <article className="intro-panel intro-concept">
          <p className="kicker">concept</p>
          <h2>设计理念</h2>
          <p>社会学家雷·奥登伯格将「第三空间」定义为家庭与工作之外的非正式公共聚集地，但在当代都市的内卷与景观化下，它们已被商业逻辑吞噬，沦为充满隐性压力的场景。「替代性空间」的构想应运而生，这个概念原指独立于主流美术馆、画廊等体制外的艺术家自发创建的另类展览、活动或交流空间，常用于实验性、先锋性艺术实践。在这个网站中，我们用「替代性第三空间」来指代那些游离于主流城市秩序之外、未经规训的边缘地带：独立书店、音乐现场、艺术空间······这些空间以反叛与自由的姿态，为都市青年提供精神庇护与连结。「隐角Hidden Corners」网站致力于以图鉴的形式，将这些散落的物理坐标重新聚合，为当代都市青年提供一份兼具实用指南价值与社会学观察意义的空间导览系统。</p>
        </article>
        <article className="intro-panel intro-actions">
          <p className="kicker">explore</p>
          <h2>功能探索</h2>
          <div className="accordion">
            {introAccordionItems.map((item, index) => (
              <div className={`accordion-item ${openIntroItem === index ? "open" : ""}`} key={item.title}>
                <button type="button" onClick={() => setOpenIntroItem(openIntroItem === index ? -1 : index)}>
                  <span>{item.title}</span>
                  <span aria-hidden="true">{openIntroItem === index ? "－" : "＋"}</span>
                </button>
                <p>{item.body}</p>
              </div>
            ))}
          </div>
        </article>
      </section>
    </section>
  );
}

function AtlasPage() {
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [listMode, setListMode] = useState(false);
  const query = new URLSearchParams();
  if (q) query.set("q", q);
  if (city) query.set("city", city);
  if (categoryId) query.set("categoryId", String(categoryId));
  const { data: spaces, loading, error } = useAsync<Space[]>(() => api(`/api/spaces?${query}`), [q, city, categoryId]);
  const { data: categories } = useAsync<Category[]>(() => api("/api/categories"), []);
  const allSpaces = useAsync<Space[]>(() => api("/api/spaces"), []);
  const cities = [...new Set((allSpaces.data ?? []).map((space) => space.City))].slice(0, 16);

  function clearFilters() {
    setQ("");
    setCity("");
    setCategoryId(null);
  }

  return (
    <section className="workspace">
      <div className="page-head">
        <div>
          <p className="kicker">atlas index</p>
          <h1 className="page-title">空间图鉴</h1>
        </div>
        <button className="plain-btn" onClick={() => setListMode((value) => !value)}><span aria-hidden="true">{listMode ? "▦" : "☰"}</span>{listMode ? "卡片" : "列表"}</button>
      </div>
      <label className="search-wrap"><span className="search-icon" aria-hidden="true">⌕</span><input className="search" value={q} onChange={(event) => setQ(event.target.value)} placeholder="搜索空间、城市、简介或分类" /></label>
      <div className="filters">
        {(categories ?? []).map((category, index) => (
          <button
            className={`${categoryColorClass(category, index)} ${categoryId === category.CategoryID ? "active-chip" : ""}`}
            key={category.CategoryID}
            title={category.CategoryDesc}
            onClick={() => setCategoryId(categoryId === category.CategoryID ? null : category.CategoryID)}
          >
            {category.CategoryName}
          </button>
        ))}
      </div>
      <div className="content-grid">
        <aside className="cities">
          <button className={!city ? "active" : ""} onClick={() => setCity("")}>全部城市</button>
          {cities.map((item) => <button className={city === item ? "active" : ""} onClick={() => setCity(item)} key={item}>{item}</button>)}
        </aside>
        <section className={listMode ? "space-list" : "cards"}>
          {loading && <EmptyState text="正在翻找图鉴..." />}
          {error && <EmptyState text={error} />}
          {!loading && !error && spaces?.length === 0 && <EmptyState text="没有找到对应空间" action="清空筛选" onAction={clearFilters} />}
          {(spaces ?? []).map((space) => listMode ? <SpaceListItem space={space} key={space.SpaceID} /> : <SpaceCard space={space} key={space.SpaceID} />)}
        </section>
      </div>
    </section>
  );
}

function SpaceCard({ space }: { space: Space }) {
  return (
    <Link to={`/spaces/${space.SpaceID}`} className="space-card">
      <div>
        <p className="meta">{space.City} / #{space.SpaceID.toString().padStart(3, "0")}</p>
        <h3>{space.SpaceName}</h3>
        <p>{space.Address}</p>
      </div>
      <CategoryChips categories={space.Categories.slice(0, 3)} />
    </Link>
  );
}

function SpaceListItem({ space }: { space: Space }) {
  return (
    <Link to={`/spaces/${space.SpaceID}`} className="space-row">
      <strong>{space.SpaceName}</strong>
      <span>{space.City}</span>
      <CategoryChips categories={space.Categories.slice(0, 3)} />
    </Link>
  );
}

function SpaceDetailPage({ user, openAuth }: { user: User | null; openAuth: (mode?: AuthMode) => void }) {
  const { id } = useParams();
  const [refreshKey, setRefreshKey] = useState(0);
  const [reviewOpen, setReviewOpen] = useState(false);
  const { data: detail, loading, error } = useAsync<SpaceDetail>(() => api(`/api/spaces/${id}`), [id, refreshKey]);

  async function mark(actionType: "想去" | "已打卡") {
    if (!user) {
      openAuth("login");
      return;
    }
    await api("/api/favorites", { method: "POST", body: JSON.stringify({ spaceId: Number(id), actionType }) });
    setRefreshKey((value) => value + 1);
  }

  if (loading) return <section className="detail"><EmptyState text="正在读取空间档案..." /></section>;
  if (error || !detail) return <section className="detail"><EmptyState text={error || "没有找到对应空间"} /></section>;

  return (
    <section className="detail">
      <div className="detail-hero">
        <div>
          <p className="kicker">{detail.City} / hidden corner</p>
          <h1>{detail.SpaceName}</h1>
          <CategoryChips categories={[{ CategoryID: -1, CategoryName: detail.Address }, ...detail.Categories]} />
        </div>
        <div className="score-box">
          <span>average resonance</span>
          <div className="score">{detail.AverageRating ?? "暂无"}</div>
          <small>{detail.ReviewCount ? `${detail.ReviewCount} 条评价` : "暂无评分"}</small>
        </div>
      </div>
      <div className="detail-body">
        <article>
          <p className="description">{detail.Description}</p>
          <section className="activity-block">
            <h2>近期活动</h2>
            {detail.Activities.length === 0 && <EmptyState text="暂无活动记录" />}
            {detail.Activities.map((activity) => (
              <div className="activity" key={activity.ActivityID}>
                <span>{activity.ActivityName}</span>
                <time>{activity.ActivityDate}</time>
                <a href={activity.PushLink} target="_blank" rel="noreferrer">推文链接</a>
              </div>
            ))}
          </section>
        </article>
        <aside className="side-stack">
          <div className="status">
            <button className={`want ${detail.CurrentUserFavorite?.ActionType === "想去" ? "selected" : ""}`} onClick={() => mark("想去")}>想去</button>
            <button className={`done ${detail.CurrentUserFavorite?.ActionType === "已打卡" ? "selected" : ""}`} onClick={() => mark("已打卡")}>已打卡</button>
          </div>
          <button className="primary-btn" onClick={() => user ? setReviewOpen(true) : openAuth("login")}>添加评价</button>
          <section className="side-note">
            <h2>空间评价</h2>
            {detail.Reviews.length === 0 && <EmptyState text="还没有人留下评价" />}
            {detail.Reviews.map((review) => <ReviewCard review={review} key={review.ReviewID} />)}
          </section>
        </aside>
      </div>
      {reviewOpen && (
        <ReviewModal
          spaceId={detail.SpaceID}
          close={() => setReviewOpen(false)}
          saved={() => {
            setReviewOpen(false);
            setRefreshKey((value) => value + 1);
          }}
        />
      )}
    </section>
  );
}

function ReviewCard({ review }: { review: Review }) {
  return (
    <article className="review-card">
      <div className="review-top">
        <strong>{review.Username ?? review.SpaceName}</strong>
        <span>{review.VisitDate}</span>
      </div>
      <div className="stars">{Array.from({ length: 5 }, (_, index) => <span key={index}>{index < review.Rating ? "★" : "☆"}</span>)}</div>
      <p>{review.Content}</p>
    </article>
  );
}

function ReviewModal({ spaceId, close, saved }: { spaceId: number; close: () => void; saved: () => void }) {
  const [error, setError] = useState("");
  const [rating, setRating] = useState(5);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/favorites", { method: "POST", body: JSON.stringify({ spaceId, actionType: "已打卡" }) });
      await api("/api/reviews", {
        method: "POST",
        body: JSON.stringify({
          spaceId,
          rating,
          content: form.get("content"),
          visitDate: form.get("visitDate")
        })
      });
      saved();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <section className="modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head"><h2>留下评价</h2><button className="icon-btn" onClick={close}>×</button></div>
        <form className="auth-form" onSubmit={submit}>
          <fieldset className="rating-field">
            <legend>评分</legend>
            <div className="star-picker" aria-label={`${rating} 星评分`}>
              {Array.from({ length: 5 }, (_, index) => {
                const value = index + 1;
                return (
                  <button
                    type="button"
                    className={value <= rating ? "selected" : ""}
                    aria-label={`${value} 星`}
                    aria-pressed={value === rating}
                    onClick={() => setRating(value)}
                    key={value}
                  >
                    ★
                  </button>
                );
              })}
            </div>
          </fieldset>
          <label>到访日期<input type="date" name="visitDate" required /></label>
          <label>评价内容<textarea name="content" rows={4} required placeholder="写下你和这个空间的相遇" /></label>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-btn">确认添加</button>
        </form>
      </section>
    </div>
  );
}

function NomadPage() {
  const [q, setQ] = useState("");
  const [province, setProvince] = useState("");
  const [city, setCity] = useState("");
  const query = new URLSearchParams();
  if (q) query.set("q", q);
  if (province) query.set("province", province);
  if (city) query.set("city", city);
  const { data: communities, loading } = useAsync<NomadCommunity[]>(() => api(`/api/nomads?${query}`), [q, province, city]);
  const all = useAsync<NomadCommunity[]>(() => api("/api/nomads"), []);
  const provinces = [...new Set((all.data ?? []).map((item) => item.Province))];
  const cities = [...new Set((all.data ?? []).filter((item) => !province || item.Province === province).map((item) => item.City))];

  return (
    <section className="workspace">
      <div className="page-head">
        <div><p className="kicker">nomad field</p><h1 className="page-title">游牧社区</h1></div>
      </div>
      <label className="search-wrap"><span className="search-icon" aria-hidden="true">⌕</span><input className="search" value={q} onChange={(event) => setQ(event.target.value)} placeholder="搜索社区、省份、城市或简介" /></label>
      <div className="filters">
        <button className={`chip chip-0 ${province ? "" : "active-chip"}`} onClick={() => setProvince("")}>全部省份</button>
        {provinces.map((item, index) => <button className={`${categoryClass(index)} ${province === item ? "active-chip" : ""}`} onClick={() => { setProvince(item); setCity(""); }} key={item}>{item}</button>)}
      </div>
      <div className="filters">
        <button className={`chip chip-1 ${city ? "" : "active-chip"}`} onClick={() => setCity("")}>全部城市</button>
        {cities.map((item, index) => <button className={`${categoryClass(index + 1)} ${city === item ? "active-chip" : ""}`} onClick={() => setCity(item)} key={item}>{item}</button>)}
      </div>
      {loading && <EmptyState text="正在读取游牧社区..." />}
      {!loading && communities?.length === 0 && <EmptyState text="没有找到对应社区" action="清空筛选" onAction={() => { setQ(""); setProvince(""); setCity(""); }} />}
      <div className="nomad-layout">
        {(communities ?? []).map((community) => (
          <article className="nomad-card" key={community.CommunityID}>
            <p className="meta">{community.Province} / {community.City}</p>
            <h3>{community.CommunityName}</h3>
            <p>{community.Description}</p>
            <div className="stats"><span className="stat">{community.Capacity} 人</span><span className="stat">¥{community.MonthlyPrice}/月</span></div>
          </article>
        ))}
      </div>
    </section>
  );
}

function UserTrailMap({ trail }: { trail: Favorite[] }) {
  const navigate = useNavigate();
  const { data: chinaMap, loading } = useAsync<ChinaGeoJson>(() => api("/china.json"), []);
  const mapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!mapRef.current || !chinaMap) return;

    echarts.registerMap("hidden-china-trail", chinaMap as never);
    const chart = echarts.getInstanceByDom(mapRef.current) ?? echarts.init(mapRef.current, undefined, { renderer: "canvas" });

    chart.setOption({
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        borderWidth: 0,
        backgroundColor: "rgba(254, 254, 254, .88)",
        textStyle: { color: "#5F6E2C", fontFamily: "Avenir Next, PingFang SC, sans-serif" },
        formatter: (params: { data?: { item?: Favorite } }) => {
          const item = params.data?.item;
          if (!item) return "";
          return `<strong>${item.SpaceName}</strong><br/>${item.City} / ${item.ActionType}`;
        }
      },
      geo: {
        map: "hidden-china-trail",
        roam: true,
        zoom: 1,
        scaleLimit: { min: MAP_MIN_ZOOM, max: MAP_MAX_ZOOM },
        layoutCenter: ["50%", "52%"],
        layoutSize: "92%",
        aspectScale: .82,
        label: { show: false },
        itemStyle: {
          areaColor: "#DEF1D0",
          borderColor: "rgba(111, 127, 47, .35)",
          borderWidth: 1
        },
        emphasis: {
          label: { show: false },
          itemStyle: {
            areaColor: "#CDEBF1"
          }
        }
      },
      series: [{
        name: "个人探索轨迹",
        type: "scatter",
        coordinateSystem: "geo",
        cursor: "pointer",
        zlevel: 2,
        symbolSize: 11,
        itemStyle: {
          borderColor: "rgba(254, 254, 254, .94)",
          borderWidth: 2,
          shadowBlur: 16,
          shadowColor: "rgba(95, 110, 44, .24)"
        },
        emphasis: {
          scale: 1.7
        },
        data: trail
          .filter((item) => Number.isFinite(Number(item.Longitude)) && Number.isFinite(Number(item.Latitude)))
          .map((item) => ({
            name: item.SpaceName,
            value: [Number(item.Longitude), Number(item.Latitude)],
            item,
            itemStyle: {
              color: item.ActionType === "已打卡" ? "#DFA36F" : "#69B8C9"
            }
          }))
      }]
    }, true);

    const handleClick = (params: any) => {
      if (params.componentSubType === "scatter" && params.data?.item?.SpaceID) {
        navigate(`/spaces/${params.data.item.SpaceID}`);
      }
    };

    const resize = () => chart.resize();
    chart.off("click");
    chart.on("click", handleClick);
    window.addEventListener("resize", resize);

    return () => {
      chart.off("click", handleClick);
      window.removeEventListener("resize", resize);
    };
  }, [chinaMap, navigate, trail]);

  return (
    <div className="trail-map" aria-label="个人探索地图">
      <div ref={mapRef} className="trail-echarts-map" />
      {(loading || !chinaMap) && <div className="map-loading">个人地图加载中</div>}
      {!loading && chinaMap && trail.length === 0 && <div className="trail-empty">还没有想去或已打卡的坐标</div>}
      <div className="trail-legend">
        <span><i className="legend-want" />想去</span>
        <span><i className="legend-done" />已打卡</span>
      </div>
    </div>
  );
}

function MePage({ user, openAuth, logout }: { user: User | null; openAuth: (mode?: AuthMode) => void; logout: () => void }) {
  const [tab, setTab] = useState<"想去" | "已打卡" | "评价记录">("想去");
  const favorites = useAsync<Favorite[]>(() => user ? api(`/api/me/favorites?actionType=${encodeURIComponent(tab === "评价记录" ? "" : tab)}`) : Promise.resolve([]), [user?.UserID, tab]);
  const reviews = useAsync<Review[]>(() => user ? api("/api/me/reviews") : Promise.resolve([]), [user?.UserID]);
  const trail = useAsync<Favorite[]>(() => user ? api("/api/me/trail") : Promise.resolve([]), [user?.UserID, favorites.data?.length]);

  if (!user) {
    return (
      <section className="detail">
        <div className="profile logged-out">
          <div>
            <p className="kicker">private field notes</p>
            <h1>建立你的探索档案</h1>
            <p>登录后可以标记想去、已打卡，记录你和城市隐秘角落的相遇。</p>
          </div>
          <button className="primary-btn" onClick={() => openAuth("register")}><span aria-hidden="true">＋</span>注册/登录</button>
        </div>
      </section>
    );
  }

  const activeFavorites = tab === "评价记录" ? [] : (favorites.data ?? []);
  const activeReviews = reviews.data ?? [];

  return (
    <section className="detail">
      <div className="profile">
        <div>
          <p className="kicker">private field notes</p>
          <h1>{user.Username}</h1>
          <div className="chip-row">
            <span className="chip chip-0">{user.UserType}</span>
            <span className="chip chip-1">{ageFromBirthDate(user.BirthDate)}岁</span>
            <span className="chip chip-2">{user.Gender}</span>
            <span className="chip chip-0">{user.HomeCity}</span>
            <span className="chip chip-1">注册于 {user.RegisterDate}</span>
          </div>
        </div>
        <button className="plain-btn" onClick={logout}><span aria-hidden="true">↗</span>退出登录</button>
      </div>
      <div className="me-grid">
        <UserTrailMap trail={trail.data ?? []} />
        <section className="side-note records">
          <div className="record-tabs">
            {(["想去", "已打卡", "评价记录"] as const).map((item) => <button className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}>{item}</button>)}
          </div>
          {tab !== "评价记录" && activeFavorites.length === 0 && <EmptyState text={tab === "想去" ? "还没有标记想去的空间" : "还没有已打卡的空间"} />}
          {tab !== "评价记录" && activeFavorites.map((item) => (
            <Link to={`/spaces/${item.SpaceID}`} className="record" key={item.FavoriteID}>
              <div><strong>{item.SpaceName}</strong><CategoryChips categories={item.Categories ?? []} /></div>
              <time>{item.ActionType === "想去" ? "标记于" : "抵达于"} {item.ActionDate}</time>
            </Link>
          ))}
          {tab === "评价记录" && activeReviews.length === 0 && <EmptyState text="还没有写过评价" />}
          {tab === "评价记录" && activeReviews.map((review) => <ReviewCard review={review} key={review.ReviewID} />)}
        </section>
      </div>
    </section>
  );
}

function ageFromBirthDate(birthDate: string) {
  const birth = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}

export default App;
