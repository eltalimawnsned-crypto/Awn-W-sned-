/* =========================================================
   لوحة إدارة معهد المحجة البيضاء — admin/
   مساحة مستقلة عن الموقع العام. كل صفحة وكل عملية تتحقق أولًا من:
   1) وجود جلسة إدارية صالحة (غير منتهية) لحساب مفعّل،
   2) صلاحية الحساب للإجراء المطلوب عبر MH.can().
   حسابات الطلاب لا تستطيع الدخول هنا مطلقًا.
   ========================================================= */
(function () {
  "use strict";
  const {
    state, save, $, $$, esc, uid, today, fmtDate, arNum, toast, confirmTap,
    ytId, course, teacher, seriesName, allStudents, progressOf, passed,
    seriesOf, catOf, pad2, verseCount, versesWord, lessonName, hasNotes, playlistsOf, lessonsIn, readImage,
    ROLES, PERMS, SESSION_HOURS, MAX_FAILS, LOCK_MINUTES, hashPassword, verifyPassword,
    currentStaff, can, scopedCourses, logAction, contactOf, ic,
    CAT_ICON, catCover, seriesCover, courseCover, coverImg,
  } = MH;
  const catIc = (id) => ic(CAT_ICON[id] || "book");

  const TABS = [
    ["overview", "نظرة عامة", "chart", "overview:view"],
    ["home", "الصفحة الرئيسية", "grid", "content:structure"],
    ["requests", "طلبات الالتحاق", "userPlus", "requests:manage"],
    ["library", "المكتبة العلمية (الكتب)", "library", "library:manage"],
    ["topics", "الأقسام العلمية", "sparkles", "content:structure"],
    ["content", "المحتوى العلمي", "file", "library:manage"],
    ["courses", "السلاسل والمتون وقوائم التشغيل", "layers", "content:structure"],
    ["lessons", "الحلقات والدروس", "play", "content:lessons"],
    ["programs", "الدورات المتاحة", "award", "programs:manage"],
    ["people", "الطلاب والمعلمون", "users", "people:view"],
    ["results", "الاختبارات والنتائج", "quiz", "results:view"],
    ["certs", "الشهادات", "check", "results:view"],
    ["plan", "المخطط السنوي", "clock", "content:structure"],
    ["ann", "الإعلانات", "sparkles", "ann:manage"],
    ["finance", "المالية", "coins", "finance:manage"],
    ["staff", "الحسابات والصلاحيات", "user", "staff:manage"],
    ["audit", "سجل العمليات", "file", "audit:view"],
  ];


  /* حارس كل عملية: جلسة صالحة + صلاحية فعلية، وإلا تُرفض العملية وتُسجّل */
  function guard(action, ctx, what) {
    const acc = currentStaff();
    if (!acc) { MH.cloud.signOut().then(() => { toast("انتهت الجلسة أو أُوقف الحساب، سجّل الدخول من جديد", "warn"); route(); }); return false; }
    if (!can(action, ctx, acc)) {
      logAction("رُفضت محاولة غير مصرّح بها: " + what, acc); save();
      toast("ليست لديك صلاحية لهذا الإجراء", "warn");
      return false;
    }
    return true;
  }
  const done = (msg, logText) => { logAction(logText || msg); save(); toast(msg); };

  /* ---------------- الدخول ---------------- */
  function viewLogin() {
    return `
    <section class="adm-login">
      <form class="auth form" id="staffLogin" autocomplete="on">
        <div class="adm-login-head">
          <img src="../assets/logo-mahajja.png" alt="" width="64" height="64">
          <h1>دخول إدارة المعهد</h1>
          <p class="muted">هذه المساحة مخصصة لفريق المعهد فقط:</p>
          <div class="role-legend">
            <span class="tag role-tag role-owner">المدير العام</span><span class="tag role-tag role-supervisor">المشرف</span><span class="tag role-tag role-teacher">المعلم</span><span class="tag role-tag role-treasurer">أمين المال</span>
          </div>
          <p class="muted small">أما <span class="tag role-tag role-student">الطالب</span> فيدخل من «فضاء الطلاب» في <a href="../#/student">الموقع العام</a>.</p>
        </div>
        ${MH.storageOK ? "" : `<div class="storage-warn-box" role="alert">⚠️ متصفحك لا يحفظ بيانات هذا الموقع (تصفح خاص أو حظر ملفات تعريف الارتباط)، فلن يبقى دخولك إلى الإدارة. افتح الرابط في نافذة عادية.</div>`}
        <label>البريد الإلكتروني<input type="email" name="email" required autocomplete="username" dir="ltr"></label>
        <label>كلمة المرور<input type="password" name="password" required autocomplete="current-password" dir="ltr"></label>
        <button class="btn block">دخول</button>
        <p class="note">الحسابات الإدارية يُنشئها المدير العام من صفحة «الحسابات والصلاحيات». نسيت كلمة المرور؟ تواصل مع المدير العام.</p>
        <a class="link center-text" href="../">← العودة إلى الموقع</a>
      </form>
    </section>`;
  }

  const viewForbidden = (label) => `
      <div class="empty forbidden"><span>⛔</span><h2>غير مصرّح</h2>
      <p>حسابك لا يملك صلاحية الوصول إلى «${esc(label)}». تواصل مع المدير العام إن كنت تحتاجها.</p>
      <a class="btn" href="#/overview">العودة إلى النظرة العامة</a></div>`;

  /* ---------------- دليل الأدوار (للتمييز بين الحسابات) ---------------- */
  const ROLE_GUIDE = [
    ["owner", "لوحة الإدارة (admin/) بالبريد", "كل الأقسام: المحتوى، والطلاب، والنتائج، والإعلانات، والمالية، والحسابات والصلاحيات، وسجل العمليات."],
    ["supervisor", "لوحة الإدارة (admin/) بالبريد", "ما يمنحه له المدير العام فقط من: المحتوى، والطلاب والمعلمين، والنتائج، والإعلانات."],
    ["teacher", "لوحة الإدارة (admin/) بالبريد", "دروس المواد التي يدرّسها فقط (مثل القرآن وعلومه، أو السيرة والحديث والفقه)، و«طلابي» ونتائجهم."],
    ["treasurer", "لوحة الإدارة (admin/) بالبريد", "المالية فقط: التبرعات، والكفالات ودفعاتها، والمصروفات، والميزانية والتقارير. لا يرى المحتوى ولا بيانات الطلاب."],
    ["student", "الموقع العام: «فضاء الطلاب» بالرقم أو البريد", "المكتبة والدورات ودروسه واختباراته وشهاداته وحسابه، ولا يدخل لوحة الإدارة."],
  ];
  const rolesGuide = (current) => `
      <div class="box mt roles-guide">
        <h3>دليل الأدوار</h3>
        <p class="muted small">كل حساب في المنصة له دور واحد، يظهر بلونه بجانب اسمه.</p>
        <div class="table-wrap"><table>
          <thead><tr><th>الدور</th><th>من أين يدخل</th><th>ما يراه ويديره</th></tr></thead>
          <tbody>${ROLE_GUIDE.map(([k, where, what]) => `<tr class="${k === current ? "is-me" : ""}">
            <td class="nowrap"><span class="tag role-tag role-${k}">${ROLES[k].label}</span>${k === current ? ` <small class="muted">(أنت)</small>` : ""}</td>
            <td class="small">${esc(where)}</td><td class="small">${esc(what)}</td></tr>`).join("")}</tbody>
        </table></div>
      </div>`;

  const subjectsText = (s) => {
    const names = (s.subjects || []).map((k) => (MH.topicsAll().find((c) => c.id === k) || {}).name).filter(Boolean);
    return names.length ? "مواده: " + names.map(esc).join("، ") : `دورات: ${esc((teacher(s.teacherId) || {}).name || "—")}`;
  };

  /* ---------------- النظرة العامة + حسابي ---------------- */
  function admOverview() {
    const acc = currentStaff();
    const cs = scopedCourses(acc);
    const st = allStudents().filter((u) => acc.role !== "teacher" || cs.some((c) => u.enrolled[c.id]));
    const enrolls = st.reduce((s, u) => s + Object.keys(u.enrolled).filter((cid) => cs.some((c) => c.id === cid)).length, 0);
    const res = st.flatMap((u) => cs.map((c) => u.results[c.id]).filter(Boolean));
    const passRate = res.length ? Math.round((res.filter(passed).length / res.length) * 100) : 0;
    const perCourse = cs.map((c) => ({ c, n: st.filter((u) => u.enrolled[c.id]).length }));
    const max = Math.max(1, ...perCourse.map((x) => x.n));
    const allowed = TABS.filter(([, , , a]) => can(a)).map(([, t]) => t);
    if (acc.role === "treasurer") return `
      <h1 class="adm-title">مرحبًا، ${esc(acc.name)}</h1>
      <p class="muted">دورك: <b>${ROLES[acc.role].label}</b> — ${esc(ROLES[acc.role].desc)}</p>
      <a class="btn mt" href="#/finance">${ic("coins")} فتح المالية</a>
      ${rolesGuide(acc.role)}
      ${selfPwdForm()}`;
    return `
      <h1 class="adm-title">مرحبًا، ${esc(acc.name)}</h1>
      <p class="muted">دورك: <b>${ROLES[acc.role].label}</b> — ${esc(ROLES[acc.role].desc)}${acc.role === "teacher" ? " تظهر لك بيانات موادك فقط." : ""}</p>
      ${acc.role === "teacher" ? `<div class="my-subjects">${(acc.subjects || []).map((k) => { const c = MH.topicsAll().find((x) => x.id === k); return c ? `<span class="chip">${catIc(c.id)} ${esc(c.name)}</span>` : ""; }).join("") || `<span class="muted small">لم تُحدَّد لك مواد بعد؛ تواصل مع المدير العام.</span>`}</div>` : ""}
      <div class="stats small">
        <div><b>${arNum(st.length)}</b><span>${acc.role === "teacher" ? "طلابي" : "الطلاب"}</span></div>
        <div><b>${arNum(cs.length)}</b><span>${acc.role === "teacher" ? "دوراتي" : "قوائم التشغيل"}</span></div>
        <div><b>${arNum(enrolls)}</b><span>التسجيلات</span></div>
        <div><b>${arNum(passRate)}٪</b><span>نسبة النجاح</span></div>
      </div>
      <div class="grid two mt">
        <div class="box">
          <h3>التسجيل حسب الدورة</h3>
          <ul class="hbars">${perCourse.map(({ c, n }) => `<li><span>${esc(c.title)}</span><div class="bar"><span style="width:${(n / max) * 100}%"></span></div><b>${arNum(n)}</b></li>`).join("") || `<li class="muted">لا توجد دورات.</li>`}</ul>
        </div>
        <div class="box">
          <h3>صلاحياتك <span class="tag role-tag role-${acc.role}">${ROLES[acc.role].label}</span></h3>
          <ul class="perm-list">${allowed.map((t) => `<li>✓ ${esc(t)}</li>`).join("")}</ul>
        </div>
      </div>
      ${rolesGuide(acc.role)}
      ${selfPwdForm()}`;
  }
  const selfPwdForm = () => `
      <form class="box form mt narrow-form" id="selfPwd">
        <h3>حسابي: تغيير كلمة المرور</h3>
        <label>كلمة المرور الحالية<input type="password" name="current" required autocomplete="current-password" dir="ltr"></label>
        <div class="row">
          <label>كلمة المرور الجديدة<input type="password" name="next" required minlength="8" autocomplete="new-password" dir="ltr"></label>
          <label>تأكيدها<input type="password" name="confirm" required minlength="8" autocomplete="new-password" dir="ltr"></label>
        </div>
        <button class="btn">تغيير كلمة المرور</button>
      </form>`;

  /* ---- كشف التكرار: مقارنة الأسماء بعد توحيد الكتابة العربية ---- */
  const norm = (t) => String(t || "").replace(/[ً-ٰٟـ]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim().toLowerCase();
  function findDuplicates() {
    const out = { series: [], courses: [], lessons: [] };
    const seen = {};
    state.series.forEach((s) => { const k = norm(s.name); if (seen[k]) out.series.push([seen[k], s]); else seen[k] = s; });
    const seenC = {};
    state.courses.forEach((c) => { const k = c.series + "|" + norm(c.title); if (seenC[k]) out.courses.push([seenC[k], c]); else seenC[k] = c; });
    state.courses.forEach((c) => {
      const byNum = {}, byTopic = {};
      c.lessons.forEach((l) => {
        if (byNum[l.num]) out.lessons.push({ c, a: byNum[l.num], b: l, why: "الرقم نفسه" }); else byNum[l.num] = l;
        const k = norm(l.topic); if (!k) return;
        if (byTopic[k] && byTopic[k] !== byNum[l.num]) out.lessons.push({ c, a: byTopic[k], b: l, why: "الموضوع نفسه" }); else if (!byTopic[k]) byTopic[k] = l;
      });
    });
    return out;
  }
  function dupBox() {
    const d = findDuplicates();
    const n = d.series.length + d.courses.length + d.lessons.length;
    if (!n) return `<p class="dup-ok">✓ لا يوجد تكرار في السلاسل ولا قوائم التشغيل ولا الدروس.</p>`;
    return `
      <div class="box dup-box">
        <h3>⚠️ عناصر مكررة (${arNum(n)})</h3>
        <p class="muted small">الدمج ينقل محتوى المكرر إلى الأصل ثم يحذف المكرر، ولا يُفقد أي درس.</p>
        <ul class="simple">
          ${d.series.map(([a, b]) => `<li><span>سلسلة «<b>${esc(b.name)}</b>» مكررة (${arNum(playlistsOf(a.id).length)} و${arNum(playlistsOf(b.id).length)} قوائم)</span><button class="btn sm" data-merge-series="${a.id}|${b.id}">دمجهما</button></li>`).join("")}
          ${d.courses.map(([a, b]) => `<li><span>قائمة «<b>${esc(b.title)}</b>» مكررة في ${esc(seriesName(a.series))} (${arNum(a.lessons.length)} و${arNum(b.lessons.length)} دروس)</span><button class="btn sm" data-merge-course="${a.id}|${b.id}">دمجهما</button></li>`).join("")}
          ${d.lessons.map((x) => `<li><span>في «${esc(x.c.title)}»: الدرس ${arNum(x.a.num)} «${esc(x.a.topic)}» والدرس ${arNum(x.b.num)} «${esc(x.b.topic)}» — ${x.why}</span><a class="btn sm ghost" href="#/lessons?c=${x.c.id}&edit=${x.b.id}">مراجعة</a></li>`).join("")}
        </ul>
      </div>`;
  }

  /* أزرار صورة الغلاف المصغّرة داخل الشجرة */
  const coverMini = (key, src, custom) => `
    <span class="cover-mini">${coverImg(src, "cover-thumb")}
      <span class="cover-mini-acts">
        <label class="link small" title="تغيير الصورة">${ic("refresh")}<input type="file" accept="image/*" hidden data-cover-file="${key}"></label>
        ${custom ? `<button type="button" class="link danger small" data-cover-reset="${key}" title="إزالة الصورة الخاصة">✕</button>` : ""}
      </span>
    </span>`;

  function admCourses() {
    const cats = MH.topicsAll().filter((c) => state.series.some((s) => s.cat === c.id));
    const qp = new URLSearchParams((location.hash.split("?")[1]) || "");
    const eS = seriesOf(qp.get("editS")), eC = course(qp.get("editC"));
    const S0 = eS || { name: "", cat: MH.topicsAll()[0].id, matn: "", author: "", desc: "", nazm: false };
    const C0 = eC || { title: "", desc: "", series: (state.series[0] || {}).id, teacher: (state.teachers[0] || {}).id, level: "مبتدئ", color: "#4a4486" };
    return `
      <h1 class="adm-title">السلاسل وقوائم التشغيل</h1>
      <p class="muted small">القسم ← السلسلة ← قائمة التشغيل ← الدروس · ${arNum(state.series.length)} سلاسل · ${arNum(state.courses.length)} قوائم · ${arNum(state.courses.reduce((n, c) => n + c.lessons.length, 0))} درسًا</p>
      ${dupBox()}
      <div class="add-row">
        <details class="box add-box" id="seriesBox" ${eS ? "open" : ""}>
          <summary>${eS ? `✎ تعديل السلسلة «${esc(eS.name)}»` : "➕ سلسلة جديدة"}</summary>
          <form class="form" id="addSeries" data-edit="${eS ? eS.id : ""}">
            <label>اسم السلسلة<input name="name" required placeholder="شرح مختصر الأخضري" value="${esc(S0.name)}"></label>
            <label>القسم العلمي<select name="cat" data-cat-select>${MH.topicsAll().map((c) => `<option value="${c.id}" ${S0.cat === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
            ${subSelect(MH.topicsAll(), S0.cat, S0.sub)}
            <div class="row">
              <label>المتن<input name="matn" placeholder="اسم المتن أو المنظومة" value="${esc(S0.matn || "")}"></label>
              <label>المؤلف<input name="author" value="${esc(S0.author || "")}"></label>
            </div>
            <label>الوصف (اختياري)<textarea name="desc" rows="2">${esc(S0.desc || "")}</textarea></label>
            <label class="check"><input type="checkbox" name="nazm" ${S0.nazm ? "checked" : ""}> المتن منظوم (تظهر حقول الأبيات في دروسه)</label>
            <div class="actions"><button class="btn">${eS ? "حفظ التعديل" : "إضافة السلسلة"}</button>${eS ? `<a class="btn ghost" href="#/courses">إلغاء</a>` : ""}</div>
          </form>
        </details>
        <details class="box add-box" id="courseBox" ${eC ? "open" : ""}>
          <summary>${eC ? `✎ تعديل القائمة «${esc(eC.title)}»` : "➕ قائمة تشغيل جديدة"}</summary>
          <form class="form" id="addCourse" data-edit="${eC ? eC.id : ""}">
            <label>العنوان<input name="title" required placeholder="كتاب الطهارة" value="${esc(C0.title)}"></label>
            <label>الوصف<textarea name="desc" rows="2" required>${esc(C0.desc || "")}</textarea></label>
            <div class="row">
              <label>السلسلة<select name="series">${state.series.map((s) => `<option value="${s.id}" ${C0.series === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></label>
              <label>المعلم<select name="teacher">${state.teachers.map((t) => `<option value="${t.id}" ${C0.teacher === t.id ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select></label>
            </div>
            <div class="row">
              <label>المستوى<select name="level">${["مبتدئ", "متوسط", "متقدم", "عام"].map((x) => `<option ${C0.level === x ? "selected" : ""}>${x}</option>`).join("")}</select></label>
              <label>اللون<input type="color" name="color" value="${esc(C0.color || "#4a4486")}"></label>
            </div>
            <div class="actions"><button class="btn">${eC ? "حفظ التعديل" : "إضافة قائمة التشغيل"}</button>${eC ? `<a class="btn ghost" href="#/courses">إلغاء</a>` : ""}</div>
          </form>
        </details>
      </div>

      ${cats.map((cat) => `
        <section class="tree-cat">
          <h2 class="tree-cat-h">${catIc(cat.id)} ${esc(cat.name)}</h2>
          ${state.series.filter((s) => s.cat === cat.id).map((s) => { const pl = playlistsOf(s.id); return `
            <div class="box tree-series">
              <div class="tree-head">
                ${coverMini("series:" + s.id, seriesCover(s), !!s.cover)}
                <div class="tree-title"><b>${esc(s.name)}</b>
                  <small class="muted">${s.matn ? esc(s.matn) + " · " : ""}${s.nazm ? "منظومة" : "منثور"} · ${arNum(pl.length)} قوائم · ${arNum(lessonsIn(s.id))} درسًا</small></div>
                <span class="nowrap small"><a class="link" href="#/courses?editS=${s.id}">تعديل</a> · <a class="link" href="../#/series/${s.id}" target="_blank" rel="noopener">عرض</a> · <button class="link danger" data-del-series="${s.id}">حذف</button></span>
              </div>
              ${pl.length ? `<ul class="tree-list">${pl.map((c, pi) => `
                <li>
                  ${coverMini("course:" + c.id, courseCover(c), !!c.cover)}
                  <span class="tree-title"><b>${esc(c.title)}</b><small class="muted">${esc((teacher(c.teacher) || {}).name || "—")} · ${arNum(c.lessons.length)} دروس</small></span>
                  <span class="nowrap small">${pi > 0 ? `<button class="link" data-move-course="${c.id}|-1" title="تقديم">▲</button>` : ""}${pi < pl.length - 1 ? `<button class="link" data-move-course="${c.id}|1" title="تأخير">▼</button>` : ""} <a class="link" href="#/lessons?c=${c.id}">الحلقات</a> · <a class="link" href="#/courses?editC=${c.id}">تعديل</a> · <button class="link danger" data-del-course="${c.id}">حذف</button></span>
                </li>`).join("")}</ul>` : `<p class="muted small">لا توجد قوائم تشغيل في هذه السلسلة بعد.</p>`}
            </div>`; }).join("")}
        </section>`).join("") || `<div class="empty">لا توجد سلاسل بعد. أضف أول سلسلة من الأعلى.</div>`}

`;
  }

  /* ---------------- صور الأغلفة ---------------- */
  const coverTile = (key, name, sub, src, custom, resetLabel) => `
    <div class="cover-tile">
      <div class="cover-prev">${coverImg(src)}<span><small>${esc(sub)}</small>${esc(name)}</span></div>
      <div class="cover-acts">
        <label class="btn sm">${ic("refresh")}تغيير الصورة<input type="file" accept="image/*" hidden data-cover-file="${key}"></label>
        <button type="button" class="btn sm ghost" data-cover-url="${key}">رابط صورة</button>
        ${custom ? `<button type="button" class="link danger small" data-cover-reset="${key}">${resetLabel}</button>` : `<span class="muted small">${key.startsWith("cat:") ? "الصورة الافتراضية" : "تَرِث صورة " + (key.startsWith("series:") ? "القسم" : "السلسلة")}</span>`}
      </div>
    </div>`;
  /* حفظ صورة غلاف (أو إزالتها) مع التراجع إن امتلأت مساحة المتصفح */
  function setCover(key, val) {
    if (!guard("content:structure", {}, "تغيير صورة غلاف")) return;
    const [kind, id] = key.split(":");
    let obj, name, prop = "cover";
    if (kind === "cat") { obj = state.catCovers; prop = id; name = catOf(id).name; }
    else if (kind === "prog") { obj = MH.programRaw(id); name = obj && obj.title; }
    else if (kind === "home") { state.settings.home = state.settings.home || {}; obj = state.settings.home; prop = id; name = "الصفحة الرئيسية"; }
    else if (kind === "series") { obj = seriesOf(id); name = obj && obj.name; }
    else { obj = course(id); name = obj && obj.title; }
    if (!obj) return;
    const prev = obj[prop];
    if (val) obj[prop] = val; else delete obj[prop];
    if (!save()) {
      if (prev === undefined) delete obj[prop]; else obj[prop] = prev;
      toast("مساحة الحفظ في المتصفح لا تتسع لهذه الصورة؛ جرّب صورة أصغر أو ضع رابطًا لها", "warn");
      return;
    }
    done(val ? "تم تحديث صورة الغلاف" : "تمت إزالة الصورة الخاصة", (val ? "تغيير" : "إزالة") + " صورة غلاف: " + name);
    route();
  }

  function admLessons() {
    const params = new URLSearchParams((location.hash.split("?")[1]) || "");
    const mine = state.courses.filter((x) => can("content:lessons", { courseId: x.id }));
    const c = mine.find((x) => x.id === params.get("c")) || mine[0];
    if (!c) return `<h1 class="adm-title">الدروس</h1><div class="empty">لا توجد قوائم تشغيل مسندة إليك بعد.</div>`;
    const s = seriesOf(c.series) || {};
    const editing = c.lessons.find((l) => l.id === params.get("edit"));
    const nextNum = c.lessons.reduce((m, l) => Math.max(m, l.num || 0), 0) + 1;
    const L0 = editing || { num: nextNum, title: lessonTitle(nextNum), topic: "", duration: "", video: "", image: "", summary: "", verses: null, notes: emptyNotes() };
    const showVerses = editing ? !!verseCount(L0.verses) : !!s.nazm;
    const lines = (k) => (L0.notes[k] || []).map((x) => (k === "definitions" ? `${x.term}: ${x.def}` : x)).join("\n");
    /* الفوائد والتنبيهات حقل واحد؛ تُدمج التنبيهات القديمة فيه عند التعديل */
    const fawaidTxt = [lines("fawaid"), lines("tanbihat")].filter(Boolean).join("\n");
    const extrasOpen = ["definitions", "masail", "refs"].some((k) => (L0.notes[k] || []).length);
    return `
      <h1 class="adm-title">الدروس وبطاقات البيانات</h1>
      <label class="inline">قائمة التشغيل:
        <select id="lessonCourse">${mine.map((x) => `<option value="${x.id}" ${x.id === c.id ? "selected" : ""}>${esc(seriesName(x.series))} ← ${esc(x.title)}</option>`).join("")}</select>
      </label>
      <div class="box mt">
        <h3>دروس «${esc(c.title)}» ${s.nazm ? `<span class="tag">منظومة</span>` : ""}</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>الرقم</th><th>الدرس</th><th>الأبيات</th><th>المدة</th><th>فيديو</th><th>صورة</th><th>فوائد</th><th></th></tr></thead>
          <tbody>${c.lessons.map((l, i) => `<tr class="${editing && editing.id === l.id ? "editing" : ""}">
            <td><span class="num-pill">${pad2(l.num)}</span></td>
            <td><b>${esc(l.topic)}</b><br><small class="muted">${esc(l.title)}</small></td>
            <td class="nowrap">${verseCount(l.verses) ? `${arNum(l.verses.from)} إلى ${arNum(l.verses.to)}` : "—"}</td>
            <td class="nowrap">${esc(l.duration || "—")}</td>
            <td>${ytId(l.video) ? "🎬" : "—"}</td><td>${l.image ? "🖼️" : "—"}</td><td>${hasNotes(l) ? "✓" : "—"}</td>
            <td class="nowrap"><span class="order-btns">${i > 0 ? `<button class="link" data-move-lesson="${c.id}|${i}|-1" title="تقديم">▲</button>` : ""}${i < c.lessons.length - 1 ? `<button class="link" data-move-lesson="${c.id}|${i}|1" title="تأخير">▼</button>` : ""}</span> <a class="link" href="#/lessons?c=${c.id}&edit=${l.id}">تعديل</a> · <a class="link" href="../#/lesson/${c.id}/${l.id}" target="_blank" rel="noopener">عرض</a> · <button class="link danger" data-del-lesson="${c.id}|${l.id}">حذف</button></td></tr>`).join("") || `<tr><td colspan="8" class="muted">لا توجد دروس.</td></tr>`}</tbody>
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

        <div class="row">
          <label>رابط الفيديو (يوتيوب)<input name="video" value="${esc(L0.video)}" placeholder="https://www.youtube.com/watch?v=..." dir="ltr"></label>
          <label>أو رابط التسجيل الصوتي (mp3، اختياري)<input name="audio" value="${esc(L0.audio || "")}" placeholder="https://.../lesson.mp3" dir="ltr"></label>
        </div>

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

        <label>💡 الفوائد والتنبيهات <small class="muted">(اختياري — كل سطر فائدة مستقلة)</small><textarea name="fawaid" rows="3">${esc(fawaidTxt)}</textarea></label>

        <details class="notes-extra" ${extrasOpen ? "open" : ""}>
          <summary>➕ إضافات علمية (اختياري): التعريفات، المسائل الفقهية، المراجع</summary>
          <fieldset class="notes-box">
            <label>📖 التعريفات المهمة <small class="muted">(المصطلح: التعريف — كل سطر تعريف)</small><textarea name="definitions" rows="3" placeholder="الطهارة لغة: النظافة">${esc(lines("definitions"))}</textarea></label>
            <label>⚖️ المسائل الفقهية<textarea name="masail" rows="3">${esc(lines("masail"))}</textarea></label>
            <label>📚 المراجع العلمية<textarea name="refs" rows="2">${esc(lines("refs"))}</textarea></label>
          </fieldset>
        </details>
        <p class="note">ⓘ لا يظهر للطالب إلا ما مُلئ من هذه الأقسام.</p>

        <div class="actions">
          <button class="btn">${editing ? "حفظ التعديلات" : "إضافة الدرس"}</button>
          ${editing ? `<a class="btn ghost" href="#/lessons?c=${c.id}">إلغاء التعديل</a>` : ""}
        </div>
        <p class="note">ⓘ الصور تُضغط تلقائيًا وتُحفظ في خادم المنصة، فيراها الجميع من أي جهاز.</p>
      </form>
      ${(() => { const pg = MH.programsWithPlaylist(c.id);
        return `<div class="box mt"><h3>${ic("quiz")} الاختبار والشهادة</h3><p class="muted small">الاختبارات والشهادات في «الدورات المتاحة»، لا في قوائم التشغيل.${pg.length ? ` هذه القائمة وحدة في: ${pg.map((x) => `<a class="link" href="#/programs?p=${esc(x.id)}">${esc(x.title)}</a>`).join("، ")}.` : ` لا ترتبط هذه القائمة بأي دورة بعد؛ يمكنك <a class="link" href="#/programs">إنشاء دورة</a> وربطها بها.`}</p></div>`; })()}`;
  }


  /* ---------------- المكتبة العلمية ---------------- */
  /* المكتبة للكتب فقط؛ وكل محتوى الأقسام (مرئي، صوتي، مقال، ملف تعليمي) يُدار من «المحتوى العلمي» ويظهر في فضاء الطلاب */
  const CONTENT_TYPES = { video: "درس مرئي (يوتيوب)", audio: "تسجيل صوتي / تلاوة (mp3)", text: "مقال أو مادة مكتوبة", file: "ملف تعليمي (PDF أو رابط)" };
  const isAVi = (i) => i.type !== "book";
  /* قائمة «الباب» (التصنيف الفرعي) مجمّعة حسب القسم؛ تظهر أبواب القسم المختار فقط */
  const subSelect = (cats, cat, sub) => {
    const withSubs = cats.filter((c) => MH.subsOf(c.id).length);
    return `<label data-sub-box ${MH.subsOf(cat).length ? "" : "hidden"}>الباب داخل القسم<select name="sub" data-sub-select>
      <option value="">— عام في القسم —</option>
      ${withSubs.map((c) => `<optgroup label="${esc(c.name)}" data-sub-cat="${esc(c.id)}" ${c.id === cat ? "" : "hidden disabled"}>${MH.subsOf(c.id).map((x) => `<option value="${esc(x.id)}" ${c.id === cat && sub === x.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</optgroup>`).join("")}
    </select></label>`;
  };
  const admContent = () => admLibrary("content");
  function admLibrary(mode) {
    const isLib = mode !== "content";
    const tab = isLib ? "library" : "content";
    const qp = new URLSearchParams((location.hash.split("?")[1]) || "");
    const cats = (isLib ? [...MH.topicsAll(), MH.GENERAL_CAT] : MH.topicsAll()).filter((c) => can("library:manage", { cat: c.id }));
    const fcat = cats.some((c) => c.id === qp.get("cat")) ? qp.get("cat") : "all";
    const mine = (i) => (isLib ? i.type === "book" : i.type !== "book");
    const ed = state.library.find((i) => i.id === qp.get("edit") && mine(i) && can("library:manage", { cat: i.cat }));
    const I0 = ed || { cat: fcat !== "all" ? fcat : (cats[0] || {}).id, type: isLib ? "book" : "video", title: "", author: "", duration: "", level: "", desc: "", video: "", src: "", content: "", file: "", points: [] };
    const items = state.library.filter((i) => mine(i) && cats.some((c) => c.id === i.cat) && (fcat === "all" || i.cat === fcat));
    const typeOf = { video: "▶", audio: "♪", text: "☰", book: "📕", file: "📄" };
    const qs = (extra) => "#/" + tab + "?" + [fcat !== "all" ? "cat=" + fcat : "", extra].filter(Boolean).join("&");
    const row = (i) => `<li class="${ed && ed.id === i.id ? "editing" : ""}">
          <span><span class="lib-ty">${typeOf[i.type] || "•"}</span> <b>${esc(i.title)}</b><br><small class="muted">${esc(catOf(i.cat).name)}${i.sub && MH.subName(i.cat, i.sub) ? " ‹ " + esc(MH.subName(i.cat, i.sub)) : ""} · ${esc(i.author)}${i.type === "book" || i.type === "file" ? (i.file ? (i.size ? " · " + MH.fmtSize(i.size) : "") : ` · <span class="neg">بلا ملف</span>`) : i.duration ? " · " + esc(i.duration) : ""}${i.type === "video" && !ytId(i.video) ? ` · <span class="neg">بلا رابط فيديو</span>` : ""}</small></span>
          <span class="nowrap small"><a class="link" href="${qs("edit=" + i.id)}">تعديل</a> · <a class="link" href="../#/${isAVi(i) ? "space" : "library"}/item/${i.id}" target="_blank" rel="noopener">عرض</a> · <button class="link danger" data-del-lib="${i.id}">حذف</button></span>
        </li>`;
    const show = (...t) => (t.includes(I0.type) ? "" : "hidden");
    const byType = (t) => items.filter((i) => i.type === t);
    const listBox = (title, list, empty) => `<div class="box mt"><h3>${title} <small class="muted">(${arNum(list.length)})</small></h3><ul class="simple lib-admin">${list.map(row).join("") || `<li class="muted">${empty}</li>`}</ul></div>`;
    return `
      <h1 class="adm-title">${isLib ? "المكتبة العلمية (الكتب)" : "المحتوى العلمي للأقسام"}</h1>
      <p class="muted small">${isLib
        ? `المكتبة للكتب فقط (ملفات PDF)، يفتحها الزوار وينزّلونها مجانًا دون تسجيل. الدروس والمقالات والملفات التعليمية تُضاف من «المحتوى العلمي». · ${arNum(state.library.filter((i) => i.type === "book").length)} كتابًا`
        : `دروس مرئية وصوتية، ومقالات، وملفات تعليمية تظهر في فضاء الطلاب داخل قسمها وبابها. السلاسل وقوائم التشغيل تُضاف من «السلاسل والمتون وقوائم التشغيل». · ${arNum(state.library.filter((i) => i.type !== "book").length)} مادة`}</p>
      <details class="box add-box" ${ed ? "open" : ""}>
        <summary>${ed ? `✎ تعديل «${esc(ed.title)}»` : isLib ? "➕ كتاب جديد" : "➕ مادة جديدة"}</summary>
        <form class="form" id="libForm" data-edit="${ed ? ed.id : ""}" data-mode="${tab}">
          <div class="row">
            <label>القسم<select name="cat" data-cat-select>${cats.map((c) => `<option value="${c.id}" ${I0.cat === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
            ${isLib ? `<input type="hidden" name="type" value="book">` : `<label>النوع<select name="type" id="libType">${Object.entries(CONTENT_TYPES).map(([k, t]) => `<option value="${k}" ${I0.type === k ? "selected" : ""}>${t}</option>`).join("")}</select></label>`}
          </div>
          ${isLib ? "" : subSelect(cats, I0.cat, I0.sub)}
          <label>العنوان<input name="title" required value="${esc(I0.title)}"></label>
          <div class="row">
            <label>المؤلف / الشيخ / القارئ<input name="author" required value="${esc(I0.author)}"></label>
            <label data-lib="video audio text" ${show("video", "audio", "text")}>المدة (اختياري)<input name="duration" value="${esc(I0.duration || "")}" placeholder="45 دقيقة"></label>
            <label data-lib="book" ${show("book")}>عدد الصفحات (اختياري)<input type="number" name="pages" min="1" value="${esc(I0.pages || "")}"></label>
          </div>
          <div data-lib="book file" class="box book-upload" ${show("book", "file")}>
            <label>${isLib ? "ملف الكتاب" : "الملف"} (PDF، حتى 50 ميغابايت)<input type="file" name="pdf" accept="application/pdf"></label>
            ${I0.file && (I0.type === "book" || I0.type === "file") ? `<p class="small">الملف الحالي: <a class="link" href="${esc(I0.file)}" target="_blank" rel="noopener">فتح</a>${I0.size ? " · " + MH.fmtSize(I0.size) : ""} — اختر ملفًا جديدًا لاستبداله.</p>` : ""}
            <label>أو رابط خارجي (اختياري)<input name="file" value="${esc(I0.filePath ? "" : I0.file || "")}" dir="ltr" placeholder="https://..."></label>
          </div>
          <div class="row">
            <label>المستوى<select name="level">${["", "مبتدئ", "متوسط", "متقدم", "عام", "تلاوة"].map((x) => `<option value="${x}" ${(I0.level || "") === x ? "selected" : ""}>${x || "—"}</option>`).join("")}</select></label>
          </div>
          <label>نبذة قصيرة<textarea name="desc" rows="2" required>${esc(I0.desc)}</textarea></label>
          <label data-lib="video" ${show("video")}>رابط الفيديو (يوتيوب)<input name="video" value="${esc(I0.video || "")}" dir="ltr" placeholder="https://www.youtube.com/watch?v=..."></label>
          <label data-lib="audio" ${show("audio")}>رابط الملف الصوتي (mp3)<input name="src" value="${esc(I0.src || "")}" dir="ltr" placeholder="https://.../001.mp3"></label>
          <label data-lib="text" ${show("text")}>النص (افصل بين الفقرات بسطر فارغ)<textarea name="content" rows="8">${esc(I0.content || "")}</textarea></label>
          <label>محاور المادة (اختياري — كل سطر محور)<textarea name="points" rows="3">${esc((I0.points || []).join("\n"))}</textarea></label>
          <div class="actions"><button class="btn">${ed ? "حفظ التعديل" : isLib ? "إضافة إلى المكتبة" : "إضافة المادة"}</button>${ed ? `<a class="btn ghost" href="${qs("")}">إلغاء</a>` : ""}</div>
        </form>
      </details>
      <div class="chips sub mt">
        <a class="chip ${fcat === "all" ? "on" : ""}" href="#/${tab}">الكل</a>
        ${cats.map((c) => `<a class="chip ${fcat === c.id ? "on" : ""}" href="#/${tab}?cat=${c.id}">${catIc(c.id)} ${esc(c.name)} <small>(${arNum(state.library.filter((i) => mine(i) && i.cat === c.id).length)})</small></a>`).join("")}
      </div>
      ${isLib
        ? listBox("كتب المكتبة", byType("book"), "لا توجد كتب في هذا القسم بعد. أضف أول كتاب من «➕ كتاب جديد».")
        : listBox("الدروس المرئية والصوتية", [...byType("video"), ...byType("audio")], "لا توجد دروس مفردة هنا بعد.")
          + listBox("المقالات والمواد المكتوبة", byType("text"), "لا توجد مقالات هنا بعد.")
          + listBox("الملفات التعليمية", byType("file"), "لا توجد ملفات تعليمية هنا بعد.")}`;
  }

  /* ---- محرر الاختبار النهائي لقائمة التشغيل ---- */
  const isPlaceholderQ = (q) => /^سؤال تجريبي/.test(q.q || "");
  function quizEditor(c, params) {
    const quiz = c.quiz || [];
    const real = quiz.filter((q) => !isPlaceholderQ(q));
    const qi = params.get("q");
    const eq = qi !== null && quiz[Number(qi)] ? quiz[Number(qi)] : null;
    const Q0 = eq || { q: "", options: ["", "", "", ""], answer: 0 };
    const opts = [0, 1, 2, 3].map((i) => (Q0.options || [])[i] || "");
    if (eq) setTimeout(() => { const b = $("#quizForm"); if (b) b.scrollIntoView({ block: "center" }); }, 0);
    return `
      <div class="box mt quiz-box" id="${c.unit ? "stage-" + esc(c.unit) : "quizBox"}">
        <h3>${ic("quiz")} ${c.unit ? `الاختبار المرحلي للوحدة «${esc(c.unitTitle)}»` : `الامتحان النهائي لدورة «${esc(c.title)}»`} (${arNum(real.length)} أسئلة)</h3>
        <p class="muted small">${c.unit ? "اختياري: يُفتح بعد إتمام دروس الوحدة، والنجاح فيه (٦٠٪) شرط للوحدة التالية وللامتحان النهائي." : "يُفتح للطالب بعد إتمام كل الدروس واجتياز الاختبارات المرحلية، والنجاح من ٦٠٪، وبعده الشهادة."}${!c.unit && real.length < 5 ? " يُفضَّل ٥ أسئلة على الأقل." : ""}</p>
        ${quiz.some(isPlaceholderQ) ? `<p class="dup-box small" style="padding:8px 12px;border-radius:10px">⚠️ في هذا الاختبار سؤال تجريبي؛ سيُحذف تلقائيًا عند إضافة أول سؤال حقيقي.</p>` : ""}
        <ol class="quiz-admin">${quiz.map((q, i) => `<li class="${eq === q ? "editing" : ""}">
          <div><b>${esc(q.q)}</b>${isPlaceholderQ(q) ? ` <span class="tag soft">تجريبي</span>` : ""}
            <ul>${q.options.map((o, j) => `<li class="${j === q.answer ? "right" : ""}">${j === q.answer ? "✓ " : ""}${esc(o)}</li>`).join("")}</ul></div>
          <span class="nowrap small">${i > 0 ? `<button class="link" data-q-move="${c.id}|${i}|-1" title="أعلى">▲</button>` : ""}${i < quiz.length - 1 ? `<button class="link" data-q-move="${c.id}|${i}|1" title="أسفل">▼</button>` : ""}
            <a class="link" href="#/programs?p=${c.id}&q=${i}">تعديل</a> · <button class="link danger" data-q-del="${c.id}|${i}">حذف</button></span>
        </li>`).join("") || `<li class="muted">لا توجد أسئلة بعد.</li>`}</ol>
        <form class="form" id="quizForm" data-course="${c.id}" data-edit="${eq ? qi : ""}">
          <h4>${eq ? `تعديل السؤال ${arNum(Number(qi) + 1)}` : "إضافة سؤال"}</h4>
          <label>نص السؤال<textarea name="q" rows="2" required>${esc(Q0.q)}</textarea></label>
          <p class="muted small">اكتب الخيارات (اثنان على الأقل)، واختر الإجابة الصحيحة بالدائرة بجانبها:</p>
          ${opts.map((o, i) => `<div class="q-opt"><input type="radio" name="answer" value="${i}" ${Q0.answer === i ? "checked" : ""} aria-label="الإجابة الصحيحة"><input name="o${i}" value="${esc(o)}" placeholder="الخيار ${["الأول", "الثاني", "الثالث (اختياري)", "الرابع (اختياري)"][i]}"></div>`).join("")}
          <div class="actions"><button class="btn">${eq ? "حفظ السؤال" : "إضافة السؤال"}</button>${eq ? `<a class="btn ghost" href="#/programs?p=${c.id}">إلغاء</a>` : ""}</div>
        </form>
      </div>`;
  }

  /* حامل أسئلة الاختبار: الامتحان النهائي للدورة، أو الاختبار المرحلي لوحدة ("الدورة@الوحدة") */
  const quizHolder = (key, create) => {
    const [pid, unit] = String(key).split("@");
    const pg = MH.programRaw(pid);
    if (!pg) return null;
    if (!unit) { pg.quiz = pg.quiz || []; return { pg, h: pg }; }
    if (!(pg.playlists || []).includes(unit)) return null;
    pg.stages = pg.stages || [];
    let st = pg.stages.find((x) => x.unit === unit);
    if (!st && create) { st = { unit, quiz: [] }; pg.stages.push(st); }
    return st ? { pg, h: st } : null;
  };

  /* ---------------- الدورات المتاحة (programs) ---------------- */
  function admPrograms() {
    const acc = currentStaff();
    const params = new URLSearchParams((location.hash.split("?")[1]) || "");
    const list = MH.programsAll().filter((p) => acc.role !== "teacher" || MH.ownsProgram(acc, p.id));
    const pkey = params.get("p") || "";
    const ed = pkey ? MH.programRaw(pkey.split("@")[0]) : null;
    /* معاملات خاصة بكل محرر: السؤال المفتوح للتعديل يخص محررًا واحدًا فقط */
    const paramsFor = (key) => new URLSearchParams(pkey === key && params.get("q") !== null ? "q=" + params.get("q") : "");
    if (params.get("p") && (!ed || !can("programs:manage", { programId: ed.id }))) return `<div class="empty">الدورة غير موجودة أو ليست من صلاحياتك.</div>`;
    const P0 = ed || { title: "", desc: "", goals: [], teacher: (state.teachers[0] || {}).id, topic: (MH.topicsAll()[0] || {}).id, playlists: [], level: "", conditions: "", hidden: false };
    const students = (id) => allStudents().filter((u) => u.enrolled && u.enrolled[id]).length;
    return `
      <h1 class="adm-title">الدورات المتاحة</h1>
      <p class="muted small">الدورة برنامج له تسجيل ومتابعة واختبار وشهادة. دروسها هي حلقات قوائم التشغيل في «فضاء الطلاب»: تختار القوائم التي تكوّن وحداتها دون نسخ أي محتوى.</p>
      ${ed ? "" : `<div class="box"><table><thead><tr><th>الدورة</th><th>الموضوع</th><th>الوحدات</th><th>الأسئلة</th><th>الملتحقون</th><th></th></tr></thead><tbody>
        ${list.map((p) => { const v = MH.program(p.id); return `<tr><td><b>${esc(p.title)}</b>${p.hidden ? ` <span class="tag soft">مخفية</span>` : ""}</td><td>${esc(catOf(p.topic).name)}</td><td>${arNum(v.units.length)} · ${arNum(v.lessons.length)} درسًا</td><td>${arNum((p.quiz || []).length)}</td><td>${arNum(students(p.id))}</td>
          <td class="nowrap small"><a class="link" href="#/programs?p=${esc(p.id)}">تعديل والاختبار</a> · <a class="link" href="../#/courses/${esc(p.id)}" target="_blank" rel="noopener">عرض</a> · <button class="link danger" data-del-program="${esc(p.id)}">حذف</button></td></tr>`; }).join("") || `<tr><td colspan="6" class="muted">لا توجد دورات بعد.</td></tr>`}
      </tbody></table></div>`}
      <details class="box add-box mt" ${ed ? "open" : ""}>
        <summary>${ed ? `✎ بيانات دورة «${esc(ed.title)}»` : "➕ دورة جديدة"}</summary>
        <form class="form" id="programForm" data-edit="${ed ? esc(ed.id) : ""}">
          <label>اسم الدورة<input name="title" required value="${esc(P0.title)}" placeholder="دورة اختبار نظم الأخضري"></label>
          <label>الوصف<textarea name="desc" rows="2" required>${esc(P0.desc)}</textarea></label>
          <label>الأهداف (كل سطر هدف)<textarea name="goals" rows="3">${esc((P0.goals || []).join("\n"))}</textarea></label>
          <div class="row">
            <label>المدرّس<select name="teacher">${state.teachers.map((t) => `<option value="${t.id}" ${P0.teacher === t.id ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select></label>
            <label>الموضوع<select name="topic">${MH.topicsAll().map((t) => `<option value="${t.id}" ${P0.topic === t.id ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select></label>
            <label>المستوى<select name="level">${["", "مبتدئ", "متوسط", "متقدم", "عام"].map((x) => `<option value="${x}" ${(P0.level || "") === x ? "selected" : ""}>${x || "—"}</option>`).join("")}</select></label>
          </div>
          <fieldset class="box pl-pick"><legend>وحدات الدورة: قوائم التشغيل من فضاء الطلاب</legend>
            ${state.series.map((sr) => { const pls = state.courses.filter((c) => c.series === sr.id); return pls.length ? `<p class="small"><b>${esc(sr.name)}</b> <span class="muted">(${esc(catOf(sr.cat).name)})</span></p>${pls.map((c) => `<label class="check"><input type="checkbox" name="pl_${c.id}" ${(P0.playlists || []).includes(c.id) ? "checked" : ""}> ${esc(c.title)} <small class="muted">(${arNum(c.lessons.length)} دروس)</small></label>`).join("")}` : ""; }).join("")}
          </fieldset>
          <label>شروط إضافية للتسجيل أو النجاح (اختياري، كل سطر شرط)<textarea name="conditions" rows="2">${esc(P0.conditions || "")}</textarea></label>
          <label class="check"><input type="checkbox" name="hidden" ${P0.hidden ? "checked" : ""}> إخفاء الدورة من «الدورات المتاحة» (تبقى بيانات الملتحقين كما هي)</label>
          <div class="actions"><button class="btn">${ed ? "حفظ الدورة" : "إضافة الدورة"}</button>${ed ? `<a class="btn ghost" href="#/programs">رجوع إلى الدورات</a>` : ""}</div>
        </form>
      </details>
      ${ed ? `<div class="box mt"><h3>${ic("grid")} صورة الدورة</h3><div class="cover-grid">${coverTile("prog:" + ed.id, ed.title, "دورة", courseCover(MH.program(ed.id)), !!ed.cover, "إزالة الصورة الخاصة")}</div></div>` : ""}
      ${ed ? (ed.playlists || []).map((plid) => { const pl = course(plid); if (!pl) return "";
        const st = (ed.stages || []).find((x) => x.unit === plid) || { quiz: [] };
        return `<details class="box mt stage-wrap" ${pkey === ed.id + "@" + plid ? "open" : ""}><summary><b>${ic("quiz")} الاختبار المرحلي: ${esc(pl.title)}</b> <small class="muted">(${arNum(st.quiz.length)} أسئلة${st.quiz.length ? "" : " — اختياري"})</small></summary>
          ${quizEditor({ id: ed.id + "@" + plid, title: ed.title, unit: plid, unitTitle: pl.title, quiz: st.quiz }, paramsFor(ed.id + "@" + plid))}</details>`; }).join("") : ""}
      ${ed ? quizEditor(ed, paramsFor(ed.id)) : ""}`;
  }

  /* ---------------- موضوعات فضاء الطلاب ---------------- */
  function admTopics() {
    const params = new URLSearchParams((location.hash.split("?")[1]) || "");
    const all = MH.topicsAll();
    const ed = all.find((t) => t.id === params.get("edit"));
    const T0 = ed || { name: "", desc: "", group: TOPIC_GROUPS[0].id, subs: [] };
    const gName = (id) => (TOPIC_GROUPS.find((g) => g.id === id) || { name: "أقسام أخرى" }).name;
    const subUsed = (t, sid) => state.series.filter((x) => x.cat === t && x.sub === sid).length + state.library.filter((x) => x.cat === t && x.sub === sid).length;
    const used = (id) => state.series.filter((x) => x.cat === id).length + state.library.filter((x) => x.cat === id).length + MH.programsAll().filter((x) => x.topic === id).length;
    return `
      <h1 class="adm-title">الأقسام العلمية</h1>
      <p class="muted small">كل قسم يظهر بطاقةً مصوّرة في فضاء الطلاب تحت مجموعته، وداخله أبوابه (التصنيفات الفرعية). يُضاف القسم وأبوابه هنا، وتُضاف سلاسله من «السلاسل والمتون وقوائم التشغيل»، ودروسه ومقالاته وملفاته من «المحتوى العلمي».</p>
      <details class="box add-box" ${ed ? "open" : ""}>
        <summary>${ed ? `✎ تعديل «${esc(ed.name)}»` : "➕ موضوع جديد"}</summary>
        <form class="form" id="topicForm" data-edit="${ed ? esc(ed.id) : ""}">
          <div class="row">
            <label>اسم القسم<input name="name" required value="${esc(T0.name)}" placeholder="الأنبياء والمرسلون"></label>
            <label>المجموعة في فضاء الطلاب<select name="group">${TOPIC_GROUPS.map((g) => `<option value="${g.id}" ${T0.group === g.id ? "selected" : ""}>${esc(g.name)}</option>`).join("")}</select></label>
          </div>
          <label>نبذة قصيرة<textarea name="desc" rows="2">${esc(T0.desc || "")}</textarea></label>
          <label>أبواب القسم (اختياري — كل سطر باب، بالترتيب الذي يظهر به)<textarea name="subs" rows="5" placeholder="قصص الأنبياء&#10;معجزات الأنبياء">${esc((T0.subs || []).map((x) => x.name).join("\n"))}</textarea></label>
          <p class="muted small">تعديل اسم باب في سطره يحافظ على المحتوى المرتبط به. وحذف باب لا يحذف محتواه، بل يصبح محتواه «عامًا في القسم».</p>
          <div class="actions"><button class="btn">${ed ? "حفظ" : "إضافة الموضوع"}</button>${ed ? `<a class="btn ghost" href="#/topics">إلغاء</a>` : ""}</div>
        </form>
      </details>
      <div class="box mt"><ul class="simple">${all.map((t, i) => `<li>
        <span><b>${catIc(t.id)} ${esc(t.name)}</b> <span class="tag soft">${esc(gName(t.group))}</span>${t.hidden ? ` <span class="tag soft">مخفي</span>` : ""}<br><small class="muted">${arNum(used(t.id))} عنصرًا مرتبطًا${(t.subs || []).length ? " · الأبواب: " + t.subs.map((x) => esc(x.name) + (subUsed(t.id, x.id) ? " (" + arNum(subUsed(t.id, x.id)) + ")" : "")).join("، ") : ""}</small></span>
        <span class="nowrap small">${i > 0 ? `<button class="link" data-topic-move="${esc(t.id)}|-1" title="تقديم">▲</button>` : ""}${i < all.length - 1 ? `<button class="link" data-topic-move="${esc(t.id)}|1" title="تأخير">▼</button>` : ""}
          <a class="link" href="#/topics?edit=${esc(t.id)}">تعديل</a> · <button class="link" data-topic-hide="${esc(t.id)}">${t.hidden ? "إظهار" : "إخفاء"}</button> · <a class="link" href="../#/space/${esc(t.id)}" target="_blank" rel="noopener">عرض</a>${used(t.id) ? "" : ` · <button class="link danger" data-topic-del="${esc(t.id)}">حذف</button>`}</span>
      </li>`).join("")}</ul></div>
      <div class="box mt">
        <h3>${ic("grid")} صور الموضوعات</h3>
        <p class="muted small">صورة أفقية (١٦:٩) واضحة تعبّر عن الموضوع. وتأخذ السلسلة صورة موضوعها ما لم تُختر لها صورة خاصة.</p>
        <div class="cover-grid">${all.map((c) => coverTile("cat:" + c.id, c.name, "موضوع", catCover(c.id), !!state.catCovers[c.id], "استعادة الصورة السابقة")).join("")}</div>
      </div>`;
  }

  /* ---------------- المخطط السنوي (لجنة التعليم) ---------------- */
  const PLAN_KINDS = { study: "دراسة ودروس", exam: "اختبارات", quran: "مسابقة قرآنية", prep: "تجهيز وتحضير", training: "تكوين المدرسين", event: "حفل ومناسبة" };
  function admPlan() {
    const pl = state.plan || { items: [] };
    const params = new URLSearchParams((location.hash.split("?")[1]) || "");
    const ed = (pl.items || []).find((x) => x.id === params.get("edit"));
    const I0 = ed || { month: new Date().toISOString().slice(0, 7), kind: "study", title: "", note: "", committee: "لجنة التعليم" };
    const items = (pl.items || []).slice().sort((a, b) => (a.month === "all") - (b.month === "all") || a.month.localeCompare(b.month));
    return `
      <h1 class="adm-title">المخطط السنوي للمعهد</h1>
      <p class="muted small">مهام لجنة التعليم في المخطط السنوي للجمعية. تظهر في صفحة «المخطط السنوي» في الموقع، وأقربها في «الدورات المتاحة» تحت «قادم في المعهد».</p>
      <form class="box form" id="planHead">
        <div class="row"><label>عنوان المخطط<input name="title" value="${esc(pl.title || "")}"></label><label>محور العام<input name="theme" value="${esc(pl.theme || "")}"></label></div>
        <button class="btn sm">حفظ</button>
      </form>
      <details class="box add-box mt" ${ed ? "open" : ""}>
        <summary>${ed ? `✎ تعديل «${esc(ed.title)}»` : "➕ مهمة جديدة"}</summary>
        <form class="form" id="planForm" data-edit="${ed ? esc(ed.id) : ""}">
          <label>المهمة<input name="title" required value="${esc(I0.title)}" placeholder="الاختبارات الفصلية الأولى"></label>
          <div class="row">
            <label>الشهر<input type="month" name="month" value="${I0.month === "all" ? "" : esc(I0.month)}"></label>
            <label class="check"><input type="checkbox" name="all" ${I0.month === "all" ? "checked" : ""}> طوال العام</label>
          </div>
          <div class="row">
            <label>النوع<select name="kind">${Object.entries(PLAN_KINDS).map(([k, t]) => `<option value="${k}" ${I0.kind === k ? "selected" : ""}>${t}</option>`).join("")}</select></label>
            <label>اللجنة المسؤولة<input name="committee" value="${esc(I0.committee || "")}"></label>
          </div>
          <label>ملاحظة (اختياري)<input name="note" value="${esc(I0.note || "")}" placeholder="أواخر رمضان"></label>
          <div class="actions"><button class="btn">${ed ? "حفظ التعديل" : "إضافة المهمة"}</button>${ed ? `<a class="btn ghost" href="#/plan">إلغاء</a>` : ""}</div>
        </form>
      </details>
      <div class="box mt"><ul class="simple">${items.map((x) => `<li><span><b>${esc(x.title)}</b><br><small class="muted">${x.month === "all" ? "طوال العام" : esc(x.month)} · ${esc(PLAN_KINDS[x.kind] || "")} · ${esc(x.committee || "")}${x.note ? " · " + esc(x.note) : ""}</small></span>
        <span class="nowrap small"><a class="link" href="#/plan?edit=${esc(x.id)}">تعديل</a> · <button class="link danger" data-del-plan="${esc(x.id)}">حذف</button></span></li>`).join("") || `<li class="muted">لا توجد مهام.</li>`}</ul></div>`;
  }

  /* ---------------- الصفحة الرئيسية ---------------- */
  function admHome() {
    const h = (state.settings && state.settings.home) || {};
    return `
      <h1 class="adm-title">الصفحة الرئيسية</h1>
      <p class="muted small">الرئيسية فيها ثلاث بطاقات: المكتبة العلمية، وفضاء الطلاب، ومشروع «نور بيت المسلم». والأقسام العلمية وصورها تُدار من «الأقسام العلمية».</p>
      <form class="box form" id="homeForm">
        <h3>${ic("library")} قسم المكتبة العلمية</h3>
        <label>العنوان<input name="libTitle" value="${esc(h.libTitle || "المكتبة العلمية المفتوحة")}"></label>
        <label>الشعار التعريفي<input name="libSlogan" value="${esc(h.libSlogan || "ادخل واحصل على كتابك")}"></label>
        <h3 class="mt">${ic("users")} التواصل مع الإدارة</h3>
        <label>رقم واتساب الإدارة (مع رمز الدولة، مثل 22233445566) — يظهر زر واتساب في صفحة الدورة و«حسابي»، ويختفي إن تُرك فارغًا<input name="whatsapp" dir="ltr" inputmode="tel" value="${esc(h.whatsapp || "")}" placeholder="222XXXXXXXX"></label>
        <h3 class="mt">${ic("cap")} قسم فضاء الطلاب</h3>
        <label>العنوان<input name="spaceTitle" value="${esc(h.spaceTitle || "فضاء الطلاب")}"></label>
        <label>الشعار التعريفي<input name="spaceSlogan" value="${esc(h.spaceSlogan || "دروس وسلاسل علمية مفتوحة للجميع")}"></label>
        <h3 class="mt">${ic("home")} مشروع «نور بيت المسلم»</h3>
        <label>العنوان<input name="noorTitle" value="${esc((state.noor || DEFAULT_NOOR).title)}"></label>
        <label>الشعار<input name="noorSlogan" value="${esc((state.noor || DEFAULT_NOOR).slogan)}"></label>
        <label>الرسالة<textarea name="noorMission" rows="2">${esc((state.noor || DEFAULT_NOOR).mission)}</textarea></label>
        <div class="actions"><button class="btn">حفظ</button><a class="btn ghost" href="../#/" target="_blank" rel="noopener">معاينة الرئيسية</a></div>
      </form>
      <div class="box mt"><h3>${ic("grid")} صور البطاقات في الرئيسية</h3>
        <div class="cover-grid">${coverTile("home:libCover", "المكتبة العلمية", "الرئيسية", MH.fromRoot(h.libCover || "assets/library/hero.jpg"), !!h.libCover, "استعادة الصورة الافتراضية")}
        ${coverTile("home:spaceCover", "فضاء الطلاب", "الرئيسية", MH.fromRoot(h.spaceCover || "assets/library/students.jpg"), !!h.spaceCover, "استعادة الصورة الافتراضية")}
        ${coverTile("home:noorCover", "نور بيت المسلم", "الرئيسية وصفحة المشروع", MH.fromRoot(h.noorCover || "assets/library/family.jpg"), !!h.noorCover, "استعادة الصورة الافتراضية")}</div>
      </div>`;
  }

  /* ---------------- الشهادات الممنوحة ---------------- */
  function admCerts() {
    const acc = currentStaff();
    const cs = scopedCourses(acc);
    const rows = [];
    allStudents().forEach((u) => Object.entries(u.results || {}).forEach(([k, r]) => {
      if (k.includes("@") || !passed(r)) return;
      const c = cs.find((x) => x.id === k);
      if (c) rows.push({ u, c, r });
    }));
    rows.sort((a, b) => String(b.r.date).localeCompare(String(a.r.date)));
    return `
      <h1 class="adm-title">الشهادات</h1>
      <p class="muted small">تُمنح الشهادة تلقائيًا لمن أتمّ دروس الدورة واجتاز اختباراتها المرحلية وامتحانها النهائي (٦٠٪ فأكثر). رقم الشهادة يتكوّن من آخر ستة أحرف من حساب الطالب ومعرّف الدورة.</p>
      <div class="box"><div class="table-wrap"><table>
        <thead><tr><th>الطالب</th><th>الدورة</th><th>النتيجة</th><th>التاريخ</th><th>رقم الشهادة</th></tr></thead>
        <tbody>${rows.map(({ u, c, r }) => `<tr><td><b>${esc(u.name)}</b><br><small class="muted" dir="ltr">${esc(contactOf(u))}</small></td><td>${esc(c.title)}</td><td>${MH.gradeTxt(r)}</td><td class="nowrap">${fmtDate(r.date)}</td><td dir="ltr" class="nowrap">${esc(String(u.id).slice(-6).toUpperCase())}-${esc(c.id.toUpperCase())}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">لم تُمنح شهادات بعد.</td></tr>`}</tbody>
      </table></div></div>`;
  }

  /* سجل الشهادات المشفّر: يُبنى من نتائج الطلاب ويُحفظ مع المحتوى إذا تغيّر (المدير العام والمشرف) */
  let certsSyncedAt = 0;
  async function syncCertRegistry() {
    const acc = currentStaff();
    if (!acc || !["owner", "supervisor"].includes(acc.role) || !(MH.cloud.online && MH.cloud.online())) return;
    if (Date.now() - certsSyncedAt < 60000) return;
    certsSyncedAt = Date.now();
    const reg = {};
    for (const u of allStudents()) {
      for (const [k, r] of Object.entries(u.results || {})) {
        if (k.includes("@") || !passed(r)) continue;
        const pg = MH.program(k); if (!pg) continue;
        const [id, val] = await MH.certSeal(MH.certCode(u.id, k), { name: u.name, course: pg.title, date: r.date, percent: Math.round((r.score / r.total) * 100) });
        reg[id] = val;
      }
    }
    if (JSON.stringify(reg) !== JSON.stringify(state.certs || {})) { state.certs = reg; save(); }
  }

  /* عدّاد طلبات الالتحاق الجديدة بجانب التبويب: يُحدَّث عند كل تنقّل، وكل دقيقتين */
  let pendingN = 0, pendingAt = 0;
  async function refreshPending(force) {
    if (!can("requests:manage")) return;
    if (!force && Date.now() - pendingAt < 20000) return paintPending();
    pendingAt = Date.now();
    pendingN = await MH.cloud.pendingCount();
    paintPending();
  }
  function paintPending() {
    const b = $("#reqBadge"); if (!b) return;
    b.hidden = !pendingN; b.textContent = arNum(pendingN);
    b.title = pendingN ? `${arNum(pendingN)} طلبات جديدة` : "";
  }
  setInterval(() => { if (currentStaff()) refreshPending(true); }, 120000);

  /* طلبات الالتحاق: تُجلب من الخادم بعد عرض الصفحة */
  let reqCache = [];
  function admRequests() {
    setTimeout(fillRequests, 0);
    return `<h1 class="adm-title">طلبات الالتحاق</h1>
      <p class="muted small">يطلب الطالب الالتحاق من صفحة الدورة بعد دخوله، ولا يُفتح له اختبارها وشهادتها إلا بعد القبول هنا.</p>
      <div id="reqBox" class="box"><p class="muted">جارٍ تحميل الطلبات…</p></div>`;
  }
  async function fillRequests() {
    const box = $("#reqBox"); if (!box) return;
    const r = await MH.cloud.loadRequests();
    if (!$("#reqBox")) return;
    if (r.error) { box.innerHTML = `<p>${esc(MH.cloud.msg(r.error))}</p>`; return; }
    reqCache = r.data;
    pendingN = reqCache.filter((q) => q.status === "pending").length; pendingAt = Date.now(); paintPending();
    const stu = (id) => allStudents().find((u) => u.id === id);
    const LBL = { pending: "قيد المراجعة", approved: "مقبول", rejected: "مرفوض" };
    const row = (q) => { const u = stu(q.student), pg = MH.program(q.course_id); return `<tr>
      <td><b>${esc(u ? u.name : "طالب")}</b><br><small class="muted" dir="ltr">${esc(u ? contactOf(u) : "")}</small></td>
      <td>${esc(pg ? pg.title : q.course_id)}</td><td class="nowrap">${fmtDate(q.created_at)}</td>
      <td><span class="tag ${q.status === "approved" ? "ok" : q.status === "rejected" ? "bad" : "soft"}">${LBL[q.status]}</span></td>
      <td class="nowrap">${q.status === "pending" ? `<button class="btn sm" data-decide="${q.id}|approved">قبول</button> <button class="btn sm ghost" data-decide="${q.id}|rejected">رفض</button>` : q.status === "rejected" ? `<button class="link" data-decide="${q.id}|approved">قبول</button>` : ""}</td></tr>`; };
    const pend = reqCache.filter((q) => q.status === "pending"), rest = reqCache.filter((q) => q.status !== "pending");
    box.innerHTML = `
      <h3>قيد المراجعة <small class="muted">(${arNum(pend.length)})</small></h3>
      <div class="table-wrap"><table><thead><tr><th>الطالب</th><th>الدورة</th><th>التاريخ</th><th>الحالة</th><th></th></tr></thead><tbody>${pend.map(row).join("") || `<tr><td colspan="5" class="muted">لا توجد طلبات جديدة.</td></tr>`}</tbody></table></div>
      ${rest.length ? `<h3 class="mt">الطلبات السابقة</h3><div class="table-wrap"><table><tbody>${rest.map(row).join("")}</tbody></table></div>` : ""}`;
  }

  let tempNotice = null; // تظهر مرة واحدة بعد توليد كلمة مرور مؤقتة
  const isOff = (u) => !!(MH.cloud.isDisabled && MH.cloud.isDisabled(u.id));
  function admPeople() {
    const shownNotice = tempNotice; setTimeout(() => { if (tempNotice === shownNotice) tempNotice = null; }, 0);
    const acc = currentStaff();
    const cs = scopedCourses(acc);
    const st = allStudents().filter((u) => acc.role !== "teacher" || cs.some((c) => u.enrolled[c.id]));
    const teachers = acc.role === "teacher" ? state.teachers.filter((t) => t.id === acc.teacherId) : state.teachers;
    const eT = can("people:manage") && state.teachers.find((t) => t.id === new URLSearchParams((location.hash.split("?")[1]) || "").get("editT"));
    return `
      <h1 class="adm-title">${acc.role === "teacher" ? "طلابي" : "الطلاب والمعلمون"}</h1>
      ${tempNotice ? `<div class="box temp-pw"><b>كلمة المرور المؤقتة للطالب «${esc(tempNotice.name)}»:</b> <code dir="ltr">${esc(tempNotice.pw)}</code>
        <p class="muted small">أبلغ الطالب بها عبر رقمه المسجّل (${esc(tempNotice.contact)}). سيدخل بها، ثم يُطلب منه اختيار كلمة مرور جديدة. لن تظهر هذه الكلمة مرة أخرى.</p></div>` : ""}
      <div class="box">
        <h3>الطلاب (${arNum(st.length)})${st.some((u) => isOff(u)) ? ` <small class="muted">· موقوف: ${arNum(st.filter(isOff).length)}</small>` : ""}</h3>
        <input type="search" id="studentSearch" class="mb" placeholder="ابحث بالاسم أو الهاتف أو البريد…" aria-label="بحث في الطلاب">
        <div class="table-wrap"><table>
          <thead><tr><th>الاسم</th><th>الهاتف / البريد</th><th>تاريخ الانضمام</th><th>${acc.role === "teacher" ? "دوراتي المسجل فيها" : "الدورات"}</th>${can("people:manage") ? "<th></th>" : ""}</tr></thead>
          <tbody>${st.map((u) => `<tr data-search="${esc(norm(u.name + " " + contactOf(u) + " " + (u.email || "") + " " + (u.phone || "")))}" class="${isOff(u) ? "off" : ""}"><td><b>${esc(u.name)}</b>${u.id.startsWith("u-demo") ? ` <span class="tag soft">تجريبي</span>` : ""}${isOff(u) ? ` <span class="tag bad">موقوف</span>` : ""}</td><td dir="ltr">${esc(contactOf(u))}</td><td>${fmtDate(u.joined)}</td>
            <td>${acc.role === "teacher" ? cs.filter((c) => u.enrolled[c.id]).map((c) => esc(c.title)).join("، ") : arNum(Object.keys(u.enrolled).length)}</td>
            ${can("people:manage") ? `<td class="nowrap">${state.users.includes(u) ? `<button class="link" data-reset-student="${u.id}">كلمة مرور مؤقتة</button>${u.mustChangePw ? ` <span class="tag soft">بانتظار تغييرها</span>` : ""}${acc.role === "owner" && MH.cloud.setDisabled ? ` · <button class="link" data-toggle-student="${u.id}">${isOff(u) ? "تفعيل" : "إيقاف"}</button> · <button class="link danger" data-del-student="${u.id}">حذف</button>` : ""}` : `<span class="muted small">—</span>`}</td>` : ""}</tr>`).join("") || `<tr><td colspan="5" class="muted">لا يوجد طلاب.</td></tr>`}</tbody>
        </table></div>
        <p class="muted small mt" id="studentNone" hidden>لا يوجد طالب مطابق.</p>
        ${acc.role === "owner" ? `<p class="note">ⓘ الطالب الموقوف لا يستطيع الدخول، وتبقى بياناته وتقدّمه محفوظة. الحذف نهائي ويمحو الحساب وتقدّمه.</p>` : ""}
      </div>
      <div class="grid two mt">
        <div class="box">
          <h3>المعلمون (${arNum(teachers.length)})</h3>
          <ul class="simple">${teachers.map((t) => `<li><span><b>${esc(t.name)}</b><br><span class="muted small">${esc(t.spec)} · ${arNum(state.courses.filter((c) => c.teacher === t.id).length)} دورات</span></span>${can("people:manage") ? `<span class="nowrap small"><a class="link" href="#/people?editT=${t.id}">تعديل</a> · <button class="link danger" data-del-teacher="${t.id}">حذف</button></span>` : ""}</li>`).join("")}</ul>
        </div>
        ${can("people:manage") ? `<form class="box form" id="addTeacher" data-edit="${eT ? eT.id : ""}">
          <h3>${eT ? `تعديل «${esc(eT.name)}»` : "إضافة معلم"}</h3>
          <label>الاسم<input name="name" required value="${esc(eT ? eT.name : "")}"></label>
          <label>التخصص<input name="spec" required value="${esc(eT ? eT.spec : "")}"></label>
          <label>البريد<input type="email" name="email" dir="ltr" value="${esc(eT ? eT.email || "" : "")}"></label>
          <div class="actions"><button class="btn">${eT ? "حفظ التعديل" : "إضافة"}</button>${eT ? `<a class="btn ghost" href="#/people">إلغاء</a>` : ""}</div>
          <p class="note">ⓘ لإعطاء المعلم دخولًا إلى اللوحة، يُنشئ له المدير العام حسابًا من «الحسابات والصلاحيات».</p>
        </form>` : ""}
      </div>`;
  }

  function admResults() {
    const acc = currentStaff();
    const cs = scopedCourses(acc);
    const rows = [];
    allStudents().forEach((u) =>
      Object.keys(u.enrolled).forEach((cid) => {
        const c = cs.find((x) => x.id === cid);
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
            <td>${r && !r.pending ? `${MH.gradeTxt(r)}` : "—"}</td>
            <td>${r ? (r.pending ? `<span class="tag soft">سلّم — بانتظار النشر</span>` : passed(r) ? `<span class="tag ok">ناجح</span>` : `<span class="tag bad">لم ينجح</span>`) : p === 100 ? `<span class="tag soft">بانتظار الامتحان</span>` : `<span class="tag soft">قيد الدراسة</span>`}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">لا توجد تسجيلات.</td></tr>`}</tbody>
        </table></div>
      </div>
      <div class="box mt" id="examBox"><p class="muted">جارٍ تحميل تسليمات الامتحانات…</p></div>`;
  }

  /* مراجعة إجابات طالب في الامتحان النهائي: اختياره، والإجابة الصحيحة لكل سؤال */
  function answersReview(c, sub, u) {
    const quiz = (MH.programRaw(c.id) || {}).quiz || [];
    const pass = sub.total && sub.score / sub.total >= 0.6;
    return `<div class="ans-student">
      <h5><b>${esc(u ? u.name : "طالب")}</b> — ${MH.gradeTxt(sub)} <small class="muted">(${arNum(sub.score)} من ${arNum(sub.total)} صحيحة)</small> ${pass ? `<span class="tag ok">ناجح</span>` : `<span class="tag bad">راسب</span>`}
        <small class="muted">· المحاولة ${arNum(sub.attempt)} · ${fmtDate(sub.submitted_at)} · ${sub.published_at ? "منشورة" : "لم تُنشر بعد"}</small></h5>
      <ol class="ans-list">${quiz.map((q, i) => { const ch = (sub.answers || [])[i]; const ok = ch === q.answer;
        return `<li class="${ok ? "is-ok" : "is-bad"}"><span>${ok ? "✓" : "✗"} ${esc(q.q)}</span>
          <small>إجابته: <b>${esc((q.options || [])[ch] ?? "—")}</b>${ok ? "" : ` · الصحيحة: <b>${esc((q.options || [])[q.answer] ?? "—")}</b>`}</small></li>`; }).join("")}</ol>
    </div>`;
  }

  /* الامتحانات النهائية: النشر والإعادة (المدير العام، والمشرف بصلاحية النتائج) */
  const canPublish = () => { const a = currentStaff(); return !!a && (a.role === "owner" || (a.role === "supervisor" && (a.perms || []).includes("results"))); };
  let examCache = null;
  async function fillExams() {
    const box = $("#examBox"); if (!box) return;
    const r = await MH.cloud.loadSubmissions();
    if (!$("#examBox")) return;
    if (r.error) { box.innerHTML = `<p>${esc(MH.cloud.msg(r.error))}</p>`; return; }
    examCache = r;
    const cs = scopedCourses(currentStaff());
    const stu = (id) => allStudents().find((u) => u.id === id);
    const pub = canPublish();
    const blocks = cs.map((c) => {
      const subs = r.data.filter((x) => x.course_id === c.id);
      const latest = new Map(); subs.forEach((x) => { const p = latest.get(x.student); if (!p || x.attempt > p.attempt) latest.set(x.student, x); });
      const waitingN = [...latest.values()].filter((x) => !x.published_at).length;
      /* الراسبون بعد النشر (ومنهم أصحاب النتائج القديمة) ولم تُفتح لهم محاولة جديدة بعد */
      const failed = allStudents().filter((u) => { const res = (u.results || {})[c.id]; if (!res || res.pending || passed(res)) return false;
        const st = r.states.find((x) => x.student === u.id && x.course_id === c.id); return !st || st.allowed <= (res.attempts || 1); });
      const reopened = allStudents().filter((u) => { const res = (u.results || {})[c.id]; const st = r.states.find((x) => x.student === u.id && x.course_id === c.id); return res && !res.pending && !passed(res) && st && st.allowed > (res.attempts || 1); });
      if (!subs.length && !failed.length && !reopened.length) return "";
      return `<div class="exam-block">
        <h4>${esc(c.title)} <small class="muted">· ${arNum(latest.size)} طالبًا سلّموا</small></h4>
        <p>${waitingN ? `<b>${arNum(waitingN)}</b> تسليمات بانتظار النشر — راجع الإجابات قبل النشر.` : `<span class="muted">لا توجد تسليمات بانتظار النشر.</span>`}
          ${pub && waitingN ? `<button class="btn sm" data-publish="${esc(c.id)}">نشر النتائج (${arNum(waitingN)})</button>` : ""}</p>
        ${latest.size ? `<details class="ans-review"><summary>مراجعة إجابات الطلاب (${arNum(latest.size)})</summary>${[...latest.values()].map((x) => answersReview(c, x, stu(x.student))).join("")}</details>` : ""}
        ${failed.length ? `<ul class="simple">${failed.map((u) => { const res = u.results[c.id]; return `<li><span><b>${esc(u.name)}</b> <small class="muted">${MH.gradeTxt(res)} · المحاولة ${arNum(res.attempts || 1)}</small></span>
          ${pub ? `<button class="link" data-retake="${esc(u.id)}|${esc(c.id)}">السماح بمحاولة جديدة</button>` : ""}</li>`; }).join("")}</ul>` : ""}
        ${reopened.length ? `<p class="small muted">فُتحت محاولة جديدة لـ: ${reopened.map((u) => esc(u.name)).join("، ")}</p>` : ""}
      </div>`;
    }).join("");
    box.innerHTML = `<h3>${ic("quiz")} الامتحانات النهائية: نشر النتائج والإعادة</h3>
      <p class="muted small">يسلّم الطالب الامتحان النهائي مرة واحدة ولا يرى درجته حتى تنشرها الإدارة. بعد النشر يرى الناجح شهادته، ويرى الراسب درجته فقط، ولا يعيد إلا إذا سمحت له الإدارة.${pub ? "" : " (النشر والإعادة للمدير العام وللمشرف الذي لديه صلاحية النتائج.)"}</p>
      ${blocks || `<p class="muted">لا توجد تسليمات بعد.</p>`}`;
  }

  function admAnn() {
    const ea = state.announcements.find((a) => a.id === new URLSearchParams((location.hash.split("?")[1]) || "").get("edit"));
    return `
      <h1 class="adm-title">الإعلانات</h1>
      <form class="box form reg-settings" id="regSettings">
        <h3>حالة التسجيل في المعهد</h3>
        <label class="check"><input type="checkbox" name="regOpen" ${state.settings.regOpen ? "checked" : ""}> باب التسجيل مفتوح للطلاب الجدد</label>
        <label>نص الإعلان (يظهر في شريط الموقع وفي الواجهة)<input name="regNote" value="${esc(state.settings.regNote || "")}" maxlength="90" required></label>
        <button class="btn">حفظ</button>
        <p class="note">ⓘ عند الإغلاق يختفي إعلان التسجيل، ولا تُنشأ حسابات جديدة، ويبقى الطلاب الحاليون قادرين على الدخول والدراسة.</p>
      </form>
      <form class="box form" id="addAnn" ${ea ? `data-edit="${ea.id}"` : ""}>
        <h3>${ea ? "تعديل الإعلان" : "نشر إعلان جديد"}</h3>
        <label>العنوان<input name="title" required value="${ea ? esc(ea.title) : ""}"></label>
        <label>النص<textarea name="body" rows="3" required>${ea ? esc(ea.body) : ""}</textarea></label>
        <label>التاريخ<input type="date" name="date" required value="${esc(ea ? ea.date : today())}" dir="ltr"></label>
        <label class="check"><input type="checkbox" name="pinned" ${ea && ea.pinned ? "checked" : ""}> تثبيت الإعلان في الأعلى</label>
        <button class="btn">${ea ? "حفظ التعديل" : "نشر الإعلان"}</button>
        ${ea ? `<a class="btn ghost" href="#/ann">إلغاء</a>` : ""}
      </form>
      <div class="box mt">
        <h3>الإعلانات المنشورة</h3>
        <ul class="simple">${state.announcements.map((a) => `<li><div><b>${a.pinned ? "📌 " : ""}${esc(a.title)}</b><br><span class="muted">${fmtDate(a.date)}</span></div><span class="nowrap"><a class="link" href="#/ann?edit=${a.id}">تعديل</a> · <button class="link danger" data-del-ann="${a.id}">حذف</button></span></li>`).join("")}</ul>
      </div>`;
  }


  /* ---------------- الحسابات والصلاحيات (المدير العام) ---------------- */
  function admStaff() {
    const me = currentStaff();
    const params = new URLSearchParams((location.hash.split("?")[1]) || "");
    const ed = state.staff.find((s) => s.id === params.get("edit"));
    const S0 = ed || { name: "", email: "", role: "supervisor", perms: ["content"], teacherId: "" };
    const roleOpts = ["owner", "supervisor", "teacher", "treasurer"].map((r) => `<option value="${r}" ${S0.role === r ? "selected" : ""}>${ROLES[r].label}</option>`).join("");
    return `
      <h1 class="adm-title">الحسابات والصلاحيات</h1>
      <div class="grid four roles-grid">
        ${Object.entries(ROLES).map(([k, r]) => `<div class="box role-card r-${k}"><b>${r.label}</b><p class="muted small">${esc(r.desc)}</p></div>`).join("")}
      </div>
      <div class="box">
        <h3>الحسابات الإدارية</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>الاسم</th><th>البريد</th><th>الدور</th><th>الصلاحيات</th><th>الحالة</th><th></th></tr></thead>
          <tbody>${state.staff.map((s) => `<tr class="${ed && ed.id === s.id ? "editing" : ""}">
            <td><b>${esc(s.name)}</b>${s.id === me.id ? ` <span class="tag soft">أنت</span>` : ""}</td>
            <td dir="ltr">${esc(s.email)}</td>
            <td><span class="tag role-tag role-${s.role}">${ROLES[s.role].label}</span></td>
            <td class="small">${s.role === "owner" ? "كل الصلاحيات" : s.role === "treasurer" ? "المالية فقط" : s.role === "teacher" ? subjectsText(s) : (s.perms || []).map((p) => esc(PERMS[p])).join("<br>") || "—"}</td>
            <td>${s.disabled ? `<span class="tag bad">موقوف</span>` : `<span class="tag ok">مفعّل</span>`}</td>
            <td class="nowrap"><a class="link" href="#/staff?edit=${s.id}">تعديل</a>${s.id !== me.id ? ` · <button class="link" data-toggle-staff="${s.id}">${s.disabled ? "تفعيل" : "إيقاف"}</button> · <button class="link danger" data-del-staff="${s.id}">حذف</button>` : ""}</td>
          </tr>`).join("")}</tbody>
        </table></div>
      </div>
      <form class="box form mt" id="staffForm" data-edit="${ed ? ed.id : ""}">
        <h3>${ed ? `تعديل حساب «${esc(ed.name)}»` : "إضافة حساب إداري"}</h3>
        <div class="row">
          <label>الاسم<input name="name" value="${esc(S0.name)}" required></label>
          <label>البريد الإلكتروني<input type="email" name="email" value="${esc(S0.email)}" required dir="ltr"></label>
        </div>
        <div class="row">
          <label>الدور<select name="role" id="staffRole" ${ed && ed.id === me.id ? "disabled" : ""}>${roleOpts}</select></label>
          <label>${ed ? "كلمة مرور جديدة (اتركها فارغة للإبقاء)" : "كلمة المرور"}<input type="password" name="password" ${ed ? "" : "required"} minlength="8" autocomplete="new-password" dir="ltr"></label>
        </div>
        <fieldset data-role-fields="supervisor" ${S0.role === "supervisor" ? "" : "hidden"}>
          <legend>الصلاحيات الممنوحة للمشرف</legend>
          ${Object.entries(PERMS).map(([k, t]) => `<label class="check"><input type="checkbox" name="perm_${k}" ${(S0.perms || []).includes(k) ? "checked" : ""}> ${esc(t)}</label>`).join("")}
        </fieldset>
        <fieldset data-role-fields="teacher" ${S0.role === "teacher" ? "" : "hidden"}>
          <legend>المواد التي يدرّسها</legend>
          <div class="subject-checks">
            ${MH.topicsAll().map((c) => `<label class="check"><input type="checkbox" name="subj_${c.id}" ${(S0.subjects || []).includes(c.id) ? "checked" : ""}> ${catIc(c.id)} ${esc(c.name)}</label>`).join("")}
          </div>
          <label>اسمه في قائمة المعلمين<select name="teacherId"><option value="">—</option>${state.teachers.map((t) => `<option value="${t.id}" ${S0.teacherId === t.id ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select></label>
          <p class="note">ⓘ يدير المعلم دروس كل الدورات في المواد المختارة (والدورات المسندة إليه باسمه)، ويتابع طلابها ونتائجهم. مثال: معلم القرآن ← «تلاوات القرآن الكريم» و«دروس التجويد».</p>
        </fieldset>
        <div class="actions">
          <button class="btn">${ed ? "حفظ التعديلات" : "إنشاء الحساب"}</button>
          ${ed ? `<a class="btn ghost" href="#/staff">إلغاء</a>` : ""}
        </div>
        <p class="note">ⓘ حسابات الطلاب تُنشأ من الموقع العام ولا تُمنح دخولًا إلى هذه اللوحة.</p>
      </form>`;
  }

  function admAudit() {
    const rows = state.audit || [];
    return `
      <h1 class="adm-title">سجل العمليات</h1>
      <div class="box">
        <h3>${ic("download")} النسخة الاحتياطية للمحتوى</h3>
        <p class="muted small">ملف واحد فيه كل المحتوى: السلاسل وقوائم التشغيل والدروس والاختبارات والمعلمون والمكتبة والإعلانات والصور. احفظه في مكان آمن (مثل Google Drive) مرة كل أسبوع. لا يشمل حسابات الطلاب ولا المالية؛ فهي محفوظة في قاعدة البيانات.</p>
        <div class="actions">
          <button class="btn" id="backupDl">تنزيل نسخة احتياطية</button>
          <label class="btn ghost">استعادة من نسخة<input type="file" id="backupRestore" accept="application/json,.json" hidden></label>
        </div>
      </div>
      <p class="muted">آخر ${arNum(Math.min(rows.length, 300))} عملية إدارية، بما فيها محاولات الدخول الفاشلة والعمليات المرفوضة.</p>
      <div class="box"><div class="table-wrap"><table>
        <thead><tr><th>الوقت</th><th>الحساب</th><th>الدور</th><th>العملية</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><td class="nowrap small">${new Date(r.at).toLocaleString("ar")}</td><td>${esc(r.who)}</td><td>${r.role ? ROLES[r.role]?.label || "" : "—"}</td><td>${esc(r.text)}</td></tr>`).join("") || `<tr><td colspan="4" class="muted">لا توجد عمليات بعد.</td></tr>`}</tbody>
      </table></div></div>`;
  }

  /* المالية: تُرسم من js/finance.js بعد جلب بياناتها من الخادم */
  function admFinance() {
    setTimeout(() => MH.finance && MH.finance.mount($("#finRoot")), 0);
    return `<div id="finRoot"><h1 class="adm-title">المالية</h1><p class="muted">جارٍ تحميل البيانات المالية…</p></div>`;
  }

  /* ---------------- الموجّه ---------------- */
  function route() {
    const acc = currentStaff();
    const user = $("#admUser");
    if (!acc) {
      if (state.staffSession) { state.staffSession = null; save(); }
      document.body.classList.add("adm-out");
      user.innerHTML = "";
      $("#app").innerHTML = viewLogin();
      return;
    }
    document.body.classList.remove("adm-out");
    user.innerHTML = `<span class="adm-who"><b>${esc(acc.name)}</b><span class="tag role-tag role-${acc.role}">${ROLES[acc.role].label}</span></span>
      <a class="btn sm ghost-light" href="../#/">عرض الموقع</a>
      <button class="btn sm" id="staffLogout">خروج</button>`;
    const raw = location.hash.slice(1) || (acc.role === "treasurer" ? "/finance" : "/overview");
    const tabId = raw.split("?")[0].split("/").filter(Boolean)[0] || "overview";
    const tab = TABS.find((t) => t[0] === tabId) || TABS[0];
    const views = { overview: admOverview, courses: admCourses, lessons: admLessons, people: admPeople, results: admResults, ann: admAnn, library: admLibrary, content: admContent, programs: admPrograms, requests: admRequests, topics: admTopics, home: admHome, certs: admCerts, plan: admPlan, finance: admFinance, staff: admStaff, audit: admAudit };
    const body = can(tab[3]) ? views[tab[0]]() : (logAction("محاولة فتح صفحة غير مصرّح بها: " + tab[1], acc), save(), viewForbidden(tab[1]));
    setTimeout(() => { refreshPending(); syncCertRegistry(); if ($("#examBox")) fillExams(); }, 0);
    $("#app").innerHTML = `
    <section class="admin">
      <aside class="adm-side">
        <nav>${TABS.filter((t) => can(t[3])).map(([k, t, i]) => `<a href="#/${k}" class="${tab[0] === k ? "on" : ""}">${ic(i)}${t}${k === "requests" ? `<span class="nav-badge" id="reqBadge" ${pendingN ? "" : "hidden"}>${arNum(pendingN)}</span>` : ""}</a>`).join("")}</nav>
        <nav class="adm-out-links" aria-label="الانتقال إلى الموقع">
          <a href="../#/">${ic("grid")}الموقع العام</a>
          <a href="../#/library">${ic("library")}المكتبة</a>
        </nav>
      </aside>
      <div class="adm-main">${body}</div>
    </section>`;
    window.scrollTo(0, 0);
  }

  /* ---------------- الأحداث ---------------- */
  document.addEventListener("click", async (e) => {
    const t = e.target.closest("button, a");
    if (!t) return;
    const d = t.dataset;
    if (t.id === "staffLogout") {
      logAction("تسجيل الخروج");
      MH.cloud.signOut().then(() => { toast("تم تسجيل الخروج"); location.hash = ""; route(); });
    } else if (t.id === "themeToggle") {
      const cur = document.documentElement.dataset.theme === "dark" || (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.dataset.theme = cur ? "light" : "dark";
      try { localStorage.setItem("mahajja-theme", document.documentElement.dataset.theme); } catch (e2) { /* */ }
    } else if (d.delCourse) {
      const c = course(d.delCourse);
      if (!guard("content:structure", {}, "حذف قائمة تشغيل")) return;
      if (!confirmTap(t, "تأكيد الحذف؟")) return;
      state.courses = state.courses.filter((x) => x.id !== d.delCourse); done("تم حذف قائمة التشغيل", "حذف قائمة التشغيل: " + (c ? c.title : d.delCourse)); route();
    } else if (d.delLesson) {
      const [cid, lid] = d.delLesson.split("|");
      if (!guard("content:lessons", { courseId: cid }, "حذف درس")) return;
      if (!confirmTap(t, "تأكيد؟")) return;
      const c = course(cid); const l = c.lessons.find((x) => x.id === lid);
      c.lessons = c.lessons.filter((x) => x.id !== lid); done("تم حذف الدرس", `حذف درس «${l ? l.topic : lid}» من ${c.title}`); route();
    } else if (d.delSeries) {
      if (!guard("content:structure", {}, "حذف سلسلة")) return;
      if (playlistsOf(d.delSeries).length) { toast("احذف قوائم التشغيل التابعة للسلسلة أولًا", "warn"); return; }
      if (!confirmTap(t, "تأكيد الحذف؟")) return;
      const s = seriesOf(d.delSeries);
      state.series = state.series.filter((x) => x.id !== d.delSeries); done("تم حذف السلسلة", "حذف سلسلة: " + (s ? s.name : "")); route();
    } else if (d.mergeSeries) {
      if (!guard("content:structure", {}, "دمج سلسلتين")) return;
      if (!confirmTap(t, "تأكيد الدمج؟")) return;
      const [keepId, dropId] = d.mergeSeries.split("|");
      const keep = seriesOf(keepId), drop = seriesOf(dropId);
      if (!keep || !drop) return;
      state.courses.forEach((c) => { if (c.series === dropId) c.series = keepId; });
      ["matn", "author", "desc", "cover"].forEach((k) => { if (!keep[k] && drop[k]) keep[k] = drop[k]; });
      keep.nazm = keep.nazm || drop.nazm;
      state.series = state.series.filter((x) => x.id !== dropId);
      done("تم دمج السلسلتين", `دمج سلسلة مكررة: ${keep.name}`); route();
    } else if (d.mergeCourse) {
      if (!guard("content:structure", {}, "دمج قائمتي تشغيل")) return;
      if (!confirmTap(t, "تأكيد الدمج؟")) return;
      const [keepId, dropId] = d.mergeCourse.split("|");
      const keep = course(keepId), drop = course(dropId);
      if (!keep || !drop) return;
      const have = new Set(keep.lessons.map((l) => norm(l.topic)));
      let next = keep.lessons.reduce((m, l) => Math.max(m, l.num || 0), 0);
      let moved = 0;
      drop.lessons.forEach((l) => {
        if (have.has(norm(l.topic))) return;
        if (keep.lessons.some((x) => x.num === l.num)) { l.num = ++next; l.title = lessonTitle(l.num); }
        keep.lessons.push(l); have.add(norm(l.topic)); next = Math.max(next, l.num); moved++;
      });
      keep.lessons.sort((a, b) => a.num - b.num);
      if (!keep.cover && drop.cover) keep.cover = drop.cover;
      /* تسجيلات الطلاب في المكرر تنتقل إلى الأصل */
      state.users.forEach((u) => {
        if (!u.enrolled || !u.enrolled[dropId]) return;
        u.enrolled[keepId] = [...new Set([...(u.enrolled[keepId] || []), ...u.enrolled[dropId].filter((lid) => keep.lessons.some((l) => l.id === lid))])];
        delete u.enrolled[dropId];
      });
      state.courses = state.courses.filter((x) => x.id !== dropId);
      done(`تم الدمج${moved ? ` ونُقل ${arNum(moved)} درس` : ""}`, `دمج قائمة تشغيل مكررة: ${keep.title}`); route();
    } else if (d.qDel || d.qMove) {
      const [cid, idx, dir] = (d.qDel || d.qMove).split("|");
      if (!guard("programs:manage", { programId: cid.split("@")[0] }, "تعديل أسئلة اختبار")) return;
      const qh = quizHolder(cid); if (!qh) return;
      const c = qh.h;
      const i = Number(idx);
      if (d.qDel) {
        if (!confirmTap(t, "تأكيد؟")) return;
        c.quiz.splice(i, 1); done("تم حذف السؤال", "حذف سؤال من اختبار " + qh.pg.title);
      } else {
        const j = i + Number(dir); if (j < 0 || j >= c.quiz.length) return;
        [c.quiz[i], c.quiz[j]] = [c.quiz[j], c.quiz[i]]; save();
      }
      location.hash = "#/programs?p=" + cid; route();
      setTimeout(() => { const b = $(cid.includes("@") ? "#stage-" + cid.split("@")[1] : "#quizBox"); if (b) b.scrollIntoView(); }, 0);
    } else if (d.topicMove || d.topicHide || d.topicDel) {
      if (!guard("content:structure", {}, "تعديل الموضوعات")) return;
      state.topics = MH.topicsAll().slice();
      const id = (d.topicMove || d.topicHide || d.topicDel).split("|")[0];
      const i = state.topics.findIndex((x) => x.id === id); if (i < 0) return;
      const tp = state.topics[i];
      if (d.topicMove) {
        const j = i + Number(d.topicMove.split("|")[1]); if (j < 0 || j >= state.topics.length) return;
        [state.topics[i], state.topics[j]] = [state.topics[j], state.topics[i]]; save(); route(); return;
      }
      if (d.topicHide) { tp.hidden = !tp.hidden; done(tp.hidden ? "أُخفي الموضوع من الموقع" : "أصبح الموضوع ظاهرًا", (tp.hidden ? "إخفاء" : "إظهار") + " موضوع: " + tp.name); route(); return; }
      if (!confirmTap(t, "تأكيد الحذف؟")) return;
      state.topics.splice(i, 1); done("تم حذف الموضوع", "حذف موضوع: " + tp.name); route();
    } else if (d.delPlan) {
      if (!guard("content:structure", {}, "حذف مهمة من المخطط")) return;
      if (!confirmTap(t, "تأكيد الحذف؟")) return;
      const it = (state.plan.items || []).find((x) => x.id === d.delPlan);
      state.plan.items = state.plan.items.filter((x) => x.id !== d.delPlan);
      done("تم حذف المهمة", "حذف مهمة من المخطط السنوي: " + (it ? it.title : "")); route();
    } else if (d.publish) {
      if (!canPublish()) { toast("ليست لديك صلاحية نشر النتائج", "warn"); return; }
      if (!confirmTap(t, "تأكيد النشر؟")) return;
      t.disabled = true;
      const r = await MH.cloud.publishResults(d.publish);
      if (r.error) { t.disabled = false; toast(MH.cloud.msg(r.error), "warn"); return; }
      const pg = MH.program(d.publish);
      /* إعلان تلقائي عن صدور النتائج (يظهر في «الدورات المتاحة» و«حسابي») */
      if (r.data && pg) {
        state.announcements = (state.announcements || []).filter((x) => x.resultsFor !== pg.id);
        state.announcements.unshift({ id: uid("a"), resultsFor: pg.id, pinned: true, date: today(),
          title: `صدور نتائج الامتحان النهائي لدورة «${pg.title}»`,
          body: "نُشرت نتائج الامتحان النهائي، ويستطيع كل طالب الاطلاع على درجته من «حسابي». مبارك للناجحين، ونسأل الله التوفيق للجميع." });
      }
      logAction(`نشر نتائج الامتحان النهائي: ${pg ? pg.title : d.publish} (${r.data})`); save();
      toast(`نُشرت ${arNum(r.data)} نتائج، وأُضيف إعلان بصدورها`);
      certsSyncedAt = 0; syncCertRegistry(); route();
    } else if (d.retake) {
      if (!canPublish()) { toast("ليست لديك صلاحية هذا الإجراء", "warn"); return; }
      const [sid, cid] = d.retake.split("|");
      if (!confirmTap(t, "تأكيد؟")) return;
      const r = await MH.cloud.allowRetake(sid, cid);
      if (r.error) { toast(MH.cloud.msg(r.error), "warn"); return; }
      const who = allStudents().find((u) => u.id === sid), pg = MH.program(cid);
      logAction(`السماح بمحاولة جديدة: ${who ? who.name : "طالب"} — ${pg ? pg.title : cid}`); save();
      toast("فُتحت للطالب محاولة جديدة"); route();
    } else if (d.decide) {
      const [rid, st] = d.decide.split("|");
      if (!guard("requests:manage", {}, "البت في طلب التحاق")) return;
      t.disabled = true;
      const r = await MH.cloud.decideEnrollment(Number(rid), st);
      if (r.error) { t.disabled = false; toast(MH.cloud.msg(r.error), "warn"); return; }
      const req = reqCache.find((x) => String(x.id) === rid);
      const who = req && allStudents().find((u) => u.id === req.student);
      const pg = req && MH.program(req.course_id);
      logAction(`${st === "approved" ? "قبول" : "رفض"} طلب التحاق: ${who ? who.name : "طالب"} — ${pg ? pg.title : req ? req.course_id : ""}`); save();
      toast(st === "approved" ? "تم قبول الطلب، والدورة الآن في حساب الطالب" : "تم رفض الطلب");
      route();
    } else if (d.delProgram) {
      const pg = MH.programRaw(d.delProgram);
      if (!pg || !guard("programs:manage", { programId: pg.id }, "حذف دورة")) return;
      const n = allStudents().filter((u) => u.enrolled && u.enrolled[pg.id]).length;
      if (n) { toast(`لا تُحذف دورة فيها ${arNum(n)} طالب ملتحق؛ أخفِها بدلًا من ذلك`, "warn"); return; }
      if (!confirmTap(t, "تأكيد الحذف؟")) return;
      state.programs = state.programs.filter((x) => x.id !== pg.id);
      done("تم حذف الدورة", "حذف دورة: " + pg.title); location.hash = "#/programs"; route();
    } else if (t.id === "backupDl") {
      const acc = currentStaff();
      if (!acc || acc.role !== "owner") return;
      downloadBackup(); logAction("تنزيل نسخة احتياطية للمحتوى"); save();
    } else if (d.moveLesson) {
      const [cid, idx, dir] = d.moveLesson.split("|");
      if (!guard("content:lessons", { courseId: cid }, "ترتيب الدروس")) return;
      const c = course(cid); if (!c) return;
      const i = Number(idx), j = i + Number(dir);
      if (j < 0 || j >= c.lessons.length) return;
      [c.lessons[i], c.lessons[j]] = [c.lessons[j], c.lessons[i]];
      /* الترقيم يتبع الترتيب الجديد؛ وتقدّم الطلاب مرتبط بمعرّف الدرس فلا يتأثر */
      c.lessons.forEach((l, k) => { l.num = k + 1; l.title = lessonTitle(k + 1); });
      done("تم تغيير الترتيب", `ترتيب دروس «${c.title}»`); route();
    } else if (d.moveCourse) {
      const [cid, dir] = d.moveCourse.split("|");
      if (!guard("content:structure", {}, "ترتيب قوائم التشغيل")) return;
      const c = course(cid); if (!c) return;
      const sib = state.courses.filter((x) => x.series === c.series);
      const k = sib.indexOf(c) + Number(dir);
      if (k < 0 || k >= sib.length) return;
      const a = state.courses.indexOf(c), b = state.courses.indexOf(sib[k]);
      [state.courses[a], state.courses[b]] = [state.courses[b], state.courses[a]];
      done("تم تغيير الترتيب", `ترتيب قوائم «${seriesName(c.series)}»`); route();
    } else if (d.toggleStudent || d.delStudent) {
      const acc = currentStaff();
      if (!acc || acc.role !== "owner") { toast("هذا للمدير العام فقط", "warn"); return; }
      const u = state.users.find((x) => x.id === (d.toggleStudent || d.delStudent)); if (!u) return;
      if (d.delStudent) {
        if (!confirmTap(t, "حذف نهائي؟")) return;
        const r = await MH.cloud.deleteUser(u.id);
        if (r.error) { toast(MH.cloud.msg(r.error), "warn"); return; }
        logAction("حذف حساب الطالب: " + u.name); save(); toast("تم حذف الحساب"); route();
      } else {
        const off = !isOff(u);
        if (off && !confirmTap(t, "تأكيد الإيقاف؟")) return;
        const r = await MH.cloud.setDisabled(u.id, off);
        if (r.error) { toast(MH.cloud.msg(r.error), "warn"); return; }
        logAction(`${off ? "إيقاف" : "تفعيل"} حساب الطالب: ${u.name}`); save(); toast(off ? "تم إيقاف الحساب" : "تم تفعيل الحساب"); route();
      }
    } else if (d.delLib) {
      const it = state.library.find((x) => x.id === d.delLib);
      if (!it || !guard("library:manage", { cat: it.cat }, "حذف مادة من المكتبة")) return;
      if (!confirmTap(t, "تأكيد الحذف؟")) return;
      state.library = state.library.filter((x) => x.id !== d.delLib);
      if (it.filePath) MH.cloud.deleteBook(it.filePath);
      done("تم حذف المادة", "حذف مادة من المكتبة: " + it.title); route();
    } else if (d.delTeacher) {
      if (!guard("people:manage", {}, "حذف معلم")) return;
      const tt = state.teachers.find((x) => x.id === d.delTeacher);
      const n = state.courses.filter((c) => c.teacher === d.delTeacher).length;
      if (n) { toast(`لا يمكن الحذف: المعلم مسند إلى ${arNum(n)} قوائم تشغيل؛ غيّر معلمها أولًا`, "warn"); return; }
      if (!confirmTap(t, "تأكيد الحذف؟")) return;
      state.teachers = state.teachers.filter((x) => x.id !== d.delTeacher);
      state.staff.forEach((s) => { if (s.teacherId === d.delTeacher) s.teacherId = null; });
      done("تم حذف المعلم", "حذف معلم: " + (tt ? tt.name : "")); route();
    } else if (d.delAnn) {
      if (!guard("ann:manage", {}, "حذف إعلان")) return;
      const a = state.announcements.find((x) => x.id === d.delAnn);
      state.announcements = state.announcements.filter((x) => x.id !== d.delAnn); done("تم حذف الإعلان", "حذف إعلان: " + (a ? a.title : "")); route();
    } else if (d.resetStudent) {
      resetStudentPw(d.resetStudent, t);
    } else if (d.coverReset) {
      setCover(d.coverReset, null);
    } else if (d.coverUrl) {
      const u = (prompt("ضع رابط الصورة (يبدأ بـ https://)") || "").trim();
      if (!u) return;
      if (!/^https:\/\/\S+$/i.test(u)) { toast("الرابط غير صالح؛ يجب أن يبدأ بـ https://", "warn"); return; }
      setCover(d.coverUrl, u);
    } else if (t.id === "clearImage") {
      $("#lessonForm [name=image]").value = ""; $("#lessonImage").value = ""; $("#imgPreview").hidden = true;
    } else if (d.toggleStaff || d.delStaff) {
      if (!guard("staff:manage", {}, "تعديل حساب إداري")) return;
      const id = d.toggleStaff || d.delStaff;
      const s = state.staff.find((x) => x.id === id);
      const me = currentStaff();
      if (!s || s.id === me.id) { toast("لا يمكنك إيقاف حسابك أو حذفه", "warn"); return; }
      const owners = state.staff.filter((x) => x.role === "owner" && !x.disabled && x.id !== s.id);
      if (s.role === "owner" && !owners.length) { toast("يجب أن يبقى مدير عام مفعّل واحد على الأقل", "warn"); return; }
      if (d.delStaff) {
        if (!confirmTap(t, "تأكيد الحذف؟")) return;
        const r = await MH.cloud.deleteUser(id);
        if (r.error) { toast(MH.cloud.msg(r.error), "warn"); return; }
        done("تم حذف الحساب", "حذف حساب: " + s.email);
      } else {
        s.disabled = !s.disabled; done(s.disabled ? "تم إيقاف الحساب" : "تم تفعيل الحساب", (s.disabled ? "إيقاف" : "تفعيل") + " حساب: " + s.email);
      }
      route();
    }
  });

  async function resetStudentPw(id, btn) {
    if (!guard("people:manage", {}, "إعادة تعيين كلمة مرور طالب")) return;
    const u = state.users.find((x) => x.id === id);
    if (!u) return;
    if (!confirmTap(btn, "تأكيد؟")) return;
    const pw = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
    const r = await MH.cloud.setPassword(u.id, pw, true);
    if (r.error) { toast(MH.cloud.msg(r.error), "warn"); return; }
    u.mustChangePw = true;
    tempNotice = { name: u.name, pw, contact: contactOf(u) };
    done("تم إنشاء كلمة مرور مؤقتة", "كلمة مرور مؤقتة للطالب: " + u.name);
    route();
  }

  /* ---------------- النسخة الاحتياطية ---------------- */
  const BACKUP_KEYS = ["series", "courses", "teachers", "announcements", "settings", "catCovers", "library", "topics", "programs", "certs", "plan"];
  function downloadBackup(tag = "") {
    const data = { app: "mahajja", kind: "content-backup", version: 1, at: new Date().toISOString(), content: {} };
    BACKUP_KEYS.forEach((k) => (data.content[k] = state[k]));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
    a.download = `mahajja-backup-${today()}${tag}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  async function restoreBackup(file) {
    const acc = currentStaff();
    if (!acc || acc.role !== "owner") { toast("الاستعادة للمدير العام فقط", "warn"); return; }
    let data;
    try { data = JSON.parse(await file.text()); } catch { toast("الملف غير صالح", "warn"); return; }
    const c = data && data.kind === "content-backup" && data.content;
    const valid = c && Array.isArray(c.series) && Array.isArray(c.courses) && Array.isArray(c.teachers) &&
      c.courses.every((x) => x && x.id && Array.isArray(x.lessons)) && c.series.every((x) => x && x.id);
    if (!valid) { toast("هذا ليس ملف نسخة احتياطية للمنصة", "warn"); return; }
    const when = data.at ? new Date(data.at).toLocaleString("ar") : "؟";
    if (!window.confirm(`استعادة نسخة ${when}؟\n\nسيُستبدل كل المحتوى الحالي (${arNum(state.courses.length)} قوائم تشغيل) بمحتوى النسخة (${arNum(c.courses.length)} قوائم تشغيل).\nسيُنزَّل قبلها تلقائيًا ملف بالمحتوى الحالي احتياطًا.`)) return;
    downloadBackup("-before-restore");
    BACKUP_KEYS.forEach((k) => { if (c[k] !== undefined) state[k] = c[k]; });
    done("تمت استعادة النسخة الاحتياطية", "استعادة نسخة احتياطية بتاريخ " + when);
    route();
  }

  /* بعد دمج تعديلات مشرف آخر تُعاد رسم الصفحة لتظهر النسخة المدموجة (ما لم يكن المستخدم يكتب في نموذج) */
  window.addEventListener("mh:content-merged", () => {
    const el = document.activeElement;
    if (!el || !el.form) route();
  });

  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.id === "lessonCourse") location.hash = "#/lessons?c=" + t.value;
    if (t.id === "hasVerses") $("#versesBox").hidden = !t.checked;
    if (t.id === "backupRestore" && t.files[0]) restoreBackup(t.files[0]).finally(() => (t.value = ""));
    if (t.id === "libType") $$("[data-lib]").forEach((x) => (x.hidden = !x.dataset.lib.split(" ").includes(t.value)));
    if (t.matches("[data-cat-select]")) {
      const f = t.form, sel = f && f.querySelector("[data-sub-select]");
      if (sel) {
        sel.value = "";
        let any = false;
        $$("optgroup", sel).forEach((g) => { const on = g.dataset.subCat === t.value; g.hidden = !on; g.disabled = !on; any = any || on; });
        f.querySelector("[data-sub-box]").hidden = !any;
      }
    }
    if (t.id === "staffRole") $$("[data-role-fields]").forEach((f) => (f.hidden = f.dataset.roleFields !== t.value));
    if (t.dataset.coverFile && t.files[0]) {
      const key = t.dataset.coverFile;
      toast("جارٍ رفع الصورة…");
      readImage(t.files[0], 1280, 0.8).then((url) => MH.cloud.uploadImage(url, "covers")).then((url) => setCover(key, url)).catch(() => toast("تعذّرت قراءة الصورة، جرّب ملفًا آخر", "warn"));
    }
    if (t.id === "lessonImage" && t.files[0]) {
      const btn = $("#lessonForm button.btn"); if (btn) btn.disabled = true;
      toast("جارٍ رفع الصورة…");
      readImage(t.files[0]).then((url) => MH.cloud.uploadImage(url, "lessons")).then((url) => {
        if (btn) btn.disabled = false;
        $("#lessonForm [name=image]").value = url;
        $("#imgPreview img").src = url; $("#imgPreview").hidden = false;
      }).catch(() => { if (btn) btn.disabled = false; toast("تعذّرت قراءة الصورة، جرّب ملفًا آخر", "warn"); });
    }
  });
  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.id === "studentSearch") {
      const k = norm(t.value); let n = 0;
      $$("tr[data-search]").forEach((r) => { const hit = !k || r.dataset.search.includes(k); r.hidden = !hit; if (hit) n++; });
      const none = $("#studentNone"); if (none) none.hidden = n > 0;
    }
    if (e.target.name === "vFrom" || e.target.name === "vTo") {
      const f = e.target.form;
      const n = verseCount({ from: Number(f.vFrom.value), to: Number(f.vTo.value) });
      $("#vCount").textContent = n ? versesWord(n) : "—";
    }
  });

  document.addEventListener("submit", async (e) => {
    const f = e.target;
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f).entries());

    if (f.id === "staffLogin") {
      const email = (v.email || "").trim().toLowerCase();
      const g = (state.loginGuard[email] = state.loginGuard[email] || { n: 0, until: 0 });
      if (Date.now() < g.until) { toast(`تم إيقاف المحاولات مؤقتًا، أعد المحاولة بعد ${Math.ceil((g.until - Date.now()) / 60000)} دقائق`, "warn"); return; }
      const btn = f.querySelector("button.btn"); if (btn) btn.disabled = true;
      const r = await MH.cloud.signIn(email, v.password, true);
      if (btn) btn.disabled = false;
      const acc = !r.error && currentStaff();
      if (!acc) {
        if (r.error === "net" || r.error === "offline") { toast(MH.cloud.msg(r.error), "warn"); return; }
        g.n += 1;
        if (g.n >= MAX_FAILS) { g.until = Date.now() + LOCK_MINUTES * 60000; g.n = 0; }
        save();
        toast("البريد أو كلمة المرور غير صحيحة، أو أن الحساب لا يملك صلاحية الإدارة", "warn");
        return;
      }
      delete state.loginGuard[email];
      logAction("تسجيل الدخول إلى اللوحة", acc); save();
      toast("مرحبًا، " + acc.name);
      location.hash = acc.role === "treasurer" ? "#/finance" : "#/overview"; route();
      return;
    }

    switch (f.id) {
      case "selfPwd": {
        if (!guard("account:self", {}, "تغيير كلمة المرور")) break;
        const acc = currentStaff();
        if (v.next !== v.confirm) { toast("كلمتا المرور الجديدتان غير متطابقتين", "warn"); break; }
        const r = await MH.cloud.changeMyPassword(v.current, v.next);
        if (r.error) { toast(MH.cloud.msg(r.error), "warn"); break; }
        done("تم تغيير كلمة المرور", "تغيير كلمة المرور الخاصة"); f.reset();
        break;
      }
      case "staffForm": {
        if (!guard("staff:manage", {}, "إنشاء أو تعديل حساب إداري")) break;
        const me = currentStaff();
        const email = v.email.trim().toLowerCase();
        const ed = state.staff.find((s) => s.id === f.dataset.edit);
        if (state.staff.some((s) => s.email.toLowerCase() === email && s !== ed)) { toast("هذا البريد مستخدم لحساب آخر", "warn"); break; }
        if (state.users.some((u) => (u.email || "").toLowerCase() === email)) { toast("هذا البريد لحساب طالب؛ استخدم بريدًا إداريًا مختلفًا", "warn"); break; }
        const role = ed && ed.id === me.id ? ed.role : v.role;
        if (!ROLES[role] || role === "student") { toast("دور غير صالح", "warn"); break; }
        if (ed && ed.role === "owner" && role !== "owner" && !state.staff.some((s) => s.role === "owner" && !s.disabled && s !== ed)) { toast("يجب أن يبقى مدير عام مفعّل واحد على الأقل", "warn"); break; }
        const perms = role === "supervisor" ? Object.keys(PERMS).filter((k) => v["perm_" + k]) : [];
        const subjects = role === "teacher" ? MH.topicsAll().map((c) => c.id).filter((k) => v["subj_" + k]) : [];
        if (role === "teacher" && !subjects.length && !v.teacherId) { toast("اختر مادة واحدة على الأقل يدرّسها المعلم", "warn"); break; }
        const data = { name: v.name.trim(), email, role, perms, subjects, teacherId: role === "teacher" ? (v.teacherId || null) : null };
        if (ed) {
          if (v.password) {
            const r = await MH.cloud.setPassword(ed.id, v.password, false);
            if (r.error) { toast(MH.cloud.msg(r.error), "warn"); break; }
          }
          Object.assign(ed, data);
          done("تم حفظ الحساب", `تعديل حساب ${email} (${ROLES[role].label})`);
          location.hash = "#/staff";
        } else {
          const r = await MH.cloud.createStaff(data, v.password);
          if (r.error) { toast(MH.cloud.msg(r.error), "warn"); break; }
          done("تم إنشاء الحساب", `إنشاء حساب ${email} (${ROLES[role].label})`);
          route();
        }
        break;
      }
      case "addSeries":
        if (!guard("content:structure", {}, "إضافة سلسلة")) break;
        if (state.series.some((x) => x.id !== f.dataset.edit && norm(x.name) === norm(v.name))) { toast("توجد سلسلة بهذا الاسم مسبقًا", "warn"); break; }
        if (f.dataset.edit) {
          const ed = seriesOf(f.dataset.edit); if (!ed) break;
          Object.assign(ed, { name: v.name.trim(), cat: v.cat, sub: MH.subsOf(v.cat).some((x) => x.id === v.sub) ? v.sub : "", matn: (v.matn || "").trim(), author: (v.author || "").trim(), desc: (v.desc || "").trim(), nazm: !!v.nazm });
          done("تم حفظ السلسلة", "تعديل سلسلة: " + ed.name); location.hash = "#/courses"; break;
        }
        state.series.push({ id: uid("s"), name: v.name.trim(), cat: v.cat, sub: MH.subsOf(v.cat).some((x) => x.id === v.sub) ? v.sub : "", matn: (v.matn || "").trim(), author: (v.author || "").trim(), desc: (v.desc || "").trim(), nazm: !!v.nazm });
        done("تمت إضافة السلسلة", "إضافة سلسلة: " + v.name.trim()); route();
        break;
      case "addCourse": {
        if (!guard("content:structure", {}, "إضافة قائمة تشغيل")) break;
        if (state.courses.some((x) => x.id !== f.dataset.edit && x.series === v.series && norm(x.title) === norm(v.title))) { toast("توجد قائمة تشغيل بهذا العنوان في السلسلة نفسها", "warn"); break; }
        if (f.dataset.edit) {
          const ed = course(f.dataset.edit); if (!ed) break;
          Object.assign(ed, { title: v.title.trim(), desc: v.desc.trim(), series: v.series, teacher: v.teacher, level: v.level, color: v.color });
          done("تم حفظ قائمة التشغيل", "تعديل قائمة تشغيل: " + ed.title); location.hash = "#/courses"; break;
        }
        const id = uid("c");
        state.courses.push({ id, title: v.title.trim(), desc: v.desc.trim(), series: v.series, teacher: v.teacher, level: v.level, color: v.color, lessons: [] });
        done("تمت إضافة قائمة التشغيل — أضف دروسها الآن", "إضافة قائمة تشغيل: " + v.title.trim());
        location.hash = "#/lessons?c=" + id;
        break;
      }
      case "lessonForm": {
        const cid = f.dataset.course;
        if (!guard("content:lessons", { courseId: cid }, "حفظ درس")) break;
        if (v.video && !ytId(v.video)) { toast("رابط يوتيوب غير صالح", "warn"); break; }
        if (v.audio && !/^https:\/\/\S+$/i.test(v.audio.trim())) { toast("رابط التسجيل الصوتي يجب أن يبدأ بـ https://", "warn"); break; }
        let verses = null;
        if (v.hasVerses) {
          verses = { from: Number(v.vFrom), to: Number(v.vTo) };
          if (!verseCount(verses)) { toast("تحقق من رقمي بداية الأبيات ونهايتها", "warn"); break; }
        }
        const list = (k) => (v[k] || "").split("\n").map((x) => x.trim()).filter(Boolean);
        const lesson = {
          num: Number(v.num), title: v.title.trim(), topic: v.topic.trim(), duration: v.duration.trim(),
          video: v.video.trim(), audio: (v.audio || "").trim(), image: v.image || "", summary: v.summary.trim(), verses,
          notes: {
            fawaid: list("fawaid"), masail: list("masail"), tanbihat: [], refs: list("refs"),
            definitions: list("definitions").map((x) => { const m = x.match(/^([^:：]+)[:：]\s*(.*)$/); return m ? { term: m[1].trim(), def: m[2].trim() } : { term: x, def: "" }; }),
          },
        };
        const c = course(cid);
        const editId = f.dataset.edit;
        const twin = c.lessons.find((l) => l.id !== editId && (l.num === lesson.num || (lesson.topic && norm(l.topic) === norm(lesson.topic))));
        if (twin) { toast(`يوجد درس ${twin.num === lesson.num ? "بالرقم نفسه" : "بالموضوع نفسه"}: «${twin.topic}» (الدرس ${twin.num})`, "warn"); break; }
        if (editId) Object.assign(c.lessons.find((l) => l.id === editId), lesson);
        else c.lessons.push(Object.assign({ id: uid("l") }, lesson));
        c.lessons.sort((a, b) => a.num - b.num);
        logAction(`${editId ? "تعديل" : "إضافة"} درس «${lesson.topic}» في ${c.title}`);
        if (!save()) { toast("تعذّر الحفظ: مساحة المتصفح ممتلئة، جرّب صورة أصغر", "warn"); break; }
        toast(editId ? "تم حفظ بطاقة الدرس" : "تمت إضافة الدرس");
        location.hash = "#/lessons?c=" + c.id;
        if (!editId) route();
        break;
      }
      case "libForm": {
        if (!guard("library:manage", { cat: v.cat }, "حفظ مادة في المكتبة")) break;
        const type = ["book", "video", "audio", "text", "file"].includes(v.type) ? v.type : "text";
        const sub = type !== "book" && MH.subsOf(v.cat).some((x) => x.id === v.sub) ? v.sub : "";
        const httpsOk = (u) => !u || /^https:\/\/\S+$/i.test(u);
        if (type === "video" && v.video && !ytId(v.video)) { toast("رابط يوتيوب غير صالح", "warn"); break; }
        if (type === "audio" && !httpsOk((v.src || "").trim())) { toast("رابط الملف الصوتي يجب أن يبدأ بـ https://", "warn"); break; }
        if (type === "audio" && !(v.src || "").trim()) { toast("ضع رابط الملف الصوتي", "warn"); break; }
        if (type === "text" && !(v.content || "").trim() && !(v.file || "").trim()) { toast("اكتب النص أو ضع رابط الملف", "warn"); break; }
        if (!httpsOk((v.file || "").trim())) { toast("رابط الملف يجب أن يبدأ بـ https://", "warn"); break; }
        const eid = f.dataset.edit;
        const prev = eid ? state.library.find((x) => x.id === eid) : null;
        /* ملف الكتاب: يُرفع إلى مساحة الكتب في الخادم، ويُحذف الملف القديم عند الاستبدال */
        let book = null;
        const pdf = f.pdf && f.pdf.files && f.pdf.files[0];
        if (type === "book" || type === "file") {
          if (pdf) {
            const btn = f.querySelector("button.btn"); if (btn) { btn.disabled = true; btn.textContent = "جارٍ رفع الكتاب…"; }
            const r = await MH.cloud.uploadBook(pdf);
            if (btn) { btn.disabled = false; btn.textContent = eid ? "حفظ التعديل" : type === "book" ? "إضافة إلى المكتبة" : "إضافة المادة"; }
            if (r.error) { toast(MH.cloud.msg(r.error), "warn"); break; }
            book = { file: r.url, filePath: r.path, size: r.size };
          } else if ((v.file || "").trim()) book = { file: v.file.trim() };
          else if (prev && prev.type === type && prev.file) book = { file: prev.file, filePath: prev.filePath, size: prev.size };
          else { toast(type === "book" ? "اختر ملف الكتاب (PDF) أو ضع رابطه" : "اختر الملف (PDF) أو ضع رابطه", "warn"); break; }
        }
        if (state.library.some((x) => x.id !== eid && x.cat === v.cat && norm(x.title) === norm(v.title))) { toast("توجد مادة بهذا العنوان في القسم نفسه", "warn"); break; }
        const item = {
          cat: v.cat, sub, type, title: v.title.trim(), author: v.author.trim(), duration: type === "book" ? "" : (v.duration || "").trim(), level: v.level || "", desc: v.desc.trim(),
          video: type === "video" ? (v.video || "").trim() : "", src: type === "audio" ? v.src.trim() : "", content: type === "text" ? (v.content || "").trim() : "",
          file: book ? book.file : (v.file || "").trim(), filePath: book ? book.filePath || "" : "", size: book ? book.size || 0 : 0,
          pages: type === "book" && Number(v.pages) > 0 ? Number(v.pages) : 0,
          points: (v.points || "").split("\n").map((x) => x.trim()).filter(Boolean),
        };
        if (prev && prev.filePath && prev.filePath !== item.filePath) MH.cloud.deleteBook(prev.filePath);
        Object.keys(item).forEach((k) => { if (item[k] === "" || item[k] === 0 || (Array.isArray(item[k]) && !item[k].length)) delete item[k]; });
        if (eid) {
          const ed = state.library.find((x) => x.id === eid); if (!ed) break;
          ["sub", "video", "src", "content", "file", "filePath", "size", "pages", "points", "duration", "level"].forEach((k) => delete ed[k]);
          Object.assign(ed, item);
        } else state.library.unshift(Object.assign({ id: uid("lib") }, item));
        done(eid ? "تم حفظ المادة" : type === "book" ? "تمت إضافة الكتاب إلى المكتبة" : "تمت إضافة المادة إلى القسم", `${eid ? "تعديل" : "إضافة"} ${type === "book" ? "كتاب في المكتبة" : "مادة في المحتوى العلمي"}: ${item.title}`);
        location.hash = "#/" + (type === "book" ? "library" : "content") + "?cat=" + item.cat; route();
        break;
      }
      case "planHead": {
        if (!guard("content:structure", {}, "تعديل المخطط السنوي")) break;
        state.plan = Object.assign({ items: [] }, state.plan, { title: v.title.trim(), theme: v.theme.trim() });
        done("تم الحفظ", "تعديل عنوان المخطط السنوي"); route();
        break;
      }
      case "planForm": {
        if (!guard("content:structure", {}, "حفظ مهمة في المخطط")) break;
        const month = v.all ? "all" : (v.month || "").trim();
        if (!month) { toast("اختر الشهر أو «طوال العام»", "warn"); break; }
        state.plan = Object.assign({ title: "", theme: "", items: [] }, state.plan);
        const item = { month, kind: v.kind, title: v.title.trim(), committee: (v.committee || "").trim(), note: (v.note || "").trim() };
        if (!item.note) delete item.note;
        const eid = f.dataset.edit;
        if (eid) { const it = state.plan.items.find((x) => x.id === eid); if (!it) break; delete it.note; Object.assign(it, item); }
        else state.plan.items.push(Object.assign({ id: uid("pl") }, item));
        done(eid ? "تم حفظ المهمة" : "تمت إضافة المهمة", `${eid ? "تعديل" : "إضافة"} مهمة في المخطط السنوي: ${item.title}`);
        location.hash = "#/plan"; route();
        break;
      }
      case "topicForm": {
        if (!guard("content:structure", {}, "حفظ موضوع")) break;
        state.topics = MH.topicsAll().slice();
        const eid = f.dataset.edit;
        const name = v.name.trim();
        if (state.topics.some((x) => x.id !== eid && norm(x.name) === norm(name))) { toast("يوجد قسم بهذا الاسم", "warn"); break; }
        const group = TOPIC_GROUPS.some((g) => g.id === v.group) ? v.group : TOPIC_GROUPS[0].id;
        /* الأبواب: يُحافظ على معرّف الباب إن بقي اسمه، أو عُدّل اسمه في السطر نفسه */
        const lines = [...new Set((v.subs || "").split("\n").map((x) => x.trim()).filter(Boolean))];
        const oldSubs = eid ? ((state.topics.find((x) => x.id === eid) || {}).subs || []) : [];
        const taken = new Set();
        const subs = lines.map((nm, i) => {
          let o = oldSubs.find((x) => !taken.has(x.id) && norm(x.name) === norm(nm));
          if (!o && oldSubs[i] && !taken.has(oldSubs[i].id) && !lines.some((l) => norm(l) === norm(oldSubs[i].name))) o = oldSubs[i];
          const id = o ? o.id : uid("sb");
          taken.add(id);
          return { id, name: nm };
        });
        if (eid) { const tp = state.topics.find((x) => x.id === eid); if (!tp) break; Object.assign(tp, { name, desc: (v.desc || "").trim(), group, subs }); }
        else state.topics.push({ id: uid("t"), name, desc: (v.desc || "").trim(), group, subs });
        done(eid ? "تم حفظ القسم" : "تمت إضافة القسم — اختر له صورة من الأسفل", (eid ? "تعديل" : "إضافة") + " قسم علمي: " + name);
        location.hash = "#/topics"; route();
        break;
      }
      case "homeForm": {
        if (!guard("content:structure", {}, "تعديل الصفحة الرئيسية")) break;
        state.settings.home = Object.assign({}, state.settings.home || {}, {
          libTitle: v.libTitle.trim(), libSlogan: v.libSlogan.trim().replace(/^«|»$/g, ""),
          spaceTitle: v.spaceTitle.trim(), spaceSlogan: v.spaceSlogan.trim().replace(/^«|»$/g, ""),
          whatsapp: String(v.whatsapp || "").replace(/[٠-٩]/g, (c) => "٠١٢٣٤٥٦٧٨٩".indexOf(c)).replace(/\D/g, "").replace(/^00/, ""),
        });
        state.noor = Object.assign({}, JSON.parse(JSON.stringify(state.noor || DEFAULT_NOOR)), {
          title: (v.noorTitle || "").trim() || DEFAULT_NOOR.title,
          slogan: (v.noorSlogan || "").trim().replace(/^«|»$/g, "") || DEFAULT_NOOR.slogan,
          mission: (v.noorMission || "").trim() || DEFAULT_NOOR.mission,
        });
        done("تم حفظ نصوص الصفحة الرئيسية", "تعديل نصوص الصفحة الرئيسية"); route();
        break;
      }
      case "programForm": {
        const eid = f.dataset.edit;
        if (!guard("programs:manage", eid ? { programId: eid } : {}, "حفظ دورة")) break;
        const pls = state.courses.filter((c) => v["pl_" + c.id]).map((c) => c.id);
        if (!pls.length) { toast("اختر قائمة تشغيل واحدة على الأقل لتكون وحدات الدورة", "warn"); break; }
        const data = { title: v.title.trim(), desc: v.desc.trim(), goals: (v.goals || "").split("\n").map((x) => x.trim()).filter(Boolean),
          teacher: v.teacher, topic: v.topic, level: v.level || "", playlists: pls, conditions: (v.conditions || "").trim(), hidden: !!v.hidden };
        state.programs = MH.programsAll();
        if (state.programs.some((x) => x.id !== eid && norm(x.title) === norm(data.title))) { toast("توجد دورة بهذا الاسم", "warn"); break; }
        if (eid) { const ed = MH.programRaw(eid); if (!ed) break; Object.assign(ed, data); }
        else state.programs.push(Object.assign({ id: uid("p"), quiz: [] }, data));
        const id = eid || state.programs[state.programs.length - 1].id;
        done(eid ? "تم حفظ الدورة" : "تمت إضافة الدورة — أضف أسئلة امتحانها الآن", `${eid ? "تعديل" : "إضافة"} دورة: ${data.title}`);
        location.hash = "#/programs?p=" + id; route();
        break;
      }
      case "quizForm": {
        const cid = f.dataset.course;
        if (!guard("programs:manage", { programId: cid.split("@")[0] }, "حفظ سؤال اختبار")) break;
        const qh = quizHolder(cid, true); if (!qh) break;
        const c = qh.h; const ctitle = qh.pg.title + (cid.includes("@") ? " (اختبار مرحلي)" : "");
        const raw = [0, 1, 2, 3].map((i) => ({ i, t: (v["o" + i] || "").trim() }));
        const kept = raw.filter((x) => x.t);
        if (kept.length < 2) { toast("اكتب خيارين على الأقل", "warn"); break; }
        const ans = kept.findIndex((x) => x.i === Number(v.answer));
        if (ans < 0) { toast("اختر الإجابة الصحيحة من بين الخيارات المكتوبة", "warn"); break; }
        if (new Set(kept.map((x) => norm(x.t))).size !== kept.length) { toast("في الخيارات خياران متطابقان", "warn"); break; }
        const q = { q: v.q.trim(), options: kept.map((x) => x.t), answer: ans };
        c.quiz = c.quiz || [];
        const ei = f.dataset.edit;
        if (c.quiz.some((x, i) => String(i) !== ei && norm(x.q) === norm(q.q))) { toast("هذا السؤال موجود في الاختبار", "warn"); break; }
        if (ei !== "" && c.quiz[Number(ei)]) c.quiz[Number(ei)] = q;
        else { c.quiz = c.quiz.filter((x) => !isPlaceholderQ(x)); c.quiz.push(q); }
        done(ei !== "" ? "تم حفظ السؤال" : "تمت إضافة السؤال", `${ei !== "" ? "تعديل" : "إضافة"} سؤال في اختبار ${ctitle}`);
        location.hash = "#/programs?p=" + cid; route();
        setTimeout(() => { const b = $(cid.includes("@") ? "#stage-" + cid.split("@")[1] : "#quizBox"); if (b) b.scrollIntoView(); }, 0);
        break;
      }
      case "addTeacher":
        if (!guard("people:manage", {}, "إضافة معلم")) break;
        if (state.teachers.some((x) => x.id !== f.dataset.edit && norm(x.name) === norm(v.name))) { toast("يوجد معلم بهذا الاسم مسبقًا", "warn"); break; }
        if (f.dataset.edit) {
          const ed = state.teachers.find((x) => x.id === f.dataset.edit); if (!ed) break;
          Object.assign(ed, { name: v.name.trim(), spec: v.spec.trim(), email: v.email || "" });
          done("تم حفظ بيانات المعلم", "تعديل معلم: " + ed.name); location.hash = "#/people"; break;
        }
        state.teachers.push({ id: uid("t"), name: v.name.trim(), spec: v.spec.trim(), email: v.email || "" });
        done("تمت إضافة المعلم", "إضافة معلم: " + v.name.trim()); route();
        break;
      case "regSettings":
        if (!guard("ann:manage", {}, "تغيير حالة التسجيل")) break;
        state.settings.regOpen = !!v.regOpen;
        state.settings.regNote = (v.regNote || "").trim();
        done(state.settings.regOpen ? "باب التسجيل مفتوح الآن" : "تم إغلاق التسجيل", (state.settings.regOpen ? "فتح" : "إغلاق") + " باب التسجيل: " + state.settings.regNote); route();
        break;
      case "addAnn":
        if (!guard("ann:manage", {}, "نشر إعلان")) break;
        const date = /^\d{4}-\d{2}-\d{2}$/.test(v.date || "") ? v.date : today();
        const item = { title: v.title.trim(), body: v.body.trim(), date, pinned: !!v.pinned };
        const ed = f.dataset.edit && state.announcements.find((a) => a.id === f.dataset.edit);
        if (ed) Object.assign(ed, item); else state.announcements.push(Object.assign({ id: uid("a") }, item));
        /* الأحدث أولًا، فيظهر الترتيب نفسه في الموقع واللوحة */
        state.announcements.sort((a, b) => (b.pinned - a.pinned) || b.date.localeCompare(a.date));
        done(ed ? "تم حفظ الإعلان" : "تم نشر الإعلان", (ed ? "تعديل إعلان: " : "نشر إعلان: ") + item.title);
        if (location.hash !== "#/ann") location.hash = "#/ann"; else route();
        break;
    }
  });

  /* تحديث فوري إذا تغيّرت البيانات أو الجلسة من تبويب آخر */
  window.addEventListener("storage", (e) => {
    if (e.key !== MH.KEY) return;
    try { const fresh = JSON.parse(e.newValue || "{}"); Object.keys(state).forEach((k) => delete state[k]); Object.assign(state, fresh); } catch (e2) { /* */ }
    route();
  });
  { const th = $("#themeToggle"); if (th) th.innerHTML = ic("moon"); }
  window.addEventListener("hashchange", route);
  setInterval(() => { if (!currentStaff() && !document.body.classList.contains("adm-out")) route(); }, 60000);
  MH.cloud.whenReady(route);
})();
