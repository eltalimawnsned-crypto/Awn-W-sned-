/* =========================================================
   منصة المحجة البيضاء — تطبيق واجهة أمامية (SPA) بدون نظام خلفي
   الحالة تُحفظ في متصفح الزائر (localStorage) لأغراض التجربة فقط.
   ========================================================= */
(function () {
  "use strict";

  /* ---------------- التخزين ---------------- */
  const KEY = "mahajja-state-v1";
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const defaults = () => ({
    users: [],
    session: null,
    admin: false,
    series: clone(DEFAULT_SERIES),
    courses: clone(DEFAULT_COURSES),
    teachers: clone(DEFAULT_TEACHERS),
    announcements: clone(DEFAULT_ANNOUNCEMENTS),
  });
  let state;
  try {
    state = Object.assign(defaults(), JSON.parse(localStorage.getItem(KEY) || "{}"));
  } catch (e) {
    state = defaults();
  }
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* تجاهل */ }
  };

  /* ---------------- أدوات ---------------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = (p) => p + "-" + Math.random().toString(36).slice(2, 8);
  const today = () => new Date().toISOString().slice(0, 10);
  const fmtDate = (d) => {
    try { return new Date(d).toLocaleDateString("ar", { year: "numeric", month: "long", day: "numeric" }); }
    catch (e) { return d; }
  };
  const arNum = (n) => Number(n).toLocaleString("ar");
  const paras = (t) => esc(t).split(/\n\n+/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");

  const toast = (msg, kind = "ok") => {
    const el = document.createElement("div");
    el.className = "toast " + kind;
    el.textContent = msg;
    const box = $("#toasts");
    while (box.children.length >= 2) box.firstChild.remove();
    box.appendChild(el);
    setTimeout(() => el.classList.add("out"), 2600);
    setTimeout(() => el.remove(), 3100);
  };

  const EMBED_OK = !window.__ARTIFACT__; // في المعاينة لا يُسمح بتضمين مواقع خارجية

  /* تأكيد بضغطتين بدل نافذة confirm */
  const confirmTap = (btn, label) => {
    if (btn.dataset.armed) return true;
    btn.dataset.armed = "1";
    const old = btn.textContent;
    btn.textContent = label || "اضغط مرة أخرى للتأكيد";
    setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = old; } }, 3000);
    return false;
  };

  const ytId = (url) => {
    if (!url) return "";
    const m = String(url).match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
    return m ? m[1] : "";
  };
  const videoBlock = (url, title) => {
    const id = ytId(url);
    if (id && !EMBED_OK)
      return `<div class="video placeholder"><div><span class="play">▶</span><strong>${esc(title)}</strong><a class="btn sm" href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener">مشاهدة على يوتيوب</a></div></div>`;
    if (id)
      return `<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${id}" title="${esc(title)}" allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;
    return `<div class="video placeholder"><div><span class="play">▶</span><strong>${esc(title)}</strong><small>فيديو تجريبي — يمكن ربط رابط يوتيوب من لوحة الإدارة</small></div></div>`;
  };

  const course = (id) => state.courses.find((c) => c.id === id);
  const teacher = (id) => state.teachers.find((t) => t.id === id);
  const seriesName = (id) => (state.series.find((s) => s.id === id) || {}).name || "—";
  const me = () => state.users.find((u) => u.id === state.session) || null;
  const allStudents = () => [...DEMO_STUDENTS, ...state.users];
  const progressOf = (u, c) => {
    const done = (u.enrolled[c.id] || []).filter((l) => c.lessons.some((x) => x.id === l)).length;
    return c.lessons.length ? Math.round((done / c.lessons.length) * 100) : 0;
  };
  const passed = (r) => r && r.score / r.total >= 0.6;

  /* ---------------- القوالب المشتركة ---------------- */
  const pageHead = (title, sub, crumbs = []) => `
    <section class="page-head">
      <div class="wrap">
        ${crumbs.length ? `<nav class="crumbs">${crumbs.map(([t, h]) => (h ? `<a href="${h}">${esc(t)}</a>` : `<span>${esc(t)}</span>`)).join("<i>‹</i>")}</nav>` : ""}
        <h1>${esc(title)}</h1>
        ${sub ? `<p>${esc(sub)}</p>` : ""}
      </div>
    </section>`;

  const typeLabel = { video: "مرئي", audio: "صوتي", text: "مقروء" };
  const typeIcon = { video: "▶", audio: "♪", text: "☰" };

  const libCard = (it) => {
    const cat = CATEGORIES.find((c) => c.id === it.cat);
    return `
    <a class="card lib-card" href="#/library/item/${it.id}">
      <div class="lib-thumb t-${it.cat}"><span>${typeIcon[it.type]}</span><em>${cat.icon}</em></div>
      <div class="card-body">
        <div class="tags"><span class="tag">${typeLabel[it.type]}</span><span class="tag soft">${esc(it.level)}</span></div>
        <h3>${esc(it.title)}</h3>
        <p class="muted">${esc(it.author)} · ${esc(it.duration)}</p>
      </div>
    </a>`;
  };

  const courseCard = (c, u) => {
    const enrolled = u && u.enrolled[c.id];
    const p = enrolled ? progressOf(u, c) : 0;
    const t = teacher(c.teacher);
    return `
    <article class="card course-card">
      <div class="course-band" style="--c:${esc(c.color || "#1f6f5c")}">
        <small>${esc(seriesName(c.series))}</small>
        <h3>${esc(c.title)}</h3>
      </div>
      <div class="card-body">
        <p>${esc(c.desc)}</p>
        <p class="muted">👤 ${esc(t ? t.name : "—")} · 📚 ${arNum(c.lessons.length)} دروس · ${esc(c.level)}</p>
        ${enrolled ? `<div class="bar"><span style="width:${p}%"></span></div><p class="muted small">أُنجز ${arNum(p)}٪</p>` : ""}
        <div class="actions">
          ${enrolled
            ? `<a class="btn" href="#/student/course/${c.id}">متابعة الدراسة</a>`
            : `<button class="btn" data-enroll="${c.id}">التسجيل في الدورة</button>`}
        </div>
      </div>
    </article>`;
  };

  /* ---------------- الصفحة الرئيسية ---------------- */
  function viewHome() {
    const ann = [...state.announcements].sort((a, b) => (b.pinned - a.pinned) || b.date.localeCompare(a.date)).slice(0, 3);
    const lessonsCount = state.courses.reduce((s, c) => s + c.lessons.length, 0);
    return `
    <section class="hero">
      <div class="wrap hero-inner">
        <div class="hero-text">
          <span class="eyebrow">معهد علمي رقمي</span>
          <h1>${esc(SITE.name)}</h1>
          <p class="slogan">«${esc(SITE.slogan)}»</p>
          <p class="lead">${esc(SITE.mission)}</p>
          <div class="actions">
            <a class="btn lg" href="#/library">تصفّح المكتبة المفتوحة</a>
            <a class="btn lg ghost" href="#/student">فضاء الطلاب</a>
          </div>
        </div>
        <div class="hero-art" aria-hidden="true">
          <svg viewBox="0 0 200 200"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="var(--gold)"/><stop offset="1" stop-color="var(--gold-2)"/></linearGradient></defs>
            <g fill="none" stroke="url(#g)" stroke-width="1.6">
              <rect x="40" y="40" width="120" height="120" transform="rotate(45 100 100)"/>
              <rect x="40" y="40" width="120" height="120"/>
              <circle cx="100" cy="100" r="58"/><circle cx="100" cy="100" r="34"/>
            </g>
            <path d="M100 136 L100 92 M100 92 Q86 76 70 78 L70 120 Q86 118 100 136 Q114 118 130 120 L130 78 Q114 76 100 92" fill="none" stroke="var(--paper)" stroke-width="3" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>
      <div class="wrap"><blockquote class="hadith">${esc(SITE.hadith)} <cite>— حديث شريف</cite></blockquote></div>
    </section>

    <section class="wrap section">
      <div class="stats">
        <div><b>${arNum(LIBRARY.length)}</b><span>مادة في المكتبة</span></div>
        <div><b>${arNum(state.courses.length)}</b><span>دورات منظمة</span></div>
        <div><b>${arNum(lessonsCount)}</b><span>درسًا</span></div>
        <div><b>${arNum(allStudents().length)}</b><span>طالبًا مسجلًا</span></div>
      </div>
    </section>

    <section class="wrap section">
      <h2 class="sec-title">أقسام المنصة</h2>
      <div class="grid three">
        <a class="pillar" href="#/library"><span class="ico">📚</span><h3>المكتبة العلمية المفتوحة</h3><p>متاحة لجميع الزوار دون تسجيل: متون، سيرة، صحابة، تلاوات، تجويد، ولغة عربية.</p><span class="more">ادخل المكتبة ←</span></a>
        <a class="pillar" href="#/student"><span class="ico">🎓</span><h3>فضاء الطلاب</h3><p>سجّل في الدورات، تابع الدروس حسب ترتيبها، أجرِ الاختبارات، واحصل على الشهادات.</p><span class="more">ادخل فضاء الطلاب ←</span></a>
        <a class="pillar" href="#/admin"><span class="ico">🗂️</span><h3>لوحة الإدارة</h3><p>إدارة السلاسل والدورات والدروس، ومتابعة الطلاب والمعلمين والنتائج والإعلانات.</p><span class="more">ادخل لوحة الإدارة ←</span></a>
      </div>
    </section>

    <section class="wrap section">
      <div class="sec-row"><h2 class="sec-title">أبواب المكتبة</h2><a href="#/library" class="link">عرض الكل</a></div>
      <div class="grid cats">
        ${CATEGORIES.map((c) => `<a class="cat" href="#/library?cat=${c.id}"><span>${c.icon}</span><b>${esc(c.name)}</b><small>${arNum(LIBRARY.filter((i) => i.cat === c.id).length)} مادة</small></a>`).join("")}
      </div>
    </section>

    <section class="wrap section">
      <div class="sec-row"><h2 class="sec-title">الدورات المتاحة</h2><a href="#/student/courses" class="link">جميع الدورات</a></div>
      <div class="grid three">${state.courses.slice(0, 3).map((c) => courseCard(c, me())).join("")}</div>
    </section>

    <section class="wrap section">
      <h2 class="sec-title">آخر الإعلانات</h2>
      <div class="ann-list">${ann.map(annItem).join("") || `<p class="muted">لا توجد إعلانات حالياً.</p>`}</div>
    </section>`;
  }

  const annItem = (a) => `
    <article class="ann ${a.pinned ? "pinned" : ""}">
      <time>${fmtDate(a.date)}</time>
      <div><h3>${a.pinned ? "📌 " : ""}${esc(a.title)}</h3><p>${esc(a.body)}</p></div>
    </article>`;

  /* ---------------- المكتبة ---------------- */
  function viewLibrary(params) {
    const cat = params.get("cat") || "all";
    const type = params.get("type") || "all";
    const q = (params.get("q") || "").trim();
    let items = LIBRARY.filter((i) => (cat === "all" || i.cat === cat) && (type === "all" || i.type === type));
    if (q) items = items.filter((i) => (i.title + i.author + i.desc).includes(q));
    const catObj = CATEGORIES.find((c) => c.id === cat);
    const link = (k, v) => {
      const p = new URLSearchParams(params);
      v === "all" ? p.delete(k) : p.set(k, v);
      const s = p.toString();
      return "#/library" + (s ? "?" + s : "");
    };
    return `
    ${pageHead("المكتبة العلمية المفتوحة", catObj ? catObj.desc : "محتوى علمي منظم ومتاح لجميع الزوار دون الحاجة إلى التسجيل.", [["الرئيسية", "#/"], ["المكتبة", cat === "all" ? null : "#/library"], ...(catObj ? [[catObj.name]] : [])])}
    <section class="wrap section">
      <form class="search" id="libSearch">
        <input type="search" name="q" placeholder="ابحث عن درس أو شيخ أو موضوع…" value="${esc(q)}" aria-label="بحث في المكتبة">
        <button class="btn">بحث</button>
      </form>
      <div class="chips" role="tablist">
        <a class="chip ${cat === "all" ? "on" : ""}" href="${link("cat", "all")}">الكل</a>
        ${CATEGORIES.map((c) => `<a class="chip ${cat === c.id ? "on" : ""}" href="${link("cat", c.id)}">${c.icon} ${esc(c.name)}</a>`).join("")}
      </div>
      <div class="chips sub">
        ${["all", "video", "audio", "text"].map((t) => `<a class="chip sm ${type === t ? "on" : ""}" href="${link("type", t)}">${t === "all" ? "كل الأنواع" : typeLabel[t]}</a>`).join("")}
      </div>
      <p class="muted">${arNum(items.length)} نتيجة</p>
      <div class="grid four">${items.map(libCard).join("") || `<div class="empty">لا توجد نتائج مطابقة.</div>`}</div>
    </section>`;
  }

  function viewLibraryItem(id) {
    const it = LIBRARY.find((i) => i.id === id);
    if (!it) return viewNotFound();
    const cat = CATEGORIES.find((c) => c.id === it.cat);
    const related = LIBRARY.filter((i) => i.cat === it.cat && i.id !== it.id).slice(0, 4);
    let media = "";
    if (it.type === "video") media = videoBlock(it.video, it.title);
    if (it.type === "audio")
      media = `<div class="audio-box"><div class="disc">📖</div><div><strong>${esc(it.title)}</strong><small>بصوت القارئ ${esc(it.author)}</small>${EMBED_OK ? `<audio controls preload="none" src="${esc(it.src)}"></audio>` : `<a class="btn sm" href="${esc(it.src)}" target="_blank" rel="noopener">▶ استماع للتلاوة</a>`}</div></div>`;
    return `
    ${pageHead(it.title, it.desc, [["الرئيسية", "#/"], ["المكتبة", "#/library"], [cat.name, "#/library?cat=" + cat.id], [it.title]])}
    <section class="wrap section detail">
      <div class="detail-main">
        ${media}
        ${it.content ? `<article class="prose">${paras(it.content)}</article>` : ""}
        ${it.points ? `<div class="box"><h3>محاور الدرس</h3><ol class="points">${it.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ol></div>` : ""}
      </div>
      <aside class="detail-side">
        <div class="box">
          <dl class="meta">
            <dt>القسم</dt><dd>${cat.icon} ${esc(cat.name)}</dd>
            <dt>${it.type === "audio" ? "القارئ" : "المُلقي"}</dt><dd>${esc(it.author)}</dd>
            <dt>النوع</dt><dd>${typeLabel[it.type]}</dd>
            <dt>المدة</dt><dd>${esc(it.duration)}</dd>
            <dt>المستوى</dt><dd>${esc(it.level)}</dd>
          </dl>
          <button class="btn block ghost" id="shareBtn">مشاركة الرابط</button>
        </div>
        ${related.length ? `<div class="box"><h3>مواد ذات صلة</h3><ul class="rel">${related.map((r) => `<li><a href="#/library/item/${r.id}"><span>${typeIcon[r.type]}</span>${esc(r.title)}</a></li>`).join("")}</ul></div>` : ""}
      </aside>
    </section>`;
  }

  /* ---------------- فضاء الطلاب ---------------- */
  function viewAuth() {
    return `
    ${pageHead("فضاء الطلاب", "أنشئ حسابًا تجريبيًا أو سجّل الدخول لمتابعة دوراتك.", [["الرئيسية", "#/"], ["فضاء الطلاب"]])}
    <section class="wrap section">
      <div class="auth">
        <div class="tabs" role="tablist">
          <button class="tab on" data-tab="login" role="tab">تسجيل الدخول</button>
          <button class="tab" data-tab="register" role="tab">إنشاء حساب</button>
        </div>
        <form id="loginForm" class="form" data-pane="login">
          <label>البريد الإلكتروني<input type="email" name="email" required autocomplete="email"></label>
          <label>كلمة المرور<input type="password" name="password" required autocomplete="current-password"></label>
          <button class="btn block">دخول</button>
          <button type="button" class="btn block ghost" id="demoLogin">دخول سريع بحساب تجريبي</button>
        </form>
        <form id="registerForm" class="form" data-pane="register" hidden>
          <label>الاسم الكامل<input name="name" required minlength="3"></label>
          <label>البريد الإلكتروني<input type="email" name="email" required autocomplete="email"></label>
          <label>كلمة المرور<input type="password" name="password" required minlength="4" autocomplete="new-password"></label>
          <button class="btn block">إنشاء الحساب</button>
        </form>
        <p class="note">ⓘ هذه واجهة تجريبية: تُحفظ البيانات في متصفحك فقط ولا تُرسل إلى أي خادم.</p>
      </div>
    </section>`;
  }

  const studentNav = (active) => `
    <nav class="subnav wrap">
      ${[["dash", "#/student", "لوحتي"], ["courses", "#/student/courses", "الدورات"], ["certs", "#/student/certificates", "الشهادات"]]
        .map(([k, h, t]) => `<a href="${h}" class="${active === k ? "on" : ""}">${t}</a>`).join("")}
      <button class="link" id="logout">تسجيل الخروج</button>
    </nav>`;

  function viewStudentDash() {
    const u = me();
    const mine = state.courses.filter((c) => u.enrolled[c.id]);
    const doneLessons = mine.reduce((s, c) => s + (u.enrolled[c.id] || []).length, 0);
    const certs = Object.entries(u.results).filter(([, r]) => passed(r)).length;
    return `
    ${pageHead("مرحبًا، " + u.name, "تابع رحلتك العلمية خطوة بخطوة.", [["الرئيسية", "#/"], ["فضاء الطلاب"]])}
    ${studentNav("dash")}
    <section class="wrap section">
      <div class="stats small">
        <div><b>${arNum(mine.length)}</b><span>دورات مسجلة</span></div>
        <div><b>${arNum(doneLessons)}</b><span>دروس مكتملة</span></div>
        <div><b>${arNum(Object.keys(u.results).length)}</b><span>اختبارات منجزة</span></div>
        <div><b>${arNum(certs)}</b><span>شهادات</span></div>
      </div>
    </section>
    <section class="wrap section">
      <h2 class="sec-title">دوراتي</h2>
      ${mine.length ? `<div class="grid three">${mine.map((c) => courseCard(c, u)).join("")}</div>`
        : `<div class="empty">لم تسجل في أي دورة بعد. <a href="#/student/courses">تصفح الدورات المتاحة</a></div>`}
    </section>
    <section class="wrap section">
      <h2 class="sec-title">إعلانات المعهد</h2>
      <div class="ann-list">${state.announcements.slice(0, 2).map(annItem).join("")}</div>
    </section>`;
  }

  function viewStudentCourses() {
    const u = me();
    return `
    ${pageHead("الدورات المتاحة", "اختر الدورة المناسبة وسجّل فيها لبدء التعلم.", [["الرئيسية", "#/"], ["فضاء الطلاب", "#/student"], ["الدورات"]])}
    ${u ? studentNav("courses") : ""}
    <section class="wrap section">
      ${state.series.map((s) => {
        const cs = state.courses.filter((c) => c.series === s.id);
        return cs.length ? `<h2 class="sec-title">${esc(s.name)}</h2><div class="grid three mb">${cs.map((c) => courseCard(c, u)).join("")}</div>` : "";
      }).join("")}
    </section>`;
  }

  function viewCourse(id) {
    const u = me();
    const c = course(id);
    if (!c) return viewNotFound();
    if (!u.enrolled[c.id]) { location.hash = "#/student/courses"; return ""; }
    const done = u.enrolled[c.id];
    const p = progressOf(u, c);
    const allDone = c.lessons.every((l) => done.includes(l.id));
    const r = u.results[c.id];
    const t = teacher(c.teacher);
    return `
    ${pageHead(c.title, c.desc, [["فضاء الطلاب", "#/student"], [c.title]])}
    ${studentNav("")}
    <section class="wrap section detail">
      <div class="detail-main">
        <div class="box">
          <div class="sec-row"><h3>دروس الدورة</h3><span class="muted">${arNum(done.length)} / ${arNum(c.lessons.length)}</span></div>
          <div class="bar lg"><span style="width:${p}%"></span></div>
          <ol class="lessons">
            ${c.lessons.map((l, i) => {
              const isDone = done.includes(l.id);
              const unlocked = i === 0 || done.includes(c.lessons[i - 1].id);
              const cls = isDone ? "done" : unlocked ? "open" : "locked";
              const badge = isDone ? "✓" : unlocked ? arNum(i + 1) : "🔒";
              return `<li class="${cls}">${unlocked ? `<a href="#/student/lesson/${c.id}/${l.id}">` : "<div>"}
                  <span class="num">${badge}</span><span class="lt">${esc(l.title)}</span><span class="muted">${esc(l.duration)}</span>
                ${unlocked ? "</a>" : "</div>"}</li>`;
            }).join("")}
            <li class="${allDone ? (r ? "done" : "open") : "locked"} quiz-row">
              ${allDone ? `<a href="#/student/quiz/${c.id}">` : "<div>"}<span class="num">${r ? "✓" : allDone ? "؟" : "🔒"}</span><span class="lt">الاختبار النهائي</span><span class="muted">${arNum(c.quiz.length)} أسئلة</span>${allDone ? "</a>" : "</div>"}
            </li>
          </ol>
          ${!allDone ? `<p class="note">ⓘ تُفتح الدروس بالترتيب، ويُتاح الاختبار بعد إتمام جميع الدروس.</p>` : ""}
        </div>
      </div>
      <aside class="detail-side">
        <div class="box">
          <dl class="meta">
            <dt>السلسلة</dt><dd>${esc(seriesName(c.series))}</dd>
            <dt>المعلم</dt><dd>${esc(t ? t.name : "—")}</dd>
            <dt>المستوى</dt><dd>${esc(c.level)}</dd>
            <dt>الإنجاز</dt><dd>${arNum(p)}٪</dd>
            ${r ? `<dt>نتيجة الاختبار</dt><dd>${arNum(r.score)} / ${arNum(r.total)} ${passed(r) ? "✅" : "❌"}</dd>` : ""}
          </dl>
          ${r && passed(r) ? `<a class="btn block" href="#/student/certificate/${c.id}">عرض الشهادة</a>` : ""}
        </div>
      </aside>
    </section>`;
  }

  function viewLesson(cid, lid) {
    const u = me();
    const c = course(cid);
    if (!c || !u.enrolled[cid]) return viewNotFound();
    const i = c.lessons.findIndex((l) => l.id === lid);
    if (i < 0) return viewNotFound();
    const l = c.lessons[i];
    const done = u.enrolled[cid];
    if (i > 0 && !done.includes(c.lessons[i - 1].id)) {
      toast("أتمّ الدرس السابق أولًا", "warn");
      location.hash = "#/student/course/" + cid;
      return "";
    }
    const isDone = done.includes(l.id);
    const next = c.lessons[i + 1];
    return `
    ${pageHead(l.title, `الدرس ${arNum(i + 1)} من ${arNum(c.lessons.length)} — ${c.title}`, [["فضاء الطلاب", "#/student"], [c.title, "#/student/course/" + c.id], [l.title]])}
    <section class="wrap section narrow">
      ${videoBlock(l.video, l.title)}
      <div class="box">
        <h3>ملخص الدرس</h3>
        <p>${esc(l.summary || "يتناول هذا الدرس موضوع «" + l.title + "» ضمن دورة " + c.title + "، مع شرح المسائل وأمثلة تطبيقية. (محتوى تجريبي)")}</p>
      </div>
      <div class="lesson-actions">
        ${i > 0 ? `<a class="btn ghost" href="#/student/lesson/${c.id}/${c.lessons[i - 1].id}">→ الدرس السابق</a>` : `<span></span>`}
        ${isDone
          ? `<span class="badge-ok">✓ تم إتمام الدرس</span>`
          : `<button class="btn" data-complete="${c.id}|${l.id}">تحديد الدرس كمكتمل</button>`}
        ${next
          ? (isDone ? `<a class="btn ghost" href="#/student/lesson/${c.id}/${next.id}">الدرس التالي ←</a>` : `<span class="btn ghost disabled">الدرس التالي ←</span>`)
          : (isDone ? `<a class="btn ghost" href="#/student/quiz/${c.id}">إلى الاختبار ←</a>` : `<span></span>`)}
      </div>
    </section>`;
  }

  function viewQuiz(cid) {
    const u = me();
    const c = course(cid);
    if (!c || !u.enrolled[cid]) return viewNotFound();
    if (!c.lessons.every((l) => u.enrolled[cid].includes(l.id))) { location.hash = "#/student/course/" + cid; return ""; }
    const r = u.results[cid];
    return `
    ${pageHead("الاختبار النهائي", c.title + " — درجة النجاح ٦٠٪", [["فضاء الطلاب", "#/student"], [c.title, "#/student/course/" + c.id], ["الاختبار"]])}
    <section class="wrap section narrow">
      ${r ? `<div class="result ${passed(r) ? "pass" : "fail"}">
          <b>${arNum(r.score)} / ${arNum(r.total)}</b>
          <span>${passed(r) ? "مبارك! اجتزت الاختبار بنجاح." : "لم تبلغ درجة النجاح، يمكنك إعادة المحاولة."}</span>
          ${passed(r) ? `<a class="btn" href="#/student/certificate/${c.id}">عرض الشهادة</a>` : ""}
        </div>` : ""}
      <form id="quizForm" data-course="${c.id}" class="quiz">
        ${c.quiz.map((q, qi) => `
          <fieldset class="box q">
            <legend>${arNum(qi + 1)}. ${esc(q.q)}</legend>
            ${q.options.map((o, oi) => `<label class="opt"><input type="radio" name="q${qi}" value="${oi}" required> <span>${esc(o)}</span></label>`).join("")}
          </fieldset>`).join("")}
        <button class="btn lg block">${r ? "إعادة الاختبار" : "تسليم الإجابات"}</button>
      </form>
    </section>`;
  }

  function viewCertificates() {
    const u = me();
    const list = Object.entries(u.results).filter(([cid, r]) => passed(r) && course(cid));
    return `
    ${pageHead("شهاداتي", "شهادات إتمام الدورات بعد اجتياز الاختبار النهائي.", [["فضاء الطلاب", "#/student"], ["الشهادات"]])}
    ${studentNav("certs")}
    <section class="wrap section">
      ${list.length ? `<div class="grid three">${list.map(([cid, r]) => `
        <a class="card cert-card" href="#/student/certificate/${cid}">
          <div class="card-body"><span class="seal">🏅</span><h3>${esc(course(cid).title)}</h3><p class="muted">${fmtDate(r.date)} · ${arNum(r.score)}/${arNum(r.total)}</p></div>
        </a>`).join("")}</div>`
        : `<div class="empty">لا توجد شهادات بعد. أتمّ دروس دورة واجتز اختبارها لتحصل على شهادة.</div>`}
    </section>`;
  }

  function viewCertificate(cid) {
    const u = me();
    const c = course(cid);
    const r = u.results[cid];
    if (!c || !passed(r)) return viewNotFound();
    const t = teacher(c.teacher);
    return `
    <section class="wrap section">
      <div class="certificate" id="cert">
        <div class="cert-inner">
          <p class="cert-org">${esc(SITE.name)}</p>
          <h1>شهادة إتمام</h1>
          <p>تشهد إدارة المنصة بأن الطالب/ة</p>
          <h2>${esc(u.name)}</h2>
          <p>قد أتمّ دراسة دورة</p>
          <h3>«${esc(c.title)}»</h3>
          <p>واجتاز الاختبار النهائي بنتيجة ${arNum(Math.round((r.score / r.total) * 100))}٪ بتاريخ ${fmtDate(r.date)}</p>
          <div class="cert-sign"><div><span>المعلم</span><b>${esc(t ? t.name : "—")}</b></div><div><span>إدارة المعهد</span><b>${esc(SITE.short)}</b></div></div>
          <p class="cert-slogan">${esc(SITE.slogan)}</p>
          <small class="muted">رقم الشهادة: ${esc(u.id.slice(-6).toUpperCase())}-${esc(cid.toUpperCase())} · شهادة تجريبية</small>
        </div>
      </div>
      <div class="actions center no-print">
        ${EMBED_OK ? `<button class="btn" onclick="window.print()">طباعة / حفظ PDF</button>` : ""}
        <a class="btn ghost" href="#/student/certificates">رجوع</a>
      </div>
    </section>`;
  }

  /* ---------------- لوحة الإدارة ---------------- */
  function viewAdminLogin() {
    return `
    ${pageHead("لوحة الإدارة", "دخول مخصص لإدارة المعهد.", [["الرئيسية", "#/"], ["لوحة الإدارة"]])}
    <section class="wrap section">
      <form class="auth form" id="adminLogin">
        <label>اسم المستخدم<input name="user" value="admin" required></label>
        <label>كلمة المرور<input type="password" name="pass" placeholder="admin" required></label>
        <button class="btn block">دخول</button>
        <p class="note">ⓘ للتجربة: اسم المستخدم وكلمة المرور <b>admin</b></p>
      </form>
    </section>`;
  }

  const ADMIN_TABS = [
    ["overview", "نظرة عامة", "📊"], ["courses", "السلاسل والدورات", "📚"], ["lessons", "الدروس والفيديوهات", "🎬"],
    ["people", "الطلاب والمعلمون", "👥"], ["results", "التسجيلات والنتائج", "📝"], ["ann", "الإعلانات", "📢"],
  ];

  function viewAdmin(tab) {
    tab = ADMIN_TABS.some((t) => t[0] === tab) ? tab : "overview";
    const body = { overview: admOverview, courses: admCourses, lessons: admLessons, people: admPeople, results: admResults, ann: admAnn }[tab]();
    return `
    <section class="admin">
      <aside class="adm-side">
        <div class="adm-brand">🗂️ لوحة الإدارة</div>
        <nav>${ADMIN_TABS.map(([k, t, i]) => `<a href="#/admin/${k}" class="${tab === k ? "on" : ""}"><span>${i}</span>${t}</a>`).join("")}</nav>
        <button class="link" id="adminLogout">خروج من اللوحة</button>
      </aside>
      <div class="adm-main">${body}</div>
    </section>`;
  }

  function admOverview() {
    const st = allStudents();
    const enrolls = st.reduce((s, u) => s + Object.keys(u.enrolled).length, 0);
    const res = st.flatMap((u) => Object.values(u.results));
    const passRate = res.length ? Math.round((res.filter(passed).length / res.length) * 100) : 0;
    const perCourse = state.courses.map((c) => ({ c, n: st.filter((u) => u.enrolled[c.id]).length }));
    const max = Math.max(1, ...perCourse.map((x) => x.n));
    return `
      <h1 class="adm-title">نظرة عامة</h1>
      <div class="stats small">
        <div><b>${arNum(st.length)}</b><span>الطلاب</span></div>
        <div><b>${arNum(state.teachers.length)}</b><span>المعلمون</span></div>
        <div><b>${arNum(enrolls)}</b><span>التسجيلات</span></div>
        <div><b>${arNum(passRate)}٪</b><span>نسبة النجاح</span></div>
      </div>
      <div class="grid two mt">
        <div class="box">
          <h3>التسجيل حسب الدورة</h3>
          <ul class="hbars">${perCourse.map(({ c, n }) => `<li><span>${esc(c.title)}</span><div class="bar"><span style="width:${(n / max) * 100}%"></span></div><b>${arNum(n)}</b></li>`).join("")}</ul>
        </div>
        <div class="box">
          <h3>أحدث الطلاب</h3>
          <ul class="simple">${st.slice(-5).reverse().map((u) => `<li><b>${esc(u.name)}</b><span class="muted">${fmtDate(u.joined)}</span></li>`).join("")}</ul>
        </div>
      </div>`;
  }

  function admCourses() {
    return `
      <h1 class="adm-title">السلاسل والدورات</h1>
      <div class="grid two">
        <form class="box form" id="addSeries">
          <h3>إضافة سلسلة</h3>
          <label>اسم السلسلة<input name="name" required></label>
          <button class="btn">إضافة السلسلة</button>
        </form>
        <form class="box form" id="addCourse">
          <h3>إضافة دورة</h3>
          <label>عنوان الدورة<input name="title" required></label>
          <label>الوصف<textarea name="desc" rows="2" required></textarea></label>
          <div class="row">
            <label>السلسلة<select name="series">${state.series.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select></label>
            <label>المعلم<select name="teacher">${state.teachers.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("")}</select></label>
          </div>
          <div class="row">
            <label>المستوى<select name="level"><option>مبتدئ</option><option>متوسط</option><option>متقدم</option><option>عام</option></select></label>
            <label>اللون<input type="color" name="color" value="#1f6f5c"></label>
          </div>
          <button class="btn">إضافة الدورة</button>
        </form>
      </div>
      <div class="box mt">
        <h3>الدورات الحالية</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>الدورة</th><th>السلسلة</th><th>المعلم</th><th>الدروس</th><th></th></tr></thead>
          <tbody>${state.courses.map((c) => `<tr><td><b>${esc(c.title)}</b></td><td>${esc(seriesName(c.series))}</td><td>${esc((teacher(c.teacher) || {}).name || "—")}</td><td>${arNum(c.lessons.length)}</td>
            <td class="nowrap"><a class="link" href="#/admin/lessons?c=${c.id}">الدروس</a> · <button class="link danger" data-del-course="${c.id}">حذف</button></td></tr>`).join("")}</tbody>
        </table></div>
      </div>`;
  }

  function admLessons() {
    const params = new URLSearchParams((location.hash.split("?")[1]) || "");
    const c = course(params.get("c")) || state.courses[0];
    if (!c) return `<h1 class="adm-title">الدروس</h1><div class="empty">أضف دورة أولًا.</div>`;
    return `
      <h1 class="adm-title">الدروس والفيديوهات</h1>
      <label class="inline">الدورة:
        <select id="lessonCourse">${state.courses.map((x) => `<option value="${x.id}" ${x.id === c.id ? "selected" : ""}>${esc(x.title)}</option>`).join("")}</select>
      </label>
      <div class="box mt">
        <h3>دروس «${esc(c.title)}»</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>#</th><th>عنوان الدرس</th><th>المدة</th><th>رابط الفيديو (يوتيوب)</th><th></th></tr></thead>
          <tbody>${c.lessons.map((l, i) => `<tr>
            <td>${arNum(i + 1)}</td><td>${esc(l.title)}</td><td>${esc(l.duration)}</td>
            <td><input class="vid-input" data-vid="${c.id}|${l.id}" value="${esc(l.video)}" placeholder="https://youtu.be/..." dir="ltr"></td>
            <td class="nowrap">${ytId(l.video) ? "🎬" : "—"} <button class="link danger" data-del-lesson="${c.id}|${l.id}">حذف</button></td></tr>`).join("") || `<tr><td colspan="5" class="muted">لا توجد دروس.</td></tr>`}</tbody>
        </table></div>
        <p class="note">ⓘ الصق رابط يوتيوب ثم اضغط خارج الحقل ليُحفظ ويظهر الفيديو للطلاب.</p>
      </div>
      <form class="box form mt" id="addLesson" data-course="${c.id}">
        <h3>إضافة درس</h3>
        <div class="row">
          <label>عنوان الدرس<input name="title" required></label>
          <label>المدة<input name="duration" placeholder="25 د"></label>
        </div>
        <label>رابط الفيديو<input name="video" placeholder="https://www.youtube.com/watch?v=..." dir="ltr"></label>
        <label>ملخص الدرس<textarea name="summary" rows="2"></textarea></label>
        <button class="btn">إضافة الدرس</button>
      </form>`;
  }

  function admPeople() {
    const st = allStudents();
    return `
      <h1 class="adm-title">الطلاب والمعلمون</h1>
      <div class="box">
        <h3>الطلاب (${arNum(st.length)})</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>الاسم</th><th>البريد</th><th>تاريخ الانضمام</th><th>الدورات</th></tr></thead>
          <tbody>${st.map((u) => `<tr><td><b>${esc(u.name)}</b>${u.id.startsWith("u-demo") ? ` <span class="tag soft">تجريبي</span>` : ""}</td><td dir="ltr">${esc(u.email)}</td><td>${fmtDate(u.joined)}</td><td>${arNum(Object.keys(u.enrolled).length)}</td></tr>`).join("")}</tbody>
        </table></div>
      </div>
      <div class="grid two mt">
        <div class="box">
          <h3>المعلمون (${arNum(state.teachers.length)})</h3>
          <ul class="simple">${state.teachers.map((t) => `<li><b>${esc(t.name)}</b><span class="muted">${esc(t.spec)} · ${arNum(state.courses.filter((c) => c.teacher === t.id).length)} دورات</span></li>`).join("")}</ul>
        </div>
        <form class="box form" id="addTeacher">
          <h3>إضافة معلم</h3>
          <label>الاسم<input name="name" required></label>
          <label>التخصص<input name="spec" required></label>
          <label>البريد<input type="email" name="email" dir="ltr"></label>
          <button class="btn">إضافة</button>
        </form>
      </div>`;
  }

  function admResults() {
    const rows = [];
    allStudents().forEach((u) =>
      Object.keys(u.enrolled).forEach((cid) => {
        const c = course(cid);
        if (c) rows.push({ u, c, p: progressOf(u, c), r: u.results[cid] });
      })
    );
    return `
      <h1 class="adm-title">التسجيلات والنتائج</h1>
      <div class="box">
        <div class="table-wrap"><table>
          <thead><tr><th>الطالب</th><th>الدورة</th><th>الإنجاز</th><th>الاختبار</th><th>الحالة</th></tr></thead>
          <tbody>${rows.map(({ u, c, p, r }) => `<tr>
            <td>${esc(u.name)}</td><td>${esc(c.title)}</td>
            <td><div class="bar mini"><span style="width:${p}%"></span></div> ${arNum(p)}٪</td>
            <td>${r ? `${arNum(r.score)}/${arNum(r.total)}` : "—"}</td>
            <td>${r ? (passed(r) ? `<span class="tag ok">ناجح</span>` : `<span class="tag bad">لم ينجح</span>`) : p === 100 ? `<span class="tag soft">بانتظار الاختبار</span>` : `<span class="tag soft">قيد الدراسة</span>`}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">لا توجد تسجيلات.</td></tr>`}</tbody>
        </table></div>
      </div>`;
  }

  function admAnn() {
    return `
      <h1 class="adm-title">الإعلانات</h1>
      <form class="box form" id="addAnn">
        <h3>نشر إعلان جديد</h3>
        <label>العنوان<input name="title" required></label>
        <label>النص<textarea name="body" rows="3" required></textarea></label>
        <label class="check"><input type="checkbox" name="pinned"> تثبيت الإعلان في الأعلى</label>
        <button class="btn">نشر الإعلان</button>
      </form>
      <div class="box mt">
        <h3>الإعلانات المنشورة</h3>
        <ul class="simple">${state.announcements.map((a) => `<li><div><b>${a.pinned ? "📌 " : ""}${esc(a.title)}</b><br><span class="muted">${fmtDate(a.date)}</span></div><button class="link danger" data-del-ann="${a.id}">حذف</button></li>`).join("")}</ul>
      </div>`;
  }

  function viewAbout() {
    return `
    ${pageHead("عن المنصة", SITE.slogan, [["الرئيسية", "#/"], ["عن المنصة"]])}
    <section class="wrap section narrow prose">
      <h2>رسالتنا</h2><p>${esc(SITE.mission)}</p>
      <h2>سبب التسمية</h2>
      <p>اسم المنصة مأخوذ من قول النبي ﷺ: ${esc(SITE.hadith)}، والمحجة هي جادّة الطريق الواضحة، فنسأل الله أن تكون هذه المنصة سبيلًا واضحًا لطلب العلم.</p>
      <h2>أقسام المنصة</h2>
      <ul><li><b>المكتبة العلمية المفتوحة:</b> متاحة للجميع دون تسجيل.</li><li><b>فضاء الطلاب:</b> دورات منظمة، متابعة للإنجاز، اختبارات، وشهادات.</li><li><b>لوحة الإدارة:</b> إدارة المحتوى والطلاب والمعلمين والإعلانات.</li></ul>
      <p class="note">ⓘ هذه نسخة تجريبية من الواجهة الأمامية فقط، دون قاعدة بيانات أو نظام خلفي.</p>
    </section>`;
  }

  const viewNotFound = () => `<section class="wrap section"><div class="empty"><h2>الصفحة غير موجودة</h2><a class="btn" href="#/">العودة إلى الرئيسية</a></div></section>`;

  /* ---------------- الموجّه ---------------- */
  function route() {
    const raw = location.hash.slice(1) || "/";
    const [path, qs] = raw.split("?");
    const params = new URLSearchParams(qs || "");
    const seg = path.split("/").filter(Boolean);
    let html = "";
    let area = seg[0] || "home";

    if (area === "home") html = viewHome();
    else if (area === "library") html = seg[1] === "item" ? viewLibraryItem(seg[2]) : viewLibrary(params);
    else if (area === "about") html = viewAbout();
    else if (area === "student") {
      if (seg[1] === "courses" && !me()) html = viewStudentCourses();
      else if (!me()) html = viewAuth();
      else if (!seg[1]) html = viewStudentDash();
      else if (seg[1] === "courses") html = viewStudentCourses();
      else if (seg[1] === "course") html = viewCourse(seg[2]);
      else if (seg[1] === "lesson") html = viewLesson(seg[2], seg[3]);
      else if (seg[1] === "quiz") html = viewQuiz(seg[2]);
      else if (seg[1] === "certificates") html = viewCertificates();
      else if (seg[1] === "certificate") html = viewCertificate(seg[2]);
      else html = viewNotFound();
    } else if (area === "admin") html = state.admin ? viewAdmin(seg[1]) : viewAdminLogin();
    else html = viewNotFound();

    if (html === "") return; // تمّت إعادة التوجيه
    $("#app").innerHTML = html;
    document.body.dataset.area = area;
    $$(".main-nav a").forEach((a) => a.classList.toggle("on", a.dataset.area === area));
    $("#navToggle").setAttribute("aria-expanded", "false");
    document.body.classList.remove("nav-open");
    updateUserChip();
    window.scrollTo(0, 0);
  }

  function updateUserChip() {
    const u = me();
    $("#userChip").innerHTML = u
      ? `<a href="#/student" class="avatar" title="${esc(u.name)}">${esc(u.name.trim()[0])}</a>`
      : `<a href="#/student" class="btn sm">دخول الطلاب</a>`;
  }

  /* ---------------- الأحداث ---------------- */
  function login(u) {
    state.session = u.id;
    save();
    toast("أهلًا بك، " + u.name);
    location.hash = "#/student";
  }

  function enroll(cid) {
    const u = me();
    if (!u) { toast("سجّل الدخول أولًا للتسجيل في الدورة", "warn"); location.hash = "#/student"; return; }
    if (!u.enrolled[cid]) u.enrolled[cid] = [];
    save();
    toast("تم التسجيل في الدورة بنجاح");
    location.hash = "#/student/course/" + cid;
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("button, a, [data-tab]");
    if (!t) return;
    const d = t.dataset;

    if (d.tab) {
      $$(".tab").forEach((x) => x.classList.toggle("on", x === t));
      $$("[data-pane]").forEach((p) => (p.hidden = p.dataset.pane !== d.tab));
    } else if (d.enroll) enroll(d.enroll);
    else if (d.complete) {
      const [cid, lid] = d.complete.split("|");
      const u = me();
      if (!u.enrolled[cid].includes(lid)) u.enrolled[cid].push(lid);
      save();
      const c = course(cid);
      toast(c.lessons.every((l) => u.enrolled[cid].includes(l.id)) ? "أتممت جميع الدروس! الاختبار متاح الآن" : "أحسنت! تم إتمام الدرس");
      route();
    } else if (t.id === "demoLogin") {
      let u = state.users.find((x) => x.email === "student@demo.com");
      if (!u) {
        u = { id: uid("u"), name: "طالب تجريبي", email: "student@demo.com", password: "demo", joined: today(), enrolled: {}, results: {} };
        state.users.push(u);
      }
      login(u);
    } else if (t.id === "logout") {
      state.session = null; save(); toast("تم تسجيل الخروج"); location.hash = "#/";
    } else if (t.id === "resetDemo") {
      if (!confirmTap(t, "اضغط مرة أخرى لإعادة الضبط")) return;
      try { localStorage.removeItem(KEY); } catch (e2) { /* */ }
      state = defaults(); toast("تمت إعادة ضبط البيانات"); location.hash = "#/"; route();
    } else if (t.id === "adminLogout") {
      state.admin = false; save(); location.hash = "#/";
    } else if (t.id === "shareBtn") {
      const url = location.href;
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject())
        .then(() => toast("تم نسخ الرابط"))
        .catch(() => toast(url));
    } else if (t.id === "navToggle") {
      const open = !document.body.classList.contains("nav-open");
      document.body.classList.toggle("nav-open", open);
      t.setAttribute("aria-expanded", String(open));
    } else if (t.id === "themeToggle") {
      const cur = document.documentElement.dataset.theme === "dark" ||
        (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.dataset.theme = cur ? "light" : "dark";
      try { localStorage.setItem("mahajja-theme", document.documentElement.dataset.theme); } catch (e2) { /* */ }
    } else if (d.delCourse) {
      if (!confirmTap(t, "تأكيد الحذف؟")) return;
      state.courses = state.courses.filter((c) => c.id !== d.delCourse); save(); toast("تم حذف الدورة"); route();
    } else if (d.delLesson) {
      const [cid, lid] = d.delLesson.split("|");
      const c = course(cid); c.lessons = c.lessons.filter((l) => l.id !== lid); save(); toast("تم حذف الدرس"); route();
    } else if (d.delAnn) {
      state.announcements = state.announcements.filter((a) => a.id !== d.delAnn); save(); toast("تم حذف الإعلان"); route();
    }
  });

  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.id === "lessonCourse") location.hash = "#/admin/lessons?c=" + t.value;
    if (t.dataset.vid) {
      const [cid, lid] = t.dataset.vid.split("|");
      const l = course(cid).lessons.find((x) => x.id === lid);
      const v = t.value.trim();
      if (v && !ytId(v)) { toast("رابط يوتيوب غير صالح", "warn"); return; }
      l.video = v; save(); toast(v ? "تم ربط الفيديو بالدرس" : "تمت إزالة الفيديو"); route();
    }
  });

  document.addEventListener("submit", (e) => {
    const f = e.target;
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f).entries());

    switch (f.id) {
      case "libSearch": {
        const p = new URLSearchParams((location.hash.split("?")[1]) || "");
        v.q ? p.set("q", v.q) : p.delete("q");
        location.hash = "#/library" + (p.toString() ? "?" + p : "");
        break;
      }
      case "loginForm": {
        const u = state.users.find((x) => x.email.toLowerCase() === v.email.toLowerCase() && x.password === v.password);
        u ? login(u) : toast("البريد أو كلمة المرور غير صحيحة", "warn");
        break;
      }
      case "registerForm": {
        if (state.users.some((x) => x.email.toLowerCase() === v.email.toLowerCase())) { toast("هذا البريد مسجل مسبقًا", "warn"); break; }
        const u = { id: uid("u"), name: v.name.trim(), email: v.email.trim(), password: v.password, joined: today(), enrolled: {}, results: {} };
        state.users.push(u);
        login(u);
        break;
      }
      case "quizForm": {
        const cid = f.dataset.course;
        const c = course(cid);
        const score = c.quiz.reduce((s, q, i) => s + (Number(v["q" + i]) === q.answer ? 1 : 0), 0);
        me().results[cid] = { score, total: c.quiz.length, date: today() };
        save();
        toast(passed(me().results[cid]) ? "مبارك! نجحت في الاختبار" : "لم تبلغ درجة النجاح", passed(me().results[cid]) ? "ok" : "warn");
        route();
        break;
      }
      case "adminLogin":
        if (v.user === "admin" && v.pass === "admin") { state.admin = true; save(); toast("مرحبًا بك في لوحة الإدارة"); route(); }
        else toast("بيانات الدخول غير صحيحة", "warn");
        break;
      case "addSeries":
        state.series.push({ id: uid("s"), name: v.name.trim() }); save(); toast("تمت إضافة السلسلة"); route();
        break;
      case "addCourse":
        state.courses.push({ id: uid("c"), title: v.title.trim(), desc: v.desc.trim(), series: v.series, teacher: v.teacher, level: v.level, color: v.color, lessons: [],
          quiz: [{ q: "سؤال تجريبي: هل أتممت دروس الدورة بتركيز؟", options: ["نعم", "لا"], answer: 0 }] });
        save(); toast("تمت إضافة الدورة — أضف دروسها الآن"); location.hash = "#/admin/lessons?c=" + state.courses[state.courses.length - 1].id;
        break;
      case "addLesson": {
        if (v.video && !ytId(v.video)) { toast("رابط يوتيوب غير صالح", "warn"); break; }
        const c = course(f.dataset.course);
        c.lessons.push({ id: uid("l"), title: v.title.trim(), duration: v.duration.trim() || "—", video: v.video.trim(), summary: v.summary.trim() });
        save(); toast("تمت إضافة الدرس"); route();
        break;
      }
      case "addTeacher":
        state.teachers.push({ id: uid("t"), name: v.name.trim(), spec: v.spec.trim(), email: v.email || "" }); save(); toast("تمت إضافة المعلم"); route();
        break;
      case "addAnn":
        state.announcements.unshift({ id: uid("a"), title: v.title.trim(), body: v.body.trim(), date: today(), pinned: !!v.pinned });
        save(); toast("تم نشر الإعلان"); route();
        break;
    }
  });

  window.addEventListener("hashchange", route);
  $("#year").textContent = new Date().getFullYear().toLocaleString("ar", { useGrouping: false });
  route();
})();
