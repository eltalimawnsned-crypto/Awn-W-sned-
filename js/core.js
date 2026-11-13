/* =========================================================
   منصة المحجة البيضاء — النواة المشتركة
   البيانات، والأدوات، ومحرك الحسابات والصلاحيات.
   يستعملها الموقع العام (js/app.js) ولوحة الإدارة (admin/ → js/admin.js).

   تنبيه أمني: هذه نسخة واجهة أمامية؛ كل ما هنا يعمل في متصفح المستخدم،
   فالتحقق من الصلاحيات هنا يمنع الاستخدام العادي لكنه لا يمنع شخصًا
   يعدّل بيانات متصفحه. الحماية الفعلية تكون بنقل هذه الفحوص إلى خادم
   (مثل قواعد RLS في Supabase) — انظر قسم «الإدارة والصلاحيات» في README.
   ========================================================= */
(function () {
  "use strict";

  /* ---------------- التخزين ---------------- */
  const KEY = "mahajja-state-v2"; // v2: هيكل القسم ← السلسلة ← قائمة التشغيل ← الدرس
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const defaults = () => ({
    users: [],
    session: null,
    staff: clone(DEFAULT_STAFF),
    staffSession: null,
    audit: [],
    loginGuard: {},
    settings: { regOpen: true, regNote: "إنشاء الحساب مجاني، والالتحاق بالدورات بعد موافقة الإدارة" },
    series: clone(DEFAULT_SERIES),
    courses: clone(DEFAULT_COURSES),
    teachers: clone(DEFAULT_TEACHERS),
    announcements: clone(DEFAULT_ANNOUNCEMENTS),
    catCovers: {},
    library: clone(LIBRARY),
    topics: clone(DEFAULT_TOPICS),
  });
  let state;
  try {
    state = Object.assign(defaults(), JSON.parse(localStorage.getItem(KEY) || "{}"));
  } catch (e) {
    state = defaults();
  }
  delete state.admin; // المفتاح القديم «admin: true» لم يعد يمنح أي صلاحية
  if (!Array.isArray(state.staff) || !state.staff.length) state.staff = clone(DEFAULT_STAFF);
  /* ترحيل: مواد المعلمين التجريبيين، وإضافة حساب معلم القرآن إن لم يكن موجودًا */
  DEFAULT_STAFF.forEach((d) => {
    const ex = state.staff.find((x) => x.id === d.id);
    if (!ex) { if (!state.staff.some((x) => x.email.toLowerCase() === d.email)) state.staff.push(clone(d)); }
    else if (ex.role === "teacher" && !ex.subjects && d.subjects) ex.subjects = d.subjects.slice();
  });
  if (!state.catCovers || typeof state.catCovers !== "object") state.catCovers = {};
  if (!Array.isArray(state.library)) state.library = clone(LIBRARY);
  /* موضوعات فضاء الطلاب: تُنشأ من الموضوعات الافتراضية أول مرة، ولا يُحذف منها شيء تلقائيًا */
  if (!Array.isArray(state.topics) || !state.topics.length) state.topics = clone(DEFAULT_TOPICS);
  state.settings = Object.assign({ regOpen: true, regNote: "إنشاء الحساب مجاني، والالتحاق بالدورات بعد موافقة الإدارة" }, state.settings || {});
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

  /* هل يسمح المتصفح بحفظ بيانات الموقع؟ (التصفح الخاص أو حظر ملفات تعريف الارتباط يمنعه) */
  const storageOK = (() => {
    try { const k = "__mahajja_test"; localStorage.setItem(k, "1"); const ok = localStorage.getItem(k) === "1"; localStorage.removeItem(k); return ok; }
    catch (e) { return false; }
  })();

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
    return `<div class="video placeholder"><div><span class="play">▶</span><strong>${esc(title)}</strong><small>يُضاف رابط الحلقة قريبًا بإذن الله</small></div></div>`;
  };

  const course = (id) => state.courses.find((c) => c.id === id);
  const teacher = (id) => state.teachers.find((t) => t.id === id);
  const seriesName = (id) => (state.series.find((s) => s.id === id) || {}).name || "—";
  const me = () => state.users.find((u) => u.id === state.session) || null;
  const allStudents = () => state.users; // DEMO_STUDENTS لم تعد تُحتسب: كانت تُظهر أرقامًا غير حقيقية
  const progressOf = (u, c) => {
    const done = (u.enrolled[c.id] || []).filter((l) => c.lessons.some((x) => x.id === l)).length;
    return c.lessons.length ? Math.round((done / c.lessons.length) * 100) : 0;
  };
  const passed = (r) => r && r.score / r.total >= 0.6;
  /* الدرجة من ١٠٠ بحسب الإجابات الصحيحة: من أجاب عن كل الأسئلة صحيحًا ينال ١٠٠ */
  const pct = (r) => (r && r.total ? Math.round((r.score / r.total) * 100) : 0);
  const gradeTxt = (r) => `${arNum(pct(r))} من ${arNum(100)}`;
  const gradeFull = (r) => `${arNum(pct(r))} من ${arNum(100)} <small class="muted">(${arNum(r.score)} من ${arNum(r.total)} إجابات صحيحة)</small>`;

  /* ---- أدوات الهيكل العلمي وبطاقة الدرس ---- */
  const seriesOf = (id) => state.series.find((s) => s.id === id);
  /* الموضوع العلمي (فضاء الطلاب) — يُقرأ من البيانات القابلة للتعديل، مع الرجوع إلى الأقسام القديمة */
  const topicsAll = () => (state.topics && state.topics.length ? state.topics : DEFAULT_TOPICS);
  const topics = () => topicsAll().filter((t) => !t.hidden);
  /* تصنيف إضافي للكتب التي لا تتبع موضوعًا بعينه (في المكتبة فقط) */
  const GENERAL_CAT = { id: "general", name: "كتب عامة", desc: "كتب ومراجع علمية عامة." };
  const libCats = () => [...topics(), GENERAL_CAT];
  const catOf = (id) => (id === "general" ? GENERAL_CAT : topicsAll().find((c) => c.id === id) || CATEGORIES.find((c) => c.id === id) || topicsAll()[0]);
  /* حجم الملف بصيغة مقروءة */
  const fmtSize = (n) => (!n ? "" : n >= 1048576 ? (n / 1048576).toFixed(1).replace(".0", "") + " ميغابايت" : Math.max(1, Math.round(n / 1024)) + " كيلوبايت");
  /* رابط تنزيل مباشر لملف في التخزين (يضيف ?download) */
  const downloadUrl = (url, name) => (/\/storage\/v1\/object\/public\//.test(url || "") ? url + (url.includes("?") ? "&" : "?") + "download=" + encodeURIComponent((name || "book").replace(/[\\/:*?"<>|]+/g, " ").trim() + ".pdf") : url);
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
  /* الاختبار المرحلي لوحدة (قائمة تشغيل) في دورة، ومفتاح نتيجته */
  const stageOf = (c, unit) => ((c && c.stages) || []).find((s) => s.unit === unit && (s.quiz || []).length) || null;
  const stageKey = (cid, unit) => cid + "@" + unit;
  const unitDone = (u, c, pl) => (pl.lessons || []).every((l) => (u.enrolled[c.id] || []).includes(l.id));
  /* هل فتحت الإدارة محاولة جديدة للطالب في هذه الدورة؟ */
  const canRetake = (cid, r) => !!r && !r.pending && !passed(r) && ((state.myExam || {})[cid] || 1) > (r.attempts || 1);
  const nextStep = (u, c) => {
    const done = u.enrolled[c.id] || [];
    /* بالترتيب: الدروس، ثم الامتحان النهائي (محاولة واحدة)، ثم انتظار النتيجة، ثم الشهادة.
       الاختبارات المرحلية للتدرّب ولا تمنع التقدّم. */
    const l = c.lessons.find((x) => !done.includes(x.id));
    if (l) return { kind: "lesson", lesson: l, href: `#/student/lesson/${c.id}/${l.id}`, label: "تابع الدرس" };
    const r = u.results[c.id];
    if (!r || canRetake(c.id, r)) return { kind: "quiz", href: `#/student/quiz/${c.id}`, label: r ? "المحاولة الجديدة متاحة" : "ابدأ الامتحان النهائي" };
    if (r.pending) return { kind: "pending", href: `#/student/quiz/${c.id}`, label: "بانتظار نشر النتيجة" };
    if (!passed(r)) return { kind: "failed", href: `#/student/quiz/${c.id}`, label: "عرض النتيجة" };
    return { kind: "done", href: `#/student/certificate/${c.id}`, label: "عرض الشهادة" };
  };
  /* الدورة التي يُقترح أن يكمل فيها الطالب: آخر ما فتحه، وإلا أول دورة غير منتهية */
  const currentCourse = (u) => {
    const mine = programs().filter((c) => u.enrolled[c.id]);
    const last = u.last && mine.find((c) => c.id === u.last.cid);
    const active = (c) => ["lesson", "quiz"].includes(nextStep(u, c).kind);
    if (last && active(last)) return last;
    return mine.find(active) || null;
  };
  const continueCard = (u) => {
    const c = currentCourse(u);
    if (!c) return "";
    const st = nextStep(u, c);
    const p = progressOf(u, c);
    const what = st.kind === "lesson" ? `${esc(st.lesson.title)}: ${esc(st.lesson.topic)}` : "الامتحان النهائي";
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

  /* ---- صور الأغلفة: قائمة التشغيل ← السلسلة ← القسم ← الصورة الافتراضية ----
     الصورة الافتراضية لكل قسم في assets/covers/<القسم>.jpg ويمكن استبدالها بملف بالاسم نفسه،
     أو تغييرها من لوحة الإدارة (قسم «صور الأغلفة»). */
  /* رقم الإصدار المنشور يُلحق بصور الموقع، فيرى الزوار الصور الجديدة فور النشر دون الاحتفاظ بالقديمة */
  const BUILD = (() => { try { const m = document.querySelector('meta[name="build"]'); return m && m.content && m.content !== "__BUILD__" ? m.content : ""; } catch (e) { return ""; } })();
  const fromRoot = (p) => (!p || /^(data:|https?:|blob:)/.test(p)) ? p : (/\/admin\//.test(location.pathname) ? "../" : "") + p + (BUILD && !p.includes("?") ? "?v=" + BUILD : "");
  const catCover = (catId) => { const t = catOf(catId); return fromRoot((state.catCovers || {})[t.id] || t.cover || "assets/covers/" + t.id + ".jpg"); };
  const seriesCover = (s) => (s && s.cover ? fromRoot(s.cover) : catCover(s ? s.cat : ""));
  const courseCover = (c) => (c && c.cover ? fromRoot(c.cover) : seriesCover(c && seriesOf(c.series)));
  /* صورة غلاف جاهزة: إن تعذّر تحميلها تبقى خلفية البطاقة الملوّنة */
  const coverImg = (src, cls = "cover-img") => `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">`;
  /* ---- الدورات المتاحة (programs) ----
     الدورة سجلّ مستقل (العنوان، الأهداف، الشروط، الاختبار) يشير إلى قوائم تشغيل في فضاء الطلاب
     بمعرّفاتها؛ فدروسها هي حلقات تلك القوائم نفسها، دون نسخ. */
  const programsAll = () => (Array.isArray(state.programs) ? state.programs : []);
  const programRaw = (id) => programsAll().find((p) => p.id === id) || null;
  /* عرض «يشبه قائمة التشغيل» للدورة: دروس القوائم المرتبطة مجمّعة، مع السلسلة واللون من أول قائمة */
  const programView = (p) => {
    if (!p) return null;
    const pls = (p.playlists || []).map((id) => state.courses.find((c) => c.id === id)).filter(Boolean);
    return Object.assign({}, p, {
      units: pls,
      lessons: pls.flatMap((c) => c.lessons || []),
      quiz: Array.isArray(p.quiz) ? p.quiz : [],
      series: (pls[0] || {}).series || "",
      color: p.color || (pls[0] || {}).color || "#4a4486",
      level: p.level || (pls[0] || {}).level || "",
      teacher: p.teacher || (pls[0] || {}).teacher || "",
    });
  };
  const program = (id) => programView(programRaw(id));
  const programs = () => programsAll().filter((p) => !p.hidden).map(programView);
  /* ترحيل لمرة واحدة: كل قائمة تشغيل لها اختبار تصبح «دورة» بالمعرّف نفسه (فتبقى تسجيلات الطلاب
     ونتائجهم ومفاتيح الإجابات كما هي)، وينتقل الاختبار من القائمة إلى الدورة. */
  const migratePrograms = () => {
    /* لا يبقى اختبار في قائمة تشغيل صارت لها دورة (الاختبار مكانه الدورة فقط) */
    const strip = () => programsAll().forEach((p) => { const c = state.courses.find((x) => x.id === p.id); if (c && c.quiz && p.quiz) delete c.quiz; });
    if (Array.isArray(state.programs)) { strip(); return false; }
    state.programs = (state.courses || []).filter((c) => Array.isArray(c.quiz) && c.quiz.length).map((c) => ({
      id: c.id, title: c.title, desc: c.desc, goals: [], teacher: c.teacher,
      topic: (state.series.find((s) => s.id === c.series) || {}).cat || "fiqh",
      playlists: [c.id], level: c.level, color: c.color, conditions: "", quiz: c.quiz,
    }));
    state.programs.forEach((p) => { const c = state.courses.find((x) => x.id === p.id); if (c) delete c.quiz; });
    return true;
  };
  migratePrograms();
  /* دورات الطالب التي تضم قائمة تشغيل معيّنة (لتسجيل إنجاز الحلقة من فضاء الطلاب) */
  const programsWithPlaylist = (cid) => programs().filter((p) => (p.playlists || []).includes(cid));
  const playlistsOf = (sid) => state.courses.filter((c) => c.series === sid);
  const lessonsIn = (sid) => playlistsOf(sid).reduce((n, c) => n + c.lessons.length, 0);

  /* ضغط الصورة المرفوعة قبل حفظها في المتصفح */
  const readImage = (file, max = 1100, q = 0.78) => new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = reject;
    fr.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement("canvas");
        cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        const ctx = cv.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        resolve(cv.toDataURL("image/jpeg", q));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });


  /* ---- حسابات الطلاب: الدخول برقم الهاتف أو البريد ---- */
  const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());
  /* يقبل الأرقام العربية والغربية، ويحذف رمز موريتانيا (+222 / 00222) إن وُجد */
  const normPhone = (v) => {
    let d = String(v || "").replace(/[٠-٩]/g, (c) => "٠١٢٣٤٥٦٧٨٩".indexOf(c)).replace(/\D/g, "");
    if (d.startsWith("00")) d = d.slice(2);
    if (d.length > 8 && d.startsWith("222")) d = d.slice(3);
    return d;
  };
  const isPhone = (v) => { const d = normPhone(v); return d.length >= 8 && d.length <= 15 && !/[a-z@]/i.test(String(v)); };
  const findStudent = (contact) => {
    const c = String(contact || "").trim();
    if (isEmail(c)) return state.users.find((u) => (u.email || "").toLowerCase() === c.toLowerCase()) || null;
    const ph = normPhone(c);
    return ph ? state.users.find((u) => u.phone && u.phone === ph) || null : null;
  };
  const contactOf = (u) => [u.phone ? "+222 " + u.phone : "", u.email || ""].filter(Boolean).join(" · ") || "—";

  /* ---- أيقونات خطية موحّدة (SVG) — بديل الرموز التعبيرية في الواجهة ---- */
  const ICONS = {
    book: '<path d="M2 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7z"/>',
    play: '<circle cx="12" cy="12" r="10"/><path d="m10 8 6 4-6 4z"/>',
    headphones: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>',
    library: '<path d="M5 4v16M9 4v16M13 5l4 15"/>',
    quiz: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    cap: '<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',
    video: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m22 8-6 4 6 4z"/>',
    users: '<circle cx="9" cy="7" r="4"/><path d="M2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7M22 21v-1a6 6 0 0 0-4-5.6"/>',
    map: '<path d="m9 4-6 2v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
    layers: '<path d="M12 2 2 7l10 5 10-5z"/><path d="m2 12 10 5 10-5M2 17l10 5 10-5"/>',
    sparkles: '<path d="m12 3 1.8 4.6L18 9.5l-4.2 1.9L12 16l-1.8-4.6L6 9.5l4.2-1.9z"/><path d="m19 15 .8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
    chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
    award: '<circle cx="12" cy="8" r="6"/><path d="M8.2 13.4 7 22l5-3 5 3-1.2-8.6"/>',
    devices: '<rect x="2" y="4" width="14" height="10" rx="2"/><path d="M6 18h6"/><rect x="17" y="8" width="5" height="12" rx="1"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    userPlus: '<circle cx="9" cy="8" r="4"/><path d="M2 21v-1a7 7 0 0 1 14 0v1M19 8v6M16 11h6"/>',
    login: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5M15 12H3"/>',
    check: '<circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a8 8 0 0 1 16 0v1"/>',
    arrow: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    scroll: '<path d="M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/>',
    mosque: '<path d="M12 3c-3 2-5 4-5 7h10c0-3-2-5-5-7z"/><path d="M5 21V10M19 21V10M3 21h18M9 21v-4a3 3 0 0 1 6 0v4"/>',
    quran: '<path d="M4 19.5V4a2 2 0 0 1 2-2h14v20H6a2 2 0 0 1-2-2.5z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="m12 6 1 2.2 2.4.3-1.8 1.6.5 2.4L12 11.3 9.9 12.5l.5-2.4-1.8-1.6 2.4-.3z"/>',
    mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/>',
    palm: '<path d="M12 22V11"/><path d="M12 11c-2-4-6-5-9-4 3 0 6 2 7 5M12 11c2-4 6-5 9-4-3 0-6 2-7 5M12 11c-1-4 0-7 3-8-2 2-2 5-2 8"/>',
    coins: '<circle cx="8" cy="8" r="6"/><path d="M18.1 10.4A6 6 0 1 1 10.4 18.1M7 6h1v4M16.7 13.9l.7.7-2.8 2.8"/>',
    hadith: '<path d="M4 19.5V4a2 2 0 0 1 2-2h14v20H6a2 2 0 0 1-2-2.5z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M9 7h7M9 11h5"/>',
  };
  /* أيقونة كل قسم من أقسام المكتبة */
  const CAT_ICON = { general: "library", fiqh: "scroll", seerah: "mosque", hadith: "hadith", sahaba: "palm", quran: "quran", tajweed: "mic", arabic: "pen", aqeedah: "sparkles", tadabbur: "book" };
  const ic = (name, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;

  /* إعادة ضبط البيانات مع الحفاظ على المرجع نفسه للكائن */
  const resetState = () => {
    try { localStorage.removeItem(KEY); } catch (e) { /* */ }
    Object.keys(state).forEach((k) => delete state[k]);
    Object.assign(state, defaults());
  };

  /* =========================================================
     الحسابات والأدوار والصلاحيات
     ========================================================= */
  const ROLES = {
    owner: { label: "المدير العام", desc: "صلاحيات كاملة على المنصة والحسابات." },
    supervisor: { label: "المشرف", desc: "إدارة المحتوى والطلاب وفق الصلاحيات الممنوحة له." },
    teacher: { label: "المعلم", desc: "إدارة دروس المواد التي يدرّسها ومتابعة طلابها فقط." },
    treasurer: { label: "أمين المال", desc: "إدارة المالية فقط: التبرعات والكفالات والمصروفات والميزانية." },
    student: { label: "الطالب", desc: "الاطلاع على المحتوى التعليمي فقط، دون دخول لوحة الإدارة." },
  };
  /* الصلاحيات التي يمنحها المدير العام للمشرف */
  const PERMS = {
    content: "إدارة المحتوى: السلاسل وقوائم التشغيل والدروس",
    students: "عرض الطلاب والمعلمين وإضافة المعلمين",
    results: "متابعة التسجيلات والنتائج",
    announcements: "نشر الإعلانات وحذفها",
  };

  const SESSION_HOURS = 8;
  const MAX_FAILS = 5, LOCK_MINUTES = 5;

  const sha256 = async (text) => {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  };
  const hashPassword = async (pw) => {
    const salt = Array.from(crypto.getRandomValues(new Uint8Array(4))).map((b) => b.toString(16).padStart(2, "0")).join("");
    return { salt, hash: await sha256(salt + ":" + pw) };
  };
  const verifyPassword = async (pw, rec) => !!rec && (await sha256(rec.salt + ":" + pw)) === rec.hash;

  /* الحساب الإداري الحالي بعد التحقق من الجلسة وصلاحية الحساب */
  const currentStaff = () => {
    const s = state.staffSession;
    if (!s || !s.exp || Date.now() > s.exp) return null;
    const acc = state.staff.find((x) => x.id === s.id);
    if (!acc || acc.disabled || !ROLES[acc.role] || acc.role === "student") return null;
    return acc;
  };

  /* المعلم يملك الدورة إن كانت في إحدى مواده (القسم العلمي لسلسلتها)، أو مسندة إليه باسمه */
  const ownsProgram = (acc, pid) => {
    const p = program(pid);
    if (!p) return false;
    if ((acc.subjects || []).includes(p.topic)) return true;
    return !!(acc.teacherId && p.teacher === acc.teacherId);
  };
  const ownsCourse = (acc, courseId) => {
    const c = course(courseId);
    if (!c) return ownsProgram(acc, courseId);
    const s = state.series.find((x) => x.id === c.series);
    if (s && (acc.subjects || []).includes(s.cat)) return true;
    return !!(acc.teacherId && c.teacher === acc.teacherId);
  };

  /* القرار الوحيد للصلاحيات: كل صفحة وكل عملية في لوحة الإدارة تمر من هنا */
  const can = (action, ctx = {}, acc = currentStaff()) => {
    if (!acc) return false;
    if (acc.role === "owner") return true;
    const has = (p) => (acc.perms || []).includes(p);
    const teacher = acc.role === "teacher";
    switch (action) {
      case "overview:view": return true;
      case "account:self": return true;
      case "content:structure": return acc.role === "supervisor" && has("content");
      /* الدورات المتاحة: المشرف بصلاحية المحتوى، والمعلم في دورات مواده */
      case "programs:manage":
        if (acc.role === "supervisor") return has("content");
        if (teacher) return ctx.programId ? ownsProgram(acc, ctx.programId) : true;
        return false;
      /* طلبات الالتحاق: المشرف بصلاحية الطلاب (والمدير العام) */
      case "requests:manage": return acc.role === "supervisor" && has("students");
      /* المكتبة: المشرف بصلاحية المحتوى، والمعلم في أقسام مواده فقط */
      case "library:manage":
        if (acc.role === "supervisor") return has("content");
        if (teacher) return ctx.cat ? (acc.subjects || []).includes(ctx.cat) : (acc.subjects || []).length > 0;
        return false;
      case "content:lessons":
        if (acc.role === "supervisor") return has("content");
        if (teacher) return ctx.courseId ? ownsCourse(acc, ctx.courseId) : state.courses.some((c) => ownsCourse(acc, c.id));
        return false;
      case "people:view":
        if (acc.role === "supervisor") return has("students");
        return teacher; // المعلم يرى طلاب دوراته فقط (تُصفّى في العرض)
      case "people:manage": return acc.role === "supervisor" && has("students");
      case "results:view":
        if (acc.role === "supervisor") return has("results");
        if (teacher) return ctx.courseId ? ownsCourse(acc, ctx.courseId) : true;
        return false;
      case "ann:manage": return acc.role === "supervisor" && has("announcements");
      case "finance:manage": return acc.role === "treasurer"; // والمدير العام (أعلاه)
      case "staff:manage": case "audit:view": return false; // للمدير العام فقط
      default: return false;
    }
  };

  /* نطاق الدورات التي يحق للحساب رؤيتها في البيانات */
  const scopedCourses = (acc = currentStaff()) =>
    !acc || acc.role === "treasurer" ? [] : acc.role === "teacher" ? programs().filter((c) => ownsProgram(acc, c.id)) : programs();

  const logAction = (text, acc = currentStaff()) => {
    state.audit = state.audit || [];
    state.audit.unshift({ at: new Date().toISOString(), who: acc ? acc.name : "زائر", role: acc ? acc.role : "", text });
    state.audit = state.audit.slice(0, 300);
  };

  /* ---------------- سجل الشهادات المشفّر (للتحقق العام دون كشف الأسماء) ----------------
     لكل شهادة: مفتاح البحث ومفتاح التشفير مشتقّان من رقم الشهادة بـ PBKDF2 (150 ألف دورة)،
     فلا يُعرف صاحب أي شهادة إلا لمن يملك رقمها، ولا يمكن استعراض الأسماء من البيانات. */
  const CERT_SALT = new TextEncoder().encode("mahajja-cert-v1");
  const hex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const certCode = (uid, cid) => String(uid).slice(-6).toUpperCase() + "-" + String(cid).toUpperCase();
  async function certKeys(code) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(code).trim().toUpperCase()), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: CERT_SALT, iterations: 150000, hash: "SHA-256" }, base, 512);
    const id = hex(bits.slice(0, 32));
    const key = await crypto.subtle.importKey("raw", bits.slice(32), "AES-GCM", false, ["encrypt", "decrypt"]);
    return { id, key };
  }
  async function certSeal(code, info) {
    const { id, key } = await certKeys(code);
    const plain = new TextEncoder().encode(JSON.stringify(info));
    const iv = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code + "|" + JSON.stringify(info)))).slice(0, 12);
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
    return [id, b64(iv) + "." + b64(ct)];
  }
  async function certOpen(code) {
    const reg = state.certs || {};
    const { id, key } = await certKeys(code);
    if (!reg[id]) return null;
    try {
      const [iv, ct] = reg[id].split(".");
      return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, key, unb64(ct))));
    } catch (e) { return null; }
  }

  /* ---------------- إظهار كلمة المرور وإخفاؤها (في الموقع ولوحة الإدارة) ---------------- */
  const PW_EYE = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const PW_EYE_OFF = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17.6 17.6 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  const pwButton = (b) => {
    b.type = "button"; b.className = "pw-toggle"; b.setAttribute("data-pw-toggle", "");
    b.setAttribute("aria-label", "إظهار كلمة المرور"); b.title = "إظهار كلمة المرور"; b.innerHTML = PW_EYE;
  };
  const enhancePw = () => {
    document.querySelectorAll('input[type="password"]').forEach((i) => {
      if (i.closest(".pw-field")) return;
      const w = document.createElement("span"); w.className = "pw-field";
      i.parentNode.insertBefore(w, i); w.appendChild(i);
      const b = document.createElement("button"); pwButton(b); w.appendChild(b);
    });
    document.querySelectorAll(".pw-toggle:not([data-pw-ready])").forEach((b) => {
      b.setAttribute("data-pw-ready", ""); if (!b.querySelector("svg")) pwButton(b);
    });
  };
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-pw-toggle]");
    if (!b) return;
    e.preventDefault();
    const i = b.closest(".pw-field") && b.closest(".pw-field").querySelector("input");
    if (!i) return;
    const show = i.type === "password";
    i.type = show ? "text" : "password";
    const label = show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور";
    b.setAttribute("aria-label", label); b.title = label; b.setAttribute("aria-pressed", String(show));
    b.innerHTML = show ? PW_EYE_OFF : PW_EYE; b.classList.toggle("on", show);
  });
  const startPw = () => { enhancePw(); new MutationObserver(enhancePw).observe(document.body, { childList: true, subtree: true }); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startPw); else startPw();

  window.MH = {
    KEY, state, save, resetState, clone, $, $$, esc, uid, today, fmtDate, arNum, paras, toast, EMBED_OK, confirmTap,
    ytId, videoBlock, course, teacher, seriesName, me, allStudents, progressOf, passed,
    seriesOf, catOf, topics, topicsAll, libCats, GENERAL_CAT, fmtSize, downloadUrl, pad2, verseCount, versesWord, lessonName, NOTE_SECTIONS, hasNotes,
    nextStep, currentCourse, continueCard, playlistsOf, lessonsIn, readImage,
    programsAll, programRaw, program, programs, programView, migratePrograms, programsWithPlaylist, stageOf, stageKey, unitDone, canRetake,
    ROLES, PERMS, SESSION_HOURS, MAX_FAILS, LOCK_MINUTES, hashPassword, verifyPassword,
    currentStaff, can, ownsCourse, ownsProgram, scopedCourses, logAction,
    isEmail, normPhone, isPhone, findStudent, contactOf, storageOK,
    pct, gradeTxt, gradeFull,
    ic, ICONS, CAT_ICON, catCover, seriesCover, courseCover, coverImg, fromRoot,
    certCode, certSeal, certOpen,
  };
})();
