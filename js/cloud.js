/* =========================================================
   منصة المحجة البيضاء — الربط بقاعدة البيانات (Supabase)
   - المحتوى (السلاسل، الدورات، الدروس، المعلمون، الإعلانات، الإعدادات)
     يُقرأ للجميع ويحفظه أصحاب الحسابات الإدارية فقط.
   - حسابات الطلاب والإدارة حقيقية (Supabase Auth)، وتقدّم الطالب
     يُحفظ في حسابه فيعمل من أي جهاز.
   - الصلاحيات الفعلية تطبّقها سياسات RLS في الخادم.
   يُحمَّل بعد js/core.js وقبل js/app.js أو js/admin.js.
   ========================================================= */
(function () {
  "use strict";
  const SB_URL = "https://cmnopyyhzvqlpbnxkwsw.supabase.co";
  const SB_KEY = "sb_publishable_S_L-NIdZfadaYK9CnFXrkw_X4aK3jZ8";
  const CONTENT_KEYS = ["series", "courses", "teachers", "announcements", "settings", "catCovers", "library", "topics", "programs"];

  const { state } = MH;
  const localSave = MH.save;
  const origLog = MH.logAction;

  let sb = null;
  try {
    if (window.supabase && window.supabase.createClient)
      sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "mahajja-auth" } });
  } catch (e) { sb = null; }

  const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ""));
  let profile = null;
  let studentCount = 0;        // عدد الطلاب المسجلين (يُعرض في الصفحة الرئيسية)          // صف الحساب الحالي من جدول profiles
  let snapContent = null;      // آخر محتوى متزامن مع الخادم
  let baseVersion = null;      // رقم إصدار ذلك المحتوى في الخادم (يزيد مع كل حفظ)
  const snapUsers = new Map(); // آخر نسخة متزامنة لكل طالب
  const snapStaff = new Map(); // آخر نسخة متزامنة لكل حساب إداري

  /* المحتوى كما يُحفظ في الخادم: الإجابات الصحيحة للاختبارات لا تُرسل معه (تُحفظ في جدول quiz_keys المحمي) */
  const stripAnswers = (courses) => (Array.isArray(courses) ? courses.map((c) => (c && Array.isArray(c.quiz) ? Object.assign({}, c, { quiz: c.quiz.map((q) => { const o = Object.assign({}, q); delete o.answer; return o; }) }) : c)) : courses);
  const contentOf = () => { const o = {}; CONTENT_KEYS.forEach((k) => (o[k] = k === "courses" || k === "programs" ? stripAnswers(state[k]) : state[k])); return o; };

  /* مفاتيح الإجابات (للإدارة فقط) */
  let snapKeys = new Map();
  /* الاختبارات في «الدورات» (وفي قوائم التشغيل للمحتوى القديم قبل الترحيل) */
  const quizHolders = () => [...(state.programs || []), ...(state.courses || [])].filter((c) => Array.isArray(c.quiz));
  const answersMap = () => new Map(quizHolders().map((c) => [c.id, c.quiz.map((q) => (Number.isInteger(q.answer) ? q.answer : 0))]));
  const injectAnswers = (map) => quizHolders().forEach((c) => { const k = map.get(c.id); if (k) c.quiz.forEach((q, i) => { if (Number.isInteger(k[i])) q.answer = k[i]; }); });
  async function loadKeys() {
    const { data, error } = await sb.from("quiz_keys").select("course_id, answers");
    if (error) { console.warn("quiz_keys", error); return; }
    const m = new Map((data || []).map((r) => [r.course_id, Array.isArray(r.answers) ? r.answers : []]));
    injectAnswers(m);
    snapKeys = new Map([...answersMap()].map(([k, v]) => [k, JSON.stringify(v)]));
  }
  async function pushKeys() {
    const now = answersMap();
    for (const [cid, arr] of now) {
      const sig = JSON.stringify(arr);
      if (snapKeys.get(cid) === sig) continue;
      const { error } = await sb.from("quiz_keys").upsert({ course_id: cid, answers: arr, updated_at: new Date().toISOString(), updated_by: profile.id });
      if (error) { console.warn(error); MH.toast("تعذّر حفظ إجابات الاختبار: " + msg(errCode(error)), "warn"); continue; }
      snapKeys.set(cid, sig);
    }
    for (const cid of [...snapKeys.keys()]) {
      if (now.has(cid)) continue;
      const { error } = await sb.from("quiz_keys").delete().eq("course_id", cid);
      if (!error) snapKeys.delete(cid);
    }
  }
  const disabledIds = new Set(); // حسابات الطلاب الموقوفة (لا تُخزَّن داخل بيانات الطالب)
  const userFromRow = (p) => (p.disabled ? disabledIds.add(p.id) : disabledIds.delete(p.id), Object.assign({ enrolled: {}, results: {} }, p.data || {}, {
    id: p.id, name: p.name, email: p.email || "", phone: p.phone || "",
    joined: (p.data && p.data.joined) || String(p.created_at || "").slice(0, 10),
  }));
  const userData = (u) => { const d = Object.assign({}, u); ["id", "name", "email", "phone", "pwd", "password"].forEach((k) => delete d[k]); return d; };
  const userSig = (u) => JSON.stringify([u.name, u.email || null, u.phone || null, userData(u)]);
  const staffFromRow = (p) => ({
    id: p.id, name: p.name, email: p.email || "", role: p.role, disabled: !!p.disabled,
    perms: (p.data && p.data.perms) || [], teacherId: (p.data && p.data.teacherId) || null,
    subjects: (p.data && p.data.subjects) || [],
  });
  const staffData = (s) => ({ perms: s.perms || [], teacherId: s.teacherId || null, subjects: s.subjects || [] });
  const staffSig = (s) => JSON.stringify([s.name, s.email, s.role, !!s.disabled, staffData(s)]);
  const isStaffNow = () => !!(profile && profile.kind === "staff" && !profile.disabled);
  /* أمين المال حساب إداري لكنه لا يحفظ المحتوى التعليمي */
  const isContentStaff = () => isStaffNow() && profile.role !== "treasurer";

  const snapshot = () => {
    snapUsers.clear(); snapStaff.clear();
    state.users.forEach((u) => isUuid(u.id) && snapUsers.set(u.id, userSig(u)));
    (state.staff || []).forEach((s) => isUuid(s.id) && snapStaff.set(s.id, staffSig(s)));
  };

  /* رسائل الأخطاء بالعربية */
  const ERR = {
    phone_taken: "هذا الرقم مسجل مسبقًا، استخدم «لديّ حساب»",
    email_taken: "هذا البريد مسجل مسبقًا، استخدم «لديّ حساب»",
    reg_closed: "التسجيل مغلق حاليًا",
    weak_password: "كلمة المرور قصيرة (6 أحرف أو أرقام على الأقل)",
    lessons_incomplete: "أتمّ جميع دروس الدورة أولًا ليُفتح الاختبار",
    not_signed_in: "سجّل الدخول أولًا",
    bad_input: "تحقق من البيانات المدخلة",
    wrong_password: "كلمة المرور الحالية غير صحيحة",
    not_allowed: "ليست لديك صلاحية لهذا الإجراء",
    not_found: "الحساب غير موجود",
    bad: "رقم الهاتف أو البريد أو كلمة المرور غير صحيحة",
    staff_only: "هذا الحساب لا يملك صلاحية الإدارة",
    staff_only_site: "هذا حساب إداري؛ ادخل به من لوحة الإدارة",
    dup: "هذا العنصر مسجَّل مسبقًا (مثل دفعة الشهر نفسه لهذه الكفالة)",
    net: "تعذّر الاتصال بالخادم، تحقق من الإنترنت وأعد المحاولة",
    offline: "تعذّر الاتصال بقاعدة البيانات في هذه النسخة؛ استخدم رابط المنصة المنشور",
    bad_pdf: "اختر ملف PDF فقط",
    too_big: "حجم الكتاب أكبر من 50 ميغابايت؛ اضغطه أو قسّمه إلى أجزاء",
  };
  const errCode = (error) => {
    const m = String((error && (error.message || error.code)) || "");
    const k = Object.keys(ERR).find((x) => m.includes(x));
    if (k) return k;
    if (/duplicate|23505|unique/i.test(m)) return m.includes("phone") ? "phone_taken" : "email_taken";
    if (/fetch|network|Failed|timeout/i.test(m)) return "net";
    return "bad";
  };
  const msg = (code) => ERR[code] || ERR.bad;

  /* تحميل الحساب الحالي وما يحق له رؤيته */
  async function loadMe(uid) {
    const { data: p, error } = await sb.from("profiles").select("*").eq("id", uid).maybeSingle();
    if (error) throw error;
    if (!p || p.disabled) { await sb.auth.signOut(); profile = null; return null; }
    profile = p;
    if (p.kind === "staff") {
      const { data: all, error: e2 } = await sb.from("profiles").select("*").order("created_at");
      if (e2) throw e2;
      state.staff = all.filter((x) => x.kind === "staff").map(staffFromRow);
      state.users = all.filter((x) => x.kind === "student").map(userFromRow);
      state.session = null;
      state.staffSession = { id: p.id, exp: Date.now() + MH.SESSION_HOURS * 3600000 };
      if (p.role !== "treasurer") await loadKeys();
      if (p.role === "owner") {
        const { data: rows } = await sb.from("audit_log").select("at,who,role,text").order("at", { ascending: false }).limit(300);
        state.audit = (rows || []).map((r) => ({ at: r.at, who: r.who, role: r.role, text: r.text }));
      }
    } else {
      state.staff = [];
      state.staffSession = null;
      state.users = [userFromRow(p)];
      state.session = p.id;
      await loadMyRequests();
    }
    snapshot();
    return p;
  }

  const clearAccounts = () => {
    profile = null;
    state.users = []; state.session = null;
    state.staff = []; state.staffSession = null;
    state.audit = [];
    state.myRequests = {};
    snapshot();
  };

  /* ---------------- الإقلاع: جلب المحتوى والجلسة ---------------- */
  const ready = (async () => {
    if (!sb) { clearAccounts(); return; }
    try {
      const [c, s, n] = await Promise.all([
        sb.from("site_content").select("data, version").eq("id", 1).maybeSingle(),
        sb.auth.getSession(),
        sb.rpc("student_count"),
      ]);
      if (n && typeof n.data === "number") studentCount = n.data;
      const row = c && c.data;
      if (row && row.data) CONTENT_KEYS.forEach((k) => { if (row.data[k] !== undefined) state[k] = row.data[k]; });
      /* محتوى الخادم قبل إنشاء «الدورات»: تُشتق منه بالطريقة نفسها عند كل زائر، وتُحفظ عند أول حفظ إداري */
      /* نسخة الأساس للدمج تُؤخذ قبل الترحيل، فيُحفظ الترحيل (الدورات + حذف الاختبار من القوائم) عند أول حفظ إداري */
      const preSnap = row && row.data ? JSON.stringify(contentOf()) : null;
      if (row && row.data && row.data.programs === undefined) state.programs = undefined;
      MH.migratePrograms();
      clearAccounts();
      const session = s && s.data && s.data.session;
      if (session) { try { await loadMe(session.user.id); } catch (e) { console.warn(e); } }
      snapContent = preSnap;
      baseVersion = row && typeof row.version === "number" ? row.version : null;
      /* أول دخول إداري: يُرفع المحتوى الموجود في هذا المتصفح ليصبح هو المحتوى الرسمي */
      if (!row && isContentStaff()) await pushContent();
      localSave();
    } catch (e) {
      console.warn("cloud boot", e);
    }
  })();

  /* ---------------- الحفظ: نسخة محلية + مزامنة مع الخادم ---------------- */
  let timer = null, pushing = Promise.resolve();
  const save = () => {
    const ok = localSave();
    if (sb && profile) { clearTimeout(timer); timer = setTimeout(() => { pushing = pushing.then(push); }, 400); }
    return ok;
  };

  /* ---------- دمج ثلاثي: حين يحفظ مشرفان في الوقت نفسه لا يمحو أحدهما تعديلات الآخر ----------
     base = آخر نسخة مشتركة، local = تعديلاتي، server = ما حفظه غيري.
     ما غيّرتُه أنا يُؤخذ مني، وما غيّره غيري يُؤخذ منه، والعناصر ذات المعرّف (السلاسل، القوائم، الدروس…)
     تُدمج عنصرًا عنصرًا. وإن عدّلنا الحقل نفسه معًا فالأحدث (تعديلي) هو المعتمد. */
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const isObj = (x) => !!x && typeof x === "object" && !Array.isArray(x);
  const idList = (a) => Array.isArray(a) && a.every((x) => isObj(x) && x.id != null);
  function merge3(base, local, server) {
    if (same(local, base)) return server;
    if (same(server, base) || same(server, local)) return local;
    if (isObj(local) && isObj(server)) {
      const b = isObj(base) ? base : {}, out = {};
      new Set([...Object.keys(server), ...Object.keys(local)]).forEach((k) => {
        const inL = k in local, inS = k in server, inB = k in b;
        if (inL && inS) out[k] = merge3(b[k], local[k], server[k]);
        else if (inL) { if (!(inB && same(local[k], b[k]))) out[k] = local[k]; }
        else if (!(inB && same(server[k], b[k]))) out[k] = server[k];
      });
      return out;
    }
    if (idList(local) && idList(server) && (base == null || idList(base))) {
      const B = new Map((base || []).map((x) => [x.id, x])), L = new Map(local.map((x) => [x.id, x])), S = new Map(server.map((x) => [x.id, x]));
      const ids = (a) => a.map((x) => x.id);
      const primary = same(ids(local), ids(base || [])) ? server : local; // من غيّر الترتيب يُعتمد ترتيبه
      const order = [...new Set([...ids(primary), ...ids(primary === local ? server : local)])];
      const out = [];
      order.forEach((id) => {
        const l = L.get(id), sv = S.get(id), bb = B.get(id);
        if (l && sv) out.push(merge3(bb, l, sv));
        else if (l) { if (!(bb && same(l, bb))) out.push(l); }   // حذفه غيري ولم أعدّله أنا
        else if (sv) { if (!(bb && same(sv, bb))) out.push(sv); } // حذفته أنا ولم يعدّله غيري
      });
      return out;
    }
    return local;
  }

  async function pushContent() {
    let json = JSON.stringify(contentOf());
    if (json === snapContent) return;
    /* المحتوى غير موجود في الخادم بعد، أو الخادم لا يدعم الإصدارات: حفظ مباشر */
    if (baseVersion === null) {
      const { data, error } = await sb.from("site_content").upsert({ id: 1, data: JSON.parse(json), updated_by: profile.id }).select("version").maybeSingle();
      if (error) { console.warn(error); MH.toast("تعذّر حفظ المحتوى في قاعدة البيانات: " + msg(errCode(error)), "warn"); return; }
      snapContent = json; baseVersion = data && typeof data.version === "number" ? data.version : null;
      return;
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data, error } = await sb.from("site_content").update({ data: JSON.parse(json), updated_by: profile.id }).eq("id", 1).eq("version", baseVersion).select("version");
      if (error) { console.warn(error); MH.toast("تعذّر حفظ المحتوى في قاعدة البيانات: " + msg(errCode(error)), "warn"); return; }
      if (data && data.length) { snapContent = json; baseVersion = data[0].version; return; }
      /* حفظ مشرف آخر بعد آخر تحميل: نجلب نسخته وندمج التعديلات ثم نعيد المحاولة */
      const r = await sb.from("site_content").select("data, version").eq("id", 1).maybeSingle();
      if (r.error || !r.data) { MH.toast("تعذّر جلب آخر نسخة من المحتوى؛ أعد تحميل الصفحة", "warn"); return; }
      const merged = merge3(snapContent ? JSON.parse(snapContent) : {}, JSON.parse(json), r.data.data || {});
      const keysNow = answersMap();
      CONTENT_KEYS.forEach((k) => { if (merged[k] !== undefined) state[k] = merged[k]; });
      injectAnswers(keysNow);
      localSave();
      snapContent = JSON.stringify(Object.fromEntries(CONTENT_KEYS.map((k) => [k, r.data.data ? r.data.data[k] : undefined])));
      baseVersion = r.data.version;
      json = JSON.stringify(contentOf());
      MH.toast("حفظ مشرف آخر تعديلات في الوقت نفسه؛ دُمجت تعديلاتكما معًا ✓");
      window.dispatchEvent(new CustomEvent("mh:content-merged"));
      if (json === snapContent) return;
    }
    MH.toast("تعذّر الحفظ بسبب تعديلات متزامنة كثيرة؛ أعد تحميل الصفحة", "warn");
  }

  async function push() {
    if (!sb || !profile) return;
    try {
      if (isContentStaff()) { await pushContent(); await pushKeys(); }
      for (const u of state.users) {
        if (!isUuid(u.id)) continue;
        if (!isStaffNow() && u.id !== profile.id) continue;
        const sig = userSig(u);
        if (snapUsers.get(u.id) === sig) continue;
        const { error } = await sb.from("profiles").update({ name: u.name, email: u.email || null, phone: u.phone || null, data: userData(u) }).eq("id", u.id);
        if (error) { console.warn(error); MH.toast(msg(errCode(error)), "warn"); continue; }
        snapUsers.set(u.id, sig);
      }
      if (isStaffNow() && profile.role === "owner") {
        for (const s of state.staff || []) {
          if (!isUuid(s.id)) continue;
          const sig = staffSig(s);
          if (snapStaff.get(s.id) === sig) continue;
          const { error } = await sb.from("profiles").update({ name: s.name, email: s.email, role: s.role, disabled: !!s.disabled, data: staffData(s) }).eq("id", s.id);
          if (error) { console.warn(error); MH.toast(msg(errCode(error)), "warn"); continue; }
          snapStaff.set(s.id, sig);
        }
      }
    } catch (e) { console.warn("cloud push", e); }
  }

  /* سجل العمليات يُحفظ في الخادم أيضًا */
  const logAction = (text, acc = MH.currentStaff()) => {
    origLog(text, acc);
    if (sb && isStaffNow()) sb.from("audit_log").insert({ who: acc ? acc.name : "زائر", role: acc ? acc.role : "", text }).then(() => {}, () => {});
  };

  /* ---------------- الحسابات ---------------- */
  async function signIn(contact, password, wantStaff) {
    if (!sb) return { error: "offline" };
    const c = String(contact || "").trim();
    const key = MH.isEmail(c) ? c.toLowerCase() : MH.normPhone(c);
    if (!key) return { error: "bad" };
    const { data: email, error } = await sb.rpc("login_email", { p_contact: key });
    if (error) return { error: errCode(error) === "bad" ? "net" : errCode(error) };
    if (!email) return { error: "bad" };
    const r = await sb.auth.signInWithPassword({ email, password });
    if (r.error) return { error: /fetch|network/i.test(r.error.message) ? "net" : "bad" };
    try {
      const p = await loadMe(r.data.user.id);
      if (!p) return { error: "bad" };
      if (wantStaff && p.kind !== "staff") { await signOut(); return { error: "staff_only" }; }
      if (!wantStaff && p.kind !== "student") { await signOut(); return { error: "staff_only_site" }; }
      localSave();
      return { profile: p };
    } catch (e) { return { error: "net" }; }
  }

  async function register({ name, phone, email, password }) {
    if (!sb) return { error: "offline" };
    const { error } = await sb.rpc("register_student", { p_name: name, p_phone: phone, p_email: email, p_password: password });
    if (error) return { error: errCode(error) };
    return signIn(email, password, false);
  }

  /* تسليم الاختبار: التصحيح في الخادم، والنتيجة تُكتب في ملف الطالب */
  async function submitQuiz(cid, answers) {
    if (!sb || !profile) return { error: "offline" };
    const { data, error } = await sb.rpc("submit_quiz", { p_course: cid, p_answers: answers });
    if (error) return { error: errCode(error) };
    const u = state.users.find((x) => x.id === profile.id);
    if (u) { u.results = u.results || {}; u.results[cid] = data; snapUsers.set(u.id, userSig(u)); localSave(); }
    return { data };
  }

  /* ---------------- طلبات الالتحاق بالدورات ---------------- */
  /* طلبات الطالب الحالي: { معرّف الدورة: pending | approved | rejected } */
  async function loadMyRequests() {
    state.myRequests = {};
    if (!sb || !profile || profile.kind !== "student") return;
    const { data, error } = await sb.from("enrollment_requests").select("course_id, status, note").eq("student", profile.id);
    if (error) { console.warn("requests", error); return; }
    (data || []).forEach((r) => (state.myRequests[r.course_id] = r.status));
  }
  async function requestEnrollment(cid) {
    if (!sb || !profile) return { error: "offline" };
    const { data, error } = await sb.rpc("request_enrollment", { p_course: cid });
    if (error) return { error: errCode(error) };
    state.myRequests = state.myRequests || {};
    state.myRequests[cid] = data;
    if (data === "approved") await loadMe(profile.id);
    return { data };
  }
  /* للإدارة: كل الطلبات مع حالتها */
  async function loadRequests() {
    if (!sb || !profile) return { error: "offline" };
    const { data, error } = await sb.from("enrollment_requests").select("*").order("created_at", { ascending: false }).limit(1000);
    if (error) return { error: errCode(error) };
    return { data: data || [] };
  }
  async function decideEnrollment(id, status, note) {
    if (!sb || !profile) return { error: "offline" };
    const { error } = await sb.rpc("decide_enrollment", { p_id: id, p_status: status, p_note: note || null });
    if (error) return { error: errCode(error) };
    /* القبول يضيف الدورة إلى ملف الطالب في الخادم؛ نعيد تحميل الحسابات لتطابقه */
    try { await loadMe(profile.id); } catch (e) { /* */ }
    return { data: true };
  }

  async function signOut() {
    clearTimeout(timer);
    try { await pushing; await push(); } catch (e) { /* */ }
    if (sb) { try { await sb.auth.signOut(); } catch (e) { /* */ } }
    clearAccounts();
    localSave();
  }

  async function rpc(name, args) {
    if (!sb) return { error: "offline" };
    const { data, error } = await sb.rpc(name, args);
    return error ? { error: errCode(error) } : { data };
  }
  const changeMyPassword = (current, next) => rpc("change_my_password", { p_current: current || "", p_new: next });
  const setPassword = (uid, pw, mustChange = true) => rpc("admin_set_password", { p_user: uid, p_password: pw, p_must_change: mustChange });
  async function createStaff(s, password) {
    const r = await rpc("admin_create_staff", { p_name: s.name, p_email: s.email, p_password: password, p_role: s.role, p_data: staffData(s) });
    if (r.error) return r;
    const acc = Object.assign({ id: r.data, disabled: false }, s);
    state.staff.push(acc);
    snapStaff.set(acc.id, staffSig(acc));
    return { data: acc };
  }
  /* إيقاف حساب طالب أو تفعيله (المدير العام فقط؛ يفرضه الخادم) */
  async function setDisabled(uid, value) {
    if (!sb) return { error: "offline" };
    const { error } = await sb.from("profiles").update({ disabled: !!value }).eq("id", uid);
    if (error) return { error: errCode(error) };
    value ? disabledIds.add(uid) : disabledIds.delete(uid);
    return { data: true };
  }

  async function deleteUser(uid) {
    const r = await rpc("admin_delete_user", { p_user: uid });
    if (r.error) return r;
    state.staff = state.staff.filter((x) => x.id !== uid);
    state.users = state.users.filter((x) => x.id !== uid);
    snapStaff.delete(uid); snapUsers.delete(uid);
    localSave();
    return { data: true };
  }

  /* ---------------- الملفات: الصور في التخزين السحابي بدل المتصفح ---------------- */
  const dataUrlToBlob = (u) => {
    const [head, b64] = String(u).split(",");
    const mime = (head.match(/data:([^;]+)/) || [])[1] || "image/jpeg";
    const bin = atob(b64); const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  };
  const newName = (ext) => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(36).slice(2)) + "." + ext;

  /* يرفع صورة (data URL مضغوطة) إلى مجلد media ويعيد رابطها العام؛ وإن تعذّر يعيد الصورة نفسها */
  async function uploadImage(dataUrl, folder = "misc") {
    if (!sb || !isContentStaff() || !/^data:image\//.test(String(dataUrl))) return dataUrl;
    try {
      const path = `${folder}/${newName("jpg")}`;
      const { error } = await sb.storage.from("media").upload(path, dataUrlToBlob(dataUrl), { contentType: "image/jpeg", cacheControl: "31536000" });
      if (error) throw error;
      return sb.storage.from("media").getPublicUrl(path).data.publicUrl;
    } catch (e) {
      console.warn("upload", e);
      MH.toast("تعذّر رفع الصورة إلى الخادم؛ حُفظت داخل المحتوى مؤقتًا", "warn");
      return dataUrl;
    }
  }

  /* ---------------- كتب المكتبة (PDF) في مجلد books: قراءة للجميع، ورفع وحذف للإدارة ---------------- */
  const BOOK_MAX = 50 * 1024 * 1024;
  async function uploadBook(file, onDone) {
    if (!sb || !isContentStaff()) return { error: "offline" };
    if (!file || file.type !== "application/pdf") return { error: "bad_pdf" };
    if (file.size > BOOK_MAX) return { error: "too_big" };
    try {
      const path = `pdf/${newName("pdf")}`;
      const { error } = await sb.storage.from("books").upload(path, file, { contentType: "application/pdf", cacheControl: "31536000" });
      if (error) throw error;
      const url = sb.storage.from("books").getPublicUrl(path).data.publicUrl;
      return { url, path, size: file.size };
    } catch (e) {
      console.warn("book upload", e);
      return { error: errCode(e) };
    }
  }
  async function deleteBook(path) {
    if (!sb || !isContentStaff() || !path) return;
    try { await sb.storage.from("books").remove([path]); } catch (e) { console.warn("book delete", e); }
  }

  /* ---------------- المالية (المدير العام وأمين المال فقط؛ تفرضه RLS) ---------------- */
  const FIN_TABLES = ["fin_donations", "fin_sponsorships", "fin_sponsorship_payments", "fin_expenses", "fin_budget"];
  const fin = {
    async loadAll() {
      if (!sb) return { error: "offline" };
      const res = await Promise.all(FIN_TABLES.map((t) => sb.from(t).select("*").order("created_at", { ascending: false }).limit(5000)));
      const bad = res.find((r) => r.error);
      if (bad) return { error: errCode(bad.error) };
      const [donations, sponsorships, payments, expenses, budget] = res.map((r) => r.data || []);
      return { data: { donations, sponsorships, payments, expenses, budget } };
    },
    async save(table, row, id) {
      if (!sb || !FIN_TABLES.includes(table)) return { error: "offline" };
      const q = id ? sb.from(table).update(row).eq("id", id) : sb.from(table).insert(row);
      const { error } = await q;
      return error ? { error: /unique|23505/i.test(error.message || error.code) ? "dup" : errCode(error) } : { data: true };
    },
    async upsertBudget(row) {
      if (!sb) return { error: "offline" };
      const { error } = await sb.from("fin_budget").upsert(row, { onConflict: "year,kind,category" });
      return error ? { error: errCode(error) } : { data: true };
    },
    async remove(table, id) {
      if (!sb || !FIN_TABLES.includes(table)) return { error: "offline" };
      const { error } = await sb.from(table).delete().eq("id", id);
      return error ? { error: errCode(error) } : { data: true };
    },
    /* إيصال: صورة مضغوطة أو ملف PDF في مجلد خاص لا يراه إلا المخوَّلون */
    async uploadReceipt(file, folder) {
      if (!sb) return { error: "offline" };
      let blob = file, ext = "pdf", type = "application/pdf";
      if (/^image\//.test(file.type)) { blob = dataUrlToBlob(await MH.readImage(file, 1400, 0.8)); ext = "jpg"; type = "image/jpeg"; }
      else if (file.type !== "application/pdf") return { error: "bad_input" };
      const path = `${folder}/${newName(ext)}`;
      const { error } = await sb.storage.from("receipts").upload(path, blob, { contentType: type });
      return error ? { error: errCode(error) } : { data: path };
    },
    async receiptUrl(path) {
      if (!sb) return { error: "offline" };
      const { data, error } = await sb.storage.from("receipts").createSignedUrl(path, 300);
      return error ? { error: errCode(error) } : { data: data.signedUrl };
    },
  };

  /* شاشة انتظار قصيرة حتى يصل المحتوى من الخادم */
  const whenReady = (fn) => {
    const app = document.getElementById("app");
    if (app && !app.innerHTML.trim()) app.innerHTML = '<div class="wrap" style="padding:60px 16px;text-align:center"><p class="muted">جارٍ التحميل…</p></div>';
    ready.then(fn, fn);
  };

  Object.assign(MH, {
    save, logAction,
    allStudents: () => state.users,
    cloud: { enabled: !!sb, studentCount: () => Math.max(studentCount, state.users.length), ready, whenReady, signIn, register, signOut, changeMyPassword, setPassword, createStaff, deleteUser, msg, profile: () => profile, uploadImage, uploadBook, deleteBook, requestEnrollment, loadRequests, decideEnrollment, fin, setDisabled, _merge3: merge3, submitQuiz, online: () => !!(sb && profile), isDisabled: (id) => disabledIds.has(id) },
  });
})();
