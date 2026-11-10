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
    seriesOf, catOf, pad2, verseCount, versesWord, lessonName, hasNotes, playlistsOf, readImage,
    ROLES, PERMS, SESSION_HOURS, MAX_FAILS, LOCK_MINUTES, hashPassword, verifyPassword,
    currentStaff, can, scopedCourses, logAction, contactOf,
  } = MH;

  const TABS = [
    ["overview", "نظرة عامة", "📊", "overview:view"],
    ["courses", "السلاسل وقوائم التشغيل", "📚", "content:structure"],
    ["lessons", "الدروس وبطاقات البيانات", "🎬", "content:lessons"],
    ["people", "الطلاب والمعلمون", "👥", "people:view"],
    ["results", "التسجيلات والنتائج", "📝", "results:view"],
    ["ann", "الإعلانات", "📢", "ann:manage"],
    ["staff", "الحسابات والصلاحيات", "🔐", "staff:manage"],
    ["audit", "سجل العمليات", "🧾", "audit:view"],
  ];

  /* حارس كل عملية: جلسة صالحة + صلاحية فعلية، وإلا تُرفض العملية وتُسجّل */
  function guard(action, ctx, what) {
    const acc = currentStaff();
    if (!acc) { state.staffSession = null; save(); toast("انتهت الجلسة أو أُوقف الحساب، سجّل الدخول من جديد", "warn"); route(); return false; }
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
          <p class="muted">هذه المساحة مخصصة للمدير العام والمشرفين والمعلمين. حسابات الطلاب لا تملك صلاحية الدخول.</p>
        </div>
        <label>البريد الإلكتروني<input type="email" name="email" required autocomplete="username" dir="ltr"></label>
        <label>كلمة المرور<input type="password" name="password" required autocomplete="current-password" dir="ltr"></label>
        <button class="btn block">دخول</button>
        <details class="note"><summary>حسابات تجريبية</summary>
          <p dir="ltr" class="demo-accs">admin@mahajja.org — Admin@2026<br>supervisor@mahajja.org — Super@2026<br>teacher@mahajja.org — Teach@2026</p>
          <p>المدير العام: كل شيء · المشرف: المحتوى والطلاب والإعلانات · المعلم: دروس دوراته وطلابه فقط.</p>
        </details>
        <a class="link center-text" href="../">← العودة إلى الموقع</a>
      </form>
    </section>`;
  }

  const viewForbidden = (label) => `
      <div class="empty forbidden"><span>⛔</span><h2>غير مصرّح</h2>
      <p>حسابك لا يملك صلاحية الوصول إلى «${esc(label)}». تواصل مع المدير العام إن كنت تحتاجها.</p>
      <a class="btn" href="#/overview">العودة إلى النظرة العامة</a></div>`;

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
    return `
      <h1 class="adm-title">مرحبًا، ${esc(acc.name)}</h1>
      <p class="muted">دورك: <b>${ROLES[acc.role].label}</b> — ${esc(ROLES[acc.role].desc)}${acc.role === "teacher" ? " تظهر لك بيانات دوراتك فقط." : ""}</p>
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
          <h3>صلاحياتك</h3>
          <ul class="perm-list">${allowed.map((t) => `<li>✓ ${esc(t)}</li>`).join("")}</ul>
        </div>
      </div>
      <form class="box form mt narrow-form" id="selfPwd">
        <h3>حسابي: تغيير كلمة المرور</h3>
        <label>كلمة المرور الحالية<input type="password" name="current" required autocomplete="current-password" dir="ltr"></label>
        <div class="row">
          <label>كلمة المرور الجديدة<input type="password" name="next" required minlength="8" autocomplete="new-password" dir="ltr"></label>
          <label>تأكيدها<input type="password" name="confirm" required minlength="8" autocomplete="new-password" dir="ltr"></label>
        </div>
        <button class="btn">تغيير كلمة المرور</button>
      </form>`;
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
            <td class="nowrap"><a class="link" href="../#/series/${s.id}" target="_blank" rel="noopener">عرض</a> · <button class="link danger" data-del-series="${s.id}">حذف</button></td></tr>`).join("")}</tbody>
        </table></div>
      </div>
      <div class="box mt">
        <h3>قوائم التشغيل</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>قائمة التشغيل</th><th>السلسلة</th><th>المعلم</th><th>الدروس</th><th></th></tr></thead>
          <tbody>${state.courses.map((c) => `<tr><td><b>${esc(c.title)}</b></td><td>${esc(seriesName(c.series))}</td><td>${esc((teacher(c.teacher) || {}).name || "—")}</td><td>${arNum(c.lessons.length)}</td>
            <td class="nowrap"><a class="link" href="#/lessons?c=${c.id}">الدروس</a> · <button class="link danger" data-del-course="${c.id}">حذف</button></td></tr>`).join("")}</tbody>
        </table></div>
      </div>`;
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
    return `
      <h1 class="adm-title">الدروس وبطاقات البيانات</h1>
      <label class="inline">قائمة التشغيل:
        <select id="lessonCourse">${mine.map((x) => `<option value="${x.id}" ${x.id === c.id ? "selected" : ""}>${esc(seriesName(x.series))} ← ${esc(x.title)}</option>`).join("")}</select>
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
            <td class="nowrap"><a class="link" href="#/lessons?c=${c.id}&edit=${l.id}">تعديل</a> · <a class="link" href="../#/lesson/${c.id}/${l.id}" target="_blank" rel="noopener">عرض</a> · <button class="link danger" data-del-lesson="${c.id}|${l.id}">حذف</button></td></tr>`).join("") || `<tr><td colspan="8" class="muted">لا توجد دروس.</td></tr>`}</tbody>
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
          ${editing ? `<a class="btn ghost" href="#/lessons?c=${c.id}">إلغاء التعديل</a>` : ""}
        </div>
        <p class="note">ⓘ الصور تُضغط تلقائيًا وتُحفظ في متصفحك فقط (نسخة تجريبية دون خادم).</p>
      </form>`;
  }


  let tempNotice = null; // تظهر مرة واحدة بعد توليد كلمة مرور مؤقتة
  function admPeople() {
    const shownNotice = tempNotice; setTimeout(() => { if (tempNotice === shownNotice) tempNotice = null; }, 0);
    const acc = currentStaff();
    const cs = scopedCourses(acc);
    const st = allStudents().filter((u) => acc.role !== "teacher" || cs.some((c) => u.enrolled[c.id]));
    const teachers = acc.role === "teacher" ? state.teachers.filter((t) => t.id === acc.teacherId) : state.teachers;
    return `
      <h1 class="adm-title">${acc.role === "teacher" ? "طلابي" : "الطلاب والمعلمون"}</h1>
      ${tempNotice ? `<div class="box temp-pw"><b>كلمة المرور المؤقتة للطالب «${esc(tempNotice.name)}»:</b> <code dir="ltr">${esc(tempNotice.pw)}</code>
        <p class="muted small">أبلغ الطالب بها عبر رقمه المسجّل (${esc(tempNotice.contact)}). سيدخل بها، ثم يُطلب منه اختيار كلمة مرور جديدة. لن تظهر هذه الكلمة مرة أخرى.</p></div>` : ""}
      <div class="box">
        <h3>الطلاب (${arNum(st.length)})</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>الاسم</th><th>الهاتف / البريد</th><th>تاريخ الانضمام</th><th>${acc.role === "teacher" ? "دوراتي المسجل فيها" : "الدورات"}</th>${can("people:manage") ? "<th></th>" : ""}</tr></thead>
          <tbody>${st.map((u) => `<tr><td><b>${esc(u.name)}</b>${u.id.startsWith("u-demo") ? ` <span class="tag soft">تجريبي</span>` : ""}</td><td dir="ltr">${esc(contactOf(u))}</td><td>${fmtDate(u.joined)}</td>
            <td>${acc.role === "teacher" ? cs.filter((c) => u.enrolled[c.id]).map((c) => esc(c.title)).join("، ") : arNum(Object.keys(u.enrolled).length)}</td>
            ${can("people:manage") ? `<td class="nowrap">${state.users.includes(u) ? `<button class="link" data-reset-student="${u.id}">كلمة مرور مؤقتة</button>${u.mustChangePw ? ` <span class="tag soft">بانتظار تغييرها</span>` : ""}` : `<span class="muted small">—</span>`}</td>` : ""}</tr>`).join("") || `<tr><td colspan="5" class="muted">لا يوجد طلاب.</td></tr>`}</tbody>
        </table></div>
      </div>
      <div class="grid two mt">
        <div class="box">
          <h3>المعلمون (${arNum(teachers.length)})</h3>
          <ul class="simple">${teachers.map((t) => `<li><b>${esc(t.name)}</b><span class="muted">${esc(t.spec)} · ${arNum(state.courses.filter((c) => c.teacher === t.id).length)} دورات</span></li>`).join("")}</ul>
        </div>
        ${can("people:manage") ? `<form class="box form" id="addTeacher">
          <h3>إضافة معلم</h3>
          <label>الاسم<input name="name" required></label>
          <label>التخصص<input name="spec" required></label>
          <label>البريد<input type="email" name="email" dir="ltr"></label>
          <button class="btn">إضافة</button>
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
            <td>${r ? `${arNum(r.score)}/${arNum(r.total)}` : "—"}</td>
            <td>${r ? (passed(r) ? `<span class="tag ok">ناجح</span>` : `<span class="tag bad">لم ينجح</span>`) : p === 100 ? `<span class="tag soft">بانتظار الاختبار</span>` : `<span class="tag soft">قيد الدراسة</span>`}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">لا توجد تسجيلات.</td></tr>`}</tbody>
        </table></div>
      </div>`;
  }

  function admAnn() {
    return `
      <h1 class="adm-title">الإعلانات</h1>
      <form class="box form reg-settings" id="regSettings">
        <h3>حالة التسجيل في المعهد</h3>
        <label class="check"><input type="checkbox" name="regOpen" ${state.settings.regOpen ? "checked" : ""}> باب التسجيل مفتوح للطلاب الجدد</label>
        <label>نص الإعلان (يظهر في شريط الموقع وفي الواجهة)<input name="regNote" value="${esc(state.settings.regNote || "")}" maxlength="90" required></label>
        <button class="btn">حفظ</button>
        <p class="note">ⓘ عند الإغلاق يختفي إعلان التسجيل، ولا تُنشأ حسابات جديدة، ويبقى الطلاب الحاليون قادرين على الدخول والدراسة.</p>
      </form>
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


  /* ---------------- الحسابات والصلاحيات (المدير العام) ---------------- */
  function admStaff() {
    const me = currentStaff();
    const params = new URLSearchParams((location.hash.split("?")[1]) || "");
    const ed = state.staff.find((s) => s.id === params.get("edit"));
    const S0 = ed || { name: "", email: "", role: "supervisor", perms: ["content"], teacherId: "" };
    const roleOpts = ["owner", "supervisor", "teacher"].map((r) => `<option value="${r}" ${S0.role === r ? "selected" : ""}>${ROLES[r].label}</option>`).join("");
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
            <td><span class="tag role-${s.role}">${ROLES[s.role].label}</span></td>
            <td class="small">${s.role === "owner" ? "كل الصلاحيات" : s.role === "teacher" ? `دروس وطلاب: ${esc((teacher(s.teacherId) || {}).name || "—")}` : (s.perms || []).map((p) => esc(PERMS[p])).join("<br>") || "—"}</td>
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
          <legend>ربط الحساب بمعلم</legend>
          <label>المعلم<select name="teacherId">${state.teachers.map((t) => `<option value="${t.id}" ${S0.teacherId === t.id ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select></label>
          <p class="note">ⓘ يرى المعلم ويعدّل دروس الدورات المسندة إليه فقط، ويتابع طلابها.</p>
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
      <div class="box danger-zone"><b>إعادة ضبط البيانات التجريبية</b><p class="muted small">يعيد كل المحتوى والحسابات والسجل إلى حالتها الأولى في هذا المتصفح. للمدير العام فقط.</p>
        <button class="btn ghost" id="resetDemo">إعادة الضبط</button></div>
      <p class="muted">آخر ${arNum(Math.min(rows.length, 300))} عملية إدارية، بما فيها محاولات الدخول الفاشلة والعمليات المرفوضة.</p>
      <div class="box"><div class="table-wrap"><table>
        <thead><tr><th>الوقت</th><th>الحساب</th><th>الدور</th><th>العملية</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><td class="nowrap small">${new Date(r.at).toLocaleString("ar")}</td><td>${esc(r.who)}</td><td>${r.role ? ROLES[r.role]?.label || "" : "—"}</td><td>${esc(r.text)}</td></tr>`).join("") || `<tr><td colspan="4" class="muted">لا توجد عمليات بعد.</td></tr>`}</tbody>
      </table></div></div>`;
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
    user.innerHTML = `<span class="adm-who"><b>${esc(acc.name)}</b><small>${ROLES[acc.role].label}</small></span>
      <a class="btn sm ghost-light" href="../" target="_blank" rel="noopener">عرض الموقع ↗</a>
      <button class="btn sm" id="staffLogout">خروج</button>`;
    const raw = location.hash.slice(1) || "/overview";
    const tabId = raw.split("?")[0].split("/").filter(Boolean)[0] || "overview";
    const tab = TABS.find((t) => t[0] === tabId) || TABS[0];
    const views = { overview: admOverview, courses: admCourses, lessons: admLessons, people: admPeople, results: admResults, ann: admAnn, staff: admStaff, audit: admAudit };
    const body = can(tab[3]) ? views[tab[0]]() : (logAction("محاولة فتح صفحة غير مصرّح بها: " + tab[1], acc), save(), viewForbidden(tab[1]));
    $("#app").innerHTML = `
    <section class="admin">
      <aside class="adm-side">
        <nav>${TABS.filter((t) => can(t[3])).map(([k, t, i]) => `<a href="#/${k}" class="${tab[0] === k ? "on" : ""}"><span>${i}</span>${t}</a>`).join("")}</nav>
      </aside>
      <div class="adm-main">${body}</div>
    </section>`;
    window.scrollTo(0, 0);
  }

  /* ---------------- الأحداث ---------------- */
  document.addEventListener("click", (e) => {
    const t = e.target.closest("button, a");
    if (!t) return;
    const d = t.dataset;
    if (t.id === "staffLogout") {
      logAction("تسجيل الخروج"); state.staffSession = null; save(); toast("تم تسجيل الخروج"); location.hash = ""; route();
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
    } else if (d.delAnn) {
      if (!guard("ann:manage", {}, "حذف إعلان")) return;
      const a = state.announcements.find((x) => x.id === d.delAnn);
      state.announcements = state.announcements.filter((x) => x.id !== d.delAnn); done("تم حذف الإعلان", "حذف إعلان: " + (a ? a.title : "")); route();
    } else if (t.id === "resetDemo") {
      if (!guard("audit:view", {}, "إعادة ضبط البيانات")) return;
      if (!confirmTap(t, "اضغط مرة أخرى للتأكيد")) return;
      MH.resetState(); save(); toast("تمت إعادة ضبط البيانات، سجّل الدخول من جديد"); location.hash = ""; route();
    } else if (d.resetStudent) {
      resetStudentPw(d.resetStudent, t);
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
        state.staff = state.staff.filter((x) => x.id !== id); done("تم حذف الحساب", "حذف حساب: " + s.email);
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
    u.pwd = await hashPassword(pw); delete u.password; u.mustChangePw = true;
    tempNotice = { name: u.name, pw, contact: contactOf(u) };
    done("تم إنشاء كلمة مرور مؤقتة", "كلمة مرور مؤقتة للطالب: " + u.name);
    route();
  }

  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.id === "lessonCourse") location.hash = "#/lessons?c=" + t.value;
    if (t.id === "hasVerses") $("#versesBox").hidden = !t.checked;
    if (t.id === "staffRole") $$("[data-role-fields]").forEach((f) => (f.hidden = f.dataset.roleFields !== t.value));
    if (t.id === "lessonImage" && t.files[0]) {
      readImage(t.files[0]).then((url) => {
        $("#lessonForm [name=image]").value = url;
        $("#imgPreview img").src = url; $("#imgPreview").hidden = false;
      }).catch(() => toast("تعذّرت قراءة الصورة، جرّب ملفًا آخر", "warn"));
    }
  });
  document.addEventListener("input", (e) => {
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
      const acc = state.staff.find((s) => s.email.toLowerCase() === email);
      const ok = acc && !acc.disabled && (await verifyPassword(v.password, acc.pwd));
      if (!ok) {
        g.n += 1;
        if (g.n >= MAX_FAILS) { g.until = Date.now() + LOCK_MINUTES * 60000; g.n = 0; }
        logAction(`محاولة دخول فاشلة إلى اللوحة (${email})`, null); save();
        toast("البريد أو كلمة المرور غير صحيحة، أو أن الحساب لا يملك صلاحية الإدارة", "warn");
        return;
      }
      delete state.loginGuard[email];
      state.staffSession = { id: acc.id, exp: Date.now() + SESSION_HOURS * 3600000 };
      logAction("تسجيل الدخول إلى اللوحة", acc); save();
      toast("مرحبًا، " + acc.name);
      location.hash = "#/overview"; route();
      return;
    }

    switch (f.id) {
      case "selfPwd": {
        if (!guard("account:self", {}, "تغيير كلمة المرور")) break;
        const acc = currentStaff();
        if (!(await verifyPassword(v.current, acc.pwd))) { toast("كلمة المرور الحالية غير صحيحة", "warn"); break; }
        if (v.next !== v.confirm) { toast("كلمتا المرور الجديدتان غير متطابقتين", "warn"); break; }
        acc.pwd = await hashPassword(v.next); done("تم تغيير كلمة المرور", "تغيير كلمة المرور الخاصة"); f.reset();
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
        const data = { name: v.name.trim(), email, role, perms, teacherId: role === "teacher" ? v.teacherId : null };
        if (ed) {
          Object.assign(ed, data);
          if (v.password) ed.pwd = await hashPassword(v.password);
          done("تم حفظ الحساب", `تعديل حساب ${email} (${ROLES[role].label})`);
          location.hash = "#/staff";
        } else {
          state.staff.push(Object.assign({ id: uid("st"), disabled: false, pwd: await hashPassword(v.password) }, data));
          done("تم إنشاء الحساب", `إنشاء حساب ${email} (${ROLES[role].label})`);
          route();
        }
        break;
      }
      case "addSeries":
        if (!guard("content:structure", {}, "إضافة سلسلة")) break;
        state.series.push({ id: uid("s"), name: v.name.trim(), cat: v.cat, matn: (v.matn || "").trim(), author: (v.author || "").trim(), desc: (v.desc || "").trim(), nazm: !!v.nazm });
        done("تمت إضافة السلسلة", "إضافة سلسلة: " + v.name.trim()); route();
        break;
      case "addCourse": {
        if (!guard("content:structure", {}, "إضافة قائمة تشغيل")) break;
        const id = uid("c");
        state.courses.push({ id, title: v.title.trim(), desc: v.desc.trim(), series: v.series, teacher: v.teacher, level: v.level, color: v.color, lessons: [],
          quiz: [{ q: "سؤال تجريبي: هل أتممت دروس الدورة بتركيز؟", options: ["نعم", "لا"], answer: 0 }] });
        done("تمت إضافة قائمة التشغيل — أضف دروسها الآن", "إضافة قائمة تشغيل: " + v.title.trim());
        location.hash = "#/lessons?c=" + id;
        break;
      }
      case "lessonForm": {
        const cid = f.dataset.course;
        if (!guard("content:lessons", { courseId: cid }, "حفظ درس")) break;
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
        const c = course(cid);
        const editId = f.dataset.edit;
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
      case "addTeacher":
        if (!guard("people:manage", {}, "إضافة معلم")) break;
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
        state.announcements.unshift({ id: uid("a"), title: v.title.trim(), body: v.body.trim(), date: today(), pinned: !!v.pinned });
        done("تم نشر الإعلان", "نشر إعلان: " + v.title.trim()); route();
        break;
    }
  });

  /* تحديث فوري إذا تغيّرت البيانات أو الجلسة من تبويب آخر */
  window.addEventListener("storage", (e) => {
    if (e.key !== MH.KEY) return;
    try { const fresh = JSON.parse(e.newValue || "{}"); Object.keys(state).forEach((k) => delete state[k]); Object.assign(state, fresh); } catch (e2) { /* */ }
    route();
  });
  window.addEventListener("hashchange", route);
  setInterval(() => { if (!currentStaff() && !document.body.classList.contains("adm-out")) route(); }, 60000);
  route();
})();
