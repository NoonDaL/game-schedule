/* 게임 일정 v2 — 공용 데이터·렌더러.
   데이터는 수집기 산출물 그대로 읽는다: ../events.json, ../games.json, ../status.json.
   시각은 전부 KST 로 보여준다. */
(() => {
  "use strict";

  const TZ = "Asia/Seoul";
  const DAY = 86400000;
  const SHOWN = new Set(["banner", "broadcast", "event", "launch"]);
  // 칩·제목에 쓰는 짧은 이름. 없는 게임은 원래 이름 그대로.
  const SHORT = {
    "명조: 워더링 웨이브": "명조", "붕괴: 스타레일": "스타레일", "젠레스 존 제로": "젠레스",
    "명일방주: 엔드필드": "엔드필드", "리버스: 1999": "리버스", "퍼니싱: 그레이 레이븐": "퍼니싱",
    "아주르 프로밀리아": "아주르",
  };
  const MISC = "기타";
  // 게임 색. 게임 이름 글자와, 카드에 올렸을 때 그림 주변 빛에만 쓴다 (넓은 면엔 안 쓴다).
  // 각 게임 대표 그림의 주된 색에서 골랐다. 없는 게임은 기본 글자색.
  const GAME_COLOR = {
    "명조: 워더링 웨이브": "#5ed6c8", "붕괴: 스타레일": "#8fa2ff", "원신": "#f0c46a",
    "젠레스 존 제로": "#c4ee3a", "이환": "#ff7aa6", "명일방주: 엔드필드": "#f2d43a",
    "리버스: 1999": "#e7a165", "퍼니싱: 그레이 레이븐": "#ff6262", "아주르 프로밀리아": "#bd9bff",
  };
  const gcolor = g => GAME_COLOR[g] || "";
  const gvar = g => (gcolor(g) ? `--g:${gcolor(g)};` : "");

  const D = { events: [], games: {}, status: null, order: [], now: new Date() };

  // ---------- 데이터 ----------
  async function getJSON(path) {
    try {
      const r = await fetch(path, { cache: "no-store" });
      return r.ok ? await r.json() : null;
    } catch (e) { return null; }
  }

  async function load() {
    const [ev, games, status] = await Promise.all([
      getJSON("../events.json"), getJSON("../games.json"), getJSON("../status.json")]);
    D.games = games || {};
    D.status = status;
    D.now = new Date();
    D.events = Object.values(ev || {})
      .filter(e => e && SHOWN.has(e.type) && e.start)
      .map(e => {
        const s = new Date(e.start);
        let end = e.end ? new Date(e.end) : null;
        // 방송은 종료가 없다. 두 시간짜리로 본다.
        if (!end && e.type === "broadcast") end = new Date(s.getTime() + 2 * 3600e3);
        return Object.assign({}, e, { s, e: end });
      });
    // 게임 순서: 수집 게임(games.json 순서) → 그 밖의 게임(이터널 리턴 등) → '기타'.
    // 출시 예정에만 있는 게임은 아직 일정이 없으니 게임 목록에 넣지 않는다.
    const known = Object.keys(D.games);
    const extra = [...new Set(D.events.filter(e => e.type !== "launch").map(e => e.game))]
      .filter(g => !known.includes(g) && g !== MISC).sort();
    D.order = known.concat(extra).concat(D.events.some(e => e.game === MISC) ? [MISC] : []);
    return D;
  }

  // ---------- 시각 ----------
  const fmtParts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: TZ, year: "numeric", month: "numeric", day: "numeric",
    weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  function parts(d) {
    const o = {};
    for (const p of fmtParts.formatToParts(d)) o[p.type] = p.value;
    return o;
  }
  function dayKey(d) { const p = parts(d); return `${p.year}-${p.month.padStart(2, "0")}-${p.day.padStart(2, "0")}`; }
  function dayIndex(d) { return Math.floor(Date.parse(dayKey(d) + "T00:00:00Z") / DAY); }
  function dateLabel(d, withTime = true) {
    const p = parts(d);
    const t = `${p.hour}:${p.minute}`;
    const time = withTime && t !== "00:00" ? ` ${t}` : "";
    return `${p.month}.${p.day} (${p.weekday})${time}`;
  }
  function shortDate(d) { const p = parts(d); return `${p.month}.${p.day}`; }

  function isLive(e, now = D.now) { return e.s <= now && (!e.e || e.e > now); }
  function isUpcoming(e, now = D.now) { return e.s > now; }

  // 남은 시간 문구. 사람이 '언제까지/언제부터' 만 보면 되도록 한 줄로.
  function timing(e, now = D.now) {
    if (e.type === "launch") return launchWhen(e);
    if (isUpcoming(e, now)) {
      const dd = dayIndex(e.s) - dayIndex(now);
      const head = dd <= 0 ? "오늘 시작" : dd === 1 ? "내일 시작" : `D-${dd}`;
      return { text: head, sub: `${dateLabel(e.s)} 시작`, hot: dd <= 1 };
    }
    if (e.e && e.e > now) {
      if (e.type === "broadcast") return { text: "방송 중", sub: dateLabel(e.s), hot: true };
      const ms = e.e - now;
      const dd = dayIndex(e.e) - dayIndex(now);
      const text = ms < DAY ? (ms < 3600e3 ? "곧 마감" : `${Math.floor(ms / 3600e3)}시간 남음`)
        : dd === 1 ? "내일 마감" : `${dd}일 남음`;
      return { text, sub: `${dateLabel(e.e)} 마감`, hot: ms < 3 * DAY };
    }
    return { text: "종료", sub: e.e ? `${dateLabel(e.e)} 종료` : dateLabel(e.s), hot: false };
  }

  function launchWhen(e) {
    const prec = e.date_precision || "day";
    if (prec === "none") return { text: "날짜 미정", sub: "", hot: false, tbd: true };
    const p = parts(e.s);
    if (prec === "year") return { text: `${p.year}년`, sub: "", hot: false };
    if (prec === "month") return { text: `${p.year}.${p.month}`, sub: "", hot: false };
    const dd = dayIndex(e.s) - dayIndex(D.now);
    return { text: dd > 0 ? `D-${dd}` : dd === 0 ? "오늘" : "출시됨", sub: `${p.year}.${p.month}.${p.day}`, hot: dd >= 0 && dd <= 7 };
  }

  // ---------- 표시 ----------
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const short = g => SHORT[g] || g;
  const meta = g => D.games[g] || null;

  function title(e) {
    const t = String(e.title || "").replace(/^\[(픽업|예측)\]\s*/, "");
    if (e.type === "banner" && t.includes("방송 확정 전")) return "다음 픽업 (미공개)";
    return t;
  }
  function gamesOf(e) { return Array.isArray(e.games) && e.games.length ? e.games : [e.game]; }

  function chip(g) {
    const m = meta(g);
    const img = m && m.avatar ? `<img src="${esc(m.avatar)}" alt="" loading="lazy">` : "";
    return `<span class="game-chip">${img}<span>${esc(short(g))}</span></span>`;
  }

  function media(e) {
    const m = meta(e.game) || meta(gamesOf(e)[0]);
    const art = m && (m.banner || m.avatar);
    const im = e.image || {};
    if (im.yt) {
      const id = esc(im.yt);
      const src = `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
      const fb = `this.onerror=null;this.src='https://i.ytimg.com/vi/${id}/hqdefault.jpg'`;
      // 쇼츠는 세로 영상이라 썸네일 가운데만 그림이다. 같은 그림을 흐리게 깔고
      // 가운데 세로 부분만 잘라 세운다.
      if (im.short) return `<img class="backdrop" src="${src}" alt="" loading="lazy" onerror="${fb}">
        <img class="portrait" src="${src}" alt="" loading="lazy" onerror="${fb}">`;
      return `<img class="cover" loading="lazy" alt="" src="${src}" onerror="${fb}">`;
    }
    if (im.src) {
      const back = art ? `<img class="backdrop" src="${esc(art)}" alt="" loading="lazy">` : "";
      return `${back}<img class="icon" src="${esc(im.src)}" alt="" loading="lazy">`;
    }
    if (art) return `<img class="cover" src="${esc(art)}" alt="" loading="lazy">`;
    // 수집 게임이 아닌 행사(이터널 리턴·기타)는 그림이 없다. 빈 검은 칸 대신 종류 아이콘.
    const icon = { event: "ph-storefront", broadcast: "ph-broadcast", banner: "ph-sparkle" }[e.type] || "ph-calendar-blank";
    return `<div class="blank"><i class="ph ${icon}" aria-hidden="true"></i></div>`;
  }

  function link(e) {
    const m = meta(e.game);
    return e.url || (m && m.channel) || "#";
  }

  const TYPE_LABEL = { banner: "픽업", broadcast: "방송", event: "행사" };
  const HOLO = `<span class="foil" aria-hidden="true"></span><span class="glare" aria-hidden="true"></span>`;

  function flags(e, opt = {}) {
    return [e.new_char ? `<span class="flag new">신규</span>` : "",
            opt.kind ? `<span class="flag kind">${TYPE_LABEL[e.type] || ""}</span>` : "",
            e.predicted ? `<span class="flag pred">예측</span>` : ""].join("");
  }

  function card(e, opt = {}) {
    const t = timing(e);
    const ver = e.version_name ? `<div class="card-sub">${esc(e.version_name)}</div>` : "";
    const range = e.type === "event" && e.e ? `<div class="card-sub">${shortDate(e.s)} - ${shortDate(e.e)}</div>` : "";
    return `<a class="card reveal${e.new_char ? " holo" : ""}" href="${esc(link(e))}" target="_blank" rel="noopener" style="--i:${opt.i || 0};${gvar(e.game)}">
      <div class="media">${media(e)}${e.new_char ? HOLO : ""}</div>
      <div class="card-body">
        <div class="meta">${chip(e.game)}<span class="dd${t.hot ? " hot" : ""}">${esc(t.text)}</span></div>
        <div class="card-title">${esc(title(e))}</div>
        ${ver}${range}
        <div class="date"><span>${esc(t.sub)}</span>${flags(e, opt)}</div>
      </div></a>`;
  }

  function feature(e) {
    const t = timing(e);
    return `<a class="card feature reveal${e.new_char ? " holo" : ""}" href="${esc(link(e))}" target="_blank" rel="noopener" style="${gvar(e.game)}">
      <div class="media">${media(e)}<div class="scrim"></div>${e.new_char ? HOLO : ""}</div>
      <div class="over">
        <div>${chip(e.game)}</div>
        <div class="card-title">${esc(title(e))}</div>
        <div class="meta"><span class="card-sub">${esc(e.version_name || t.sub)}</span>
          <span class="dd${t.hot ? " hot" : ""}">${esc(t.text)}</span></div>
      </div></a>`;
  }

  function row(e, i = 0) {
    const t = timing(e);
    const p = parts(e.s);
    const date = e.type === "event" && e.e
      ? `<b>${shortDate(e.s)}</b>${shortDate(e.e)} 까지`
      : `<b>${p.month}.${p.day}</b>${p.weekday} ${p.hour}:${p.minute}`;
    return `<a class="row reveal" href="${esc(link(e))}" target="_blank" rel="noopener" style="--i:${i};${gvar(e.game)}">
      <div class="media">${media(e)}</div>
      <div><div class="t">${esc(title(e))}</div><div class="s"><span class="g">${esc(short(e.game))}</span> · <span class="dd${t.hot ? " hot" : ""}">${esc(t.text)}</span></div></div>
      <div class="date">${date}</div></a>`;
  }

  function launchCard(e, i = 0) {
    const w = launchWhen(e);
    const m = meta(e.game);
    const img = m && m.avatar ? `<img src="${esc(m.avatar)}" alt="" style="width:30px;height:30px;border-radius:50%">` : "";
    return `<div class="launch reveal${w.tbd ? " tbd" : ""}" style="--i:${i};${gvar(e.game)}">
      <div style="display:flex;gap:10px;align-items:center">${img}<div class="n">${esc(e.game)}</div></div>
      <div class="d"><span>${esc(w.sub || "출시")}</span><b>${esc(w.text)}</b></div></div>`;
  }

  function gameTile(g, i = 0) {
    const m = meta(g) || {};
    const live = D.events.filter(e => e.type === "banner" && gamesOf(e).includes(g) && isLive(e)).length;
    const next = D.events.filter(e => e.type === "banner" && gamesOf(e).includes(g) && isUpcoming(e)).length;
    const art = m.banner ? `style="background-image:url('${esc(m.banner)}')"` : "";
    const av = m.avatar ? `<img src="${esc(m.avatar)}" alt="" loading="lazy">` : "";
    const href = m.key ? `game.html?g=${encodeURIComponent(m.key)}` : `schedule.html`;
    return `<a class="game-tile reveal" href="${href}" style="--i:${i};${gvar(g)}">
      <div class="art" ${art}></div>
      <div class="info">${av}<div><div class="name">${esc(g)}</div>
      <div class="count">진행 중 ${live} · 예정 ${next}</div></div></div></a>`;
  }

  // ---------- 티켓 (콜라보·행사) ----------
  function ticket(e, i = 0) {
    const t = timing(e);
    const live = isLive(e);
    const days = e.e ? Math.max(1, dayIndex(e.e) - dayIndex(e.s) + 1) : 1;
    const dd = dayIndex(e.s) - dayIndex(D.now);
    const kind = /콜라보/.test(e.title || "") ? "COLLAB" : "EVENT";
    const left = live ? (e.e ? Math.max(0, dayIndex(e.e) - dayIndex(D.now)) : 0) : dd;
    // 0일 남음·0일 뒤 시작 대신 '오늘 마감'·'오늘 시작'.
    const big = left > 0 ? left : "오늘";
    const cap = left > 0 ? (live ? "일 남음" : "일 뒤 시작") : (live ? "마감" : "시작");
    return `<div class="ticket reveal" style="--i:${i};${gvar(e.game)}">
      <div class="main">
        <div class="line"><span>${kind} · ${esc(short(e.game))}</span><b>${live ? "진행 중" : esc(t.text)}</b></div>
        <div class="tt"><a href="${esc(link(e))}" target="_blank" rel="noopener">${esc(title(e))}</a></div>
        <div class="grid4">
          <div><small>시작</small><span>${esc(dateLabel(e.s, false))}</span></div>
          <div><small>종료</small><span>${e.e ? esc(dateLabel(e.e, false)) : "미정"}</span></div>
          <div><small>기간</small><span>${days}일</span></div>
        </div>
      </div>
      <div class="stub" aria-hidden="true">
        <div class="band">${esc(short(e.game))}</div>
        <div class="big">${big}</div><div class="cap">${cap}</div><div class="code"></div>
      </div></div>`;
  }

  // 그루터기를 오른쪽으로 끌어 뜯으면 날아가고, 잠시 뒤 다시 인쇄된다 (장난감 같은 손맛).
  function bindTickets(root = document) {
    root.querySelectorAll(".ticket .stub").forEach(stub => {
      let x0 = 0, y0 = 0, on = false;
      stub.addEventListener("pointerdown", ev => {
        on = true; x0 = ev.clientX; y0 = ev.clientY;
        stub.setPointerCapture(ev.pointerId); stub.classList.add("drag");
      });
      stub.addEventListener("pointermove", ev => {
        if (!on) return;
        const dx = Math.max(0, ev.clientX - x0), dy = (ev.clientY - y0) * .3;
        stub.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 14}deg)`;
      });
      const end = ev => {
        if (!on) return;
        on = false; stub.classList.remove("drag");
        const dx = ev.clientX - x0;
        stub.style.transform = "";
        if (dx > 70) {
          stub.classList.add("torn");
          setTimeout(() => {
            stub.classList.add("reprint"); stub.classList.remove("torn");
            // 화면 갱신(rAF)은 숨겨진 탭에서 멈춰 투명한 채 남았다. 짧은 타이머로 푼다.
            setTimeout(() => stub.classList.remove("reprint"), 40);
          }, 650);
        }
      };
      stub.addEventListener("pointerup", end);
      stub.addEventListener("pointercancel", end);
    });
  }

  // 홀로그램: 포인터 위치를 광택·기울기 값으로. 프레임마다 한 번만 적는다.
  function bindHolo(root = document) {
    if (!matchMedia("(hover: hover)").matches) return;
    let pending = null, scheduled = false;
    root.addEventListener("pointermove", ev => {
      const el = ev.target.closest && ev.target.closest(".holo");
      if (!el) return;
      pending = [el, ev.clientX, ev.clientY];
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        const [card, cx, cy] = pending;
        const r = card.querySelector(".media").getBoundingClientRect();
        const x = Math.min(1, Math.max(0, (cx - r.left) / r.width));
        const y = Math.min(1, Math.max(0, (cy - r.top) / r.height));
        card.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
        card.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
        card.style.setProperty("--rx", `${((.5 - y) * 10).toFixed(2)}deg`);
        card.style.setProperty("--ry", `${((x - .5) * 12).toFixed(2)}deg`);
      });
    }, { passive: true });
  }

  // 대표 창 진행도 --p. 내릴 때만 커지고 올려도 줄지 않는다 (다시 닫힐 이유가 없다).
  // 다 열리면 .opened 로 남은 스크롤 길이를 접고, 줄어든 만큼 스크롤 위치를 당겨 화면이 튀지 않게 한다.
  // 프레임마다 한 번만 계산한다.
  function apertureFallback() {
    const sec = document.querySelector(".aperture"), stick = sec && sec.querySelector(".ap-stick");
    if (!stick) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let max = 0, queued = false, done = false;
    const finish = () => {
      done = true;
      const before = sec.offsetHeight;
      sec.classList.add("opened");
      const shrink = before - sec.offsetHeight;
      if (shrink > 0 && scrollY > 0) window.scrollTo({ top: Math.max(0, scrollY - shrink), behavior: "instant" });
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", update);
    };
    const update = () => {
      queued = false;
      if (done) return;
      const r = sec.getBoundingClientRect();
      const span = r.height - innerHeight;
      const p = span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 1;
      if (p <= max) return;
      max = p;
      stick.style.setProperty("--p", max.toFixed(4));
      if (max >= 1) finish();
    };
    const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", update);
    update();
  }

  // ---------- 공용 ----------
  function reveal(root = document) {
    const els = root.querySelectorAll(".reveal:not(.in)");
    if (!("IntersectionObserver" in window)) { els.forEach(el => el.classList.add("in")); return; }
    const io = new IntersectionObserver(list => {
      for (const it of list) if (it.isIntersecting) { it.target.classList.add("in"); io.unobserve(it.target); }
    }, { rootMargin: "0px 0px -8% 0px" });
    els.forEach(el => io.observe(el));
  }

  function footer() {
    const el = document.getElementById("updated");
    if (el && D.status && D.status.checked_at) el.textContent = `${dateLabel(new Date(D.status.checked_at))} 갱신`;
    const btn = document.getElementById("copy-ics");
    if (btn) btn.addEventListener("click", async () => {
      const url = new URL("../schedule.ics", location.href).href;
      try { await navigator.clipboard.writeText(url); btn.textContent = "복사했습니다"; } catch (e) { prompt("캘린더 주소", url); }
    });
  }

  const store = {
    get(k, d) { try { const v = localStorage.getItem("gsched-v2:" + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("gsched-v2:" + k, JSON.stringify(v)); } catch (e) {} },
  };

  // 내비게이션: 조금이라도 내리면 바탕과 아래 선을 깐다.
  const nav = document.querySelector(".nav");
  if (nav) {
    const navScroll = () => nav.classList.toggle("scrolled", scrollY > 8);
    addEventListener("scroll", navScroll, { passive: true });
    navScroll();
  }

  window.App = { D, load, gvar, gcolor, ticket, bindTickets, bindHolo, apertureFallback, media, HOLO, timing, isLive, isUpcoming, card, feature, row, launchCard, gameTile,
    title, gamesOf, short, meta, chip, esc, reveal, footer, dateLabel, shortDate, dayIndex, parts, store, MISC };
})();
