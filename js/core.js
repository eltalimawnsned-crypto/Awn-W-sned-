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
    settings: { regOpen: true, regNote: "التسجيل مجاني ومفتوح في جميع الدورات" },
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
  delete state.admin; // المفتاح القديم «admin: true» لم يعد يمنح أي صلاحية
  if (!Array.isArray(state.staff) || !state.staff.length) state.staff = clone(DEFAULT_STAFF);
  /* ترحيل: مواد المعلمين التجريبيين، وإضافة حساب معلم القرآن إن لم يكن موجودًا */
  DEFAULT_STAFF.forEach((d) => {
    const ex = state.staff.find((x) => x.id === d.id);
    if (!ex) { if (!state.staff.some((x) => x.email.toLowerCase() === d.email)) state.staff.push(clone(d)); }
    else if (ex.role === "teacher" && !ex.subjects && d.subjects) ex.subjects = d.subjects.slice();
  });
  state.settings = Object.assign({ regOpen: true, regNote: "التسجيل مجاني ومفتوح في جميع الدورات" }, state.settings || {});
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
  const ownsCourse = (acc, courseId) => {
    const c = course(courseId);
    if (!c) return false;
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
      case "staff:manage": case "audit:view": return false; // للمدير العام فقط
      default: return false;
    }
  };

  /* نطاق الدورات التي يحق للحساب رؤيتها في البيانات */
  const scopedCourses = (acc = currentStaff()) =>
    !acc ? [] : acc.role === "teacher" ? state.courses.filter((c) => ownsCourse(acc, c.id)) : state.courses;

  const logAction = (text, acc = currentStaff()) => {
    state.audit = state.audit || [];
    state.audit.unshift({ at: new Date().toISOString(), who: acc ? acc.name : "زائر", role: acc ? acc.role : "", text });
    state.audit = state.audit.slice(0, 300);
  };

  window.MH = {
    KEY, state, save, resetState, clone, $, $$, esc, uid, today, fmtDate, arNum, paras, toast, EMBED_OK, confirmTap,
    ytId, videoBlock, course, teacher, seriesName, me, allStudents, progressOf, passed,
    seriesOf, catOf, pad2, verseCount, versesWord, lessonName, NOTE_SECTIONS, hasNotes,
    nextStep, currentCourse, continueCard, playlistsOf, lessonsIn, readImage,
    ROLES, PERMS, SESSION_HOURS, MAX_FAILS, LOCK_MINUTES, hashPassword, verifyPassword,
    currentStaff, can, ownsCourse, scopedCourses, logAction,
    isEmail, normPhone, isPhone, findStudent, contactOf, storageOK,
  };
})();
