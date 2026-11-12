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
  const CONTENT_KEYS = ["series", "courses", "teachers", "announcements", "settings", "catCovers"];

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
  const snapUsers = new Map(); // آخر نسخة متزامنة لكل طالب
  const snapStaff = new Map(); // آخر نسخة متزامنة لكل حساب إداري

  const contentOf = () => { const o = {}; CONTENT_KEYS.forEach((k) => (o[k] = state[k])); return o; };
  const userFromRow = (p) => Object.assign({ enrolled: {}, results: {} }, p.data || {}, {
    id: p.id, name: p.name, email: p.email || "", phone: p.phone || "",
    joined: (p.data && p.data.joined) || String(p.created_at || "").slice(0, 10),
  });
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
    weak_password: "كلمة المرور قصيرة (4 أحرف أو أرقام على الأقل)",
    bad_input: "تحقق من البيانات المدخلة",
    wrong_password: "كلمة المرور الحالية غير صحيحة",
    not_allowed: "ليست لديك صلاحية لهذا الإجراء",
    not_found: "الحساب غير موجود",
    bad: "رقم الهاتف أو البريد أو كلمة المرور غير صحيحة",
    staff_only: "هذا الحساب لا يملك صلاحية الإدارة",
    staff_only_site: "هذا حساب إداري؛ ادخل به من لوحة الإدارة",
    net: "تعذّر الاتصال بالخادم، تحقق من الإنترنت وأعد المحاولة",
    offline: "تعذّر الاتصال بقاعدة البيانات في هذه النسخة؛ استخدم رابط المنصة المنشور",
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
      if (p.role === "owner") {
        const { data: rows } = await sb.from("audit_log").select("at,who,role,text").order("at", { ascending: false }).limit(300);
        state.audit = (rows || []).map((r) => ({ at: r.at, who: r.who, role: r.role, text: r.text }));
      }
    } else {
      state.staff = [];
      state.staffSession = null;
      state.users = [userFromRow(p)];
      state.session = p.id;
    }
    snapshot();
    return p;
  }

  const clearAccounts = () => {
    profile = null;
    state.users = []; state.session = null;
    state.staff = []; state.staffSession = null;
    state.audit = [];
    snapshot();
  };

  /* ---------------- الإقلاع: جلب المحتوى والجلسة ---------------- */
  const ready = (async () => {
    if (!sb) { clearAccounts(); return; }
    try {
      const [c, s, n] = await Promise.all([
        sb.from("site_content").select("data").eq("id", 1).maybeSingle(),
        sb.auth.getSession(),
        sb.rpc("student_count"),
      ]);
      if (n && typeof n.data === "number") studentCount = n.data;
      const row = c && c.data;
      if (row && row.data) CONTENT_KEYS.forEach((k) => { if (row.data[k] !== undefined) state[k] = row.data[k]; });
      clearAccounts();
      const session = s && s.data && s.data.session;
      if (session) { try { await loadMe(session.user.id); } catch (e) { console.warn(e); } }
      snapContent = row && row.data ? JSON.stringify(contentOf()) : null;
      /* أول دخول إداري: يُرفع المحتوى الموجود في هذا المتصفح ليصبح هو المحتوى الرسمي */
      if (!row && isStaffNow()) await pushContent();
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

  async function pushContent() {
    const json = JSON.stringify(contentOf());
    if (json === snapContent) return;
    const { error } = await sb.from("site_content").upsert({ id: 1, data: JSON.parse(json), updated_at: new Date().toISOString(), updated_by: profile.id });
    if (error) { console.warn(error); MH.toast("تعذّر حفظ المحتوى في قاعدة البيانات: " + msg(errCode(error)), "warn"); return; }
    snapContent = json;
  }

  async function push() {
    if (!sb || !profile) return;
    try {
      if (isStaffNow()) await pushContent();
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
  async function deleteUser(uid) {
    const r = await rpc("admin_delete_user", { p_user: uid });
    if (r.error) return r;
    state.staff = state.staff.filter((x) => x.id !== uid);
    state.users = state.users.filter((x) => x.id !== uid);
    snapStaff.delete(uid); snapUsers.delete(uid);
    localSave();
    return { data: true };
  }

  /* شاشة انتظار قصيرة حتى يصل المحتوى من الخادم */
  const whenReady = (fn) => {
    const app = document.getElementById("app");
    if (app && !app.innerHTML.trim()) app.innerHTML = '<div class="wrap" style="padding:60px 16px;text-align:center"><p class="muted">جارٍ التحميل…</p></div>';
    ready.then(fn, fn);
  };

  Object.assign(MH, {
    save, logAction,
    allStudents: () => state.users,
    cloud: { enabled: !!sb, studentCount: () => Math.max(studentCount, state.users.length), ready, whenReady, signIn, register, signOut, changeMyPassword, setPassword, createStaff, deleteUser, msg, profile: () => profile },
  });
})();
