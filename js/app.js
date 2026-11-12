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
    seriesOf, catOf, topics, topicsAll, libCats, fmtSize, downloadUrl, pad2, verseCount, versesWord, lessonName, NOTE_SECTIONS, hasNotes,
    nextStep, currentCourse, continueCard, playlistsOf, lessonsIn, program, programs, programsWithPlaylist, stageOf, stageKey, unitDone,
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

  const typeLabel = { video: "مرئي", audio: "صوتي", text: "مقال", book: "كتاب" };
  const typeIcon = { video: "▶", audio: "♪", text: "☰", book: "📕" };
  /* رابط المادة: المرئي والصوتي في فضاء الطلاب، والكتب والمقالات في المكتبة */
  const itemHref = (it) => (it.type === "video" || it.type === "audio" ? "#/space/item/" : "#/library/item/") + it.id;

  // صف مختصر للمادة: أيقونة النوع بدل صورة الغلاف المتكررة
  const libCard = (it) => `
    <a class="lib-row" href="${itemHref(it)}">
      <span class="lib-type ty-${it.type}" aria-hidden="true">${typeIcon[it.type]}</span>
      <span class="lib-info">
        <b>${esc(it.title)}</b>
        <small>${esc(it.author)}${it.type === "book" ? (it.size ? " · PDF " + fmtSize(it.size) : " · PDF") : it.duration ? " · " + esc(it.duration) : ""}</small>
      </span>
      <span class="lib-tag">${typeLabel[it.type]}</span>
    </a>`;

  /* حالة الطالب مع الدورة: ملتحق، أو طلب قيد المراجعة، أو مرفوض، أو لا شيء */
  const joinState = (u, cid) => (u && u.enrolled[cid] ? "enrolled" : ((state.myRequests || {})[cid] || "none"));
  const JOIN_TAG = { pending: `<span class="reg-tag pending-tag">طلبك قيد المراجعة</span>`, rejected: `<span class="reg-tag rejected-tag">لم يُقبل الطلب</span>` };

  const courseCard = (c, u) => {
    const js = joinState(u, c.id);
    const p = js === "enrolled" ? progressOf(u, c) : 0;
    const t = teacher(c.teacher);
    return `
    <article class="card course-card">
      <a class="course-band" href="#/courses/${esc(c.id)}" style="--c:${esc(c.color || "#4a4486")}">
        ${coverImg(courseCover(c))}
        <small>${esc(catOf(c.topic).name)}</small>
        <h3>${esc(c.title)}</h3>
        ${JOIN_TAG[js] || ""}
      </a>
      <div class="card-body">
        <p>${esc(c.desc)}</p>
        <p class="muted meta-line"><span>${ic("user")}${esc(t ? t.name : "—")}</span><span>${ic("book")}${arNum(c.lessons.length)} دروس</span><span>${ic("quiz")}${c.quiz.length ? "اختبار وشهادة" : "دون اختبار"}</span></p>
        ${js === "enrolled" ? `<div class="bar"><span style="width:${p}%"></span></div><p class="muted small">أُنجز ${arNum(p)}٪</p>` : ""}
        <div class="actions">
          ${js === "enrolled"
            ? `<a class="btn" href="#/student/course/${esc(c.id)}">متابعة الدراسة</a>`
            : `<a class="btn ${js === "pending" ? "ghost" : ""}" href="#/courses/${esc(c.id)}">${js === "pending" ? "عرض الدورة" : "تفاصيل الدورة والالتحاق"}</a>`}
        </div>
      </div>
    </article>`;
  };

  /* ---------------- الصفحة الرئيسية ---------------- */
  /* المواد المرئية والصوتية تُعرض في فضاء الطلاب، والمكتبة للكتب والمقالات فقط */
  const isAV = (it) => it && (it.type === "video" || it.type === "audio");
  const libDocs = () => state.library.filter((i) => !isAV(i));

  /* بطاقة موضوع في فضاء الطلاب: صورة واسعة + العنوان + زر الدخول */
  const topicCard = (t) => {
    const n = state.series.filter((s) => s.cat === t.id).length + state.library.filter((i) => isAV(i) && i.cat === t.id).length;
    return `
    <a class="topic-card" href="#/space/${esc(t.id)}">
      ${coverImg(catCover(t.id))}
      <span class="topic-body">
        <span class="topic-ic" aria-hidden="true">${catIc(t.id)}</span>
        <b>${esc(t.name)}</b>
        <small>${n ? arNum(n) + " سلاسل ومواد" : "يُضاف محتواه قريبًا"}</small>
        <span class="topic-go">ادخل ←</span>
      </span>
    </a>`;
  };

  function viewHome() {
    const docs = libDocs();
    const h = (state.settings && state.settings.home) || {};
    return `
    ${me() && currentCourse(me()) ? `<section class="wrap continue-top">${continueCard(me())}</section>` : ""}
    <section class="hero hero-slim">
      <div class="wrap hero-inner">
        <div class="hero-text">
          <span class="eyebrow"><img src="assets/logo-mark.png" alt="" width="18" height="18">من مشاريع جمعية عون وسند الخيرية – موريتانيا</span>
          <h1>${esc(SITE.name)}</h1>
          <p class="slogan">«${esc(SITE.slogan)}»</p>
          <p class="lead">${esc(SITE.mission)}</p>
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

    <section class="wrap section" id="home-library">
      <div class="lib-feature">
        ${coverImg(MH.fromRoot(h.libCover || "assets/library/hero.jpg"))}
        <div class="lib-feature-body">
          <span class="topic-ic" aria-hidden="true">${ic("library")}</span>
          <h2>${esc(h.libTitle || "المكتبة العلمية المفتوحة")}</h2>
          <p class="lib-slogan">«${esc(h.libSlogan || "ادخل واحصل على كتابك")}»</p>
          <p>${esc(h.libDesc || "كتب ومراجع ومقالات علمية مجانية لطلاب العلم والزوار، تفتحها وتنزّلها دون تسجيل.")}</p>
          <form class="search lib-feature-search" id="libSearch" role="search">
            <input type="search" name="q" placeholder="ابحث عن كتاب أو مؤلف…" aria-label="ابحث في المكتبة">
            <button class="btn">بحث</button>
          </form>
          <a class="btn lg" href="#/library">ادخل المكتبة (${arNum(docs.length)}) ←</a>
        </div>
      </div>
    </section>

    <section class="wrap section" id="home-space">
      <div class="sec-row"><h2 class="sec-title">${esc(h.spaceTitle || "فضاء الطلاب")}</h2><a href="#/space" class="link">كل الموضوعات</a></div>
      <p class="muted sec-lead">${esc(h.spaceLead || "دروس وسلاسل علمية مفتوحة، مرتبة حسب الموضوعات: الموضوع ← المتن أو السلسلة ← قائمة التشغيل ← الحلقات.")}</p>
      <div class="topic-grid">${topics().map(topicCard).join("")}</div>
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
    const q = (params.get("q") || "").trim();
    const docs = libDocs();
    let items = docs.filter((i) => cat === "all" || i.cat === cat).sort((a, b) => (b.type === "book") - (a.type === "book"));
    if (q) items = items.filter((i) => [i.title, i.author, i.desc].join(" ").includes(q));
    const cats = libCats().filter((t) => docs.some((i) => i.cat === t.id));
    const link = (k, v) => {
      const p = new URLSearchParams(params);
      v === "all" ? p.delete(k) : p.set(k, v);
      const qs = p.toString();
      return "#/library" + (qs ? "?" + qs : "");
    };
    const catObj = cat !== "all" ? catOf(cat) : null;
    return `
    ${pageHead("المكتبة العلمية المفتوحة", "«ادخل واحصل على كتابك» — كتب ومراجع ومقالات علمية مجانية، دون تسجيل.", [["الرئيسية", "#/"], ["المكتبة العلمية", catObj || q ? "#/library" : null], ...(catObj ? [[catObj.name]] : q ? [["نتائج البحث"]] : [])])}
    <section class="wrap section">
      <form class="search" id="libSearch" role="search">
        <input type="search" name="q" placeholder="ابحث عن كتاب أو مؤلف أو موضوع…" value="${esc(q)}" aria-label="بحث في المكتبة">
        <button class="btn">بحث</button>
      </form>
      <div class="chips">
        <a class="chip ${cat === "all" ? "on" : ""}" href="${link("cat", "all")}">الكل</a>
        ${cats.map((t) => `<a class="chip ${cat === t.id ? "on" : ""}" href="${link("cat", t.id)}">${catIc(t.id)}${esc(t.name)}</a>`).join("")}
      </div>
      <h2 class="sec-title">${q ? "نتائج البحث" : catObj ? esc(catObj.name) : "الكتب والمقالات"} <small class="muted">(${arNum(items.length)})</small></h2>
      <div class="row-list">${items.map(libCard).join("") || `<div class="empty">لا توجد كتب أو مقالات مطابقة.</div>`}</div>
    </section>`;
  }

  function viewLibraryItem(id) {
    const it = state.library.find((i) => i.id === id);
    if (!it) return viewNotFound();
    const cat = catOf(it.cat);
    const av = isAV(it);
    const related = state.library.filter((i) => i.cat === it.cat && i.id !== it.id && isAV(i) === av).slice(0, 4);
    let media = "";
    if (it.type === "video") media = videoBlock(it.video, it.title);
    if (it.type === "audio")
      media = `<div class="audio-box"><div class="disc">📖</div><div><strong>${esc(it.title)}</strong><small>بصوت القارئ ${esc(it.author)}</small>${EMBED_OK ? `<audio controls preload="none" src="${esc(it.src)}"></audio>` : `<a class="btn sm" href="${esc(it.src)}" target="_blank" rel="noopener">▶ استماع للتلاوة</a>`}</div></div>`;
    return `
    ${pageHead(it.title, it.desc, av
      ? [["الرئيسية", "#/"], ["فضاء الطلاب", "#/space"], [cat.name, "#/space/" + cat.id], [it.title]]
      : [["الرئيسية", "#/"], ["المكتبة العلمية", "#/library"], [cat.name, "#/library?cat=" + cat.id], [it.title]])}
    <section class="wrap section detail">
      <div class="detail-main">
        ${media}
        ${it.content ? `<article class="prose">${paras(it.content)}</article>` : ""}
        ${it.type === "book" ? `<div class="book-box">
          <span class="book-ic" aria-hidden="true">${ic("book")}</span>
          <div class="book-info"><b>${esc(it.title)}</b><small>${esc(it.author)}${it.size ? " · PDF " + fmtSize(it.size) : ""}${it.pages ? " · " + arNum(it.pages) + " صفحة" : ""}</small></div>
          ${it.file ? `<div class="actions">
            <a class="btn" href="${esc(it.file)}" target="_blank" rel="noopener">${ic("book")} فتح الكتاب</a>
            <a class="btn ghost" href="${esc(downloadUrl(it.file, it.title))}" download>${ic("download")} تنزيل مجانًا</a>
          </div>` : `<p class="muted">لم يُرفع ملف الكتاب بعد.</p>`}
        </div>` : it.file ? `<a class="btn" href="${esc(it.file)}" target="_blank" rel="noopener">${ic("file")} فتح الملف</a>` : ""}
        ${it.points ? `<div class="box"><h3>محاور الدرس</h3><ol class="points">${it.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ol></div>` : ""}
      </div>
      <aside class="detail-side">
        <div class="box">
          <dl class="meta">
            <dt>القسم</dt><dd>${catIc(cat.id)} ${esc(cat.name)}</dd>
            <dt>${it.type === "audio" ? "القارئ" : it.type === "book" || it.type === "text" ? "المؤلف" : "المُلقي"}</dt><dd>${esc(it.author)}</dd>
            <dt>النوع</dt><dd>${typeLabel[it.type]}</dd>
            ${it.duration ? `<dt>المدة</dt><dd>${esc(it.duration)}</dd>` : ""}
            ${it.level ? `<dt>المستوى</dt><dd>${esc(it.level)}</dd>` : ""}
          </dl>
          <button class="btn block ghost" id="shareBtn">مشاركة الرابط</button>
        </div>
        ${related.length ? `<div class="box"><h3>مواد ذات صلة</h3><ul class="rel">${related.map((r) => `<li><a href="${itemHref(r)}"><span>${typeIcon[r.type]}</span>${esc(r.title)}</a></li>`).join("")}</ul></div>` : ""}
      </aside>
    </section>`;
  }


  /* ---------------- فضاء الطلاب: الموضوعات ---------------- */
  function viewSpace() {
    return `
    ${pageHead("فضاء الطلاب", "دروس وسلاسل علمية مفتوحة للجميع، مرتبة حسب الموضوعات.", [["الرئيسية", "#/"], ["فضاء الطلاب"]])}
    <section class="wrap section">
      <div class="topic-grid">${topics().map(topicCard).join("")}</div>
      <p class="note mt">ⓘ الاختبارات والامتحانات والشهادات في قسم <a href="#/courses">الدورات المتاحة</a>.</p>
    </section>`;
  }

  function viewTopic(id) {
    const t = topicsAll().find((x) => x.id === id);
    if (!t || t.hidden) return viewNotFound();
    const ser = state.series.filter((s) => s.cat === t.id);
    const singles = state.library.filter((i) => isAV(i) && i.cat === t.id);
    return `
    ${pageHead(t.name, t.desc, [["الرئيسية", "#/"], ["فضاء الطلاب", "#/space"], [t.name]])}
    <section class="wrap section">
      ${ser.length ? `<h2 class="sec-title">المتون والسلاسل</h2><div class="row-list mb">${ser.map(seriesCard).join("")}</div>` : ""}
      ${singles.length ? `<h2 class="sec-title">دروس وتلاوات مفردة</h2><div class="row-list">${singles.map(libCard).join("")}</div>` : ""}
      ${!ser.length && !singles.length ? `<div class="empty">لم يُضف محتوى لهذا الموضوع بعد، وسيُضاف قريبًا بإذن الله.</div>` : ""}
    </section>`;
  }

  /* الدورة المرتبطة بقائمة تشغيل (إن وُجدت) — رابط إلى «الدورات المتاحة» دون نظام الاختبار هنا */
  const courseLink = (c) => `
    <div class="course-link">
      <span>${ic("award")}</span>
      <span><b>تريد اختبارًا وشهادة؟</b><small>لهذه الدروس دورة في «الدورات المتاحة» فيها التسجيل والاختبارات والشهادة.</small></span>
      <a class="btn sm" href="#/courses/${esc(c.id)}">صفحة الدورة ←</a>
    </div>`;

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
    ${pageHead(s.name, s.desc, [["فضاء الطلاب", "#/space"], [cat.name, "#/space/" + cat.id], [s.name]])}
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
    ${pageHead(c.title, c.desc, [["فضاء الطلاب", "#/space"], [cat.name, "#/space/" + cat.id], [s.name, s.id ? "#/series/" + s.id : null], [c.title]])}
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
          <p class="note">ⓘ الدروس متاحة للجميع دون تسجيل.</p>
        </div>
        ${programsWithPlaylist(c.id).slice(0, 1).map(courseLink).join("")}
        <div>
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
      ["رقم الحلقة", `<span class="num-pill">${pad2(l.num)}</span>`],
      ["المدرّس", esc((teacher(c.teacher) || {}).name || "—")],
      ...(vc ? [
        ["عدد الأبيات", versesWord(vc)],
        ["بداية الأبيات", "البيت " + pad2(l.verses.from)],
        ["نهاية الأبيات", "البيت " + pad2(l.verses.to)],
      ] : []),
      ...(s.matn ? [["المتن", esc(s.matn)]] : []),
      ["مدة الدرس", esc(l.duration || "—")],
      ["رابط الفيديو", id ? `<a href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener">مشاهدة الدرس ↗</a>` : `<span class="muted">لم يُربط بعد</span>`],
      ...(l.audio ? [["التسجيل الصوتي", `<a href="${esc(l.audio)}" target="_blank" rel="noopener">استماع أو تنزيل ↗</a>`]] : []),
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

  /* الحلقة: فيديو يوتيوب، أو تسجيل صوتي، أو كلاهما */
  const audioBlock = (l) => !l.audio ? "" : `<div class="audio-box"><div class="disc">♪</div><div><strong>${esc(lessonName(l))}</strong><small>التسجيل الصوتي للحلقة</small>${EMBED_OK ? `<audio controls preload="none" src="${esc(l.audio)}"></audio>` : `<a class="btn sm" href="${esc(l.audio)}" target="_blank" rel="noopener">▶ استماع</a>`}</div></div>`;
  const lessonMain = (c, l) => `
    ${l.audio && !l.video ? "" : videoBlock(l.video, lessonName(l))}
    ${audioBlock(l)}
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
    ${pageHead(lessonName(l), `${s.name} — ${c.title}`, [["فضاء الطلاب", "#/space"], [cat.name, "#/space/" + cat.id], [s.name, s.id ? "#/series/" + s.id : null], [c.title, "#/playlist/" + c.id], [l.title]])}
    <section class="wrap section detail">
      <div class="detail-main">
        ${lessonMain(c, l)}
        <div class="lesson-actions">
          ${prev ? `<a class="btn ghost" href="#/lesson/${c.id}/${prev.id}">→ ${esc(prev.title)}</a>` : `<span></span>`}
          ${(() => { const pg = u && programsWithPlaylist(c.id).find((x) => u.enrolled[x.id]);
            return pg ? `<a class="btn" href="#/student/lesson/${esc(pg.id)}/${l.id}">سجّل إنجازه في دورتي</a>` : `<a class="btn ghost" href="#/playlist/${c.id}">${ic("layers")} كل الحلقات</a>`; })()}
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
          <label>كلمة المرور <small class="muted">(6 أحرف أو أرقام على الأقل)</small>${pwInput("password", "new-password", 'minlength="6"')}</label>
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
    const c = cid && program(cid);
    const box = document.createElement("div");
    box.className = "modal-back";
    box.innerHTML = `
      <div class="modal auth" role="dialog" aria-modal="true" aria-labelledby="authTitle">
        <button type="button" class="modal-close" data-close-modal aria-label="إغلاق">✕</button>
        <h2 id="authTitle">${c ? `الالتحاق بدورة «${esc(c.title)}»` : "سجّل في المعهد"}</h2>
        <p class="muted">${c ? "الالتحاق بالدورات يتطلب حسابًا: ادخل أو أنشئ حسابك، ثم يُرسل طلبك إلى إدارة المعهد." : getLast() ? "ادخل بكلمة مرورك لتتابع." : regOpen() ? "خطوة واحدة وتبدأ مباشرة." : "سجّل الدخول بحسابك لمتابعة دراستك."}</p>
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
    const pending = state.pendingEnroll && program(state.pendingEnroll);
    return `
    ${pageHead("حسابي", regOpen() ? "التسجيل مفتوح ومجاني: الاسم ورقم الهاتف والبريد وكلمة مرور، وتبدأ التعلم فورًا." : "حساب واحد يحفظ تقدّمك في الدروس ونتائج اختباراتك وشهاداتك.", [["الرئيسية", "#/"], ["حسابي"]])}
    <section class="wrap section">
      <div class="auth">
        ${pending ? `<div class="pending">📌 بعد الدخول يُرسل طلب التحاقك بدورة «${esc(pending.title)}» إلى الإدارة.</div>` : ""}
        <ol class="steps" aria-label="خطوات البدء">
          <li><b>١</b>أنشئ حسابك</li><li><b>٢</b>اطلب الالتحاق بدورة</li><li><b>٣</b>بعد القبول تابع الدروس</li><li><b>٤</b>اختبر واحصل على شهادتك</li>
        </ol>
        ${authForms(!!pending || regOpen())}
        <p class="note">ⓘ حسابك وتقدّمك في الدروس محفوظان في خادم المنصة، فتدخل بهما من أي جهاز.</p>
      </div>
    </section>`;
  }

  const studentNav = (active) => `
    <nav class="subnav wrap">
      ${[["dash", "#/student", "لوحتي"], ["certs", "#/student/certificates", "الشهادات"], ["account", "#/student/account", "بياناتي"]]
        .map(([k, h, t]) => `<a href="${h}" class="${active === k ? "on" : ""}">${t}</a>`).join("")}
      <button type="button" class="btn sm ghost logout-btn" data-logout>تسجيل الخروج ⎋</button>
    </nav>`;

  function viewAccount() {
    const u = me();
    return `
    ${pageHead("حسابي", "بياناتك في المعهد، وتستطيع تعديلها في أي وقت.", [["حسابي", "#/student"], ["حسابي"]])}
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
          <label>كلمة المرور الجديدة${pwInput("next", "new-password", 'minlength="6"')}</label>
          <label>تأكيدها${pwInput("confirm", "new-password", 'minlength="6"')}</label>
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
    const mine = programs().filter((c) => u.enrolled[c.id]);
    const waiting = programs().filter((c) => !u.enrolled[c.id] && (state.myRequests || {})[c.id] === "pending");
    const doneLessons = mine.reduce((s, c) => s + (u.enrolled[c.id] || []).length, 0);
    const certs = Object.entries(u.results).filter(([k, r]) => !k.includes("@") && passed(r) && program(k)).length;
    /* كل نتائج الطالب: الاختبارات المرحلية والامتحانات النهائية */
    const resRows = Object.entries(u.results).map(([k, r]) => {
      const [pid, unit] = k.split("@");
      const pg = program(pid);
      if (!pg || !r) return "";
      const pl = unit && (pg.units || []).find((x) => x.id === unit);
      return `<tr><td>${esc(pg.title)}</td><td>${unit ? "اختبار الوحدة: " + esc(pl ? pl.title : unit) : "الامتحان النهائي"}</td><td>${arNum(r.score)}/${arNum(r.total)}</td><td>${passed(r) ? `<span class="tag ok">ناجح</span>` : `<span class="tag bad">لم ينجح</span>`}</td><td class="nowrap">${fmtDate(r.date)}</td></tr>`;
    }).join("");
    return `
    ${pageHead("مرحبًا، " + u.name, "تابع رحلتك العلمية خطوة بخطوة.", [["الرئيسية", "#/"], ["حسابي"]])}
    ${studentNav("dash")}
    ${u.mustChangePw ? `<section class="wrap section"><div class="pending">🔑 دخلتَ بكلمة مرور مؤقتة من الإدارة. <a href="#/student/account">غيّرها الآن من «حسابي»</a></div></section>` : ""}
    ${continueCard(u) ? `<section class="wrap section">${continueCard(u)}</section>` : ""}
    <section class="wrap section">
      <div class="stats small">
        <div><b>${arNum(mine.length)}</b><span>دورات مسجلة</span></div>
        <div><b>${arNum(doneLessons)}</b><span>دروس مكتملة</span></div>
        <div><b>${arNum(Object.keys(u.results).filter((k) => program(k.split("@")[0])).length)}</b><span>اختبارات منجزة</span></div>
        <div><b>${arNum(certs)}</b><span>شهادات</span></div>
      </div>
    </section>
    <section class="wrap section">
      ${waiting.length ? `<h2 class="sec-title">طلبات قيد المراجعة</h2><div class="grid three mb">${waiting.map((c) => courseCard(c, u)).join("")}</div>` : ""}
      <h2 class="sec-title">دوراتي</h2>
      ${mine.length ? `<div class="grid three">${mine.map((c) => courseCard(c, u)).join("")}</div>`
        : `<div class="empty"><b>ابدأ رحلتك باختيار دورة</b><br>افتح الدورة واضغط «طلب الالتحاق»، وبعد موافقة الإدارة تبدأ الدروس.</div>
           <div class="grid three mt">${programs().filter((c) => !u.enrolled[c.id]).slice(0, 3).map((c) => courseCard(c, u)).join("")}</div>`}
    </section>
    ${resRows ? `<section class="wrap section">
      <h2 class="sec-title">نتائجي في الاختبارات</h2>
      <div class="box"><div class="table-wrap"><table><thead><tr><th>الدورة</th><th>الاختبار</th><th>النتيجة</th><th>الحالة</th><th>التاريخ</th></tr></thead><tbody>${resRows}</tbody></table></div></div>
    </section>` : ""}
    <section class="wrap section mobile-only">
      <button type="button" class="btn block ghost logout-block" data-logout>تسجيل الخروج ⎋</button>
    </section>`;
  }

  function viewStudentCourses() {
    const u = me();
    return `
    ${pageHead("الدورات المتاحة", "دورات منظمة بالتسجيل والمتابعة والاختبارات والشهادات.", [["الرئيسية", "#/"], ["الدورات المتاحة"]])}
    <section class="wrap section">
      ${(() => { const all = programs();
        const groups = [...new Set(all.map((c) => c.topic))];
        return groups.map((tid) => `<h2 class="sec-title">${esc(catOf(tid).name)}</h2><div class="grid three mb">${all.filter((c) => c.topic === tid).map((c) => courseCard(c, u)).join("")}</div>`).join("")
          || `<div class="empty">لا توجد دورات متاحة حاليًا.</div>`; })()}
    </section>
    ${state.announcements.length ? `<section class="wrap section">
      <h2 class="sec-title">إعلانات المعهد</h2>
      <div class="ann-list">${[...state.announcements].sort((a, b) => (b.pinned - a.pinned) || b.date.localeCompare(a.date)).slice(0, 4).map(annItem).join("")}</div>
    </section>` : ""}`;
  }

  function viewCourseInfo(id) {
    const c = program(id);
    if (!c || c.hidden) return viewNotFound();
    const u = me();
    const js = joinState(u, c.id);
    const t = teacher(c.teacher);
    const action = js === "enrolled"
      ? `<a class="btn block" href="#/student/course/${esc(c.id)}">متابعة الدراسة ←</a>`
      : js === "pending"
        ? `<div class="pending">⏳ طلب التحاقك قيد المراجعة لدى إدارة المعهد، وستظهر الدورة في «حسابي» بعد القبول.</div>`
        : `${js === "rejected" ? `<div class="pending">لم يُقبل طلبك السابق. يمكنك إعادة الطلب أو التواصل مع إدارة المعهد.</div>` : ""}
           <button class="btn block" data-enroll="${esc(c.id)}">${u ? (js === "rejected" ? "إعادة طلب الالتحاق" : "طلب الالتحاق بالدورة") : "سجّل الدخول لطلب الالتحاق"}</button>`;
    return `
    ${pageHead(c.title, c.desc, [["الرئيسية", "#/"], ["الدورات المتاحة", "#/courses"], [c.title]])}
    <section class="wrap section detail">
      <div class="detail-main">
        ${(c.goals || []).length ? `<div class="box"><h3>${ic("check")} أهداف الدورة</h3><ul class="goals">${c.goals.map((g) => `<li>${esc(g)}</li>`).join("")}</ul></div>` : ""}
        <div class="box">
          <h3>${ic("layers")} محتوى الدورة ووحداتها</h3>
          <p class="muted small">الدروس هي حلقات فضاء الطلاب نفسها؛ يشاهدها الجميع، والملتحق بالدورة يُحتسب له إنجازه ويُختبر فيها.</p>
          ${c.units.map((pl, ui) => `
            <div class="unit">
              <h4>الوحدة ${arNum(ui + 1)}: <a href="#/playlist/${esc(pl.id)}">${esc(pl.title)}</a> <small class="muted">(${arNum(pl.lessons.length)} دروس)</small></h4>
              <ol class="lessons">${pl.lessons.map((l) => `<li class="open"><a href="#/lesson/${pl.id}/${l.id}"><span class="num">${pad2(l.num)}</span><span class="lt"><b>${esc(l.topic)}</b><small class="muted">${esc(l.title)}</small></span><span class="muted">${esc(l.duration)}</span></a></li>`).join("")}</ol>
            </div>`).join("") || `<p class="muted">تُضاف وحدات الدورة قريبًا.</p>`}
        </div>
        <div class="box">
          <h3>${ic("quiz")} الاختبارات والتقييم</h3>
          ${c.quiz.length ? `<p>امتحان نهائي من ${arNum(c.quiz.length)} أسئلة يُفتح بعد إتمام جميع الدروس، والنجاح من ٦٠٪، ويمكن إعادته.</p>` : `<p class="muted">لم يُضف امتحان هذه الدورة بعد.</p>`}
        </div>
        <div class="box">
          <h3>${ic("award")} شروط التسجيل والشهادة</h3>
          <ul class="goals">
            <li>إنشاء حساب في المنصة وتسجيل الدخول.</li>
            <li>إرسال طلب الالتحاق وموافقة إدارة المعهد عليه.</li>
            <li>إتمام جميع دروس الدورة بالترتيب.</li>
            ${c.quiz.length ? `<li>اجتياز الامتحان النهائي بنسبة ٦٠٪ فأكثر، فتُمنح شهادة إتمام الدورة.</li>` : ""}
            ${c.conditions ? c.conditions.split("\n").filter(Boolean).map((x) => `<li>${esc(x)}</li>`).join("") : ""}
          </ul>
        </div>
      </div>
      <aside class="detail-side">
        <div class="box">
          <dl class="meta">
            <dt>المدرّس</dt><dd>${esc(t ? t.name : "—")}</dd>
            <dt>الموضوع</dt><dd>${esc(catOf(c.topic).name)}</dd>
            ${c.level ? `<dt>المستوى</dt><dd>${esc(c.level)}</dd>` : ""}
            <dt>الوحدات</dt><dd>${arNum(c.units.length)}</dd>
            <dt>الدروس</dt><dd>${arNum(c.lessons.length)}</dd>
          </dl>
          ${action}
          <p class="note">ⓘ الالتحاق والاختبار والشهادة تتطلب حسابًا وموافقة الإدارة.</p>
        </div>
      </aside>
    </section>`;
  }

  function viewCourse(id) {
    const u = me();
    const c = program(id);
    if (!c) return viewNotFound();
    if (!u.enrolled[c.id]) { location.hash = "#/courses/" + c.id; return ""; }
    const done = u.enrolled[c.id];
    const p = progressOf(u, c);
    const allDone = c.lessons.every((l) => done.includes(l.id));
    const r = u.results[c.id];
    const t = teacher(c.teacher);
    return `
    ${pageHead(c.title, c.desc, [["حسابي", "#/student"], [c.title]])}
    ${studentNav("")}
    <section class="wrap section detail">
      <div class="detail-main">
        <div class="box">
          <div class="sec-row"><h3>دروس الدورة</h3><span class="muted">${arNum(done.length)} / ${arNum(c.lessons.length)}</span></div>
          <div class="bar lg"><span style="width:${p}%"></span></div>
          ${(() => { const st = nextStep(u, c); return `<a class="btn block lg mb-s" href="${st.href}">${st.kind === "lesson" ? `${st.label}: ${esc(st.lesson.topic)}` : st.label} ←</a>`; })()}
          ${(() => {
            /* القفل: الدرس يُفتح بعد الذي قبله، وأول درس في الوحدة بعد اجتياز اختبار الوحدة السابقة */
            let open = true;
            const units = c.units && c.units.length ? c.units : [{ id: "", title: "", lessons: c.lessons }];
            const stagesOk = units.every((pl) => { const st = stageOf(c, pl.id); return !st || passed(u.results[stageKey(c.id, pl.id)]); });
            const html = units.map((pl, ui) => {
              const rows = pl.lessons.map((l) => {
                const isDone = done.includes(l.id);
                const unlocked = open;
                if (!isDone) open = false;
                const cls = isDone ? "done" : unlocked ? "open" : "locked";
                const badge = isDone ? "✓" : unlocked ? "▶" : "🔒";
                return `<li class="${cls}">${unlocked ? `<a href="#/student/lesson/${c.id}/${l.id}">` : `<div data-locked role="button" tabindex="0">`}
                  <span class="num">${isDone || !unlocked ? badge : pad2(l.num)}</span><span class="lt"><b>${esc(l.topic)}</b><small class="muted">${esc(l.title)} ${verseTag(l)}</small></span><span class="muted">${esc(l.duration)}</span>
                ${unlocked ? "</a>" : "</div>"}</li>`;
              }).join("");
              const st = pl.id && stageOf(c, pl.id);
              let stRow = "";
              if (st) {
                const rs = u.results[stageKey(c.id, pl.id)];
                const can = unitDone(u, c, pl);
                stRow = `<li class="${can ? (passed(rs) ? "done" : "open") : "locked"} quiz-row">${can ? `<a href="#/student/stage/${c.id}/${pl.id}">` : `<div data-locked="stage" role="button" tabindex="0">`}<span class="num">${passed(rs) ? "✓" : can ? "؟" : "🔒"}</span><span class="lt">الاختبار المرحلي للوحدة${rs ? ` <small class="muted">(${arNum(rs.score)}/${arNum(rs.total)})</small>` : ""}</span><span class="muted">${arNum(st.quiz.length)} أسئلة</span>${can ? "</a>" : "</div>"}</li>`;
                if (!passed(rs)) open = false;
              }
              return `${units.length > 1 || pl.title ? `<h4 class="unit-h">الوحدة ${arNum(ui + 1)}${pl.title ? ": " + esc(pl.title) : ""}</h4>` : ""}<ol class="lessons">${rows}${stRow}</ol>`;
            }).join("");
            const finalOpen = allDone && stagesOk;
            return html + (c.quiz.length ? `<ol class="lessons"><li class="${finalOpen ? (r ? "done" : "open") : "locked"} quiz-row">
              ${finalOpen ? `<a href="#/student/quiz/${c.id}">` : `<div data-locked="quiz" role="button" tabindex="0">`}<span class="num">${r ? "✓" : finalOpen ? "؟" : "🔒"}</span><span class="lt">الامتحان النهائي</span><span class="muted">${arNum(c.quiz.length)} أسئلة</span>${finalOpen ? "</a>" : "</div>"}
            </li></ol>` : "");
          })()}
          ${!allDone ? `<p class="note">ⓘ تُفتح الدروس بالترتيب، ويُفتح اختبار كل وحدة بعد إتمام دروسها، والامتحان النهائي بعد إتمام الوحدات واجتياز اختباراتها.</p>` : ""}
        </div>
      </div>
      <aside class="detail-side">
        <div class="box">
          <dl class="meta">
            <dt>الموضوع</dt><dd>${esc(catOf(c.topic).name)}</dd>
            <dt>المعلم</dt><dd>${esc(t ? t.name : "—")}</dd>
            ${c.level ? `<dt>المستوى</dt><dd>${esc(c.level)}</dd>` : ""}
            <dt>الإنجاز</dt><dd>${arNum(p)}٪</dd>
            ${r ? `<dt>نتيجة الاختبار</dt><dd>${arNum(r.score)} / ${arNum(r.total)} ${passed(r) ? "✅" : "❌"}</dd>` : ""}
          </dl>
          ${r && passed(r) ? `<a class="btn block" href="#/student/certificate/${c.id}">عرض الشهادة</a>` : ""}
          <a class="btn block ghost" href="#/courses/${esc(c.id)}">صفحة الدورة</a>
        </div>
      </aside>
    </section>`;
  }

  function viewLesson(cid, lid) {
    const u = me();
    const c = program(cid);
    if (!c || !u.enrolled[cid]) return viewNotFound();
    const i = c.lessons.findIndex((l) => l.id === lid);
    if (i < 0) return viewNotFound();
    const l = c.lessons[i];
    const done = u.enrolled[cid];
    const ui = (c.units || []).findIndex((pl) => pl.lessons.some((x) => x.id === lid));
    const prevUnit = ui > 0 ? c.units[ui - 1] : null;
    const firstOfUnit = ui >= 0 && c.units[ui].lessons[0] && c.units[ui].lessons[0].id === lid;
    if (firstOfUnit && prevUnit && stageOf(c, prevUnit.id) && !passed(u.results[stageKey(c.id, prevUnit.id)])) {
      toast("اجتز الاختبار المرحلي للوحدة السابقة أولًا", "warn");
      location.hash = "#/student/stage/" + cid + "/" + prevUnit.id;
      return "";
    }
    if (i > 0 && !done.includes(c.lessons[i - 1].id)) {
      toast("أتمّ الدرس السابق أولًا", "warn");
      location.hash = "#/student/course/" + cid;
      return "";
    }
    const isDone = done.includes(l.id);
    const next = c.lessons[i + 1];
    u.last = { cid, lid, at: today() }; save();
    const unitEnd = ui >= 0 && c.units[ui].lessons[c.units[ui].lessons.length - 1].id === lid && stageOf(c, c.units[ui].id);
    const nextHref = unitEnd ? `#/student/stage/${c.id}/${c.units[ui].id}` : next ? `#/student/lesson/${c.id}/${next.id}` : `#/student/quiz/${c.id}`;
    return `
    ${pageHead(lessonName(l), `${arNum(i + 1)} من ${arNum(c.lessons.length)} — ${c.title}`, [["حسابي", "#/student"], [c.title, "#/student/course/" + c.id], [l.title]])}
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

  function viewQuiz(cid, params, unit) {
    const u = me();
    const c0 = program(cid);
    if (!c0 || !u.enrolled[cid]) return viewNotFound();
    /* الاختبار المرحلي لوحدة، أو الامتحان النهائي للدورة */
    const pl = unit ? (c0.units || []).find((x) => x.id === unit) : null;
    const st = pl && stageOf(c0, unit);
    if (unit && !st) return viewNotFound();
    const c = unit ? Object.assign({}, c0, { quiz: st.quiz }) : c0;
    const key = unit ? stageKey(cid, unit) : cid;
    const base = unit ? `#/student/stage/${cid}/${unit}` : `#/student/quiz/${cid}`;
    if (unit ? !unitDone(u, c0, pl) : !c0.lessons.every((l) => u.enrolled[cid].includes(l.id))) { toast(unit ? "أتمّ دروس الوحدة أولًا ليُفتح اختبارها" : "أتمّ جميع الدروس أولًا ليُفتح الاختبار", "warn"); location.hash = "#/student/course/" + cid; return ""; }
    if (!unit && (c0.units || []).some((x) => stageOf(c0, x.id) && !passed(u.results[stageKey(cid, x.id)]))) { toast("اجتز الاختبارات المرحلية أولًا ليُفتح الامتحان النهائي", "warn"); location.hash = "#/student/course/" + cid; return ""; }
    const r = u.results[key];
    const review = r && r.answers && !params.get("retry");
    const head = pageHead(unit ? "الاختبار المرحلي" : "الامتحان النهائي", `${unit ? pl.title + " — " : ""}${c.title} — ${arNum(c.quiz.length)} أسئلة، والنجاح من ٦٠٪`, [["حسابي", "#/student"], [c.title, "#/student/course/" + c.id], [unit ? "اختبار الوحدة" : "الامتحان النهائي"]]);
    if (review) {
      return `${head}
      <section class="wrap section narrow">
        <div class="result ${passed(r) ? "pass" : "fail"}">
          <b>${arNum(r.score)} / ${arNum(r.total)}</b>
          <span>${passed(r) ? "مبارك! اجتزت الاختبار بنجاح. راجع إجاباتك أدناه." : "لم تبلغ درجة النجاح بعد. راجع الدروس المتعلقة بالأسئلة التي أخطأت فيها ثم أعد المحاولة؛ تظهر الإجابات الصحيحة بعد النجاح."}</span>
        </div>
        <div class="actions mb">
          ${passed(r) ? (unit ? `<a class="btn" href="${nextStep(u, c0).href}">${esc(nextStep(u, c0).label)} ←</a>` : `<a class="btn" href="#/student/certificate/${c.id}">🏅 عرض الشهادة</a>`) : ""}
          <a class="btn ${passed(r) ? "ghost" : ""}" href="${base}?retry=1">إعادة الاختبار</a>
          <a class="btn ghost" href="#/student/course/${c.id}">مراجعة الدروس</a>
        </div>
        ${c.quiz.map((q, qi) => {
          const chosen = r.answers[qi];
          /* نتيجة الخادم: ok لكل سؤال، والمفتاح key لا يصل إلا بعد النجاح */
          const ok = Array.isArray(r.ok) ? !!r.ok[qi] : chosen === q.answer;
          const key = Array.isArray(r.key) ? r.key[qi] : Array.isArray(r.ok) ? (ok ? chosen : null) : q.answer;
          return `<div class="box q review ${ok ? "is-ok" : "is-bad"}">
            <p class="q-title">${ok ? "✓" : "✗"} ${arNum(qi + 1)}. ${esc(q.q)}</p>
            ${q.options.map((o, oi) => `<div class="opt ${oi === key ? "right" : oi === chosen ? "wrong" : ""}">
              <span>${esc(o)}</span>${oi === key ? `<small>${oi === chosen ? "إجابتك صحيحة" : "الإجابة الصحيحة"}</small>` : oi === chosen ? `<small>إجابتك</small>` : ""}</div>`).join("")}
          </div>`; }).join("")}
      </section>`;
    }
    return `${head}
    <section class="wrap section narrow">
      <p class="note">ⓘ أجب عن جميع الأسئلة ثم اضغط «تسليم الإجابات». بعد التسليم تعرف أيّ الأسئلة أصبت فيها، وتظهر الإجابات الصحيحة كاملة بعد النجاح، ويمكنك الإعادة متى شئت.</p>
      <form id="quizForm" data-course="${c.id}" data-unit="${esc(unit || "")}" class="quiz">
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
    const list = Object.entries(u.results).filter(([cid, r]) => !cid.includes("@") && passed(r) && program(cid));
    return `
    ${pageHead("شهاداتي", "شهادات إتمام الدورات بعد اجتياز الاختبار النهائي.", [["حسابي", "#/student"], ["الشهادات"]])}
    ${studentNav("certs")}
    <section class="wrap section">
      ${list.length ? `<div class="grid three">${list.map(([cid, r]) => `
        <a class="card cert-card" href="#/student/certificate/${cid}">
          <div class="card-body"><span class="seal">🏅</span><h3>${esc(program(cid).title)}</h3><p class="muted">${fmtDate(r.date)} · ${arNum(r.score)}/${arNum(r.total)}</p></div>
        </a>`).join("")}</div>`
        : `<div class="empty">لا توجد شهادات بعد. أتمّ دروس دورة واجتز اختبارها لتحصل على شهادة.</div>`}
    </section>`;
  }

  function viewCertificate(cid) {
    const u = me();
    const c = program(cid);
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

    /* تحويل الروابط القديمة إلى أماكنها الجديدة (روابط مُشاركة سابقًا) */
    const redirect = (h) => { location.replace(h); return true; };
    if (area === "library" && seg[1] === "item") { const it = state.library.find((i) => i.id === seg[2]); if (isAV(it) && redirect("#/space/item/" + it.id)) return; }
    if (area === "library" && !seg[1] && params.get("cat") && !libDocs().some((i) => i.cat === params.get("cat")) && redirect("#/space/" + params.get("cat"))) return;
    if (area === "student" && seg[1] === "courses" && redirect("#/courses")) return;
    if (area === "account" && redirect("#/student")) return;

    if (area === "home") html = viewHome();
    else if (area === "library") html = seg[1] === "item" ? viewLibraryItem(seg[2]) : viewLibrary(params);
    else if (area === "space") html = !seg[1] ? viewSpace() : seg[1] === "item" ? viewLibraryItem(seg[2]) : viewTopic(seg[1]);
    else if (area === "courses") html = seg[1] ? viewCourseInfo(seg[1]) : viewStudentCourses();
    else if (area === "about") html = viewAbout();
    else if (area === "series") html = viewSeries(seg[1]);
    else if (area === "playlist") html = viewPlaylist(seg[1]);
    else if (area === "lesson") html = viewLessonPublic(seg[1], seg[2]);
    else if (area === "student") {
      if (!me()) html = viewAuth();
      else if (!seg[1]) html = viewStudentDash();
      else if (seg[1] === "course") html = viewCourse(seg[2]);
      else if (seg[1] === "lesson") html = viewLesson(seg[2], seg[3]);
      else if (seg[1] === "quiz") html = viewQuiz(seg[2], params);
      else if (seg[1] === "stage") html = viewQuiz(seg[2], params, seg[3]);
      else if (seg[1] === "certificates") html = viewCertificates();
      else if (seg[1] === "certificate") html = viewCertificate(seg[2]);
      else if (seg[1] === "account") html = viewAccount();
      else html = viewNotFound();
    } else html = viewNotFound();

    if (html === "") return; // تمّت إعادة التوجيه
    $("#app").innerHTML = html;
    document.body.dataset.area = area;
    /* القائمة الثلاثية: الرئيسية (ومعها المكتبة وفضاء الطلاب) · الدورات المتاحة · حسابي */
    const navArea = area === "courses" ? "courses" : area === "student" ? "student" : area === "about" ? "" : "home";
    $$(".main-nav a").forEach((a) => a.classList.toggle("on", a.dataset.area === navArea));
    $$(".bottom-nav a").forEach((a) => a.classList.toggle("on", a.dataset.tab2 === navArea));
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
            <a href="#/courses" role="menuitem">الدورات المتاحة</a>
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
    const pending = state.pendingEnroll && program(state.pendingEnroll);
    state.pendingEnroll = null;
    if (pending) {
      save();
      closeAuthModal();
      requestJoin(pending.id);
      return;
    }
    save();
    toast("أهلًا بك، " + u.name);
    if (wasModal) { closeAuthModal(); go("#/courses"); return; }
    go("#/student");
  }

  /* طلب الالتحاق بدورة: يتطلب حسابًا، ويُرسل إلى الإدارة للموافقة */
  async function requestJoin(cid) {
    const c = program(cid);
    if (!c) return;
    const r = await MH.cloud.requestEnrollment(cid);
    if (r.error) { toast(MH.cloud.msg(r.error), "warn"); go("#/courses/" + cid); return; }
    save();
    toast(r.data === "approved" ? `أنت ملتحق بدورة «${c.title}»` : `أُرسل طلب التحاقك بدورة «${c.title}»، وستراجعه الإدارة`);
    go(r.data === "approved" ? "#/student/course/" + cid : "#/courses/" + cid);
  }
  function enroll(cid) {
    if (!me()) {
      state.pendingEnroll = cid; save();
      if (onAuthPage()) { route(); return; }
      openAuthModal(cid);
      return;
    }
    requestJoin(cid);
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
      const c = program(cid);
      toast(c.lessons.every((l) => u.enrolled[cid].includes(l.id)) ? "أحسنت! أتممت جميع الدروس، والاختبار متاح الآن" : "أحسنت! تم إتمام الدرس");
      if (d.go) location.hash = d.go; else route();
    } else if (d.locked !== undefined) {
      toast(d.locked === "quiz" ? "يُفتح الامتحان النهائي بعد إتمام الدروس واجتياز الاختبارات المرحلية" : d.locked === "stage" ? "يُفتح اختبار الوحدة بعد إتمام دروسها" : "هذا الدرس مقفل: أتمّ ما قبله أولًا", "warn");
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
        const cid = f.dataset.course, unit = f.dataset.unit || "";
        const c0 = program(cid);
        const c = unit ? { quiz: (stageOf(c0, unit) || {}).quiz || [] } : c0;
        const key = unit ? stageKey(cid, unit) : cid;
        const answers = c.quiz.map((q, i) => Number(v["q" + i]));
        if (MH.cloud.online && MH.cloud.online()) {
          const btn = f.querySelector("button.btn"); if (btn) btn.disabled = true;
          const r = unit ? await MH.cloud.submitStage(cid, unit, answers) : await MH.cloud.submitQuiz(cid, answers);
          if (btn) btn.disabled = false;
          if (r.error) { toast(MH.cloud.msg(r.error), "warn"); break; }
        } else {
          /* النسخة المحلية دون خادم (للتجربة فقط) */
          const score = c.quiz.reduce((s, q, i) => s + (answers[i] === q.answer ? 1 : 0), 0);
          me().results[key] = { score, total: c.quiz.length, date: today(), answers };
          save();
        }
        toast(passed(me().results[key]) ? "مبارك! نجحت في الاختبار" : "لم تبلغ درجة النجاح، راجع الإجابات وأعد المحاولة", passed(me().results[key]) ? "ok" : "warn");
        const qh = unit ? `#/student/stage/${cid}/${unit}` : "#/student/quiz/" + cid;
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
