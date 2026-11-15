/* =========================================================
   منصة المحجة البيضاء — الحضور والحفظ (لوحة الإدارة فقط)
   طلاب المعهد الحضوريون وحلقاتهم · حضور الفترتين الصباحية والمسائية
   · الحفظ الجديد والحفظ القديم (المراجعة) · الأسبوعي · تقرير للطباعة/PDF
   البيانات في Supabase (جداول att_*) ولا يقرؤها أو يعدّلها إلا المدير العام
   والمشرف الممنوح صلاحية «الحضور والحفظ»؛ تفرض ذلك سياسات RLS في الخادم،
   ويُكتب اسم من سجّل ووقت التسجيل في الخادم نفسه.
   يُحمَّل بعد js/cloud.js وقبل js/admin.js.
   ========================================================= */
(function () {
  "use strict";
  const { $$, esc, arNum, toast, today, confirmTap, can, ic } = MH;
  const norm = (t) => String(t || "").replace(/[\u064B-\u065F\u0670\u0640]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").toLowerCase().trim();

  const STATUS = {
    present: { t: "حاضر", cls: "st-present", s: "✓" },
    late: { t: "متأخر", cls: "st-late", s: "⏱" },
    absent: { t: "غائب", cls: "st-absent", s: "✗" },
    excused: { t: "بعذر", cls: "st-excused", s: "ع" },
  };
  const OUT = { out: { t: "خرج", cls: "st-out" }, early: { t: "خرج مبكرًا", cls: "st-early" } };
  const GRADES = ["ممتاز", "جيد جدًا", "جيد", "مقبول", "يعيد"];
  const PERIODS = { am: { t: "الصباح", long: "الفترة الصباحية", icon: "☀" }, pm: { t: "المساء", long: "الفترة المسائية", icon: "☾" } };
  const DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

  const TSTATUS = Object.assign({}, STATUS, { leave: { t: "إجازة", cls: "st-leave", s: "إ" } });
  const TPERIODS = { both: "الصباح والمساء", am: "الصباح فقط", pm: "المساء فقط" };
  let D = null, baseAt = 0, R = new Map(), rangeKey = "", root = null, busy = false;
  let TR = new Map(), trKey = "";

  /* ---------------- أدوات ---------------- */
  const params = () => new URLSearchParams(location.hash.split("?")[1] || "");
  const tab = () => (["am", "pm", "week", "roster", "teachers"].includes(params().get("t")) ? params().get("t") : (new Date().getHours() < 14 ? "am" : "pm"));
  const day = () => (/^\d{4}-\d{2}-\d{2}$/.test(params().get("d") || "") ? params().get("d") : today());
  const grp = () => params().get("g") || "";
  const href = (o) => { const p = params(); Object.entries(o).forEach(([k, v]) => (v == null || v === "" ? p.delete(k) : p.set(k, v))); return "#/attendance?" + p.toString(); };
  const allowed = () => can("attendance:manage");
  const log = (text) => { MH.logAction("الحضور والحفظ: " + text); MH.save(); };
  const key = (sid, d, p) => sid + "|" + d + "|" + p;
  const dObj = (d) => new Date(d + "T12:00:00");
  const iso = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  const addDays = (d, n) => { const x = dObj(d); x.setDate(x.getDate() + n); return iso(x); };
  const weekStart = (d) => { const x = dObj(d); return addDays(d, -((x.getDay() + 1) % 7)); }; // الأسبوع يبدأ السبت
  const dayLabel = (d) => dObj(d).toLocaleDateString("ar", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const shortDay = (d) => `${DAYS[dObj(d).getDay()]} ${arNum(dObj(d).getDate())}`;
  const hm = (ts) => (ts ? new Date(ts).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" }) : "");
  const groupName = (id) => (D.groups.find((g) => g.id === id) || {}).name || "بلا حلقة";
  const activeStudents = () => D.students.filter((s) => s.active !== false && (!grp() || s.group_id === grp()));
  const range = () => (tab() === "week" ? [weekStart(day()), addDays(weekStart(day()), 6)] : [day(), day()]);
  const rec = (sid, d = day(), p = tab()) => R.get(key(sid, d, p));
  /* الأساتذة */
  const tview = () => (["day", "week", "month", "list"].includes(params().get("v")) ? params().get("v") : "day");
  const tper = () => (["am", "pm"].includes(params().get("p")) ? params().get("p") : (new Date().getHours() < 14 ? "am" : "pm"));
  const month = () => (/^\d{4}-\d{2}$/.test(params().get("mo") || "") ? params().get("mo") : day().slice(0, 7));
  const monthDays = (mo) => { const [y, m] = mo.split("-").map(Number); const n = new Date(y, m, 0).getDate(); return [...Array(n)].map((_, i) => `${mo}-${String(i + 1).padStart(2, "0")}`); };
  const trange = () => { const v = tview(); if (v === "week") return [weekStart(day()), addDays(weekStart(day()), 6)]; if (v === "month") { const ds = monthDays(month()); return [ds[0], ds[ds.length - 1]]; } return [day(), day()]; };
  const trec = (tid, d = day(), p = tper()) => TR.get(key(tid, d, p));
  const teacherName = (id) => (D.teachers.find((t) => t.id === id) || {}).name || "";
  const groupsOfTeacher = (tid) => D.groups.filter((g) => g.teacher_id === tid);
  const activeTeachers = (p) => D.teachers.filter((t) => t.active !== false && (!p || t.periods === "both" || t.periods === p));
  async function loadTRecords(force) {
    const [a, b] = trange();
    const k = a + "~" + b;
    if (!force && k === trKey) return {};
    const r = await MH.cloud.att.loadRecords(a, b, "att_teacher_records");
    if (!r.error) { TR = new Map(r.data.map((x) => [key(x.teacher_id, x.date, x.period), x])); trKey = k; }
    return r;
  }
  const memText = (r) => [r && (r.new_from || r.new_to) ? `جديد: ${r.new_from || "…"} ← ${r.new_to || "…"}` : "", r && (r.old_from || r.old_to) ? `قديم: ${r.old_from || "…"} ← ${r.old_to || "…"}` : "", r && r.grade ? r.grade : ""].filter(Boolean).join(" · ");

  /* ---------------- التحميل ---------------- */
  async function loadBase(force) {
    if (!force && D && Date.now() - baseAt < 60000) return {};
    const r = await MH.cloud.att.loadBase();
    if (!r.error) { D = r.data; baseAt = Date.now(); }
    return r;
  }
  async function loadRecords(force) {
    const [a, b] = range();
    const k = a + "~" + b;
    if (!force && k === rangeKey) return {};
    const r = await MH.cloud.att.loadRecords(a, b);
    if (!r.error) { R = new Map(r.data.map((x) => [key(x.student_id, x.date, x.period), x])); rangeKey = k; }
    return r;
  }
  async function mount(el) {
    root = el;
    if (!el) return;
    if (!allowed()) { el.innerHTML = `<div class="empty forbidden"><span>⛔</span><h2>غير مصرّح</h2><p>الحضور والحفظ للمدير العام، وللمشرف الممنوح هذه الصلاحية.</p></div>`; return; }
    const r1 = await loadBase(false);
    const r2 = r1.error ? r1 : tab() === "teachers" ? (tview() === "list" ? {} : await loadTRecords(false)) : tab() === "roster" ? {} : await loadRecords(false);
    if (!el.isConnected) return;
    const err = r1.error || r2.error;
    if (err) { el.innerHTML = `<h1 class="adm-title">الحضور والحفظ</h1><div class="box"><p>${esc(MH.cloud.msg(err))}</p><button class="btn" data-att-reload>إعادة المحاولة</button></div>`; return; }
    render();
  }

  /* ---------------- الرسم ---------------- */
  function render() {
    if (!root || !root.isConnected) return;
    const t = tab();
    const me = MH.currentStaff();
    const tabs = [["am", "الصباح", "☀"], ["pm", "المساء", "☾"], ["week", "الأسبوعي", "▦"], ["roster", "الطلاب والحلقات", "👥"], ["teachers", "الأساتذة", "🎓"]];
    root.innerHTML = `
      <div class="att-head">
        <h1 class="adm-title">الحضور والحفظ</h1>
        <p class="muted small">المسجِّل: ${esc(me ? me.name : "")} — ${arNum(D.students.filter((s) => s.active !== false).length)} طالبًا في ${arNum(D.groups.length)} حلقة · ${arNum(D.teachers.filter((x) => x.active !== false).length)} أستاذًا</p>
      </div>
      <nav class="att-tabs att-tabs-5">${tabs.map(([k, l, i]) => `<a class="${t === k ? "on" : ""}" href="${href({ t: k, f: null })}"><span aria-hidden="true">${i}</span> ${l}</a>`).join("")}</nav>
      ${t === "teachers" ? vTeachers() : t === "roster" ? vRoster() : `
        <div class="att-controls">
          <input type="date" id="attDate" value="${esc(day())}" aria-label="التاريخ">
          <select id="attGroup" aria-label="الحلقة"><option value="">كل الطلاب</option>${D.groups.map((g) => `<option value="${esc(g.id)}" ${grp() === g.id ? "selected" : ""}>${esc(g.name)}</option>`).join("")}</select>
          <input type="search" id="attSearch" placeholder="ابحث عن طالب…" aria-label="بحث">
          <a class="btn sm att-add" href="${href({ t: "roster", es: null, f: "new" })}">➕ تسجيل طلاب</a>
        </div>
        ${t === "week" ? vWeek() : vDay()}`}
      <p class="note">ⓘ كل تسجيل يُحفظ مباشرة في قاعدة البيانات مع اسم المسجِّل ووقت العملية. هذا القسم للإدارة فقط ولا يظهر في الموقع ولا في حسابات الطلاب.</p>`;
    /* الانتقال مباشرة إلى نموذج التسجيل (من زر «تسجيل طلاب» أو عند تعديل طالب) */
    if ((t === "roster" && (params().get("f") === "new" || params().get("es"))) || (t === "teachers" && params().get("et"))) {
      const box = root.querySelector("#attNew");
      if (box) setTimeout(() => { box.scrollIntoView({ behavior: "smooth", block: "start" }); if (params().get("f") === "new") { const n = box.querySelector("input[name=name]"); if (n) n.focus({ preventScroll: true }); } }, 50);
    }
  }

  function counts() {
    const list = activeStudents();
    const c = { present: 0, late: 0, absent: 0, excused: 0, out: 0, early: 0, notOut: 0, none: 0 };
    list.forEach((s) => {
      const r = rec(s.id);
      if (!r || !r.status) { c.none++; return; }
      c[r.status]++;
      if (r.out_status) c[r.out_status]++;
      else if (r.status === "present" || r.status === "late") c.notOut++;
    });
    return c;
  }
  function vStats() {
    const c = counts();
    const tile = (n, t, cls) => `<div class="att-stat ${cls}"><b>${arNum(n)}</b><span>${t}</span></div>`;
    return `<div class="att-stats" id="attStats">
      ${tile(c.present, "حاضر", "st-present")}${tile(c.late, "متأخر", "st-late")}${tile(c.absent, "غائب", "st-absent")}${tile(c.excused, "بعذر", "st-excused")}
      ${tile(c.out, "خرج", "st-out")}${tile(c.early, "خرج مبكرًا", "st-early")}${tile(c.notOut, "لم يخرج بعد", "st-notout")}${tile(c.none, "لم يُسجَّل", "st-none")}
    </div>`;
  }

  function vDay() {
    const list = activeStudents();
    if (!D.students.length) return `<div class="empty"><p>لا يوجد طلاب بعد. أضف الحلقات والطلاب أولًا.</p><a class="btn" href="${href({ t: "roster" })}">إضافة الطلاب والحلقات</a></div>`;
    return `
      <h2 class="att-day">${esc(dayLabel(day()))} — ${PERIODS[tab()].long}</h2>
      ${vStats()}
      <div class="att-bulk">
        <button class="btn sm att-b-ok" data-att-bulk="present">${ic("check")} غير المحددين حاضرون</button>
        <button class="btn sm att-b-bad" data-att-bulk="absent">✗ غير المحددين غائبون</button>
        <button class="btn sm att-b-out" data-att-bulk="out">⎋ خروج الباقين (نهاية الحصة)</button>
        <button class="btn sm" data-att-print="day">${ic("file")} تقرير الفترة PDF</button>
      </div>
      <ul class="att-list">${list.map(rowHtml).join("") || `<li class="muted">لا يوجد طلاب في هذه الحلقة.</li>`}</ul>`;
  }

  function rowHtml(s) {
    const r = rec(s.id) || {};
    const inOk = r.status === "present" || r.status === "late";
    const mem = memText(r);
    return `<li class="att-row" id="att-${esc(s.id)}" data-search="${esc(norm(s.name))}">
      <div class="att-who"><b>${esc(s.name)}</b><small class="muted">${esc(groupName(s.group_id))}${r.in_at && inOk ? " · دخل " + hm(r.in_at) : ""}${r.out_at && r.out_status ? " · خرج " + hm(r.out_at) : ""}</small></div>
      <div class="att-btns" role="group" aria-label="الحضور">
        ${Object.entries(STATUS).map(([k, x]) => `<button class="att-chip ${x.cls} ${r.status === k ? "on" : ""}" data-att-st="${esc(s.id)}|${k}" aria-pressed="${r.status === k}">${x.t}</button>`).join("")}
        ${Object.entries(OUT).map(([k, x]) => `<button class="att-chip ${x.cls} ${r.out_status === k ? "on" : ""}" data-att-out="${esc(s.id)}|${k}" ${inOk ? "" : "disabled"} aria-pressed="${r.out_status === k}">${x.t}</button>`).join("")}
      </div>
      <details class="att-mem" ${params().get("m") === s.id ? "open" : ""}>
        <summary>📖 الحفظ${mem ? `: <span class="muted">${esc(mem)}</span>` : ""}</summary>
        <form class="form att-mem-form" id="attMem" data-sid="${esc(s.id)}">
          <div class="row"><label>الحفظ الجديد — من<input name="new_from" value="${esc(r.new_from || "")}"></label><label>إلى<input name="new_to" value="${esc(r.new_to || "")}"></label></div>
          <div class="row"><label>الحفظ القديم (المراجعة) — من<input name="old_from" value="${esc(r.old_from || "")}"></label><label>إلى<input name="old_to" value="${esc(r.old_to || "")}"></label></div>
          <div class="row"><label>التقدير<select name="grade"><option value="">—</option>${GRADES.map((g) => `<option ${r.grade === g ? "selected" : ""}>${g}</option>`).join("")}</select></label><label>ملاحظة<input name="note" value="${esc(r.note || "")}"></label></div>
          <div class="actions"><button class="btn sm">حفظ</button>${r.recorded_by ? `<small class="muted">آخر تسجيل: ${esc(r.recorded_by)} · ${esc(hm(r.updated_at))}</small>` : ""}</div>
        </form>
      </details>
    </li>`;
  }
  function refreshRow(sid) {
    const el = root && root.querySelector("#att-" + CSS.escape(sid));
    const s = D.students.find((x) => x.id === sid);
    if (el && s) { const open = el.querySelector("details[open]"); el.outerHTML = rowHtml(s); if (open) { const n = root.querySelector("#att-" + CSS.escape(sid) + " details"); if (n) n.open = true; } }
    const st = root && root.querySelector("#attStats");
    if (st) st.outerHTML = vStats();
  }

  function vWeek() {
    const a = weekStart(day());
    const days = [...Array(7)].map((_, i) => addDays(a, i));
    const list = activeStudents();
    const cell = (sid, d, p) => { const r = rec(sid, d, p); return r && r.status ? `<span class="wk ${STATUS[r.status].cls}" title="${STATUS[r.status].t}${memText(r) ? " — " + esc(memText(r)) : ""}">${STATUS[r.status].s}${memText(r) ? "<i>📖</i>" : ""}</span>` : `<span class="wk st-none">·</span>`; };
    const tot = (sid) => { const t = { present: 0, late: 0, absent: 0, excused: 0, mem: 0 }; days.forEach((d) => ["am", "pm"].forEach((p) => { const r = rec(sid, d, p); if (r && r.status) t[r.status]++; if (r && memText(r)) t.mem++; })); return t; };
    return `
      <div class="sec-row att-weeknav">
        <a class="btn sm ghost" href="${href({ d: addDays(a, -7) })}">→ الأسبوع السابق</a>
        <h2 class="att-day">من ${esc(shortDay(days[0]))} إلى ${esc(shortDay(days[6]))}</h2>
        <a class="btn sm ghost" href="${href({ d: addDays(a, 7) })}">الأسبوع التالي ←</a>
      </div>
      <div class="att-bulk"><button class="btn sm" data-att-print="week">${ic("file")} تقرير الأسبوع PDF</button>
        <span class="muted small">✓ حاضر · ⏱ متأخر · ✗ غائب · ع بعذر · 📖 سُجّل حفظ — في كل يوم: الصباح ثم المساء</span></div>
      <div class="box table-wrap"><table class="att-week">
        <thead><tr><th>الطالب</th>${days.map((d) => `<th>${esc(shortDay(d))}</th>`).join("")}<th>حضور</th><th>تأخر</th><th>غياب</th><th>بعذر</th><th>حفظ</th></tr></thead>
        <tbody>${list.map((s) => { const t = tot(s.id); return `<tr data-search="${esc(norm(s.name))}"><th>${esc(s.name)}<br><small class="muted">${esc(groupName(s.group_id))}</small></th>${days.map((d) => `<td>${cell(s.id, d, "am")}${cell(s.id, d, "pm")}</td>`).join("")}<td>${arNum(t.present)}</td><td>${arNum(t.late)}</td><td>${arNum(t.absent)}</td><td>${arNum(t.excused)}</td><td>${arNum(t.mem)}</td></tr>`; }).join("") || `<tr><td colspan="13" class="muted">لا يوجد طلاب.</td></tr>`}</tbody>
      </table></div>`;
  }

  function vRoster() {
    const p = params();
    const edG = D.groups.find((g) => g.id === p.get("eg"));
    const edS = D.students.find((s) => s.id === p.get("es"));
    const fg = p.get("fg") || "";
    const studs = D.students.filter((s) => !fg || (fg === "none" ? !s.group_id : s.group_id === fg));
    const gOpts = (sel) => `<option value="">— بلا حلقة —</option>${D.groups.map((g) => `<option value="${esc(g.id)}" ${sel === g.id ? "selected" : ""}>${esc(g.name)}</option>`).join("")}`;
    return `
      <div class="box att-new" id="attNew">
        <h3>${edS ? `✎ تعديل «${esc(edS.name)}»` : "➕ طالب جديد"}</h3>
        <form class="form" id="attStudentForm" data-edit="${edS ? esc(edS.id) : ""}">
          <label>الاسم<input name="name" required value="${esc(edS ? edS.name : "")}"></label>
          <div class="row"><label>الحلقة<select name="group_id">${gOpts(edS ? edS.group_id : (fg !== "none" ? fg : ""))}</select></label><label>هاتف ولي الأمر<input name="guardian_phone" inputmode="tel" dir="ltr" value="${esc(edS ? edS.guardian_phone || "" : "")}"></label></div>
          <label>ملاحظة<input name="note" value="${esc(edS ? edS.note || "" : "")}"></label>
          ${edS ? `<label class="check"><input type="checkbox" name="active" ${edS.active !== false ? "checked" : ""}> نشط (يظهر في الحضور)</label>` : ""}
          <div class="actions"><button class="btn sm">${edS ? "حفظ" : "إضافة الطالب"}</button>${edS ? `<a class="btn sm ghost" href="${href({ es: null })}">إلغاء</a>` : ""}</div>
        </form>
      </div>
      <div class="grid two att-roster">
        <div>
          <div class="box">
            <h3>${edG ? `✎ تعديل حلقة «${esc(edG.name)}»` : "الحلقات"}</h3>
            <form class="form" id="attGroupForm" data-edit="${edG ? esc(edG.id) : ""}">
              <div class="row"><label>اسم الحلقة<input name="name" required value="${esc(edG ? edG.name : "")}" placeholder="حلقة الصباح للبنات"></label><label>الأستاذ<select name="teacher_id"><option value="">—</option>${D.teachers.filter((x) => x.active !== false || (edG && edG.teacher_id === x.id)).map((x) => `<option value="${esc(x.id)}" ${edG && edG.teacher_id === x.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label></div>
              <label>ملاحظة<input name="note" value="${esc(edG ? edG.note || "" : "")}"></label>
              <div class="actions"><button class="btn sm">${edG ? "حفظ" : "➕ إضافة حلقة"}</button>${edG ? `<a class="btn sm ghost" href="${href({ eg: null })}">إلغاء</a>` : ""}</div>
            </form>
            <ul class="simple mt">${D.groups.map((g) => `<li><span><b>${esc(g.name)}</b><br><small class="muted">${arNum(D.students.filter((s) => s.group_id === g.id && s.active !== false).length)} طالبًا${g.teacher_id && teacherName(g.teacher_id) ? " · الأستاذ: " + esc(teacherName(g.teacher_id)) : ""}${g.note ? " · " + esc(g.note) : ""}</small></span>
              <span class="nowrap small"><a class="link" href="${href({ eg: g.id })}">تعديل</a> · <button class="link danger" data-att-del="att_groups|${esc(g.id)}">حذف</button></span></li>`).join("") || `<li class="muted">لا توجد حلقات بعد.</li>`}</ul>
          </div>
          <details class="box add-box">
            <summary>➕ إضافة طلاب دفعة واحدة</summary>
            <form class="form" id="attBulkStudents">
              <label>الحلقة<select name="group_id">${gOpts(fg && fg !== "none" ? fg : "")}</select></label>
              <label>الطلاب (كل سطر طالب: الاسم، هاتف ولي الأمر، ملاحظة)<textarea name="names" rows="8" required placeholder="محمد أحمد، 22334455، يحفظ جزء عمّ&#10;عائشة سيدي، 33445566&#10;إبراهيم محمود"></textarea></label>
              <p class="muted small">الهاتف والملاحظة اختياريان. يمكن الفصل بفاصلة (، أو ,) أو لصق ثلاثة أعمدة من Excel. الاسم الموجود من قبل في الحلقة نفسها يُتجاهَل.</p>
              <button class="btn sm">إضافة الطلاب</button>
            </form>
          </details>
        </div>
        <div class="box">
          <h3>قائمة الطلاب</h3>
          <div class="chips sub mt">
            <a class="chip ${!fg ? "on" : ""}" href="${href({ fg: null })}">الكل (${arNum(D.students.length)})</a>
            ${D.groups.map((g) => `<a class="chip ${fg === g.id ? "on" : ""}" href="${href({ fg: g.id })}">${esc(g.name)}</a>`).join("")}
            ${D.students.some((s) => !s.group_id) ? `<a class="chip ${fg === "none" ? "on" : ""}" href="${href({ fg: "none" })}">بلا حلقة</a>` : ""}
          </div>
          <ul class="simple">${studs.map((s) => `<li><span><b>${esc(s.name)}</b>${s.active === false ? ` <span class="tag soft">موقوف</span>` : ""}<br><small class="muted">${esc(groupName(s.group_id))}${s.guardian_phone ? ` · <span dir="ltr">${esc(s.guardian_phone)}</span>` : ""}${s.note ? " · " + esc(s.note) : ""}</small></span>
            <span class="nowrap small"><a class="link" href="${href({ es: s.id })}">تعديل</a> · <button class="link danger" data-att-del="att_students|${esc(s.id)}">حذف</button></span></li>`).join("") || `<li class="muted">لا يوجد طلاب بعد.</li>`}</ul>
        </div>
      </div>`;
  }

  /* ---------------- الأساتذة ---------------- */
  function tcounts(p) {
    const c = { present: 0, late: 0, absent: 0, excused: 0, leave: 0, out: 0, early: 0, none: 0 };
    activeTeachers(p).forEach((t) => { const r = trec(t.id, day(), p); if (!r || !r.status) { c.none++; return; } c[r.status]++; if (r.out_status) c[r.out_status]++; });
    return c;
  }
  function vTStats() {
    const c = tcounts(tper());
    const tile = (n, t, cls) => `<div class="att-stat ${cls}"><b>${arNum(n)}</b><span>${t}</span></div>`;
    return `<div class="att-stats" id="attTStats">${tile(c.present, "حاضر", "st-present")}${tile(c.late, "متأخر", "st-late")}${tile(c.absent, "غائب", "st-absent")}${tile(c.excused, "بعذر", "st-excused")}${tile(c.leave, "إجازة", "st-leave")}${tile(c.out, "خرج", "st-out")}${tile(c.early, "خرج مبكرًا", "st-early")}${tile(c.none, "لم يُسجَّل", "st-none")}</div>`;
  }
  function trowHtml(t) {
    const r = trec(t.id) || {};
    const inOk = r.status === "present" || r.status === "late";
    const gs = groupsOfTeacher(t.id).map((g) => g.name).join("، ");
    return `<li class="att-row" id="attt-${esc(t.id)}" data-search="${esc(norm(t.name))}">
      <div class="att-who"><b>${esc(t.name)}</b><small class="muted">${esc([t.subject, gs].filter(Boolean).join(" · ") || "—")}${r.in_at && inOk ? " · دخل " + hm(r.in_at) : ""}${r.out_at && r.out_status ? " · خرج " + hm(r.out_at) : ""}</small></div>
      <div class="att-btns" role="group" aria-label="حضور الأستاذ">
        ${Object.entries(TSTATUS).map(([k, x]) => `<button class="att-chip ${x.cls} ${r.status === k ? "on" : ""}" data-att-tst="${esc(t.id)}|${k}" aria-pressed="${r.status === k}">${x.t}</button>`).join("")}
        ${Object.entries(OUT).map(([k, x]) => `<button class="att-chip ${x.cls} ${r.out_status === k ? "on" : ""}" data-att-tout="${esc(t.id)}|${k}" ${inOk ? "" : "disabled"} aria-pressed="${r.out_status === k}">${x.t}</button>`).join("")}
      </div>
      <details class="att-mem"><summary>📝 ملاحظة${r.note ? `: <span class="muted">${esc(r.note)}</span>` : ""}</summary>
        <form class="form att-mem-form" id="attTNote" data-tid="${esc(t.id)}">
          <label>ملاحظة (سبب الغياب، أو من عوّضه في الحلقة…)<input name="note" value="${esc(r.note || "")}"></label>
          <div class="actions"><button class="btn sm">حفظ</button>${r.recorded_by ? `<small class="muted">آخر تسجيل: ${esc(r.recorded_by)} · ${esc(hm(r.updated_at))}</small>` : ""}</div>
        </form></details>
    </li>`;
  }
  function refreshTRow(tid) {
    const el = root && root.querySelector("#attt-" + CSS.escape(tid));
    const t = D.teachers.find((x) => x.id === tid);
    if (el && t) { const open = el.querySelector("details[open]"); el.outerHTML = trowHtml(t); if (open) { const n = root.querySelector("#attt-" + CSS.escape(tid) + " details"); if (n) n.open = true; } }
    const st = root && root.querySelector("#attTStats");
    if (st) st.outerHTML = vTStats();
  }
  function vTeachers() {
    const v = tview();
    const views = [["day", "الحضور"], ["week", "الأسبوعي"], ["month", "التقرير الشهري"], ["list", "بيانات الأساتذة"]];
    const nav = `<nav class="chips sub att-subnav">${views.map(([k, l]) => `<a class="chip ${v === k ? "on" : ""}" href="${href({ v: k, et: null })}">${l}</a>`).join("")}</nav>`;
    if (v === "list") return nav + vTList();
    if (!D.teachers.length) return nav + `<div class="empty"><p>لا يوجد أساتذة بعد.</p><a class="btn" href="${href({ v: "list" })}">إضافة الأساتذة</a></div>`;
    const search = `<input type="search" id="attSearch" placeholder="ابحث عن أستاذ…" aria-label="بحث">`;
    if (v === "month") return nav + `<div class="att-controls"><input type="month" id="attMonth" value="${esc(month())}" aria-label="الشهر">${search}</div>` + vTMonth();
    const ctl = `<div class="att-controls"><input type="date" id="attDate" value="${esc(day())}" aria-label="التاريخ">
      ${v === "day" ? `<select id="attTPer" aria-label="الفترة">${Object.entries(PERIODS).map(([k, x]) => `<option value="${k}" ${tper() === k ? "selected" : ""}>${x.icon} ${x.t}</option>`).join("")}</select>` : "<span></span>"}${search}</div>`;
    if (v === "week") return nav + ctl + vTWeek();
    const list = activeTeachers(tper());
    return nav + ctl + `
      <h2 class="att-day">${esc(dayLabel(day()))} — ${PERIODS[tper()].long}</h2>
      ${vTStats()}
      <div class="att-bulk">
        <button class="btn sm att-b-ok" data-att-tbulk="present">${ic("check")} غير المحددين حاضرون</button>
        <button class="btn sm att-b-out" data-att-tbulk="out">⎋ خروج الباقين (نهاية الحصة)</button>
        <button class="btn sm" data-att-print="tday">${ic("file")} تقرير الفترة PDF</button>
      </div>
      <ul class="att-list">${list.map(trowHtml).join("") || `<li class="muted">لا يوجد أساتذة في هذه الفترة.</li>`}</ul>`;
  }
  const tTotals = (tid, days) => { const t = { present: 0, late: 0, absent: 0, excused: 0, leave: 0, early: 0 }; days.forEach((d) => ["am", "pm"].forEach((p) => { const r = trec(tid, d, p); if (r && r.status) t[r.status]++; if (r && r.out_status === "early") t.early++; })); return t; };
  function vTWeek() {
    const a = weekStart(day());
    const days = [...Array(7)].map((_, i) => addDays(a, i));
    const cell = (tid, d, p) => { const r = trec(tid, d, p); return r && r.status ? `<span class="wk ${TSTATUS[r.status].cls}" title="${TSTATUS[r.status].t}${r.note ? " — " + esc(r.note) : ""}">${TSTATUS[r.status].s}</span>` : `<span class="wk st-none">·</span>`; };
    const list = D.teachers.filter((t) => t.active !== false);
    return `
      <div class="sec-row att-weeknav">
        <a class="btn sm ghost" href="${href({ d: addDays(a, -7) })}">→ الأسبوع السابق</a>
        <h2 class="att-day">من ${esc(shortDay(days[0]))} إلى ${esc(shortDay(days[6]))}</h2>
        <a class="btn sm ghost" href="${href({ d: addDays(a, 7) })}">الأسبوع التالي ←</a>
      </div>
      <div class="att-bulk"><button class="btn sm" data-att-print="tweek">${ic("file")} تقرير الأسبوع PDF</button>
        <span class="muted small">✓ حاضر · ⏱ متأخر · ✗ غائب · ع بعذر · إ إجازة — في كل يوم: الصباح ثم المساء</span></div>
      <div class="box table-wrap"><table class="att-week">
        <thead><tr><th>الأستاذ</th>${days.map((d) => `<th>${esc(shortDay(d))}</th>`).join("")}<th>حضور</th><th>تأخر</th><th>غياب</th><th>بعذر</th><th>إجازة</th></tr></thead>
        <tbody>${list.map((t) => { const x = tTotals(t.id, days); return `<tr data-search="${esc(norm(t.name))}"><th>${esc(t.name)}<br><small class="muted">${esc(t.subject || "")}</small></th>${days.map((d) => `<td>${cell(t.id, d, "am")}${cell(t.id, d, "pm")}</td>`).join("")}<td>${arNum(x.present)}</td><td>${arNum(x.late)}</td><td>${arNum(x.absent)}</td><td>${arNum(x.excused)}</td><td>${arNum(x.leave)}</td></tr>`; }).join("")}</tbody>
      </table></div>`;
  }
  const monthLabel = (mo) => dObj(mo + "-15").toLocaleDateString("ar", { month: "long", year: "numeric" });
  function vTMonth() {
    const days = monthDays(month());
    const [y, m] = month().split("-").map(Number);
    const prev = iso(new Date(y, m - 2, 15)).slice(0, 7), next = iso(new Date(y, m, 15)).slice(0, 7);
    const list = D.teachers.filter((t) => t.active !== false);
    return `
      <div class="sec-row att-weeknav">
        <a class="btn sm ghost" href="${href({ mo: prev })}">→ الشهر السابق</a>
        <h2 class="att-day">${esc(monthLabel(month()))}</h2>
        <a class="btn sm ghost" href="${href({ mo: next })}">الشهر التالي ←</a>
      </div>
      <div class="att-bulk"><button class="btn sm" data-att-print="tmonth">${ic("file")} تقرير الشهر PDF</button><span class="muted small">الأرقام بعدد الحصص (كل يوم فيه حصة صباحية وحصة مسائية).</span></div>
      <div class="box table-wrap"><table class="att-week att-month">
        <thead><tr><th>الأستاذ</th><th>حضور</th><th>تأخر</th><th>غياب</th><th>بعذر</th><th>إجازة</th><th>خرج مبكرًا</th><th></th></tr></thead>
        <tbody>${list.map((t) => { const x = tTotals(t.id, days); return `<tr data-search="${esc(norm(t.name))}"><th>${esc(t.name)}<br><small class="muted">${esc(t.subject || "")}</small></th><td>${arNum(x.present)}</td><td>${arNum(x.late)}</td><td>${arNum(x.absent)}</td><td>${arNum(x.excused)}</td><td>${arNum(x.leave)}</td><td>${arNum(x.early)}</td><td><button class="link" data-att-print="tone|${esc(t.id)}">تقرير مفصّل</button></td></tr>`; }).join("") || `<tr><td colspan="8" class="muted">لا يوجد أساتذة.</td></tr>`}</tbody>
      </table></div>`;
  }
  function vTList() {
    const p = params();
    const ed = D.teachers.find((t) => t.id === p.get("et"));
    const T0 = ed || { name: "", phone: "", subject: "", periods: "both", joined: "", note: "" };
    return `
      <div class="box att-new" id="attNew">
        <h3>${ed ? `✎ تعديل «${esc(ed.name)}»` : "➕ أستاذ جديد"}</h3>
        <form class="form" id="attTeacherForm" data-edit="${ed ? esc(ed.id) : ""}">
          <div class="row"><label>الاسم<input name="name" required value="${esc(T0.name)}"></label><label>الهاتف<input name="phone" inputmode="tel" dir="ltr" value="${esc(T0.phone || "")}"></label></div>
          <div class="row"><label>المادة / التخصص<input name="subject" value="${esc(T0.subject || "")}" placeholder="القرآن الكريم"></label><label>الفترة<select name="periods">${Object.entries(TPERIODS).map(([k, l]) => `<option value="${k}" ${T0.periods === k ? "selected" : ""}>${l}</option>`).join("")}</select></label></div>
          <div class="row"><label>تاريخ الالتحاق<input type="date" name="joined" value="${esc(T0.joined || "")}"></label><label>ملاحظة<input name="note" value="${esc(T0.note || "")}"></label></div>
          ${D.groups.length ? `<fieldset class="att-groups-pick"><legend>الحلقات التي يدرّسها</legend>${D.groups.map((g) => `<label class="check"><input type="checkbox" name="g_${esc(g.id)}" ${ed && g.teacher_id === ed.id ? "checked" : ""}> ${esc(g.name)}${g.teacher_id && (!ed || g.teacher_id !== ed.id) && teacherName(g.teacher_id) ? ` <small class="muted">(حاليًا: ${esc(teacherName(g.teacher_id))})</small>` : ""}</label>`).join("")}</fieldset>` : `<p class="muted small">أضف الحلقات من «الطلاب والحلقات» لتسندها إلى الأساتذة.</p>`}
          ${ed ? `<label class="check"><input type="checkbox" name="active" ${ed.active !== false ? "checked" : ""}> نشط (يظهر في الحضور)</label>` : ""}
          <div class="actions"><button class="btn sm">${ed ? "حفظ" : "إضافة الأستاذ"}</button>${ed ? `<a class="btn sm ghost" href="${href({ et: null })}">إلغاء</a>` : ""}</div>
        </form>
      </div>
      <div class="box"><h3>الأساتذة <small class="muted">(${arNum(D.teachers.length)})</small></h3>
        <ul class="simple">${D.teachers.map((t) => `<li><span><b>${esc(t.name)}</b>${t.active === false ? ` <span class="tag soft">موقوف</span>` : ""}<br><small class="muted">${esc([t.subject, TPERIODS[t.periods], groupsOfTeacher(t.id).map((g) => g.name).join("، "), t.joined ? "منذ " + t.joined : "", t.note].filter(Boolean).join(" · "))}${t.phone ? ` · <span dir="ltr">${esc(t.phone)}</span>` : ""}</small></span>
          <span class="nowrap small"><a class="link" href="${href({ et: t.id })}">تعديل</a> · <button class="link danger" data-att-del="att_teachers|${esc(t.id)}">حذف</button></span></li>`).join("") || `<li class="muted">لا يوجد أساتذة بعد.</li>`}</ul>
      </div>`;
  }

  /* ---------------- التقرير (نافذة للطباعة أو الحفظ PDF) ---------------- */
  function printReport(kind) {
    const w = window.open("", "_blank");
    if (!w) { toast("اسمح بالنوافذ المنبثقة لفتح التقرير", "warn"); return; }
    const list = activeStudents();
    let gTitle = grp() ? groupName(grp()) : "كل الطلاب";
    let title, body;
    const tk = kind.split("|");
    if (tk[0].startsWith("t")) {
      gTitle = "الأساتذة";
      const tl = D.teachers.filter((t) => t.active !== false);
      const row5 = (x) => `<td>${arNum(x.present)}</td><td>${arNum(x.late)}</td><td>${arNum(x.absent)}</td><td>${arNum(x.excused)}</td><td>${arNum(x.leave)}</td>`;
      if (tk[0] === "tday") {
        const c = tcounts(tper());
        title = `حضور الأساتذة — ${PERIODS[tper()].long} — ${dayLabel(day())}`;
        body = `<p class="stats">حاضر: ${arNum(c.present)} · متأخر: ${arNum(c.late)} · غائب: ${arNum(c.absent)} · بعذر: ${arNum(c.excused)} · إجازة: ${arNum(c.leave)} · خرج مبكرًا: ${arNum(c.early)} · لم يُسجَّل: ${arNum(c.none)}</p>
          <table><thead><tr><th>#</th><th>الأستاذ</th><th>المادة</th><th>الحلقات</th><th>الحضور</th><th>الدخول</th><th>الخروج</th><th>ملاحظة</th></tr></thead><tbody>
          ${activeTeachers(tper()).map((t, i) => { const r = trec(t.id) || {}; return `<tr><td>${arNum(i + 1)}</td><td>${esc(t.name)}</td><td>${esc(t.subject || "")}</td><td>${esc(groupsOfTeacher(t.id).map((g) => g.name).join("، "))}</td><td>${r.status ? TSTATUS[r.status].t : "لم يُسجَّل"}</td><td>${esc(hm(r.in_at))}</td><td>${r.out_status ? OUT[r.out_status].t + " " + esc(hm(r.out_at)) : ""}</td><td>${esc(r.note || "")}</td></tr>`; }).join("")}</tbody></table>`;
      } else if (tk[0] === "tweek") {
        const a = weekStart(day());
        const days = [...Array(7)].map((_, i) => addDays(a, i));
        title = `حضور الأساتذة الأسبوعي — من ${shortDay(days[0])} إلى ${shortDay(days[6])}`;
        body = `<table><thead><tr><th>#</th><th>الأستاذ</th>${days.map((d) => `<th>${esc(shortDay(d))}<br><small>ص / م</small></th>`).join("")}<th>حضور</th><th>تأخر</th><th>غياب</th><th>بعذر</th><th>إجازة</th></tr></thead><tbody>
          ${tl.map((t, i) => `<tr><td>${arNum(i + 1)}</td><td>${esc(t.name)}</td>${days.map((d) => `<td>${["am", "pm"].map((p) => { const r = trec(t.id, d, p); return r && r.status ? TSTATUS[r.status].s : "·"; }).join(" / ")}</td>`).join("")}${row5(tTotals(t.id, days))}</tr>`).join("")}</tbody></table>
          <p class="leg">✓ حاضر · ⏱ متأخر · ✗ غائب · ع بعذر · إ إجازة · · لم يُسجَّل</p>`;
      } else if (tk[0] === "tmonth") {
        const days = monthDays(month());
        title = `التقرير الشهري لحضور الأساتذة — ${monthLabel(month())}`;
        body = `<table><thead><tr><th>#</th><th>الأستاذ</th><th>المادة</th><th>حضور</th><th>تأخر</th><th>غياب</th><th>بعذر</th><th>إجازة</th><th>خرج مبكرًا</th></tr></thead><tbody>
          ${tl.map((t, i) => { const x = tTotals(t.id, days); return `<tr><td>${arNum(i + 1)}</td><td>${esc(t.name)}</td><td>${esc(t.subject || "")}</td>${row5(x)}<td>${arNum(x.early)}</td></tr>`; }).join("")}</tbody></table>
          <p class="leg">الأرقام بعدد الحصص (الصباحية والمسائية).</p>`;
      } else {
        const t = D.teachers.find((x) => x.id === tk[1]) || { name: "" };
        const days = monthDays(month());
        const x = tTotals(t.id, days);
        title = `تقرير الأستاذ ${t.name} — ${monthLabel(month())}`;
        body = `<p class="stats">${esc([t.subject, groupsOfTeacher(t.id).map((g) => g.name).join("، ")].filter(Boolean).join(" · "))}</p>
          <p class="stats">حضور: ${arNum(x.present)} · تأخر: ${arNum(x.late)} · غياب: ${arNum(x.absent)} · بعذر: ${arNum(x.excused)} · إجازة: ${arNum(x.leave)} · خرج مبكرًا: ${arNum(x.early)}</p>
          <table><thead><tr><th>اليوم</th><th>الفترة</th><th>الحضور</th><th>الدخول</th><th>الخروج</th><th>ملاحظة</th></tr></thead><tbody>
          ${days.flatMap((d) => ["am", "pm"].map((p) => { const r = trec(t.id, d, p); return r && r.status ? `<tr><td>${esc(dayLabel(d))}</td><td>${PERIODS[p].t}</td><td>${TSTATUS[r.status].t}</td><td>${esc(hm(r.in_at))}</td><td>${r.out_status ? OUT[r.out_status].t + " " + esc(hm(r.out_at)) : ""}</td><td>${esc(r.note || "")}</td></tr>` : ""; })).join("") || `<tr><td colspan="6">لا تسجيلات في هذا الشهر.</td></tr>`}</tbody></table>`;
      }
    } else if (kind === "week") {
      const a = weekStart(day());
      const days = [...Array(7)].map((_, i) => addDays(a, i));
      title = `تقرير الحضور الأسبوعي — من ${shortDay(days[0])} إلى ${shortDay(days[6])}`;
      body = `<table><thead><tr><th>#</th><th>الطالب</th>${days.map((d) => `<th>${esc(shortDay(d))}<br><small>ص / م</small></th>`).join("")}<th>حضور</th><th>تأخر</th><th>غياب</th><th>بعذر</th></tr></thead><tbody>
        ${list.map((s, i) => { const t = { present: 0, late: 0, absent: 0, excused: 0 }; const cells = days.map((d) => ["am", "pm"].map((p) => { const r = rec(s.id, d, p); if (r && r.status) t[r.status]++; return r && r.status ? STATUS[r.status].s : "·"; }).join(" / ")); return `<tr><td>${arNum(i + 1)}</td><td>${esc(s.name)}</td>${cells.map((c) => `<td>${c}</td>`).join("")}<td>${arNum(t.present)}</td><td>${arNum(t.late)}</td><td>${arNum(t.absent)}</td><td>${arNum(t.excused)}</td></tr>`; }).join("")}</tbody></table>
        <p class="leg">✓ حاضر · ⏱ متأخر · ✗ غائب · ع بعذر · · لم يُسجَّل</p>`;
    } else {
      const c = counts();
      title = `تقرير ${PERIODS[tab()].long} — ${dayLabel(day())}`;
      body = `<p class="stats">حاضر: ${arNum(c.present)} · متأخر: ${arNum(c.late)} · غائب: ${arNum(c.absent)} · بعذر: ${arNum(c.excused)} · خرج: ${arNum(c.out)} · خرج مبكرًا: ${arNum(c.early)} · لم يخرج بعد: ${arNum(c.notOut)} · لم يُسجَّل: ${arNum(c.none)}</p>
        <table><thead><tr><th>#</th><th>الطالب</th><th>الحلقة</th><th>الحضور</th><th>الدخول</th><th>الخروج</th><th>الحفظ الجديد</th><th>الحفظ القديم</th><th>التقدير</th><th>ملاحظة</th></tr></thead><tbody>
        ${list.map((s, i) => { const r = rec(s.id) || {}; return `<tr><td>${arNum(i + 1)}</td><td>${esc(s.name)}</td><td>${esc(groupName(s.group_id))}</td><td>${r.status ? STATUS[r.status].t : "لم يُسجَّل"}</td><td>${esc(hm(r.in_at))}</td><td>${r.out_status ? OUT[r.out_status].t + " " + esc(hm(r.out_at)) : ""}</td><td>${r.new_from || r.new_to ? esc((r.new_from || "…") + " ← " + (r.new_to || "…")) : ""}</td><td>${r.old_from || r.old_to ? esc((r.old_from || "…") + " ← " + (r.old_to || "…")) : ""}</td><td>${esc(r.grade || "")}</td><td>${esc(r.note || "")}</td></tr>`; }).join("")}</tbody></table>`;
    }
    const me = MH.currentStaff();
    w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title>
      <style>body{font-family:Tajawal,"Segoe UI",Tahoma,sans-serif;color:#221f40;margin:24px}header{display:flex;align-items:center;gap:14px;border-bottom:3px solid #c9a46a;padding-bottom:10px;margin-bottom:14px}
      header img{height:60px}h1{font-size:18px;margin:0}h2{font-size:15px;margin:2px 0 0;color:#4a4486;font-weight:600}
      table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #d9d3e6;padding:5px 6px;text-align:right;vertical-align:top}th{background:#2c2853;color:#fff}
      tr:nth-child(even) td{background:#f7f5fa}.stats{font-weight:700}.leg,footer{font-size:11px;color:#6a6585;margin-top:10px}@page{size:A4 landscape;margin:12mm}</style></head><body>
      <header><img src="${location.origin + location.pathname.replace(/admin\/.*$/, "")}assets/logo-mahajja.png" alt=""><div><h1>معهد المحجة البيضاء — جمعية عون وسند الخيرية</h1><h2>${esc(title)}</h2><div>${esc(gTitle)}</div></div></header>
      ${body}<footer>أُعدّ التقرير بواسطة: ${esc(me ? me.name : "")} — ${esc(new Date().toLocaleString("ar"))}</footer>
      <script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>`);
    w.document.close();
  }

  /* ---------------- الحفظ في الخادم ---------------- */
  async function put(rows, okMsg) {
    if (!rows.length) { toast("لا يوجد طلاب يحتاجون إلى ذلك", "warn"); return false; }
    const r = await MH.cloud.att.upsert(rows);
    if (r.error) { toast(MH.cloud.msg(r.error), "warn"); return false; }
    r.data.forEach((x) => R.set(key(x.student_id, x.date, x.period), x));
    if (okMsg) toast(okMsg);
    return true;
  }
  async function putT(rows, okMsg) {
    if (!rows.length) { toast("لا يوجد أساتذة يحتاجون إلى ذلك", "warn"); return false; }
    const r = await MH.cloud.att.upsert(rows, "att_teacher_records");
    if (r.error) { toast(MH.cloud.msg(r.error), "warn"); return false; }
    r.data.forEach((x) => TR.set(key(x.teacher_id, x.date, x.period), x));
    if (okMsg) toast(okMsg);
    return true;
  }
  const baseRow = (sid) => { const r = rec(sid) || {}; return { student_id: sid, date: day(), period: tab(), status: r.status || null, out_status: r.out_status || null, in_at: r.in_at || null, out_at: r.out_at || null, new_from: r.new_from || null, new_to: r.new_to || null, old_from: r.old_from || null, old_to: r.old_to || null, grade: r.grade || null, note: r.note || null }; };

  /* ---------------- الأحداث ---------------- */
  const inRoot = (el) => root && root.isConnected && root.contains(el);

  document.addEventListener("click", async (e) => {
    const t = e.target.closest("button, a");
    if (!t || !inRoot(t)) return;
    const d = t.dataset;
    if (d.attReload !== undefined) { mount(root); return; }
    if (d.attPrint) { printReport(d.attPrint); return; }
    if (!allowed() || busy) return;
    busy = true;
    try {
      if (d.attSt) {
        const [sid, st] = d.attSt.split("|");
        const row = baseRow(sid);
        if (row.status === st) { row.status = null; row.in_at = null; row.out_status = null; row.out_at = null; }
        else {
          row.status = st;
          if (st === "present" || st === "late") row.in_at = row.in_at || new Date().toISOString();
          else { row.in_at = null; row.out_status = null; row.out_at = null; }
        }
        if (await put([row])) refreshRow(sid);
      } else if (d.attOut) {
        const [sid, o] = d.attOut.split("|");
        const row = baseRow(sid);
        if (row.out_status === o) { row.out_status = null; row.out_at = null; } else { row.out_status = o; row.out_at = new Date().toISOString(); }
        if (await put([row])) refreshRow(sid);
      } else if (d.attTst || d.attTout) {
        const [tid, v] = (d.attTst || d.attTout).split("|");
        const r = trec(tid) || {};
        const row = { teacher_id: tid, date: day(), period: tper(), status: r.status || null, out_status: r.out_status || null, in_at: r.in_at || null, out_at: r.out_at || null, note: r.note || null };
        if (d.attTst) {
          if (row.status === v) { row.status = null; row.in_at = null; row.out_status = null; row.out_at = null; }
          else { row.status = v; if (v === "present" || v === "late") row.in_at = row.in_at || new Date().toISOString(); else { row.in_at = null; row.out_status = null; row.out_at = null; } }
        } else if (row.out_status === v) { row.out_status = null; row.out_at = null; } else { row.out_status = v; row.out_at = new Date().toISOString(); }
        if (await putT([row])) refreshTRow(tid);
      } else if (d.attTbulk) {
        const now = new Date().toISOString();
        const base = (t) => { const r = trec(t.id) || {}; return { teacher_id: t.id, date: day(), period: tper(), status: r.status || null, out_status: r.out_status || null, in_at: r.in_at || null, out_at: r.out_at || null, note: r.note || null }; };
        const list = activeTeachers(tper());
        const rows = d.attTbulk === "out"
          ? list.filter((t) => { const r = trec(t.id); return r && (r.status === "present" || r.status === "late") && !r.out_status; }).map((t) => Object.assign(base(t), { out_status: "out", out_at: now }))
          : list.filter((t) => !(trec(t.id) || {}).status).map((t) => Object.assign(base(t), { status: "present", in_at: now }));
        if (rows.length && !confirmTap(t, `تأكيد (${arNum(rows.length)})؟`)) return;
        const label = d.attTbulk === "out" ? "خارجين (نهاية الحصة)" : "حاضرين";
        if (await putT(rows, `سُجّل ${arNum(rows.length)} أستاذًا ${label}`)) { log(`الأساتذة — ${PERIODS[tper()].long} ${day()}: ${rows.length} ${label}`); render(); }
      } else if (d.attBulk) {
        const list = activeStudents();
        let rows;
        if (d.attBulk === "out") rows = list.filter((s) => { const r = rec(s.id); return r && (r.status === "present" || r.status === "late") && !r.out_status; }).map((s) => Object.assign(baseRow(s.id), { out_status: "out", out_at: new Date().toISOString() }));
        else rows = list.filter((s) => !(rec(s.id) || {}).status).map((s) => Object.assign(baseRow(s.id), { status: d.attBulk, in_at: d.attBulk === "present" ? new Date().toISOString() : null }));
        const label = { present: "حاضرين", absent: "غائبين", out: "خارجين (نهاية الحصة)" }[d.attBulk];
        if (rows.length && !confirmTap(t, `تأكيد (${arNum(rows.length)})؟`)) return;
        if (await put(rows, `سُجّل ${arNum(rows.length)} طالبًا ${label}`)) { log(`${PERIODS[tab()].long} ${day()}: تسجيل ${rows.length} ${label}`); render(); }
      } else if (d.attDel) {
        const [table, id] = d.attDel.split("|");
        const isG = table === "att_groups", isT = table === "att_teachers";
        const name = isG ? groupName(id) : isT ? teacherName(id) : (D.students.find((s) => s.id === id) || {}).name;
        if (!confirmTap(t, isG ? "حذف الحلقة؟ (يبقى طلابها بلا حلقة)" : isT ? "حذف الأستاذ وكل سجلاته؟" : "حذف الطالب وكل سجلاته؟")) return;
        const r = await MH.cloud.att.remove(table, id);
        if (r.error) { toast(MH.cloud.msg(r.error), "warn"); return; }
        log(`حذف ${isG ? "حلقة" : isT ? "أستاذ" : "طالب"}: ${name}`); toast("تم الحذف");
        await loadBase(true); rangeKey = ""; trKey = "";
        if (tab() === "teachers") { if (tview() !== "list") await loadTRecords(true); } else if (tab() !== "roster") await loadRecords(true);
        render();
      }
    } finally { busy = false; }
  });

  document.addEventListener("change", (e) => {
    const t = e.target;
    if (!inRoot(t)) return;
    if (t.id === "attDate" && t.value) location.hash = href({ d: t.value });
    if (t.id === "attGroup") location.hash = href({ g: t.value });
    if (t.id === "attTPer") location.hash = href({ p: t.value });
    if (t.id === "attMonth" && t.value) location.hash = href({ mo: t.value });
  });
  document.addEventListener("input", (e) => {
    const t = e.target;
    if (!inRoot(t) || t.id !== "attSearch") return;
    const q = norm(t.value);
    $$("[data-search]", root).forEach((el) => (el.hidden = !!q && !el.dataset.search.includes(q)));
  });

  document.addEventListener("submit", async (e) => {
    const f = e.target;
    if (!inRoot(f) || !/^att/.test(f.id)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (busy || !allowed()) return;
    const v = Object.fromEntries(new FormData(f).entries());
    const str = (k) => String(v[k] || "").trim() || null;
    const btn = f.querySelector("button.btn");
    busy = true; if (btn) btn.disabled = true;
    try {
      switch (f.id) {
        case "attMem": {
          const sid = f.dataset.sid;
          const row = Object.assign(baseRow(sid), { new_from: str("new_from"), new_to: str("new_to"), old_from: str("old_from"), old_to: str("old_to"), grade: str("grade"), note: str("note") });
          if (await put([row], "تم حفظ الحفظ")) {
            const s = D.students.find((x) => x.id === sid);
            log(`حفظ ${s ? s.name : ""} — ${day()} ${PERIODS[tab()].t}`);
            refreshRow(sid);
          }
          break;
        }
        case "attTNote": {
          const tid = f.dataset.tid;
          const r0 = trec(tid) || {};
          const row = { teacher_id: tid, date: day(), period: tper(), status: r0.status || null, out_status: r0.out_status || null, in_at: r0.in_at || null, out_at: r0.out_at || null, note: str("note") };
          if (await putT([row], "تم حفظ الملاحظة")) refreshTRow(tid);
          break;
        }
        case "attTeacherForm": {
          const id = f.dataset.edit;
          const row = { name: str("name"), phone: str("phone"), subject: str("subject"), periods: ["am", "pm", "both"].includes(v.periods) ? v.periods : "both", joined: str("joined"), note: str("note") };
          if (id) row.active = !!v.active;
          if (!row.name) { toast("اكتب اسم الأستاذ", "warn"); break; }
          let tid = id;
          if (id) { const r = await MH.cloud.att.save("att_teachers", row, id); if (r.error) { toast(MH.cloud.msg(r.error), "warn"); break; } }
          else {
            const r = await MH.cloud.att.insertOne("att_teachers", row);
            if (r.error) { toast(MH.cloud.msg(r.error), "warn"); break; }
            tid = r.data.id;
          }
          /* إسناد الحلقات: المختارة تُسند إليه، وما أُلغي اختياره يُفرغ */
          for (const g of D.groups) {
            const want = !!v["g_" + g.id];
            if (want && g.teacher_id !== tid) await MH.cloud.att.save("att_groups", { teacher_id: tid }, g.id);
            else if (!want && g.teacher_id === tid) await MH.cloud.att.save("att_groups", { teacher_id: null }, g.id);
          }
          log(`${id ? "تعديل" : "إضافة"} أستاذ: ${row.name}`); toast(id ? "تم حفظ الأستاذ" : "تمت إضافة الأستاذ");
          await loadBase(true);
          if (id) location.hash = href({ et: null }); else render();
          break;
        }
        case "attGroupForm": {
          const id = f.dataset.edit;
          const row = { name: str("name"), note: str("note"), teacher_id: str("teacher_id") };
          if (!row.name) { toast("اكتب اسم الحلقة", "warn"); break; }
          if (!id) row.sort = D.groups.length;
          const r = await MH.cloud.att.save("att_groups", row, id);
          if (r.error) { toast(r.error === "dup" ? "توجد حلقة بهذا الاسم" : MH.cloud.msg(r.error), "warn"); break; }
          log(`${id ? "تعديل" : "إضافة"} حلقة: ${row.name}`); toast(id ? "تم حفظ الحلقة" : "تمت إضافة الحلقة");
          await loadBase(true);
          if (id) location.hash = href({ eg: null }); else render();
          break;
        }
        case "attStudentForm": {
          const id = f.dataset.edit;
          const row = { name: str("name"), group_id: str("group_id"), guardian_phone: str("guardian_phone"), note: str("note") };
          if (id) row.active = !!v.active;
          if (!row.name) { toast("اكتب اسم الطالب", "warn"); break; }
          const r = await MH.cloud.att.save("att_students", row, id);
          if (r.error) { toast(MH.cloud.msg(r.error), "warn"); break; }
          log(`${id ? "تعديل" : "إضافة"} طالب: ${row.name}`); toast(id ? "تم حفظ الطالب" : "تمت إضافة الطالب");
          await loadBase(true);
          if (id) location.hash = href({ es: null }); else render();
          break;
        }
        case "attBulkStudents": {
          const gid = str("group_id");
          /* كل سطر: الاسم، الهاتف، الملاحظة — مفصولة بفاصلة عربية أو لاتينية أو بعلامة جدولة (من Excel) */
          const seen = new Set(D.students.filter((s) => (s.group_id || null) === gid).map((s) => norm(s.name)));
          const rows = [];
          let skipped = 0;
          String(v.names || "").split("\n").forEach((line) => {
            const parts = line.split(/\t|،|,/).map((x) => x.trim());
            const name = parts[0];
            if (!name) return;
            if (seen.has(norm(name))) { skipped++; return; }
            seen.add(norm(name));
            const phone = (parts[1] || "").replace(/[٠-٩]/g, (c) => "٠١٢٣٤٥٦٧٨٩".indexOf(c));
            rows.push({ name, group_id: gid, guardian_phone: phone || null, note: parts.slice(2).filter(Boolean).join("، ") || null });
          });
          if (!rows.length) { toast(skipped ? "كل الأسماء موجودة من قبل في هذه الحلقة" : "اكتب الأسماء", "warn"); break; }
          const r = await MH.cloud.att.save("att_students", rows);
          if (r.error) { toast(MH.cloud.msg(r.error), "warn"); break; }
          log(`إضافة ${rows.length} طالبًا${gid ? " إلى حلقة " + groupName(gid) : ""}`);
          toast(`تمت إضافة ${arNum(rows.length)} طالبًا${skipped ? ` — وتُجوهل ${arNum(skipped)} موجود من قبل` : ""}`);
          await loadBase(true); render();
          break;
        }
      }
    } finally { busy = false; if (btn && btn.isConnected) btn.disabled = false; }
  }, true);

  MH.attendance = { mount };
})();
