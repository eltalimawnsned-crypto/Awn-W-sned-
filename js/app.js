/* =========================================================
   منصة المحجة البيضاء — الموقع العام (للزوار والطلاب)
   لا يحتوي هذا الملف على أي واجهة أو عملية إدارية؛ لوحة الإدارة
   مستقلة في admin/ وتعمل بحسابات إدارية وصلاحيات منفصلة.
   ========================================================= */
(function () {
  "use strict";
  const {
    state, save, resetState, $, $$, esc, uid, today, fmtDate, arNum, paras, toast, EMBED_OK, confirmTap,
    ytId, videoBlock, course, teacher, seriesName, me, allStudents, progressOf, passed,
    seriesOf, catOf, pad2, verseCount, versesWord, lessonName, NOTE_SECTIONS, hasNotes,
    nextStep, currentCourse, continueCard, playlistsOf, lessonsIn,
    isEmail, normPhone, isPhone, findStudent, contactOf, hashPassword, verifyPassword, currentStaff, ROLES,
    ic, CAT_ICON, catCover, seriesCover, courseCover, coverImg,
  } = MH;
  const catIc = (id) => ic(CAT_ICON[id] || "book");

  /* ---- تذكّر آخر طالب دخل من هذا الجهاز (لعودة أسهل بعد الخروج) ---- */
  const LAST_KEY = "mahajja-last-student";
  /* يُحفظ الاسم ووسيلة الدخول فقط (لا كلمة مرور)، فيعود الطالب بكلمة مروره */
  const getLast = () => { try { const o = JSON.parse(localStorage.getItem(LAST_KEY) || "null"); return o && o.id && o.contact ? o : null; } catch (e) { return null; } };
  const isLast = (u) => { const l = getLast(); return !!(l && u && l.id === u.id); };
  const setLast = (u) => { try { localStorage.setItem(LAST_KEY, JSON.stringify({ id: u.id, name: u.name, contact: u.email || u.phone })); } catch (e) { /* */ } };
  const forgetLast = () => { try { localStorage.removeItem(LAST_KEY); } catch (e) { /* */ } };
  /* حقل كلمة مرور مع زر إظهار/إخفاء */
  const pwInput = (name, auto, extra = "") => `<span class="pw-field"><input type="password" name="${name}" required autocomplete="${auto}" ${extra}><button type="button" class="pw-toggle" data-pw-toggle aria-label="إظهار كلمة المرور" title="إظهار كلمة المرور"></button></span>`;
  const forgotHelp = `
          <button type="button" class="link small forgot-link" data-forgot>نسيت كلمة المرور؟</button>
          <div class="note forgot-help" hidden>لحماية حسابك، تُستعاد كلمة المرور عن طريق <b>إدارة المعهد</b>: تواصل معها من رقمك المسجّل، فتعطيك كلمة مرور مؤقتة تدخل بها ثم تغيّرها من صفحة «حسابي».</div>`;
  /* تحقق كلمة مرور الطالب (يدعم الحسابات القديمة المخزّنة نصًا ويرقّيها إلى بصمة) */
  const checkStudentPw = async (u, pw) => {
    if (u.pwd) return verifyPassword(pw, u.pwd);
    if (u.password !== undefined && u.password === pw) { u.pwd = await hashPassword(pw); delete u.password; return true; }
    return false;
  };
  const regOpen = () => !!(state.settings && state.settings.regOpen);
  /* صفحة الدخول نفسها (#/student دون حساب) تعرض النماذج مباشرة، فلا حاجة للنافذة */
  const onAuthPage = () => !me() && /^#\/student\/?$/.test(location.hash);

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

  // صف مختصر للمادة: أيقونة النوع بدل صورة الغلاف المتكررة
  const libCard = (it) => `
    <a class="lib-row" href="#/library/item/${it.id}">
      <span class="lib-type ty-${it.type}" aria-hidden="true">${typeIcon[it.type]}</span>
      <span class="lib-info">
        <b>${esc(it.title)}</b>
        <small>${esc(it.author)}${it.duration ? " · " + esc(it.duration) : ""}</small>
      </span>
      <span class="lib-tag">${typeLabel[it.type]}</span>
    </a>`;

  const courseCard = (c, u) => {
    const enrolled = u && u.enrolled[c.id];
    const p = enrolled ? progressOf(u, c) : 0;
    const t = teacher(c.teacher);
    return `
    <article class="card course-card">
      <div class="course-band" style="--c:${esc(c.color || "#4a4486")}">
        ${coverImg(courseCover(c))}
        <small>${esc(seriesName(c.series))}</small>
        <h3>${esc(c.title)}</h3>
        ${!enrolled && regOpen() ? `<span class="reg-tag">التسجيل مفتوح</span>` : ""}
      </div>
      <div class="card-body">
        <p>${esc(c.desc)}</p>
        <p class="muted meta-line"><span>${ic("user")}${esc(t ? t.name : "—")}</span><span>${ic("book")}${arNum(c.lessons.length)} دروس</span><span>${ic("chart")}${esc(c.level)}</span></p>
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
        <div><b>${arNum(MH.cloud.studentCount())}</b><span>طالبًا مسجلًا</span></div>
      </div>
    </section>

    ${regOpen() && !me() ? `<section class="wrap section">
      <div class="reg-cta">
        <div class="reg-cta-text">
          <span class="reg-tag">التسجيل مفتوح</span>
          <h2>ابدأ طلب العلم اليوم</h2>
          <p>${esc(state.settings.regNote || "")}. يكفيك اسمك ورقم هاتفك وبريدك، ثم تبدأ أول درس مباشرة.</p>
        </div>
        <ol class="reg-steps"><li><b>١</b>اختر دورة</li><li><b>٢</b>سجّل في دقيقة</li><li><b>٣</b>ابدأ الدرس الأول</li></ol>
        <div class="actions">
          <button type="button" class="btn lg" data-signup>سجّل الآن مجانًا</button>
          <a class="btn lg ghost" href="#/student/courses">تصفّح الدورات</a>
        </div>
      </div>
    </section>` : ""}
    <section class="wrap section">
      <h2 class="sec-title">أقسام المنصة</h2>
      <div class="grid three">
        <a class="pillar" href="#/library"><span class="ico">📚</span><h3>المكتبة العلمية المفتوحة</h3><p>متاحة لجميع الزوار دون تسجيل: متون، سيرة، صحابة، تلاوات، تجويد، ولغة عربية.</p><span class="more">ادخل المكتبة ←</span></a>
        <a class="pillar" href="#/student"><span class="ico">🎓</span><h3>فضاء الطلاب</h3><p>سجّل في الدورات، تابع الدروس حسب ترتيبها، أجرِ الاختبارات، واحصل على الشهادات.</p><span class="more">ادخل فضاء الطلاب ←</span></a>
        <a class="pillar" href="#/student/courses"><span class="ico">📜</span><h3>الدورات والسلاسل</h3><p>سلاسل علمية منظمة بقوائم تشغيل ودروس مرتبة، لكل درس بطاقة بيانات وفوائد علمية.</p><span class="more">تصفّح الدورات ←</span></a>
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

  /* ---------------- واجهة المكتبة المصوّرة ---------------- */
  // [سطر العنوان الأول، السطر الذهبي، الصورة، الرابط (فارغ = قيد الإعداد)]
  const LX_SECTIONS = [
    ["العقيدة", "الإسلامية", "aqeedah", ""],
    ["آية", "وتدبر", "tadabbur", ""],
    ["التجويد", "وتصحيح التلاوة", "tajweed", "#/library?cat=tajweed"],
    ["القرآن الكريم", "والتلاوات", "quran", "#/library?cat=quran"],
    ["الأربعون", "النووية", "nawawi", "#/library?cat=hadith"],
    ["منظومة", "ابن عاشر", "ibn-ashir", "#/series/s-ibn"],
    ["مختصر", "الأخضري", "akhdari", "#/series/s-akh"],
    ["فقه", "العبادات", "ibadat", "#/library?cat=fiqh"],
    ["النحو", "والصرف", "nahw", "#/series/s-ar"],
    ["اللغة", "العربية", "arabic", "#/library?cat=arabic"],
    ["رجال حول", "الرسول <span class=\"lx-saw\">ﷺ</span>", "sahaba", "#/library?cat=sahaba"],
    ["السيرة", "النبوية", "seerah", "#/library?cat=seerah"],
    ["المكتبة", "الإسلامية", "islamic-lib", "#/library?view=all"],
    ["من المهد", "إلى الرشد", "childhood", ""],
    ["نور", "بيت المسلم", "family", ""],
    ["التربية", "الإسلامية", "tarbiya", ""],
  ];
  const LX_ORN = `<svg class="lx-orn" viewBox="0 0 160 12" fill="currentColor" aria-hidden="true"><rect x="0" y="5.4" width="66" height="1.2"/><rect x="94" y="5.4" width="66" height="1.2"/><path d="M80 0l6 6-6 6-6-6z"/><path d="M70 6l4-3 4 3-4 3zM82 6l4-3 4 3-4 3z" opacity=".7"/><circle cx="66" cy="6" r="1.6"/><circle cx="94" cy="6" r="1.6"/></svg>`;
  const LX_ICONS = {
    book: `<svg viewBox="0 0 64 48" fill="currentColor"><path d="M32 10C25 4 14 2 3 3v38c11-1 22 1 29 7 7-6 18-8 29-7V3C50 2 39 4 32 10zm-3 31C22 37 14 36 7 36V7c8 0 16 2 22 7zm28-5c-7 0-15 1-22 5V14c6-5 14-7 22-7z"/><path d="M12 13h12v2H12zm0 6h12v2H12zm0 6h12v2H12zm28-12h12v2H40zm0 6h12v2H40zm0 6h12v2H40z" opacity=".55"/></svg>`,
    play: `<svg viewBox="0 0 64 54" fill="none" stroke="currentColor" stroke-width="3"><rect x="10" y="3" width="44" height="28" rx="3"/><path d="M28 11l10 6-10 6z" fill="currentColor"/><path d="M32 46c-6-5-15-6-27-6V34c12 0 21 1 27 6 6-5 15-6 27-6v6c-12 0-21 1-27 6z" fill="currentColor" stroke="none"/></svg>`,
    people: `<svg viewBox="0 0 64 54" fill="currentColor"><circle cx="32" cy="9" r="7"/><circle cx="15" cy="14" r="5.5"/><circle cx="49" cy="14" r="5.5"/><path d="M20 30c0-7 5-12 12-12s12 5 12 12zM5 30c0-6 4-10 10-10 3 0 5 1 7 3-2 2-3 4-3 7zm54 0c0-6-4-10-10-10-3 0-5 1-7 3 2 2 3 4 3 7z"/><path d="M32 50c-6-5-15-6-27-6v-9c12 0 21 1 27 6 6-5 15-6 27-6v9c-12 0-21 1-27 6z"/></svg>`,
  };
  const lxCard = (cls, img, inner, href) =>
    `<a class="lx-card ${cls}" href="${href || "#/library"}"${href ? "" : " data-soon"}>
      <span class="lx-photo" style="background-image:url('assets/library/${img}.jpg')"></span>
      <span class="lx-panel">${inner}${LX_ORN}</span><span class="lx-curve"></span>
      ${href ? "" : `<span class="lx-soon">قريبًا</span>`}
    </a>`;
  function libraryGateway() {
    return `
    <section class="wrap lx-gate">
      <div class="lx-top">
        ${lxCard("lx-hero", "hero", `<span class="lx-ico">${LX_ICONS.book}</span><b class="lx-title"><span class="g">المكتبة العلمية</span></b>`, "#/library?view=all")}
        ${lxCard("lx-mid", "courses", `<span class="lx-ico">${LX_ICONS.play}</span><b class="lx-title">الدورات<br><span class="g">والسلاسل</span></b>`, "#/student/courses")}
        ${lxCard("lx-mid", "students", `<span class="lx-ico">${LX_ICONS.people}</span><b class="lx-title">فضاء<br><span class="g">الطلاب</span></b>`, "#/student")}
      </div>
      <form class="search lx-search" id="libSearch" role="search">
        <input type="search" name="q" placeholder="ابحث عن درس أو شيخ أو موضوع…" aria-label="بحث في المكتبة">
        <button class="btn">بحث</button>
      </form>
      <h2 class="sec-title lx-head">أقسام المكتبة</h2>
      <div class="lx-grid">
        ${LX_SECTIONS.map(([a, b, img, href]) => lxCard("lx-tile", img, `<b class="lx-title">${a}<br><span class="g">${b}</span></b>`, href)).join("")}
      </div>
    </section>`;
  }

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
    // صفحة المكتبة الرئيسية: الأقسام فقط، والمحتوى يظهر عند اختيار قسم
    if (params.toString() === "") return libraryGateway();
    const title = catObj ? catObj.name : q ? "نتائج البحث" : "جميع المواد";
    return `
    ${pageHead(title, catObj ? catObj.desc : q ? "«" + q + "»" : "كل ما في المكتبة العلمية.", [["الرئيسية", "#/"], ["المكتبة", "#/library"], [title]])}
    <section class="wrap section">
      <form class="search" id="libSearch">
        <input type="search" name="q" placeholder="ابحث عن درس أو شيخ أو موضوع…" value="${esc(q)}" aria-label="بحث في المكتبة">
        <button class="btn">بحث</button>
      </form>
      <div class="chips sub">
        ${["all", "video", "audio", "text"].map((t) => `<a class="chip sm ${type === t ? "on" : ""}" href="${link("type", t)}">${t === "all" ? "كل الأنواع" : typeLabel[t]}</a>`).join("")}
      </div>
      ${ser.length ? `<h2 class="sec-title mt">السلاسل العلمية</h2><div class="row-list mb">${ser.map(seriesCard).join("")}</div>` : ""}
      ${q && foundLessons.length ? `<h2 class="sec-title">دروس مطابقة</h2><ul class="found mb">${foundLessons.slice(0, 12).map(({ c, l }) => `<li><a href="#/lesson/${c.id}/${l.id}"><span class="num-pill">${pad2(l.num)}</span><span><b>${esc(l.topic)}</b><small class="muted">${esc(seriesOf(c.series)?.name || "")} — ${esc(c.title)}</small></span></a></li>`).join("")}</ul>` : ""}
      ${items.length || !ser.length ? `<h2 class="sec-title">المواد <small class="muted">(${arNum(items.length)})</small></h2>
      <div class="row-list">${items.map(libCard).join("") || `<div class="empty">لا توجد مواد في هذا القسم بعد.</div>`}</div>` : ""}
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
            <dt>القسم</dt><dd>${catIc(cat.id)} ${esc(cat.name)}</dd>
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
    const pls = playlistsOf(s.id);
    return `
    <a class="ser-row" href="#/series/${s.id}">
      <span class="ser-ic" aria-hidden="true">${ic("scroll")}</span>
      <span class="lib-info">
        <b>${esc(s.name)}</b>
        <small>${s.matn ? esc(s.matn) + (s.author ? " — " + esc(s.author) : "") : esc(s.desc)}</small>
        <small class="ser-meta">${arNum(pls.length)} قوائم تشغيل · ${arNum(lessonsIn(s.id))} درسًا${s.nazm ? " · منظومة" : ""}</small>
      </span>
      <span class="ser-go" aria-hidden="true">‹</span>
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
            <dt>القسم العلمي</dt><dd>${catIc(cat.id)} ${esc(cat.name)}</dd>
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
  /* نماذج الدخول والتسجيل المختصرة — تُستخدم في صفحة الطلاب وفي النافذة المنبثقة */
  let preferLogin = false; // بعد «ادخل بحساب آخر» يُفتح نموذج الدخول لا التسجيل
  const authForms = (startOnRegister) => {
    const open = regOpen();
    const last = me() ? null : getLast();
    const reg = open && startOnRegister && !last && !preferLogin;
    preferLogin = false;
    return `
        <div class="tabs" role="tablist">
          <button type="button" class="tab ${reg ? "" : "on"}" data-tab="login" role="tab">لديّ حساب</button>
          <button type="button" class="tab ${reg ? "on" : ""}" data-tab="register" role="tab">حساب جديد</button>
        </div>
        <form class="form" data-form="login" data-pane="login" ${reg ? "hidden" : ""}>
          ${last ? `
          <div class="welcome-back">
            <span class="avatar" aria-hidden="true">${esc(last.name.trim()[0])}</span>
            <span><b>مرحبًا بعودتك، ${esc(last.name.split(" ")[0])}</b><small>حسابك محفوظ على هذا الجهاز</small></span>
          </div>
          <input type="hidden" name="remembered" value="1">
          <input type="hidden" name="remember" value="1">
          <label>كلمة المرور${pwInput("password", "current-password", "autofocus")}</label>
          <button class="btn block">دخول</button>
          ${forgotHelp}
          <button type="button" class="link small center-text" data-forget-last>لستَ ${esc(last.name.split(" ")[0])}؟ ادخل بحساب آخر</button>` : `
          <label>رقم الهاتف أو البريد<input name="contact" required autocomplete="username" dir="ltr" placeholder="22 33 44 55"></label>
          <label>كلمة المرور${pwInput("password", "current-password")}</label>
          <label class="check remember"><input type="checkbox" name="remember" checked> تذكّرني على هذا الجهاز <small class="muted">(لا تفعّله على جهاز مشترك)</small></label>
          <button class="btn block">دخول</button>
          ${forgotHelp}`}
        </form>
        <form class="form" data-form="register" data-pane="register" ${reg ? "" : "hidden"}>
          ${open ? `
          <label>الاسم الكامل<input name="name" required minlength="3" autocomplete="name"></label>
          <label>رقم الهاتف<input type="tel" name="phone" required inputmode="tel" autocomplete="tel" dir="ltr" placeholder="22 33 44 55"></label>
          <label>البريد الإلكتروني<input type="email" name="email" required autocomplete="email" dir="ltr" placeholder="name@example.com"></label>
          <label>كلمة المرور <small class="muted">(4 أحرف أو أرقام على الأقل)</small>${pwInput("password", "new-password", 'minlength="4"')}</label>
<label class="check remember"><input type="checkbox" name="remember" checked> تذكّرني على هذا الجهاز <small class="muted">(لا تفعّله على جهاز مشترك)</small></label>
          <button class="btn block">أنشئ حسابي وابدأ ←</button>
          <p class="muted small center-text">مجاني بالكامل · تدخل لاحقًا بالرقم أو بالبريد</p> ` : `
          <div class="empty small">التسجيل مغلق حاليًا، وسيُعلَن عن موعد فتحه.<br>يمكنك تصفّح المكتبة والدروس بحرية، ومن لديه حساب يستطيع الدخول.</div>`}
        </form>`;
  };

  /* نافذة تسجيل سريعة فوق الصفحة الحالية، دون مغادرتها */
  let modalCid = null;
  function openAuthModal(cid) {
    closeAuthModal();
    modalCid = cid || null;
    const c = cid && course(cid);
    const box = document.createElement("div");
    box.className = "modal-back";
    box.innerHTML = `
      <div class="modal auth" role="dialog" aria-modal="true" aria-labelledby="authTitle">
        <button type="button" class="modal-close" data-close-modal aria-label="إغلاق">✕</button>
        <h2 id="authTitle">${c ? `التسجيل في «${esc(c.title)}»` : "سجّل في المعهد"}</h2>
        <p class="muted">${getLast() ? "ادخل بكلمة مرورك لتتابع." : regOpen() ? "خطوة واحدة وتبدأ الدرس الأول مباشرة." : "سجّل الدخول بحسابك لمتابعة دراستك."}</p>
        ${authForms(true)}
      </div>`;
    document.body.appendChild(box);
    document.body.classList.add("modal-open");
    const first = box.querySelector("form:not([hidden]) input");
    if (first) first.focus();
  }
  function closeAuthModal() {
    const m = $(".modal-back");
    if (m) m.remove();
    document.body.classList.remove("modal-open");
  }

  /* تنبيه عندما لا يسمح المتصفح بحفظ الحساب (تصفح خاص، أو حظر ملفات تعريف الارتباط) */
  function renderStorageWarn() {
    if (MH.storageOK || $("#storageWarn")) return;
    $(".site-header").insertAdjacentHTML("afterend", `<div id="storageWarn" role="alert"><div class="wrap">
      ⚠️ <b>متصفحك لا يحفظ بيانات هذا الموقع</b>، فلن يبقى دخولك ولا حسابك ولا تقدّمك بعد إغلاق الصفحة.
      السبب غالبًا: <b>التصفح الخاص</b> أو <b>حظر ملفات تعريف الارتباط</b>. افتح الموقع في نافذة عادية في Safari أو Chrome.</div></div>`);
  }

  /* شريط «باب التسجيل مفتوح» أعلى الموقع للزوار */
  function renderRegBar(area) {
    let bar = $("#regBar");
    let hidden = false;
    try { hidden = sessionStorage.getItem("mahajja-regbar") === "x"; } catch (e) { /* */ }
    const show = regOpen() && !me() && !hidden && area !== "student";
    if (!show) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "regBar";
      $(".site-header").insertAdjacentElement("afterend", bar);
    }
    bar.innerHTML = `<div class="wrap reg-bar-inner">
      <span>🎓 <b>باب التسجيل مفتوح</b><small class="reg-note"> — ${esc(state.settings.regNote || "")}</small></span>
      <button type="button" class="btn sm" data-signup>سجّل الآن</button>
      <button type="button" class="reg-bar-x" data-hide-regbar aria-label="إخفاء">✕</button></div>`;
  }

  function viewAuth() {
    const pending = state.pendingEnroll && course(state.pendingEnroll);
    return `
    ${pageHead("فضاء الطلاب", regOpen() ? "التسجيل مفتوح ومجاني: الاسم ورقم الهاتف والبريد وكلمة مرور، وتبدأ التعلم فورًا." : "حساب واحد يحفظ تقدّمك في الدروس ونتائج اختباراتك وشهاداتك.", [["الرئيسية", "#/"], ["فضاء الطلاب"]])}
    <section class="wrap section">
      <div class="auth">
        ${pending ? `<div class="pending">📌 بعد الدخول ستُسجَّل مباشرة في دورة «${esc(pending.title)}».</div>` : ""}
        <ol class="steps" aria-label="خطوات البدء">
          <li><b>١</b>أنشئ حسابك</li><li><b>٢</b>سجّل في دورة</li><li><b>٣</b>تابع الدروس بالترتيب</li><li><b>٤</b>اختبر واحصل على شهادتك</li>
        </ol>
        ${authForms(!!pending || regOpen())}
        <p class="note">ⓘ هذه واجهة تجريبية: تُحفظ البيانات في متصفحك فقط ولا تُرسل إلى أي خادم.</p>
      </div>
    </section>`;
  }

  const studentNav = (active) => `
    <nav class="subnav wrap">
      ${[["dash", "#/student", "لوحتي"], ["courses", "#/student/courses", "الدورات"], ["certs", "#/student/certificates", "الشهادات"], ["account", "#/student/account", "حسابي"]]
        .map(([k, h, t]) => `<a href="${h}" class="${active === k ? "on" : ""}">${t}</a>`).join("")}
      <button type="button" class="btn sm ghost logout-btn" data-logout>تسجيل الخروج ⎋</button>
    </nav>`;

  function viewAccount() {
    const u = me();
    return `
    ${pageHead("حسابي", "بياناتك في المعهد، وتستطيع تعديلها في أي وقت.", [["فضاء الطلاب", "#/student"], ["حسابي"]])}
    ${studentNav("account")}
    <section class="wrap section narrow">
      ${u.mustChangePw ? `<div class="pending">🔑 كلمة مرورك الحالية مؤقتة من الإدارة؛ اختر كلمة مرور جديدة بالأسفل.</div>` : ""}
      <form class="box form" data-form="profile">
        <h3>بياناتي <span class="tag role-tag role-student">حساب طالب</span></h3>
        <label>الاسم الكامل<input name="name" required minlength="3" value="${esc(u.name)}" autocomplete="name"></label>
        <div class="row">
          <label>رقم الهاتف<input type="tel" name="phone" required inputmode="tel" dir="ltr" value="${esc(u.phone || "")}" autocomplete="tel"></label>
          <label>البريد الإلكتروني<input type="email" name="email" required dir="ltr" value="${esc(u.email || "")}" autocomplete="email"></label>
        </div>
        <button class="btn">حفظ البيانات</button>
        <p class="muted small">تدخل إلى حسابك بالرقم أو بالبريد. عضو منذ ${fmtDate(u.joined)}.</p>
      </form>
      <form class="box form" data-form="changePw">
        <h3>تغيير كلمة المرور</h3>
        ${u.mustChangePw ? "" : `<label>كلمة المرور الحالية${pwInput("current", "current-password")}</label>`}
        <div class="row">
          <label>كلمة المرور الجديدة${pwInput("next", "new-password", 'minlength="4"')}</label>
          <label>تأكيدها${pwInput("confirm", "new-password", 'minlength="4"')}</label>
        </div>
        <button class="btn">تغيير كلمة المرور</button>
      </form>
      <div class="box account-out">
        <div><b>تسجيل الخروج</b><p class="muted small">${isLast(u) ? "هذا الجهاز يتذكر حسابك، فتعود بكلمة المرور فقط. إن كان الجهاز مشتركًا فاختر «الخروج ونسيان هذا الجهاز»." : "هذا الجهاز لا يحفظ حسابك؛ تعود برقمك أو بريدك وكلمة المرور."}</p></div>
        <div class="actions">
          <button type="button" class="btn ghost logout-block" data-logout>تسجيل الخروج ⎋</button>
          ${isLast(u) ? `<button type="button" class="btn ghost logout-block" data-logout-forget>الخروج ونسيان هذا الجهاز</button>` : ""}
        </div>
      </div>
    </section>`;
  }

  function viewStudentDash() {
    const u = me();
    const mine = state.courses.filter((c) => u.enrolled[c.id]);
    const doneLessons = mine.reduce((s, c) => s + (u.enrolled[c.id] || []).length, 0);
    const certs = Object.entries(u.results).filter(([, r]) => passed(r)).length;
    return `
    ${pageHead("مرحبًا، " + u.name, "تابع رحلتك العلمية خطوة بخطوة.", [["الرئيسية", "#/"], ["فضاء الطلاب"]])}
    ${studentNav("dash")}
    ${u.mustChangePw ? `<section class="wrap section"><div class="pending">🔑 دخلتَ بكلمة مرور مؤقتة من الإدارة. <a href="#/student/account">غيّرها الآن من «حسابي»</a></div></section>` : ""}
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
    </section>
    <section class="wrap section mobile-only">
      <button type="button" class="btn block ghost logout-block" data-logout>تسجيل الخروج ⎋</button>
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


  function viewAbout() {
    return `
    ${pageHead("عن المنصة", SITE.slogan, [["الرئيسية", "#/"], ["عن المنصة"]])}
    <section class="wrap section narrow prose">
      <h2>رسالتنا</h2><p>${esc(SITE.mission)}</p>
      <h2>الجهة المشرفة</h2>
      <p class="about-org"><img class="logo-m" src="assets/logo-mahajja.png" alt="شعار معهد المحجة البيضاء" width="96" height="96"><img src="assets/logo.png" alt="جمعية عون وسند الخيرية" width="230" height="125"><span>منصة المحجة البيضاء من مشاريع <b>جمعية عون وسند الخيرية</b>، ضمن رسالتها في دعم التعليم وكفالة الطلاب والأساتذة.</span></p>
      <h2>سبب التسمية</h2>
      <p>اسم المنصة مأخوذ من قول النبي ﷺ: ${esc(SITE.hadith)}، والمحجة هي جادّة الطريق الواضحة، فنسأل الله أن تكون هذه المنصة سبيلًا واضحًا لطلب العلم.</p>
      <h2>أقسام المنصة</h2>
      <ul><li><b>المكتبة العلمية المفتوحة:</b> متاحة للجميع دون تسجيل.</li><li><b>فضاء الطلاب:</b> دورات منظمة، متابعة للإنجاز، اختبارات، وشهادات.</li><li><b>السلاسل والدورات:</b> قوائم تشغيل مرتبة، لكل درس بطاقة بيانات وفوائد علمية.</li></ul>
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
      else if (seg[1] === "account") html = viewAccount();
      else html = viewNotFound();
    } else html = viewNotFound();

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
    updateAdminLink();
    closeAuthModal();
    renderRegBar(area);
    renderStorageWarn();
    window.scrollTo(0, 0);
  }

  function closeUserMenu() {
    const m = $("#userMenu"), b = $("#userMenuBtn");
    if (m) m.hidden = true;
    if (b) b.setAttribute("aria-expanded", "false");
  }

  /* رابط «لوحة الإدارة» في الموقع العام: خاص، يظهر فقط لمن له جلسة إدارية صالحة على هذا الجهاز.
     لا يمنح أي صلاحية؛ لوحة الإدارة نفسها تتحقق من الحساب ودوره عند كل صفحة وعملية. */
  function updateAdminLink() {
    const acc = currentStaff();
    document.querySelectorAll(".nav-admin, #adminChip").forEach((x) => x.parentNode.removeChild(x));
    delete document.body.dataset.staff;
    if (!acc) return;
    const role = ROLES[acc.role];
    $(".main-nav").insertAdjacentHTML("beforeend",
      `<a href="admin/#/overview" class="nav-admin" data-area="admin">🛡️ لوحة الإدارة <span class="tag role-tag role-${acc.role}">${role.label}</span></a>`);
    document.body.dataset.staff = acc.role; // نقطة بلون الدور على زر القائمة في الهاتف
  }

  function updateUserChip() {
    const u = me();
    $("#userChip").innerHTML = u
      ? `<div class="user-menu-wrap">
          <button type="button" class="avatar" id="userMenuBtn" aria-haspopup="true" aria-expanded="false" aria-controls="userMenu" title="حسابي: ${esc(u.name)}">${esc(u.name.trim()[0])}</button>
          <div class="user-menu" id="userMenu" role="menu" hidden>
            <div class="um-head"><b>${esc(u.name)} <span class="tag role-tag role-student">طالب</span></b><small dir="ltr">${esc(contactOf(u))}</small></div>
            <a href="#/student" role="menuitem">لوحتي</a>
            <a href="#/student/courses" role="menuitem">الدورات</a>
            <a href="#/student/certificates" role="menuitem">شهاداتي</a>
            <a href="#/student/account" role="menuitem">حسابي</a>
            <button type="button" class="um-logout" role="menuitem" data-logout>تسجيل الخروج ⎋</button>
            ${isLast(u) ? `<button type="button" class="um-forget" role="menuitem" data-logout-forget>الخروج ونسيان هذا الجهاز</button>` : ""}
          </div>
        </div>`
      : `<a href="#/student" class="btn sm">دخول الطلاب</a>`;
  }

  /* ---------------- الأحداث ---------------- */
  /* الانتقال إلى عنوان؛ وإن كان هو العنوان الحالي تُعاد الصفحة يدويًا (فالمتصفح لا يطلق hashchange) */
  const go = (h) => { if (location.hash === h) route(); else location.hash = h; };

  function login(u, remember) {
    state.session = u.id;
    /* اطلب من المتصفح ألا يحذف بيانات الموقع تلقائيًا، فيبقى الطالب داخلًا على جهازه */
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) { /* */ }
    if (remember) setLast(u); else forgetLast();
    const wasModal = !!$(".modal-back");
    const pending = state.pendingEnroll && course(state.pendingEnroll);
    state.pendingEnroll = null;
    if (pending) {
      if (!u.enrolled[pending.id]) u.enrolled[pending.id] = [];
      save();
      toast(`أهلًا بك، ${u.name}! سُجّلتَ في «${pending.title}»`);
      const st = nextStep(u, pending);
      go(st.kind === "lesson" ? st.href : "#/student/course/" + pending.id);
      return;
    }
    save();
    toast("أهلًا بك، " + u.name);
    if (wasModal) { closeAuthModal(); go("#/student/courses"); return; }
    go("#/student");
  }

  function enroll(cid) {
    const u = me();
    if (!u) {
      state.pendingEnroll = cid; save();
      if (onAuthPage()) { route(); return; }
      openAuthModal(cid);
      return;
    }
    if (!u.enrolled[cid]) u.enrolled[cid] = [];
    save();
    const c = course(cid);
    toast("تم التسجيل! ابدأ بالدرس الأول");
    location.hash = c && c.lessons[0] ? `#/student/lesson/${cid}/${c.lessons[0].id}` : "#/student/course/" + cid;
  }


  document.addEventListener("click", async (e) => {
    if (e.target.classList && e.target.classList.contains("modal-back")) { state.pendingEnroll = null; save(); closeAuthModal(); return; }
    const um = $("#userMenu");
    if (um && !um.hidden && !e.target.closest(".user-menu-wrap")) closeUserMenu();
    if (um && !um.hidden && e.target.closest(".user-menu a")) closeUserMenu();
    const t = e.target.closest("button, a, [data-tab], [data-locked]");
    if (!t) return;
    const d = t.dataset;

    if (d.soon !== undefined) {
      e.preventDefault();
      toast("هذا القسم قيد الإعداد، وسيُتاح قريبًا بإذن الله", "warn");
    } else if (d.tab) {
      const scope = t.closest(".auth") || document;
      $$(".tab", scope).forEach((x) => x.classList.toggle("on", x === t));
      $$("[data-pane]", scope).forEach((p) => (p.hidden = p.dataset.pane !== d.tab));
      const first = $("[data-pane]:not([hidden]) input", scope);
      if (first) first.focus();
    } else if (d.enroll) enroll(d.enroll);
    else if (d.signup !== undefined) {
      state.pendingEnroll = null; save();
      if (onAuthPage()) { route(); return; }
      openAuthModal(null);
    } else if (d.closeModal !== undefined) {
      state.pendingEnroll = null; save(); closeAuthModal();
    } else if (d.hideRegbar !== undefined) {
      try { sessionStorage.setItem("mahajja-regbar", "x"); } catch (e2) { /* */ }
      const b = $("#regBar"); if (b) b.remove();
    } else if (d.complete) {
      const [cid, lid] = d.complete.split("|");
      const u = me();
      if (!u.enrolled[cid].includes(lid)) u.enrolled[cid].push(lid);
      save();
      const c = course(cid);
      toast(c.lessons.every((l) => u.enrolled[cid].includes(l.id)) ? "أحسنت! أتممت جميع الدروس، والاختبار متاح الآن" : "أحسنت! تم إتمام الدرس");
      if (d.go) location.hash = d.go; else route();
    } else if (d.locked !== undefined) {
      toast(d.locked === "quiz" ? "يُفتح الاختبار بعد إتمام جميع الدروس" : "هذا الدرس مقفل: أتمّ الدرس الذي قبله أولًا", "warn");
    } else if (d.forgot !== undefined) {
      const h = t.parentElement.querySelector(".forgot-help"); if (h) h.hidden = !h.hidden;
    } else if (d.pwToggle !== undefined) {
      // يعالجه js/core.js لكل خانات كلمة المرور
    } else if (d.forgetLast !== undefined) {
      forgetLast(); preferLogin = true;
      if ($(".modal-back")) openAuthModal(modalCid); else route();
    } else if (t.id === "userMenuBtn") {
      const m = $("#userMenu"); const open = m.hidden;
      m.hidden = !open; t.setAttribute("aria-expanded", String(open));
      if (open) { const f = m.querySelector("a"); if (f) f.focus(); }
    } else if (t.id === "logout" || d.logout !== undefined || d.logoutForget !== undefined) {
      const forget = d.logoutForget !== undefined;
      if (forget) forgetLast();
      state.pendingEnroll = null;
      await MH.cloud.signOut();
      $("#toasts").innerHTML = ""; // لا تبقى رسالة ترحيب باسم الطالب ظاهرة بعد خروجه
      toast(forget ? "تم تسجيل الخروج ومسح حسابك من هذا الجهاز" : getLast() ? "تم تسجيل الخروج. للعودة: اضغط «دخول» واكتب كلمة مرورك" : "تم تسجيل الخروج. للعودة: اضغط «دخول» برقمك أو بريدك");
      go("#/");
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
    } else if (d.zoom !== undefined) {
      const img = t.querySelector("img");
      const box = document.createElement("div");
      box.className = "lightbox"; box.tabIndex = -1;
      box.innerHTML = `<img src="${img.src}" alt="${esc(img.alt)}"><button type="button" class="lb-close" aria-label="إغلاق">✕</button>`;
      box.addEventListener("click", () => box.remove());
      document.body.appendChild(box); box.focus();
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
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const um = $("#userMenu"); if (um && !um.hidden) { closeUserMenu(); $("#userMenuBtn").focus(); return; }
    const lb = $(".lightbox"); if (lb) { lb.remove(); return; }
    if ($(".modal-back")) { state.pendingEnroll = null; save(); closeAuthModal(); }
  });

  document.addEventListener("submit", async (e) => {
    const f = e.target;
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f).entries());

    switch (f.dataset.form || f.id) {
      case "libSearch": {
        const p = new URLSearchParams((location.hash.split("?")[1]) || "");
        v.q ? p.set("q", v.q) : p.delete("q");
        location.hash = "#/library" + (p.toString() ? "?" + p : "");
        break;
      }
      case "login": {
        const last = getLast();
        const contact = v.remembered ? (last && last.contact) : v.contact;
        const btn = f.querySelector("button.btn"); if (btn) btn.disabled = true;
        const r = await MH.cloud.signIn(contact, v.password, false);
        if (btn) btn.disabled = false;
        if (r.error) { toast(MH.cloud.msg(r.error), "warn"); break; }
        login(me(), !!v.remember);
        break;
      }
      case "profile": {
        const u = me(); if (!u) break;
        const phone = (v.phone || "").trim(), email = (v.email || "").trim();
        if (!isPhone(phone)) { toast("اكتب رقم هاتف صحيحًا (8 أرقام على الأقل)", "warn"); break; }
        if (!isEmail(email)) { toast("اكتب بريدًا إلكترونيًا صحيحًا", "warn"); break; }
        u.name = v.name.trim(); u.phone = normPhone(phone); u.email = email.toLowerCase();
        save(); toast("تم حفظ بياناتك"); route();
        break;
      }
      case "changePw": {
        const u = me(); if (!u) break;
        if (v.next !== v.confirm) { toast("كلمتا المرور الجديدتان غير متطابقتين", "warn"); break; }
        const r = await MH.cloud.changeMyPassword(v.current, v.next);
        if (r.error) { toast(MH.cloud.msg(r.error), "warn"); break; }
        delete u.mustChangePw;
        save(); toast("تم تغيير كلمة المرور"); route();
        break;
      }
      case "register": {
        if (!regOpen()) { toast("التسجيل مغلق حاليًا", "warn"); break; }
        const phone = (v.phone || "").trim(), email = (v.email || "").trim();
        if (!isPhone(phone)) { toast("اكتب رقم هاتف صحيحًا (8 أرقام على الأقل)", "warn"); break; }
        if (!isEmail(email)) { toast("اكتب بريدًا إلكترونيًا صحيحًا، مثل name@example.com", "warn"); break; }
        const btn = f.querySelector("button.btn"); if (btn) btn.disabled = true;
        const r = await MH.cloud.register({ name: v.name.trim(), phone: normPhone(phone), email: email.toLowerCase(), password: v.password });
        if (btn) btn.disabled = false;
        if (r.error) { toast(MH.cloud.msg(r.error), "warn"); break; }
        login(me(), !!v.remember);
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
    }
  });

  window.addEventListener("hashchange", route);
  /* رقم الإصدار المنشور (يُختم تلقائيًا عند كل نشر) ليعرف المستخدم أي نسخة يشاهد */
  (() => {
    const m = document.querySelector('meta[name="build"]');
    const v = m && m.content && m.content !== "__BUILD__" ? m.content : "محلي";
    const el = $("#buildVer"); if (el) el.innerHTML = "الإصدار <bdi dir=\"ltr\">" + esc(v) + "</bdi>";
  })();
  $("#year").textContent = new Date().getFullYear().toLocaleString("ar", { useGrouping: false });
  MH.cloud.whenReady(route);
})();
