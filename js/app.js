/* =========================================================
   منصة المحجة البيضاء — تطبيق واجهة أمامية (SPA) بدون نظام خلفي
   الحالة تُحفظ في متصفح الزائر (localStorage) لأغراض التجربة فقط.
   ========================================================= */
(function () {
  "use strict";

  /* ---------------- التخزين ---------------- */
  const KEY = "mahajja-state-v2"; // v2: هيكل القسم ← السلسلة ← قائمة التشغيل ← الدرس
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
  // ترحيل ألوان الدورات من الهوية القديمة إلى الجديدة
  const OLD_COLORS = { "#1f6f5c": "#4a4486", "#9a7b2f": "#9c5161", "#2d5a8a": "#3b5a8f", "#7a3e3e": "#6a4a8a", "#c8615e": "#9c5161", "#8a3f4e": "#8a6a3e" };
  (state.courses || []).forEach((c) => { if (OLD_COLORS[c.color]) c.color = OLD_COLORS[c.color]; });

  // توحيد شكل الدروس (للبيانات المضافة قبل اعتماد بطاقة الدرس)
  state.series.forEach((s) => { if (!s.cat) s.cat = "fiqh"; });
  state.courses.forEach((c) => c.lessons.forEach((l, i) => {
    if (!l.num) l.num = i + 1;
    if (!l.topic) { l.topic = l.title; l.title = lessonTitle(l.num); }
    if (!l.notes) l.notes = emptyNotes();
    if (l.verses === undefined) l.verses = null;
  }));

  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch (e) { return false; }
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

  /* ---- أدوات الهيكل العلمي وبطاقة الدرس ---- */
  const seriesOf = (id) => state.series.find((s) => s.id === id);
  const catOf = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[0];
  const pad2 = (n) => String(n).padStart(2, "0");
  const verseCount = (v) => (v && v.from && v.to >= v.from ? v.to - v.from + 1 : 0);
  const versesWord = (n) => (n === 1 ? "بيت واحد" : n === 2 ? "بيتان" : n <= 10 ? n + " أبيات" : n + " بيتًا");
  const lessonName = (l) => `${l.title}: ${l.topic}`;
  const NOTE_SECTIONS = [
    ["fawaid", "الفوائد المستخلصة", "💡"],
    ["definitions", "التعريفات المهمة", "📖"],
    ["masail", "المسائل الفقهية", "⚖️"],
    ["tanbihat", "التنبيهات العلمية", "⚠️"],
    ["refs", "المراجع العلمية", "📚"],
  ];
  const hasNotes = (l) => l.notes && NOTE_SECTIONS.some(([k]) => (l.notes[k] || []).length);
  /* الخطوة التالية للطالب في دورة: أول درس لم يُتمّه، ثم الاختبار، ثم الشهادة */
  const nextStep = (u, c) => {
    const done = u.enrolled[c.id] || [];
    const l = c.lessons.find((x) => !done.includes(x.id));
    if (l) return { kind: "lesson", lesson: l, href: `#/student/lesson/${c.id}/${l.id}`, label: "تابع الدرس" };
    const r = u.results[c.id];
    if (!r || !passed(r)) return { kind: "quiz", href: `#/student/quiz/${c.id}`, label: r ? "أعد الاختبار" : "ابدأ الاختبار النهائي" };
    return { kind: "done", href: `#/student/certificate/${c.id}`, label: "عرض الشهادة" };
  };
  /* الدورة التي يُقترح أن يكمل فيها الطالب: آخر ما فتحه، وإلا أول دورة غير منتهية */
  const currentCourse = (u) => {
    const mine = state.courses.filter((c) => u.enrolled[c.id]);
    const last = u.last && mine.find((c) => c.id === u.last.cid);
    if (last && nextStep(u, last).kind !== "done") return last;
    return mine.find((c) => nextStep(u, c).kind !== "done") || null;
  };
  const continueCard = (u) => {
    const c = currentCourse(u);
    if (!c) return "";
    const st = nextStep(u, c);
    const p = progressOf(u, c);
    const what = st.kind === "lesson" ? `${esc(st.lesson.title)}: ${esc(st.lesson.topic)}` : "الاختبار النهائي";
    return `
      <a class="continue" href="${st.href}" style="--c:${esc(c.color || "#4a4486")}">
        <span class="continue-icon" aria-hidden="true">${st.kind === "lesson" ? "▶" : "✎"}</span>
        <span class="continue-text">
          <small>تابع من حيث توقفت · ${esc(c.title)}</small>
          <b>${what}</b>
          <span class="bar"><span style="width:${p}%"></span></span>
          <small>أنجزت ${arNum(p)}٪ من الدورة</small>
        </span>
        <span class="btn">${st.label} ←</span>
      </a>`;
  };

  const playlistsOf = (sid) => state.courses.filter((c) => c.series === sid);
  const lessonsIn = (sid) => playlistsOf(sid).reduce((n, c) => n + c.lessons.length, 0);

  /* ضغط الصورة المرفوعة قبل حفظها في المتصفح */
  const readImage = (file) => new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = reject;
    fr.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const k = Math.min(1, 1100 / Math.max(img.width, img.height));
        const cv = document.createElement("canvas");
        cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        const ctx = cv.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        resolve(cv.toDataURL("image/jpeg", 0.78));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });

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
      <div class="course-band" style="--c:${esc(c.color || "#4a4486")}">
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
    ${me() && currentCourse(me()) ? `<section class="wrap continue-top">${continueCard(me())}</section>` : ""}
    <section class="hero">
      <div class="wrap hero-inner">
        <div class="hero-text">
          <span class="eyebrow"><img src="assets/logo-mark.png" alt="" width="18" height="18">من مشاريع جمعية عون وسند الخيرية – موريتانيا</span>
          <h1>${esc(SITE.name)}</h1>
          <p class="slogan">«${esc(SITE.slogan)}»</p>
          <p class="lead">${esc(SITE.mission)}</p>
          <form class="search hero-search" id="libSearch" role="search">
            <input type="search" name="q" placeholder="ابحث عن درس أو متن أو موضوع…" aria-label="ابحث في المكتبة">
            <button class="btn">بحث</button>
          </form>
          <div class="actions">
            <a class="btn lg" href="#/library">تصفّح المكتبة المفتوحة</a>
            <a class="btn lg ghost" href="#/student">${me() ? "دوراتي" : "ابدأ التعلّم مجانًا"}</a>
          </div>
        </div>
        <div class="hero-art" aria-hidden="true">
          <svg viewBox="0 0 200 200"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="var(--sand)"/><stop offset="1" stop-color="var(--rose)"/></linearGradient></defs>
            <g fill="none" stroke="url(#g)" stroke-width="1.6">
              <rect x="40" y="40" width="120" height="120" transform="rotate(45 100 100)"/>
              <rect x="40" y="40" width="120" height="120"/>
              <circle cx="100" cy="100" r="58"/><circle cx="100" cy="100" r="34"/>
            </g>
            <clipPath id="heroLogo"><circle cx="100" cy="100" r="33"/></clipPath>
            <image href="assets/logo-mahajja.png" x="56" y="56" width="88" height="88" clip-path="url(#heroLogo)"/>
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
    const ser = type === "all" || type === "video"
      ? state.series.filter((s) => (cat === "all" || s.cat === cat) && (!q || (s.name + s.matn + s.desc + s.author).includes(q)))
      : [];
    const foundLessons = [];
    if (q) state.courses.forEach((c) => { const s = seriesOf(c.series); if (cat !== "all" && s && s.cat !== cat) return;
      c.lessons.forEach((l) => { if ((l.title + l.topic + l.summary).includes(q)) foundLessons.push({ c, l }); }); });
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
      ${ser.length ? `<h2 class="sec-title mt">السلاسل العلمية</h2><div class="grid three mb">${ser.map(seriesCard).join("")}</div>` : ""}
      ${q && foundLessons.length ? `<h2 class="sec-title">دروس مطابقة</h2><ul class="found mb">${foundLessons.slice(0, 12).map(({ c, l }) => `<li><a href="#/lesson/${c.id}/${l.id}"><span class="num-pill">${pad2(l.num)}</span><span><b>${esc(l.topic)}</b><small class="muted">${esc(seriesOf(c.series)?.name || "")} — ${esc(c.title)}</small></span></a></li>`).join("")}</ul>` : ""}
      <h2 class="sec-title">مواد مفردة</h2>
      <p class="muted">${arNum(items.length)} مادة</p>
      <div class="grid four">${items.map(libCard).join("") || `<div class="empty">لا توجد مواد مطابقة.</div>`}</div>
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


  /* ---------------- السلاسل وقوائم التشغيل وبطاقة الدرس ---------------- */
  const seriesCard = (s) => {
    const cat = catOf(s.cat);
    const pls = playlistsOf(s.id);
    return `
    <a class="card series-card" href="#/series/${s.id}">
      <div class="course-band" style="--c:${esc((pls[0] && pls[0].color) || "#4a4486")}">
        <small>${cat.icon} ${esc(cat.name)}</small>
        <h3>${esc(s.name)}</h3>
      </div>
      <div class="card-body">
        <p>${esc(s.desc)}</p>
        ${s.matn ? `<p class="muted small">📜 ${esc(s.matn)}${s.author ? " — " + esc(s.author) : ""}</p>` : ""}
        <div class="tags">
          ${s.nazm ? `<span class="tag">منظومة</span>` : `<span class="tag soft">متن منثور</span>`}
          <span class="tag soft">${arNum(pls.length)} قوائم تشغيل</span>
          <span class="tag soft">${arNum(lessonsIn(s.id))} درسًا</span>
        </div>
      </div>
    </a>`;
  };

  const verseTag = (l) => verseCount(l.verses)
    ? `<span class="verse-tag">الأبيات ${arNum(l.verses.from)} إلى ${arNum(l.verses.to)}</span>` : "";

  function viewSeries(sid) {
    const s = seriesOf(sid);
    if (!s) return viewNotFound();
    const cat = catOf(s.cat);
    const pls = playlistsOf(s.id);
    return `
    ${pageHead(s.name, s.desc, [["المكتبة", "#/library"], [cat.name, "#/library?cat=" + cat.id], [s.name]])}
    <section class="wrap section detail">
      <div class="detail-main">
        <h2 class="sec-title">قوائم التشغيل</h2>
        ${pls.length ? `<div class="pl-list">${pls.map((c) => {
          const verses = c.lessons.reduce((n, l) => n + verseCount(l.verses), 0);
          return `<a class="pl-item" href="#/playlist/${c.id}" style="--c:${esc(c.color || "#4a4486")}">
            <span class="pl-icon">▶</span>
            <span class="pl-text"><b>${esc(c.title)}</b><small>${esc(c.desc)}</small></span>
            <span class="pl-meta">${arNum(c.lessons.length)} دروس${verses ? ` · ${arNum(verses)} بيتًا` : ""}</span>
          </a>`; }).join("")}</div>` : `<div class="empty">لا توجد قوائم تشغيل في هذه السلسلة بعد.</div>`}
      </div>
      <aside class="detail-side">
        <div class="box">
          <dl class="meta">
            <dt>القسم العلمي</dt><dd>${cat.icon} ${esc(cat.name)}</dd>
            ${s.matn ? `<dt>المتن</dt><dd>${esc(s.matn)}</dd>` : ""}
            ${s.author ? `<dt>المؤلف</dt><dd>${esc(s.author)}</dd>` : ""}
            <dt>نوع المتن</dt><dd>${s.nazm ? "منظومة (تُشرح بالأبيات)" : "منثور"}</dd>
            <dt>الدروس</dt><dd>${arNum(lessonsIn(s.id))}</dd>
          </dl>
        </div>
      </aside>
    </section>`;
  }

  function viewPlaylist(cid) {
    const c = course(cid);
    if (!c) return viewNotFound();
    const s = seriesOf(c.series) || { name: "—", cat: "fiqh" };
    const cat = catOf(s.cat);
    const u = me();
    const enrolled = u && u.enrolled[c.id];
    const t = teacher(c.teacher);
    return `
    ${pageHead(c.title, c.desc, [["المكتبة", "#/library"], [cat.name, "#/library?cat=" + cat.id], [s.name, s.id ? "#/series/" + s.id : null], [c.title]])}
    <section class="wrap section detail">
      <div class="detail-main">
        <div class="box">
          <h3>دروس قائمة التشغيل</h3>
          <ol class="lessons">
            ${c.lessons.map((l) => `<li class="open"><a href="#/lesson/${c.id}/${l.id}">
              <span class="num">${pad2(l.num)}</span>
              <span class="lt"><b>${esc(l.topic)}</b><small class="muted">${esc(l.title)} ${verseTag(l)}</small></span>
              <span class="muted">${esc(l.duration)}</span></a></li>`).join("") || `<li class="muted">لا توجد دروس بعد.</li>`}
          </ol>
        </div>
      </div>
      <aside class="detail-side">
        <div class="box">
          <dl class="meta">
            <dt>السلسلة</dt><dd>${esc(s.name)}</dd>
            <dt>المعلم</dt><dd>${esc(t ? t.name : "—")}</dd>
            <dt>المستوى</dt><dd>${esc(c.level)}</dd>
            <dt>الدروس</dt><dd>${arNum(c.lessons.length)}</dd>
          </dl>
          ${enrolled ? `<a class="btn block" href="#/student/course/${c.id}">متابعة في فضاء الطلاب</a>`
            : `<button class="btn block" data-enroll="${c.id}">التسجيل لتتبّع التقدم والاختبار</button>`}
          <p class="note">ⓘ الدروس متاحة للجميع؛ التسجيل يضيف تتبّع الإنجاز والاختبار والشهادة.</p>
        </div>
      </aside>
    </section>`;
  }

  /* بطاقة بيانات الدرس (تُستخدم في المكتبة وفضاء الطلاب) */
  function lessonSheet(c, l) {
    const s = seriesOf(c.series) || {};
    const vc = verseCount(l.verses);
    const id = ytId(l.video);
    const rows = [
      ["عنوان الدرس", esc(l.title)],
      ["موضوع الدرس", esc(l.topic)],
      ["رقم الدرس", `<span class="num-pill">${pad2(l.num)}</span>`],
      ...(vc ? [
        ["عدد الأبيات", versesWord(vc)],
        ["بداية الأبيات", "البيت " + pad2(l.verses.from)],
        ["نهاية الأبيات", "البيت " + pad2(l.verses.to)],
      ] : []),
      ...(s.matn ? [["المتن", esc(s.matn)]] : []),
      ["مدة الدرس", esc(l.duration || "—")],
      ["رابط الفيديو", id ? `<a href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener">مشاهدة الدرس ↗</a>` : `<span class="muted">لم يُربط بعد</span>`],
      ["صورة الدرس", l.image ? (vc ? "صفحة الأبيات المشروحة (أدناه)" : "صفحة من المتن (أدناه)") : `<span class="muted">لا توجد</span>`],
    ];
    return `
      <div class="box sheet">
        <h3>📚 بطاقة بيانات الدرس</h3>
        <table class="datasheet"><thead><tr><th>البيان</th><th>التفاصيل</th></tr></thead>
          <tbody>${rows.map(([k, v]) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`).join("")}</tbody></table>
      </div>
      ${l.image ? `<figure class="box lesson-figure"><button type="button" class="fig-btn" data-zoom aria-label="تكبير الصورة"><img src="${esc(l.image)}" alt="صورة الدرس: ${esc(l.topic)}"></button>
        <figcaption>${vc ? `صفحة الأبيات ${arNum(l.verses.from)} إلى ${arNum(l.verses.to)}` : "صورة الدرس"} · اضغط للتكبير</figcaption></figure>` : ""}`;
  }

  function lessonNotes(l) {
    if (!hasNotes(l)) return "";
    return `
      <section class="box notes">
        <h3>الفوائد والتنبيهات العلمية</h3>
        <div class="notes-grid">
          ${NOTE_SECTIONS.map(([k, label, icon]) => {
            const items = (l.notes && l.notes[k]) || [];
            if (!items.length) return "";
            const body = k === "definitions"
              ? `<dl class="defs">${items.map((d) => `<dt>${esc(d.term)}</dt><dd>${esc(d.def)}</dd>`).join("")}</dl>`
              : `<ul>${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
            return `<div class="note-block n-${k}"><h4><span>${icon}</span>${label}</h4>${body}</div>`;
          }).join("")}
        </div>
      </section>`;
  }

  const lessonMain = (c, l) => `
    ${videoBlock(l.video, lessonName(l))}
    <div class="box">
      <h3>ملخص الدرس</h3>
      <p>${esc(l.summary || "أهم المسائل التي تناولها الشيخ في هذا الدرس ستُضاف قريبًا.")}</p>
    </div>
    ${lessonNotes(l)}`;

  function viewLessonPublic(cid, lid) {
    const c = course(cid);
    if (!c) return viewNotFound();
    const i = c.lessons.findIndex((l) => l.id === lid);
    if (i < 0) return viewNotFound();
    const l = c.lessons[i];
    const s = seriesOf(c.series) || { name: "—", cat: "fiqh" };
    const cat = catOf(s.cat);
    const prev = c.lessons[i - 1], next = c.lessons[i + 1];
    const u = me();
    return `
    ${pageHead(lessonName(l), `${s.name} — ${c.title}`, [["المكتبة", "#/library"], [cat.name, "#/library?cat=" + cat.id], [s.name, s.id ? "#/series/" + s.id : null], [c.title, "#/playlist/" + c.id], [l.title]])}
    <section class="wrap section detail">
      <div class="detail-main">
        ${lessonMain(c, l)}
        <div class="lesson-actions">
          ${prev ? `<a class="btn ghost" href="#/lesson/${c.id}/${prev.id}">→ ${esc(prev.title)}</a>` : `<span></span>`}
          ${u && u.enrolled[c.id] ? `<a class="btn" href="#/student/lesson/${c.id}/${l.id}">تتبّع في فضاء الطلاب</a>` : `<button class="btn" data-enroll="${c.id}">التسجيل في الدورة</button>`}
          ${next ? `<a class="btn ghost" href="#/lesson/${c.id}/${next.id}">${esc(next.title)} ←</a>` : `<span></span>`}
        </div>
      </div>
      <aside class="detail-side sheet-side">${lessonSheet(c, l)}</aside>
    </section>`;
  }

  /* ---------------- فضاء الطلاب ---------------- */
  function viewAuth() {
    const pending = state.pendingEnroll && course(state.pendingEnroll);
    return `
    ${pageHead("فضاء الطلاب", "حساب واحد يحفظ تقدّمك في الدروس ونتائج اختباراتك وشهاداتك.", [["الرئيسية", "#/"], ["فضاء الطلاب"]])}
    <section class="wrap section">
      <div class="auth">
        ${pending ? `<div class="pending">📌 بعد الدخول ستُسجَّل مباشرة في دورة «${esc(pending.title)}».</div>` : ""}
        <ol class="steps" aria-label="خطوات البدء">
          <li><b>١</b>أنشئ حسابك</li><li><b>٢</b>سجّل في دورة</li><li><b>٣</b>تابع الدروس بالترتيب</li><li><b>٤</b>اختبر واحصل على شهادتك</li>
        </ol>
        <div class="tabs" role="tablist">
          <button class="tab ${pending ? "" : "on"}" data-tab="login" role="tab">لديّ حساب</button>
          <button class="tab ${pending ? "on" : ""}" data-tab="register" role="tab">حساب جديد</button>
        </div>
        <form id="loginForm" class="form" data-pane="login" ${pending ? "hidden" : ""}>
          <label>البريد الإلكتروني<input type="email" name="email" required autocomplete="email"></label>
          <label>كلمة المرور<input type="password" name="password" required autocomplete="current-password"></label>
          <button class="btn block">دخول</button>
          <button type="button" class="btn block ghost" id="demoLogin" data-demo>دخول سريع بحساب تجريبي</button>
        </form>
        <form id="registerForm" class="form" data-pane="register" ${pending ? "" : "hidden"}>
          <label>الاسم الكامل<input name="name" required minlength="3" autocomplete="name"></label>
          <label>البريد الإلكتروني<input type="email" name="email" required autocomplete="email"></label>
          <label>كلمة المرور<input type="password" name="password" required minlength="4" autocomplete="new-password"></label>
          <button class="btn block">إنشاء الحساب والبدء</button>
          <button type="button" class="btn block ghost" data-demo>أو جرّب فورًا بحساب تجريبي</button>
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
    ${continueCard(u) ? `<section class="wrap section">${continueCard(u)}</section>` : ""}
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
        : `<div class="empty"><b>ابدأ رحلتك باختيار دورة</b><br>هذه دورات مناسبة للمبتدئين، اضغط «التسجيل في الدورة» لتبدأ.</div>
           <div class="grid three mt">${state.courses.filter((c) => c.level === "مبتدئ").slice(0, 3).map((c) => courseCard(c, u)).join("")}</div>`}
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
          ${(() => { const st = nextStep(u, c); return `<a class="btn block lg mb-s" href="${st.href}">${st.kind === "lesson" ? `${st.label}: ${esc(st.lesson.topic)}` : st.label} ←</a>`; })()}
          <ol class="lessons">
            ${c.lessons.map((l, i) => {
              const isDone = done.includes(l.id);
              const unlocked = i === 0 || done.includes(c.lessons[i - 1].id);
              const cls = isDone ? "done" : unlocked ? "open" : "locked";
              const badge = isDone ? "✓" : unlocked ? arNum(i + 1) : "🔒";
              return `<li class="${cls}">${unlocked ? `<a href="#/student/lesson/${c.id}/${l.id}">` : `<div data-locked role="button" tabindex="0">`}
                  <span class="num">${isDone || !unlocked ? badge : pad2(l.num)}</span><span class="lt"><b>${esc(l.topic)}</b><small class="muted">${esc(l.title)} ${verseTag(l)}</small></span><span class="muted">${esc(l.duration)}</span>
                ${unlocked ? "</a>" : "</div>"}</li>`;
            }).join("")}
            <li class="${allDone ? (r ? "done" : "open") : "locked"} quiz-row">
              ${allDone ? `<a href="#/student/quiz/${c.id}">` : `<div data-locked="quiz" role="button" tabindex="0">`}<span class="num">${r ? "✓" : allDone ? "؟" : "🔒"}</span><span class="lt">الاختبار النهائي</span><span class="muted">${arNum(c.quiz.length)} أسئلة</span>${allDone ? "</a>" : "</div>"}
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
    u.last = { cid, lid, at: today() }; save();
    const nextHref = next ? `#/student/lesson/${c.id}/${next.id}` : `#/student/quiz/${c.id}`;
    return `
    ${pageHead(lessonName(l), `${arNum(i + 1)} من ${arNum(c.lessons.length)} — ${c.title}`, [["فضاء الطلاب", "#/student"], [c.title, "#/student/course/" + c.id], [l.title]])}
    <section class="wrap section detail">
      <div class="detail-main">
        ${lessonMain(c, l)}
        <div class="lesson-actions">
          ${i > 0 ? `<a class="btn ghost" href="#/student/lesson/${c.id}/${c.lessons[i - 1].id}">→ الدرس السابق</a>` : `<span></span>`}
          ${isDone
            ? `<a class="btn" href="${nextHref}">${next ? "الدرس التالي ←" : "إلى الاختبار النهائي ←"}</a>`
            : `<button class="btn" data-complete="${c.id}|${l.id}" data-go="${nextHref}">✓ أتممتُ الدرس${next ? "، التالي ←" : "، إلى الاختبار ←"}</button>`}
          <a class="btn ghost" href="#/student/course/${c.id}">قائمة الدروس</a>
        </div>
        ${isDone ? `<p class="done-note">✓ أتممتَ هذا الدرس</p>` : ""}
      </div>
      <aside class="detail-side sheet-side">${lessonSheet(c, l)}</aside>
    </section>`;
  }

  function viewQuiz(cid, params) {
    const u = me();
    const c = course(cid);
    if (!c || !u.enrolled[cid]) return viewNotFound();
    if (!c.lessons.every((l) => u.enrolled[cid].includes(l.id))) { toast("أتمّ جميع الدروس أولًا ليُفتح الاختبار", "warn"); location.hash = "#/student/course/" + cid; return ""; }
    const r = u.results[cid];
    const review = r && r.answers && !params.get("retry");
    const head = pageHead("الاختبار النهائي", `${c.title} — ${arNum(c.quiz.length)} أسئلة، والنجاح من ٦٠٪`, [["فضاء الطلاب", "#/student"], [c.title, "#/student/course/" + c.id], ["الاختبار"]]);
    if (review) {
      return `${head}
      <section class="wrap section narrow">
        <div class="result ${passed(r) ? "pass" : "fail"}">
          <b>${arNum(r.score)} / ${arNum(r.total)}</b>
          <span>${passed(r) ? "مبارك! اجتزت الاختبار بنجاح. راجع إجاباتك أدناه." : "لم تبلغ درجة النجاح بعد. راجع الإجابات الصحيحة ثم أعد المحاولة."}</span>
        </div>
        <div class="actions mb">
          ${passed(r) ? `<a class="btn" href="#/student/certificate/${c.id}">🏅 عرض الشهادة</a>` : ""}
          <a class="btn ${passed(r) ? "ghost" : ""}" href="#/student/quiz/${c.id}?retry=1">إعادة الاختبار</a>
          <a class="btn ghost" href="#/student/course/${c.id}">مراجعة الدروس</a>
        </div>
        ${c.quiz.map((q, qi) => {
          const chosen = r.answers[qi];
          const ok = chosen === q.answer;
          return `<div class="box q review ${ok ? "is-ok" : "is-bad"}">
            <p class="q-title">${ok ? "✓" : "✗"} ${arNum(qi + 1)}. ${esc(q.q)}</p>
            ${q.options.map((o, oi) => `<div class="opt ${oi === q.answer ? "right" : oi === chosen ? "wrong" : ""}">
              <span>${esc(o)}</span>${oi === q.answer ? `<small>الإجابة الصحيحة</small>` : oi === chosen ? `<small>إجابتك</small>` : ""}</div>`).join("")}
          </div>`; }).join("")}
      </section>`;
    }
    return `${head}
    <section class="wrap section narrow">
      <p class="note">ⓘ أجب عن جميع الأسئلة ثم اضغط «تسليم الإجابات». ستظهر لك الإجابات الصحيحة بعد التسليم، ويمكنك الإعادة متى شئت.</p>
      <form id="quizForm" data-course="${c.id}" class="quiz">
        ${c.quiz.map((q, qi) => `
          <fieldset class="box q">
            <legend>${arNum(qi + 1)}. ${esc(q.q)}</legend>
            ${q.options.map((o, oi) => `<label class="opt"><input type="radio" name="q${qi}" value="${oi}" required> <span>${esc(o)}</span></label>`).join("")}
          </fieldset>`).join("")}
        <p class="muted center-text" id="quizProgress">أجبت عن ٠ من ${arNum(c.quiz.length)}</p>
        <button class="btn lg block">تسليم الإجابات</button>
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
      <h1 class="adm-title">السلاسل وقوائم التشغيل</h1>
      <p class="muted">التنظيم: القسم العلمي ← السلسلة ← قائمة التشغيل ← الدرس ← تفاصيل الدرس</p>
      <div class="grid two">
        <form class="box form" id="addSeries">
          <h3>إضافة سلسلة</h3>
          <label>اسم السلسلة<input name="name" required placeholder="شرح مختصر الأخضري"></label>
          <label>القسم العلمي<select name="cat">${CATEGORIES.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></label>
          <div class="row">
            <label>المتن<input name="matn" placeholder="اسم المتن أو المنظومة"></label>
            <label>المؤلف<input name="author"></label>
          </div>
          <label>الوصف<textarea name="desc" rows="2"></textarea></label>
          <label class="check"><input type="checkbox" name="nazm"> المتن منظوم (تظهر حقول الأبيات في دروسه)</label>
          <button class="btn">إضافة السلسلة</button>
        </form>
        <form class="box form" id="addCourse">
          <h3>إضافة قائمة تشغيل (دورة)</h3>
          <label>العنوان<input name="title" required placeholder="كتاب الطهارة"></label>
          <label>الوصف<textarea name="desc" rows="2" required></textarea></label>
          <div class="row">
            <label>السلسلة<select name="series">${state.series.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select></label>
            <label>المعلم<select name="teacher">${state.teachers.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("")}</select></label>
          </div>
          <div class="row">
            <label>المستوى<select name="level"><option>مبتدئ</option><option>متوسط</option><option>متقدم</option><option>عام</option></select></label>
            <label>اللون<input type="color" name="color" value="#4a4486"></label>
          </div>
          <button class="btn">إضافة قائمة التشغيل</button>
        </form>
      </div>
      <div class="box mt">
        <h3>السلاسل</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>السلسلة</th><th>القسم</th><th>المتن</th><th>النوع</th><th>قوائم التشغيل</th><th></th></tr></thead>
          <tbody>${state.series.map((s) => `<tr><td><b>${esc(s.name)}</b></td><td>${esc(catOf(s.cat).name)}</td><td>${esc(s.matn || "—")}</td>
            <td>${s.nazm ? `<span class="tag">منظومة</span>` : `<span class="tag soft">منثور</span>`}</td><td>${arNum(playlistsOf(s.id).length)}</td>
            <td class="nowrap"><a class="link" href="#/series/${s.id}">عرض</a> · <button class="link danger" data-del-series="${s.id}">حذف</button></td></tr>`).join("")}</tbody>
        </table></div>
      </div>
      <div class="box mt">
        <h3>قوائم التشغيل</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>قائمة التشغيل</th><th>السلسلة</th><th>المعلم</th><th>الدروس</th><th></th></tr></thead>
          <tbody>${state.courses.map((c) => `<tr><td><b>${esc(c.title)}</b></td><td>${esc(seriesName(c.series))}</td><td>${esc((teacher(c.teacher) || {}).name || "—")}</td><td>${arNum(c.lessons.length)}</td>
            <td class="nowrap"><a class="link" href="#/admin/lessons?c=${c.id}">الدروس</a> · <button class="link danger" data-del-course="${c.id}">حذف</button></td></tr>`).join("")}</tbody>
        </table></div>
      </div>`;
  }

  function admLessons() {
    const params = new URLSearchParams((location.hash.split("?")[1]) || "");
    const c = course(params.get("c")) || state.courses[0];
    if (!c) return `<h1 class="adm-title">الدروس</h1><div class="empty">أضف قائمة تشغيل أولًا.</div>`;
    const s = seriesOf(c.series) || {};
    const editing = c.lessons.find((l) => l.id === params.get("edit"));
    const nextNum = c.lessons.reduce((m, l) => Math.max(m, l.num || 0), 0) + 1;
    const L0 = editing || { num: nextNum, title: lessonTitle(nextNum), topic: "", duration: "", video: "", image: "", summary: "", verses: null, notes: emptyNotes() };
    const showVerses = editing ? !!verseCount(L0.verses) : !!s.nazm;
    const lines = (k) => (L0.notes[k] || []).map((x) => (k === "definitions" ? `${x.term}: ${x.def}` : x)).join("\n");
    return `
      <h1 class="adm-title">الدروس وبطاقات البيانات</h1>
      <label class="inline">قائمة التشغيل:
        <select id="lessonCourse">${state.courses.map((x) => `<option value="${x.id}" ${x.id === c.id ? "selected" : ""}>${esc(seriesName(x.series))} ← ${esc(x.title)}</option>`).join("")}</select>
      </label>
      <div class="box mt">
        <h3>دروس «${esc(c.title)}» ${s.nazm ? `<span class="tag">منظومة</span>` : ""}</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>الرقم</th><th>الدرس</th><th>الأبيات</th><th>المدة</th><th>فيديو</th><th>صورة</th><th>فوائد</th><th></th></tr></thead>
          <tbody>${c.lessons.map((l) => `<tr class="${editing && editing.id === l.id ? "editing" : ""}">
            <td><span class="num-pill">${pad2(l.num)}</span></td>
            <td><b>${esc(l.topic)}</b><br><small class="muted">${esc(l.title)}</small></td>
            <td class="nowrap">${verseCount(l.verses) ? `${arNum(l.verses.from)} إلى ${arNum(l.verses.to)}` : "—"}</td>
            <td class="nowrap">${esc(l.duration || "—")}</td>
            <td>${ytId(l.video) ? "🎬" : "—"}</td><td>${l.image ? "🖼️" : "—"}</td><td>${hasNotes(l) ? "✓" : "—"}</td>
            <td class="nowrap"><a class="link" href="#/admin/lessons?c=${c.id}&edit=${l.id}">تعديل</a> · <a class="link" href="#/lesson/${c.id}/${l.id}">عرض</a> · <button class="link danger" data-del-lesson="${c.id}|${l.id}">حذف</button></td></tr>`).join("") || `<tr><td colspan="8" class="muted">لا توجد دروس.</td></tr>`}</tbody>
        </table></div>
      </div>

      <form class="box form mt" id="lessonForm" data-course="${c.id}" data-edit="${editing ? editing.id : ""}">
        <h3>${editing ? `تعديل بطاقة «${esc(lessonName(editing))}»` : "إضافة درس جديد"}</h3>
        <div class="row">
          <label>رقم الدرس<input type="number" name="num" min="1" value="${L0.num}" required></label>
          <label>عنوان الدرس<input name="title" value="${esc(L0.title)}" required></label>
        </div>
        <div class="row">
          <label>موضوع الدرس<input name="topic" value="${esc(L0.topic)}" required placeholder="مقدمة في الطهارة"></label>
          <label>مدة الدرس<input name="duration" value="${esc(L0.duration)}" placeholder="35 دقيقة"></label>
        </div>

        <label class="check"><input type="checkbox" name="hasVerses" id="hasVerses" ${showVerses ? "checked" : ""}> الدرس يعتمد على نظم (إظهار حقول الأبيات)</label>
        <fieldset class="verses-box" id="versesBox" ${showVerses ? "" : "hidden"}>
          <legend>الأبيات المشروحة</legend>
          <div class="row three">
            <label>بداية الأبيات (رقم البيت)<input type="number" name="vFrom" min="1" value="${L0.verses ? L0.verses.from : ""}"></label>
            <label>نهاية الأبيات (رقم البيت)<input type="number" name="vTo" min="1" value="${L0.verses ? L0.verses.to : ""}"></label>
            <label>عدد الأبيات<output id="vCount">${verseCount(L0.verses) ? versesWord(verseCount(L0.verses)) : "—"}</output></label>
          </div>
        </fieldset>

        <label>رابط الفيديو (يوتيوب)<input name="video" value="${esc(L0.video)}" placeholder="https://www.youtube.com/watch?v=..." dir="ltr"></label>

        <div class="img-field">
          <label for="lessonImage">صورة الدرس (صفحة من المتن أو صورة توضيحية)</label>
          <input type="file" id="lessonImage" accept="image/*">
          <input type="hidden" name="image" value="${esc(L0.image)}">
          <div class="img-preview" id="imgPreview" ${L0.image ? "" : "hidden"}>
            <img src="${esc(L0.image)}" alt="معاينة صورة الدرس">
            <button type="button" class="link danger" id="clearImage">إزالة الصورة</button>
          </div>
        </div>

        <label>ملخص الدرس (أهم المسائل التي تناولها الشيخ)<textarea name="summary" rows="3">${esc(L0.summary)}</textarea></label>

        <fieldset class="notes-box">
          <legend>الفوائد والتنبيهات العلمية <small class="muted">— كل سطر عنصر مستقل</small></legend>
          <div class="row">
            <label>💡 الفوائد المستخلصة<textarea name="fawaid" rows="3">${esc(lines("fawaid"))}</textarea></label>
            <label>📖 التعريفات المهمة <small class="muted">(المصطلح: التعريف)</small><textarea name="definitions" rows="3" placeholder="الطهارة لغة: النظافة">${esc(lines("definitions"))}</textarea></label>
          </div>
          <div class="row">
            <label>⚖️ المسائل الفقهية<textarea name="masail" rows="3">${esc(lines("masail"))}</textarea></label>
            <label>⚠️ التنبيهات التي ذكرها الشيخ<textarea name="tanbihat" rows="3">${esc(lines("tanbihat"))}</textarea></label>
          </div>
          <label>📚 المراجع العلمية<textarea name="refs" rows="2">${esc(lines("refs"))}</textarea></label>
        </fieldset>

        <div class="actions">
          <button class="btn">${editing ? "حفظ التعديلات" : "إضافة الدرس"}</button>
          ${editing ? `<a class="btn ghost" href="#/admin/lessons?c=${c.id}">إلغاء التعديل</a>` : ""}
        </div>
        <p class="note">ⓘ الصور تُضغط تلقائيًا وتُحفظ في متصفحك فقط (نسخة تجريبية دون خادم).</p>
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
      <h2>الجهة المشرفة</h2>
      <p class="about-org"><img class="logo-m" src="assets/logo-mahajja.png" alt="شعار معهد المحجة البيضاء" width="96" height="96"><img src="assets/logo.png" alt="جمعية عون وسند الخيرية" width="230" height="125"><span>منصة المحجة البيضاء من مشاريع <b>جمعية عون وسند الخيرية</b>، ضمن رسالتها في دعم التعليم وكفالة الطلاب والأساتذة.</span></p>
      <h2>الهوية البصرية</h2>
      <p>ألوان المنصة مستمدة من شعاري المحجة البيضاء والجهة المشرفة عليها:</p>
      <div class="swatches">
        <div class="swatch" style="--c:#2c2853"><i></i><span><b>الكحلي الموحّد</b><br>خلفية الشعارين <code>#2C2853</code></span></div>
        <div class="swatch" style="--c:#e4b0b5"><i></i><span><b>الوردي الموحّد</b><br>مزيج وردي الشعارين <code>#E4B0B5</code></span></div>
        <div class="swatch" style="--c:#c9a46a"><i></i><span><b>الذهبي الرملي</b><br>من مئذنة شعار المحجة <code>#C9A46A</code></span></div>
        <div class="swatch" style="--c:#4a4486"><i></i><span><b>البنفسجي التفاعلي</b><br>الأزرار والروابط <code>#4A4486</code></span></div>
        <div class="swatch" style="--c:#f7f5fa"><i></i><span><b>الأبيض</b><br>«المحجة البيضاء» <code>#F7F5FA</code></span></div>
      </div>
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
    else if (area === "series") html = viewSeries(seg[1]);
    else if (area === "playlist") html = viewPlaylist(seg[1]);
    else if (area === "lesson") html = viewLessonPublic(seg[1], seg[2]);
    else if (area === "student") {
      if (seg[1] === "courses" && !me()) html = viewStudentCourses();
      else if (!me()) html = viewAuth();
      else if (!seg[1]) html = viewStudentDash();
      else if (seg[1] === "courses") html = viewStudentCourses();
      else if (seg[1] === "course") html = viewCourse(seg[2]);
      else if (seg[1] === "lesson") html = viewLesson(seg[2], seg[3]);
      else if (seg[1] === "quiz") html = viewQuiz(seg[2], params);
      else if (seg[1] === "certificates") html = viewCertificates();
      else if (seg[1] === "certificate") html = viewCertificate(seg[2]);
      else html = viewNotFound();
    } else if (area === "admin") html = state.admin ? viewAdmin(seg[1]) : viewAdminLogin();
    else html = viewNotFound();

    if (html === "") return; // تمّت إعادة التوجيه
    $("#app").innerHTML = html;
    document.body.dataset.area = area;
    const navArea = ["series", "playlist", "lesson"].includes(area) ? "library" : area;
    $$(".main-nav a").forEach((a) => a.classList.toggle("on", a.dataset.area === navArea));
    const tab = area === "student" ? (seg[1] === "courses" ? "courses" : "student") : navArea;
    $$(".bottom-nav a").forEach((a) => a.classList.toggle("on", a.dataset.tab2 === tab));
    const bn = $('.bottom-nav a[data-tab2="student"] span:last-child');
    if (bn) bn.textContent = me() ? "دوراتي" : "دخول";
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
    const pending = state.pendingEnroll && course(state.pendingEnroll);
    state.pendingEnroll = null;
    if (pending) {
      if (!u.enrolled[pending.id]) u.enrolled[pending.id] = [];
      save();
      toast(`أهلًا بك، ${u.name}! سُجّلتَ في «${pending.title}»`);
      const st = nextStep(u, pending);
      location.hash = st.kind === "lesson" ? st.href : "#/student/course/" + pending.id;
      return;
    }
    save();
    toast("أهلًا بك، " + u.name);
    location.hash = "#/student";
  }

  function enroll(cid) {
    const u = me();
    if (!u) {
      state.pendingEnroll = cid; save();
      toast("خطوة واحدة: أنشئ حسابك وستُسجَّل في الدورة مباشرة");
      if (location.hash === "#/student") route(); else location.hash = "#/student";
      return;
    }
    if (!u.enrolled[cid]) u.enrolled[cid] = [];
    save();
    const c = course(cid);
    toast("تم التسجيل! ابدأ بالدرس الأول");
    location.hash = c && c.lessons[0] ? `#/student/lesson/${cid}/${c.lessons[0].id}` : "#/student/course/" + cid;
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("button, a, [data-tab], [data-locked]");
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
      toast(c.lessons.every((l) => u.enrolled[cid].includes(l.id)) ? "أحسنت! أتممت جميع الدروس، والاختبار متاح الآن" : "أحسنت! تم إتمام الدرس");
      if (d.go) location.hash = d.go; else route();
    } else if (d.locked !== undefined) {
      toast(d.locked === "quiz" ? "يُفتح الاختبار بعد إتمام جميع الدروس" : "هذا الدرس مقفل: أتمّ الدرس الذي قبله أولًا", "warn");
    } else if (d.demo !== undefined) {
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
    } else if (t.id === "fontToggle") {
      const sizes = ["", "lg", "xl"];
      const cur = sizes.indexOf(document.documentElement.dataset.font || "");
      const nx = sizes[(cur + 1) % sizes.length];
      if (nx) document.documentElement.dataset.font = nx; else delete document.documentElement.dataset.font;
      toast(["حجم الخط: عادي", "حجم الخط: كبير", "حجم الخط: كبير جدًا"][(cur + 1) % sizes.length]);
      try { localStorage.setItem("mahajja-font", nx); } catch (e2) { /* */ }
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
    } else if (d.delSeries) {
      if (playlistsOf(d.delSeries).length) { toast("احذف قوائم التشغيل التابعة للسلسلة أولًا", "warn"); return; }
      if (!confirmTap(t, "تأكيد الحذف؟")) return;
      state.series = state.series.filter((s) => s.id !== d.delSeries); save(); toast("تم حذف السلسلة"); route();
    } else if (d.zoom !== undefined) {
      const img = t.querySelector("img");
      const box = document.createElement("div");
      box.className = "lightbox"; box.tabIndex = -1;
      box.innerHTML = `<img src="${img.src}" alt="${esc(img.alt)}"><button type="button" class="lb-close" aria-label="إغلاق">✕</button>`;
      box.addEventListener("click", () => box.remove());
      document.body.appendChild(box); box.focus();
    } else if (t.id === "clearImage") {
      $("#lessonForm [name=image]").value = ""; $("#lessonImage").value = ""; $("#imgPreview").hidden = true;
    } else if (d.delAnn) {
      state.announcements = state.announcements.filter((a) => a.id !== d.delAnn); save(); toast("تم حذف الإعلان"); route();
    }
  });

  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.id === "lessonCourse") location.hash = "#/admin/lessons?c=" + t.value;
    if (t.id === "hasVerses") $("#versesBox").hidden = !t.checked;
    if (t.id === "lessonImage" && t.files[0]) {
      readImage(t.files[0]).then((url) => {
        $("#lessonForm [name=image]").value = url;
        $("#imgPreview img").src = url; $("#imgPreview").hidden = false;
      }).catch(() => toast("تعذّرت قراءة الصورة، جرّب ملفًا آخر", "warn"));
    }
    if (t.dataset.vid) {
      const [cid, lid] = t.dataset.vid.split("|");
      const l = course(cid).lessons.find((x) => x.id === lid);
      const v = t.value.trim();
      if (v && !ytId(v)) { toast("رابط يوتيوب غير صالح", "warn"); return; }
      l.video = v; save(); toast(v ? "تم ربط الفيديو بالدرس" : "تمت إزالة الفيديو"); route();
    }
  });

  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-locked]")) { e.preventDefault(); e.target.click(); }
  });
  document.addEventListener("change", (e) => {
    const f = e.target.form;
    if (f && f.id === "quizForm") {
      const total = f.querySelectorAll("fieldset").length;
      const answered = new Set($$("input:checked", f).map((x) => x.name)).size;
      $("#quizProgress").textContent = `أجبت عن ${arNum(answered)} من ${arNum(total)}`;
    }
  });
  document.addEventListener("input", (e) => {
    if (e.target.name === "vFrom" || e.target.name === "vTo") {
      const f = e.target.form;
      const n = verseCount({ from: Number(f.vFrom.value), to: Number(f.vTo.value) });
      $("#vCount").textContent = n ? versesWord(n) : "—";
    }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { const lb = $(".lightbox"); if (lb) lb.remove(); } });

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
        me().results[cid] = { score, total: c.quiz.length, date: today(), answers: c.quiz.map((q, i) => Number(v["q" + i])) };
        save();
        toast(passed(me().results[cid]) ? "مبارك! نجحت في الاختبار" : "لم تبلغ درجة النجاح، راجع الإجابات وأعد المحاولة", passed(me().results[cid]) ? "ok" : "warn");
        const qh = "#/student/quiz/" + cid;
        if (location.hash === qh) route(); else location.hash = qh;
        break;
      }
      case "adminLogin":
        if (v.user === "admin" && v.pass === "admin") { state.admin = true; save(); toast("مرحبًا بك في لوحة الإدارة"); route(); }
        else toast("بيانات الدخول غير صحيحة", "warn");
        break;
      case "addSeries":
        state.series.push({ id: uid("s"), name: v.name.trim(), cat: v.cat, matn: (v.matn || "").trim(), author: (v.author || "").trim(), desc: (v.desc || "").trim(), nazm: !!v.nazm });
        save(); toast("تمت إضافة السلسلة"); route();
        break;
      case "addCourse":
        state.courses.push({ id: uid("c"), title: v.title.trim(), desc: v.desc.trim(), series: v.series, teacher: v.teacher, level: v.level, color: v.color, lessons: [],
          quiz: [{ q: "سؤال تجريبي: هل أتممت دروس الدورة بتركيز؟", options: ["نعم", "لا"], answer: 0 }] });
        save(); toast("تمت إضافة الدورة — أضف دروسها الآن"); location.hash = "#/admin/lessons?c=" + state.courses[state.courses.length - 1].id;
        break;
      case "lessonForm": {
        if (v.video && !ytId(v.video)) { toast("رابط يوتيوب غير صالح", "warn"); break; }
        let verses = null;
        if (v.hasVerses) {
          verses = { from: Number(v.vFrom), to: Number(v.vTo) };
          if (!verseCount(verses)) { toast("تحقق من رقمي بداية الأبيات ونهايتها", "warn"); break; }
        }
        const list = (k) => (v[k] || "").split("\n").map((x) => x.trim()).filter(Boolean);
        const lesson = {
          num: Number(v.num), title: v.title.trim(), topic: v.topic.trim(), duration: v.duration.trim(),
          video: v.video.trim(), image: v.image || "", summary: v.summary.trim(), verses,
          notes: {
            fawaid: list("fawaid"), masail: list("masail"), tanbihat: list("tanbihat"), refs: list("refs"),
            definitions: list("definitions").map((x) => { const m = x.match(/^([^:：]+)[:：]\s*(.*)$/); return m ? { term: m[1].trim(), def: m[2].trim() } : { term: x, def: "" }; }),
          },
        };
        const c = course(f.dataset.course);
        const editId = f.dataset.edit;
        if (editId) Object.assign(c.lessons.find((l) => l.id === editId), lesson);
        else c.lessons.push(Object.assign({ id: uid("l") }, lesson));
        c.lessons.sort((a, b) => a.num - b.num);
        if (!save()) {
          toast("تعذّر الحفظ: مساحة المتصفح ممتلئة، جرّب صورة أصغر", "warn");
          break;
        }
        toast(editId ? "تم حفظ بطاقة الدرس" : "تمت إضافة الدرس");
        location.hash = "#/admin/lessons?c=" + c.id;
        if (!editId) route();
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
