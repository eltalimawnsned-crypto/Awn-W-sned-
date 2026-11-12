/* =========================================================
   منصة المحجة البيضاء — المالية (لوحة الإدارة)
   التبرعات · الكفالات ودفعاتها · المصروفات · الميزانية · الملخص والتقارير
   البيانات في Supabase (جداول fin_*) ولا يقرؤها أو يعدّلها إلا
   المدير العام وأمين المال؛ تفرض ذلك سياسات RLS في الخادم.
   الإيصالات في مجلد تخزين خاص وتُفتح بروابط مؤقتة.
   يُحمَّل بعد js/cloud.js وقبل js/admin.js.
   ========================================================= */
(function () {
  "use strict";
  const { $, esc, arNum, toast, today, fmtDate, confirmTap, can, ic } = MH;

  const T = { donations: "fin_donations", sponsorships: "fin_sponsorships", payments: "fin_sponsorship_payments", expenses: "fin_expenses", budget: "fin_budget" };
  const METHODS = ["نقدًا", "بنكيلي", "مصرفي", "سداد", "تحويل بنكي", "شيك"];
  const PURPOSES = ["عام", "كفالة الطلاب", "رواتب المعلمين", "بناء وتجهيز", "زكاة", "صدقة جارية", "إفطار صائم", "أخرى"];
  const EXPENSE_CATS = ["رواتب ومكافآت المعلمين", "إيجار", "كهرباء وماء", "إنترنت واتصالات", "مستلزمات تعليمية", "طباعة وكتب", "صيانة", "نقل", "ضيافة", "مساعدات للطلاب", "أخرى"];
  const SP_TYPES = ["كفالة طالب", "كفالة معلم", "كفالة حلقة", "كفالة يتيم", "أخرى"];
  const SP_STATUS = ["نشطة", "متوقفة", "منتهية"];
  const SPONSOR_INCOME = "الكفالات"; // بند الإيرادات الذي تُحسب فيه دفعات الكفالات
  const SUBTABS = [["summary", "الملخص", "chart"], ["donations", "التبرعات", "coins"], ["sponsorships", "الكفالات", "users"], ["expenses", "المصروفات", "file"], ["budget", "الميزانية", "layers"]];
  const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

  let D = null, loadedAt = 0, root = null, busy = false;

  /* ---------------- أدوات ---------------- */
  const num = (v) => { const n = Number(String(v ?? "").replace(/[٠-٩]/g, (c) => "٠١٢٣٤٥٦٧٨٩".indexOf(c)).replace(/[,،\s]/g, "")); return isFinite(n) ? n : NaN; };
  const sum = (arr, k = "amount") => arr.reduce((s, x) => s + (Number(x[k]) || 0), 0);
  const money = (n) => `${arNum(Math.round((Number(n) || 0) * 100) / 100)} <small>أوقية</small>`;
  const params = () => new URLSearchParams(location.hash.split("?")[1] || "");
  const curYear = () => Number(params().get("y")) || new Date().getFullYear();
  const yOf = (d) => Number(String(d || "").slice(0, 4));
  const ymNow = () => today().slice(0, 7);
  const href = (o) => { const p = params(); Object.entries(o).forEach(([k, v]) => (v == null || v === "" ? p.delete(k) : p.set(k, v))); return "#/finance?" + p.toString(); };
  const opts = (list, sel) => list.map((x) => `<option ${x === sel ? "selected" : ""}>${esc(x)}</option>`).join("");
  const datalist = (id, list) => `<datalist id="${id}">${list.map((x) => `<option value="${esc(x)}">`).join("")}</datalist>`;
  const ymLabel = (ym) => { const [y, m] = String(ym).split("-").map(Number); return `${MONTHS[m - 1] || ""} ${yr(y)}`.trim(); };
  const monthsBetween = (a, b) => { const [y1, m1] = a.split("-").map(Number); const [y2, m2] = b.split("-").map(Number); return (y2 - y1) * 12 + (m2 - m1) + 1; };
  const allowed = () => can("finance:manage");
  const yr = (n) => Number(n).toLocaleString("ar", { useGrouping: false });
  const log = (text) => { MH.logAction("المالية: " + text); MH.save(); };

  /* الكفالة: ما استُحق وما دُفع وما تأخر حتى الشهر الحالي */
  function spStats(sp) {
    const pays = D.payments.filter((p) => p.sponsorship_id === sp.id);
    const start = String(sp.start_date || today()).slice(0, 7);
    let end = ymNow();
    if (sp.end_date && sp.end_date.slice(0, 7) < end) end = sp.end_date.slice(0, 7);
    const due = sp.status === "نشطة" && start <= end ? monthsBetween(start, end) : 0;
    const paidIn = pays.filter((p) => p.period >= start && p.period <= end).length;
    const late = Math.max(0, due - paidIn);
    return { pays, late, lateAmount: late * (Number(sp.monthly) || 0), paidYear: sum(pays.filter((p) => yOf(p.period) === curYear())) };
  }

  /* ---------------- التحميل ---------------- */
  async function load(force) {
    if (!force && D && Date.now() - loadedAt < 60000) return { data: D };
    const r = await MH.cloud.fin.loadAll();
    if (!r.error) { D = r.data; loadedAt = Date.now(); }
    return r;
  }
  async function mount(el) {
    root = el;
    if (!el) return;
    if (!allowed()) { el.innerHTML = `<div class="empty forbidden"><span>⛔</span><h2>غير مصرّح</h2><p>المالية للمدير العام وأمين المال فقط.</p></div>`; return; }
    const r = await load(false);
    if (!el.isConnected) return;
    if (r.error) { el.innerHTML = `<h1 class="adm-title">المالية</h1><div class="box"><p>${esc(MH.cloud.msg(r.error))}</p><button class="btn" data-fin-reload>إعادة المحاولة</button></div>`; return; }
    render();
  }
  async function refresh() { await load(true); if (root && root.isConnected) render(); }

  /* ---------------- الرسم ---------------- */
  function render() {
    const tab = params().get("t") || "summary";
    const y = curYear();
    const years = new Set([new Date().getFullYear(), y]);
    [...D.donations, ...D.expenses].forEach((x) => yOf(x.date) && years.add(yOf(x.date)));
    D.payments.forEach((p) => years.add(yOf(p.period)));
    D.budget.forEach((b) => years.add(b.year));
    const views = { summary: vSummary, donations: vDonations, sponsorships: vSponsorships, expenses: vExpenses, budget: vBudget };
    root.innerHTML = `
      <div class="fin-head">
        <h1 class="adm-title">${ic("coins")} المالية</h1>
        <label class="inline">السنة:
          <select id="finYear">${[...years].sort((a, b) => b - a).map((x) => `<option value="${x}" ${x === y ? "selected" : ""}>${yr(x)}</option>`).join("")}</select>
        </label>
      </div>
      <nav class="fin-tabs">${SUBTABS.map(([k, t, i]) => `<a href="${href({ t: k, edit: null, pay: null })}" class="${k === tab ? "on" : ""}">${ic(i)}${t}</a>`).join("")}</nav>
      ${(views[tab] || vSummary)(y)}
      ${datalist("finMethods", METHODS)}${datalist("finPurposes", [...PURPOSES, SPONSOR_INCOME])}${datalist("finExpCats", EXPENSE_CATS)}${datalist("finSpTypes", SP_TYPES)}`;
  }

  /* ---- الملخص ---- */
  function vSummary(y) {
    const don = D.donations.filter((d) => yOf(d.date) === y);
    const pay = D.payments.filter((p) => yOf(p.period) === y);
    const exp = D.expenses.filter((e) => yOf(e.date) === y);
    const income = sum(don) + sum(pay), out = sum(exp), net = income - out;
    const cash = sum(D.donations) + sum(D.payments) - sum(D.expenses);
    const active = D.sponsorships.filter((s) => s.status === "نشطة");
    const late = active.map((s) => ({ s, ...spStats(s) })).filter((x) => x.late > 0);
    const monthly = MONTHS.map((m, i) => {
      const ym = `${y}-${String(i + 1).padStart(2, "0")}`;
      const inc = sum(don.filter((d) => d.date.slice(0, 7) === ym)) + sum(pay.filter((p) => p.period === ym));
      const o = sum(exp.filter((e) => e.date.slice(0, 7) === ym));
      return { m, inc, o };
    });
    const maxM = Math.max(1, ...monthly.map((x) => Math.max(x.inc, x.o)));
    const group = (rows, key) => { const g = {}; rows.forEach((r) => (g[r[key] || "أخرى"] = (g[r[key] || "أخرى"] || 0) + Number(r.amount))); return Object.entries(g).sort((a, b) => b[1] - a[1]); };
    const byPurpose = group(don, "purpose"); if (sum(pay)) byPurpose.push([SPONSOR_INCOME, sum(pay)]); byPurpose.sort((a, b) => b[1] - a[1]);
    const byCat = group(exp, "category");
    const bars = (rows, cls) => { const mx = Math.max(1, ...rows.map((r) => r[1])); return rows.map(([k, v]) => `<li><span>${esc(k)}</span><div class="bar ${cls}"><span style="width:${(v / mx) * 100}%"></span></div><b>${arNum(Math.round(v))}</b></li>`).join("") || `<li class="muted">لا توجد بيانات لهذه السنة.</li>`; };
    return `
      <div class="fin-cards">
        <div class="fin-card in"><span>الإيرادات ${yr(y)}</span><b>${money(income)}</b><small>تبرعات ${money(sum(don))} · كفالات ${money(sum(pay))}</small></div>
        <div class="fin-card out"><span>المصروفات ${yr(y)}</span><b>${money(out)}</b><small>${arNum(exp.length)} عملية</small></div>
        <div class="fin-card ${net >= 0 ? "in" : "out"}"><span>صافي السنة</span><b>${money(net)}</b><small>${net >= 0 ? "فائض" : "عجز"}</small></div>
        <div class="fin-card"><span>رصيد الصندوق (كل السنوات)</span><b>${money(cash)}</b><small>كل الإيرادات ناقص كل المصروفات</small></div>
      </div>
      <div class="grid two mt">
        <div class="box">
          <h3>الكفالات النشطة</h3>
          <p><b>${arNum(active.length)}</b> كفالة · التزام شهري <b>${money(sum(active, "monthly"))}</b></p>
          ${late.length ? `<h4 class="fin-warn">⚠️ كفالات متأخرة (${arNum(late.length)})</h4><ul class="simple">${late.slice(0, 8).map((x) => `<li><span><b>${esc(x.s.sponsor)}</b> ← ${esc(x.s.beneficiary)}</span><span class="nowrap">${arNum(x.late)} شهر · ${money(x.lateAmount)} <a class="link" href="${href({ t: "sponsorships", pay: x.s.id })}">تسجيل دفعة</a></span></li>`).join("")}</ul>` : `<p class="muted small">✓ لا توجد كفالات متأخرة.</p>`}
        </div>
        <div class="box">
          <h3>الإيرادات والمصروفات حسب الشهر</h3>
          <div class="table-wrap"><table class="fin-months">
            <thead><tr><th>الشهر</th><th>الإيرادات</th><th>المصروفات</th><th>الصافي</th></tr></thead>
            <tbody>${monthly.map((x) => `<tr><td>${x.m}</td>
              <td><div class="bar mini in"><span style="width:${(x.inc / maxM) * 100}%"></span></div> ${arNum(Math.round(x.inc))}</td>
              <td><div class="bar mini out"><span style="width:${(x.o / maxM) * 100}%"></span></div> ${arNum(Math.round(x.o))}</td>
              <td class="${x.inc - x.o < 0 ? "neg" : ""}">${arNum(Math.round(x.inc - x.o))}</td></tr>`).join("")}</tbody>
          </table></div>
        </div>
      </div>
      <div class="grid two">
        <div class="box"><h3>الإيرادات حسب الغرض</h3><ul class="hbars">${bars(byPurpose, "in")}</ul></div>
        <div class="box"><h3>المصروفات حسب البند</h3><ul class="hbars">${bars(byCat, "out")}</ul></div>
      </div>
      ${budgetTable(y, true)}
      <div class="box">
        <h3>تقرير سنة ${yr(y)}</h3>
        <p class="muted small">ملفات تُفتح في Excel أو Google Sheets.</p>
        <div class="actions">
          <button class="btn sm ghost" data-fin-csv="donations">تنزيل التبرعات</button>
          <button class="btn sm ghost" data-fin-csv="payments">تنزيل دفعات الكفالات</button>
          <button class="btn sm ghost" data-fin-csv="expenses">تنزيل المصروفات</button>
          <button class="btn sm ghost" data-fin-print>طباعة الملخص</button>
        </div>
      </div>`;
  }

  /* ---- جدول عام مع الإجمالي ---- */
  const receiptCell = (r) => (r.receipt ? `<button class="link" data-fin-receipt="${esc(r.receipt)}">عرض</button>` : "—");
  const rowActs = (tab, table, r) => `<td class="nowrap"><a class="link" href="${href({ t: tab, edit: r.id })}">تعديل</a> · <button class="link danger" data-fin-del="${table}|${r.id}">حذف</button></td>`;

  /* ---- التبرعات ---- */
  function vDonations(y) {
    const ed = D.donations.find((d) => d.id === params().get("edit"));
    const r0 = ed || { date: today(), donor: "", phone: "", amount: "", method: "نقدًا", purpose: "عام", note: "" };
    const rows = D.donations.filter((d) => yOf(d.date) === y).sort((a, b) => b.date.localeCompare(a.date));
    return `
      <form class="box form" id="finDonation" data-edit="${ed ? ed.id : ""}">
        <h3>${ed ? "تعديل تبرع" : "تسجيل تبرع"}</h3>
        <div class="row">
          <label>اسم المتبرع<input name="donor" value="${esc(r0.donor)}" placeholder="فاعل خير"></label>
          <label>الهاتف (اختياري)<input name="phone" value="${esc(r0.phone || "")}" inputmode="tel" dir="ltr"></label>
        </div>
        <div class="row">
          <label>المبلغ (أوقية)<input name="amount" value="${esc(r0.amount)}" required inputmode="decimal" dir="ltr"></label>
          <label>التاريخ<input type="date" name="date" value="${esc(r0.date)}" required dir="ltr"></label>
        </div>
        <div class="row">
          <label>طريقة الدفع<input name="method" value="${esc(r0.method)}" list="finMethods" required></label>
          <label>الغرض<input name="purpose" value="${esc(r0.purpose)}" list="finPurposes" required></label>
        </div>
        <label>ملاحظة<input name="note" value="${esc(r0.note || "")}"></label>
        <label>الإيصال (صورة أو PDF — اختياري)<input type="file" name="receiptFile" accept="image/*,application/pdf"></label>
        ${ed && ed.receipt ? `<p class="small">إيصال محفوظ: ${receiptCell(ed)} · اختر ملفًا جديدًا لاستبداله</p>` : ""}
        <div class="actions"><button class="btn">${ed ? "حفظ التعديل" : "تسجيل التبرع"}</button>${ed ? `<a class="btn ghost" href="${href({ edit: null })}">إلغاء</a>` : ""}</div>
      </form>
      <div class="box">
        <h3>تبرعات ${yr(y)} (${arNum(rows.length)}) <button class="btn sm ghost fl" data-fin-csv="donations">تنزيل</button></h3>
        <div class="table-wrap"><table>
          <thead><tr><th>التاريخ</th><th>المتبرع</th><th>المبلغ</th><th>الطريقة</th><th>الغرض</th><th>إيصال</th><th></th></tr></thead>
          <tbody>${rows.map((r) => `<tr class="${ed && ed.id === r.id ? "editing" : ""}"><td class="nowrap">${fmtDate(r.date)}</td><td><b>${esc(r.donor)}</b>${r.phone ? `<br><small dir="ltr">${esc(r.phone)}</small>` : ""}${r.note ? `<br><small class="muted">${esc(r.note)}</small>` : ""}</td>
            <td class="nowrap">${money(r.amount)}</td><td>${esc(r.method)}</td><td>${esc(r.purpose)}</td><td>${receiptCell(r)}</td>${rowActs("donations", T.donations, r)}</tr>`).join("") || `<tr><td colspan="7" class="muted">لا توجد تبرعات في هذه السنة.</td></tr>`}</tbody>
          ${rows.length ? `<tfoot><tr><th colspan="2">الإجمالي</th><th colspan="5">${money(sum(rows))}</th></tr></tfoot>` : ""}
        </table></div>
      </div>`;
  }

  /* ---- الكفالات ---- */
  function vSponsorships(y) {
    const p = params();
    const ed = D.sponsorships.find((s) => s.id === p.get("edit"));
    const r0 = ed || { sponsor: "", phone: "", type: "كفالة طالب", beneficiary: "", monthly: "", start_date: today(), end_date: "", status: "نشطة", note: "" };
    const paySp = D.sponsorships.find((s) => s.id === p.get("pay"));
    const list = [...D.sponsorships].sort((a, b) => SP_STATUS.indexOf(a.status) - SP_STATUS.indexOf(b.status) || String(a.sponsor).localeCompare(String(b.sponsor), "ar"));
    const active = list.filter((s) => s.status === "نشطة");
    const pays = D.payments.filter((x) => yOf(x.period) === y).sort((a, b) => b.period.localeCompare(a.period));
    const spName = (id) => { const s = D.sponsorships.find((x) => x.id === id); return s ? `${esc(s.sponsor)} ← ${esc(s.beneficiary)}` : "—"; };
    const def = paySp || active[0];
    return `
      <div class="grid two">
        <form class="box form" id="finPayment">
          <h3>${ic("check")} تسجيل دفعة كفالة</h3>
          ${active.length ? `
          <label>الكفالة<select name="sponsorship_id" id="finPaySp">${active.map((s) => `<option value="${s.id}" data-monthly="${esc(s.monthly)}" ${def && def.id === s.id ? "selected" : ""}>${esc(s.sponsor)} ← ${esc(s.beneficiary)} (${arNum(s.monthly)})</option>`).join("")}</select></label>
          <div class="row">
            <label>عن شهر<input type="month" name="period" value="${ymNow()}" required dir="ltr"></label>
            <label>المبلغ (أوقية)<input name="amount" id="finPayAmount" value="${esc(def ? def.monthly : "")}" required inputmode="decimal" dir="ltr"></label>
          </div>
          <div class="row">
            <label>تاريخ الاستلام<input type="date" name="paid_on" value="${today()}" required dir="ltr"></label>
            <label>طريقة الدفع<input name="method" value="نقدًا" list="finMethods" required></label>
          </div>
          <label>ملاحظة<input name="note"></label>
          <button class="btn">تسجيل الدفعة</button>` : `<p class="muted">أضف كفالة نشطة أولًا.</p>`}
        </form>
        <form class="box form" id="finSponsorship" data-edit="${ed ? ed.id : ""}">
          <h3>${ed ? "تعديل كفالة" : "إضافة كفالة"}</h3>
          <div class="row">
            <label>اسم الكافل<input name="sponsor" value="${esc(r0.sponsor)}" required></label>
            <label>هاتف الكافل<input name="phone" value="${esc(r0.phone || "")}" inputmode="tel" dir="ltr"></label>
          </div>
          <div class="row">
            <label>نوع الكفالة<input name="type" value="${esc(r0.type)}" list="finSpTypes" required></label>
            <label>المكفول (طالب، معلم، حلقة…)<input name="beneficiary" value="${esc(r0.beneficiary)}" required></label>
          </div>
          <div class="row">
            <label>المبلغ الشهري (أوقية)<input name="monthly" value="${esc(r0.monthly)}" required inputmode="decimal" dir="ltr"></label>
            <label>الحالة<select name="status">${opts(SP_STATUS, r0.status)}</select></label>
          </div>
          <div class="row">
            <label>تاريخ البداية<input type="date" name="start_date" value="${esc(r0.start_date)}" required dir="ltr"></label>
            <label>تاريخ النهاية (اختياري)<input type="date" name="end_date" value="${esc(r0.end_date || "")}" dir="ltr"></label>
          </div>
          <label>ملاحظة<input name="note" value="${esc(r0.note || "")}"></label>
          <div class="actions"><button class="btn">${ed ? "حفظ التعديل" : "إضافة الكفالة"}</button>${ed ? `<a class="btn ghost" href="${href({ edit: null })}">إلغاء</a>` : ""}</div>
        </form>
      </div>
      <div class="box">
        <h3>الكفالات (${arNum(list.length)}) · الالتزام الشهري للنشطة: ${money(sum(active, "monthly"))}</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>الكافل</th><th>المكفول</th><th>النوع</th><th>شهريًا</th><th>الحالة</th><th>مدفوع ${yr(y)}</th><th>المتأخرات</th><th></th></tr></thead>
          <tbody>${list.map((s) => { const st = spStats(s); return `<tr class="${ed && ed.id === s.id ? "editing" : ""}">
            <td><b>${esc(s.sponsor)}</b>${s.phone ? `<br><small dir="ltr">${esc(s.phone)}</small>` : ""}</td><td>${esc(s.beneficiary)}</td><td>${esc(s.type)}</td>
            <td class="nowrap">${money(s.monthly)}</td>
            <td><span class="tag ${s.status === "نشطة" ? "ok" : s.status === "متوقفة" ? "soft" : "bad"}">${esc(s.status)}</span></td>
            <td class="nowrap">${money(st.paidYear)}</td>
            <td class="nowrap ${st.late ? "neg" : ""}">${st.late ? `${arNum(st.late)} شهر<br><small>${money(st.lateAmount)}</small>` : "✓"}</td>
            <td class="nowrap">${s.status === "نشطة" ? `<a class="link" href="${href({ t: "sponsorships", pay: s.id, edit: null })}">دفعة</a> · ` : ""}<a class="link" href="${href({ t: "sponsorships", edit: s.id, pay: null })}">تعديل</a> · <button class="link danger" data-fin-del="${T.sponsorships}|${s.id}">حذف</button></td></tr>`; }).join("") || `<tr><td colspan="8" class="muted">لا توجد كفالات بعد.</td></tr>`}</tbody>
        </table></div>
      </div>
      <div class="box">
        <h3>دفعات ${yr(y)} (${arNum(pays.length)}) <button class="btn sm ghost fl" data-fin-csv="payments">تنزيل</button></h3>
        <div class="table-wrap"><table>
          <thead><tr><th>الشهر</th><th>الكفالة</th><th>المبلغ</th><th>استُلمت</th><th>الطريقة</th><th></th></tr></thead>
          <tbody>${pays.map((x) => `<tr><td class="nowrap">${ymLabel(x.period)}</td><td>${spName(x.sponsorship_id)}${x.note ? `<br><small class="muted">${esc(x.note)}</small>` : ""}</td><td class="nowrap">${money(x.amount)}</td><td class="nowrap">${fmtDate(x.paid_on)}</td><td>${esc(x.method)}</td>
            <td><button class="link danger" data-fin-del="${T.payments}|${x.id}">حذف</button></td></tr>`).join("") || `<tr><td colspan="6" class="muted">لا توجد دفعات في هذه السنة.</td></tr>`}</tbody>
          ${pays.length ? `<tfoot><tr><th colspan="2">الإجمالي</th><th colspan="4">${money(sum(pays))}</th></tr></tfoot>` : ""}
        </table></div>
      </div>`;
  }

  /* ---- المصروفات ---- */
  function vExpenses(y) {
    const ed = D.expenses.find((d) => d.id === params().get("edit"));
    const r0 = ed || { date: today(), category: EXPENSE_CATS[0], description: "", amount: "", method: "نقدًا", beneficiary: "", note: "" };
    const rows = D.expenses.filter((d) => yOf(d.date) === y).sort((a, b) => b.date.localeCompare(a.date));
    return `
      <form class="box form" id="finExpense" data-edit="${ed ? ed.id : ""}">
        <h3>${ed ? "تعديل مصروف" : "تسجيل مصروف"}</h3>
        <div class="row">
          <label>البند<input name="category" value="${esc(r0.category)}" list="finExpCats" required></label>
          <label>الوصف<input name="description" value="${esc(r0.description)}" required placeholder="راتب شهر أكتوبر لمعلم القرآن"></label>
        </div>
        <div class="row">
          <label>المبلغ (أوقية)<input name="amount" value="${esc(r0.amount)}" required inputmode="decimal" dir="ltr"></label>
          <label>التاريخ<input type="date" name="date" value="${esc(r0.date)}" required dir="ltr"></label>
        </div>
        <div class="row">
          <label>طريقة الدفع<input name="method" value="${esc(r0.method)}" list="finMethods" required></label>
          <label>المستفيد / الجهة (اختياري)<input name="beneficiary" value="${esc(r0.beneficiary || "")}"></label>
        </div>
        <label>ملاحظة<input name="note" value="${esc(r0.note || "")}"></label>
        <label>الإيصال / الفاتورة (صورة أو PDF — اختياري)<input type="file" name="receiptFile" accept="image/*,application/pdf"></label>
        ${ed && ed.receipt ? `<p class="small">إيصال محفوظ: ${receiptCell(ed)} · اختر ملفًا جديدًا لاستبداله</p>` : ""}
        <div class="actions"><button class="btn">${ed ? "حفظ التعديل" : "تسجيل المصروف"}</button>${ed ? `<a class="btn ghost" href="${href({ edit: null })}">إلغاء</a>` : ""}</div>
      </form>
      <div class="box">
        <h3>مصروفات ${yr(y)} (${arNum(rows.length)}) <button class="btn sm ghost fl" data-fin-csv="expenses">تنزيل</button></h3>
        <div class="table-wrap"><table>
          <thead><tr><th>التاريخ</th><th>البند</th><th>الوصف</th><th>المبلغ</th><th>الطريقة</th><th>إيصال</th><th></th></tr></thead>
          <tbody>${rows.map((r) => `<tr class="${ed && ed.id === r.id ? "editing" : ""}"><td class="nowrap">${fmtDate(r.date)}</td><td>${esc(r.category)}</td><td>${esc(r.description)}${r.beneficiary ? `<br><small class="muted">${esc(r.beneficiary)}</small>` : ""}</td>
            <td class="nowrap">${money(r.amount)}</td><td>${esc(r.method)}</td><td>${receiptCell(r)}</td>${rowActs("expenses", T.expenses, r)}</tr>`).join("") || `<tr><td colspan="7" class="muted">لا توجد مصروفات في هذه السنة.</td></tr>`}</tbody>
          ${rows.length ? `<tfoot><tr><th colspan="3">الإجمالي</th><th colspan="4">${money(sum(rows))}</th></tr></tfoot>` : ""}
        </table></div>
      </div>`;
  }

  /* ---- الميزانية ---- */
  function actualFor(y, kind, cat) {
    if (kind === "income") {
      if (cat === SPONSOR_INCOME) return sum(D.payments.filter((p) => yOf(p.period) === y));
      return sum(D.donations.filter((d) => yOf(d.date) === y && d.purpose === cat));
    }
    return sum(D.expenses.filter((e) => yOf(e.date) === y && e.category === cat));
  }
  function budgetTable(y, compact) {
    const rows = D.budget.filter((b) => b.year === y);
    if (!rows.length) return compact ? "" : `<div class="box"><p class="muted">لم تُحدَّد ميزانية لسنة ${yr(y)} بعد. أضف بنود الإيرادات والمصروفات المتوقعة من النموذج أعلاه.</p></div>`;
    const part = (kind, title) => {
      const rs = rows.filter((r) => r.kind === kind).sort((a, b) => b.planned - a.planned);
      if (!rs.length) return "";
      const tp = sum(rs, "planned"), ta = rs.reduce((s, r) => s + actualFor(y, kind, r.category), 0);
      return `<h4 class="cover-h">${title}</h4><div class="table-wrap"><table>
        <thead><tr><th>البند</th><th>المخطط</th><th>الفعلي</th><th>نسبة التنفيذ</th>${compact ? "" : "<th></th>"}</tr></thead>
        <tbody>${rs.map((r) => { const a = actualFor(y, kind, r.category); const pct = r.planned ? Math.round((a / r.planned) * 100) : 0; const over = kind === "expense" && a > r.planned;
          return `<tr><td>${esc(r.category)}${r.note ? `<br><small class="muted">${esc(r.note)}</small>` : ""}</td><td class="nowrap">${money(r.planned)}</td><td class="nowrap ${over ? "neg" : ""}">${money(a)}</td>
            <td><div class="bar mini ${kind === "income" ? "in" : "out"}"><span style="width:${Math.min(100, pct)}%"></span></div> ${arNum(pct)}٪${over ? " ⚠️" : ""}</td>
            ${compact ? "" : `<td class="nowrap"><a class="link" href="${href({ t: "budget", edit: r.id })}">تعديل</a> · <button class="link danger" data-fin-del="${T.budget}|${r.id}">حذف</button></td>`}</tr>`; }).join("")}</tbody>
        <tfoot><tr><th>الإجمالي</th><th>${money(tp)}</th><th>${money(ta)}</th><th colspan="${compact ? 1 : 2}">${tp ? arNum(Math.round((ta / tp) * 100)) + "٪" : "—"}</th></tr></tfoot>
      </table></div>`;
    };
    return `<div class="box"><h3>الميزانية مقابل الفعلي — ${yr(y)}</h3>${part("income", "الإيرادات المتوقعة")}${part("expense", "المصروفات المتوقعة")}</div>`;
  }
  function vBudget(y) {
    const ed = D.budget.find((b) => b.id === params().get("edit"));
    const r0 = ed || { kind: "expense", category: "", planned: "", note: "" };
    return `
      <form class="box form" id="finBudget" data-edit="${ed ? ed.id : ""}">
        <h3>${ed ? "تعديل بند" : "إضافة بند للميزانية"} — سنة ${yr(y)}</h3>
        <div class="row">
          <label>النوع<select name="kind" id="finBudgetKind"><option value="expense" ${r0.kind === "expense" ? "selected" : ""}>مصروفات متوقعة</option><option value="income" ${r0.kind === "income" ? "selected" : ""}>إيرادات متوقعة</option></select></label>
          <label>البند<input name="category" value="${esc(r0.category)}" list="${r0.kind === "income" ? "finPurposes" : "finExpCats"}" id="finBudgetCat" required></label>
        </div>
        <div class="row">
          <label>المبلغ المخطط للسنة (أوقية)<input name="planned" value="${esc(r0.planned)}" required inputmode="decimal" dir="ltr"></label>
          <label>ملاحظة<input name="note" value="${esc(r0.note || "")}"></label>
        </div>
        <p class="note">ⓘ اكتب البند بالاسم نفسه المستعمل في التبرعات (الغرض) أو المصروفات (البند) ليُحسب «الفعلي» تلقائيًا. دفعات الكفالات تُحسب في بند «${SPONSOR_INCOME}».</p>
        <div class="actions"><button class="btn">${ed ? "حفظ" : "إضافة البند"}</button>${ed ? `<a class="btn ghost" href="${href({ edit: null })}">إلغاء</a>` : ""}</div>
      </form>
      ${budgetTable(y, false)}`;
  }

  /* ---------------- التصدير ---------------- */
  function csv(kind) {
    const y = curYear();
    const spName = (id) => { const s = D.sponsorships.find((x) => x.id === id); return s ? `${s.sponsor} ← ${s.beneficiary}` : ""; };
    const sets = {
      donations: [["التاريخ", "المتبرع", "الهاتف", "المبلغ", "الطريقة", "الغرض", "ملاحظة"], D.donations.filter((d) => yOf(d.date) === y).map((r) => [r.date, r.donor, r.phone, r.amount, r.method, r.purpose, r.note])],
      payments: [["الشهر", "الكفالة", "المبلغ", "تاريخ الاستلام", "الطريقة", "ملاحظة"], D.payments.filter((p) => yOf(p.period) === y).map((r) => [r.period, spName(r.sponsorship_id), r.amount, r.paid_on, r.method, r.note])],
      expenses: [["التاريخ", "البند", "الوصف", "المبلغ", "الطريقة", "المستفيد", "ملاحظة"], D.expenses.filter((e) => yOf(e.date) === y).map((r) => [r.date, r.category, r.description, r.amount, r.method, r.beneficiary, r.note])],
    };
    const [head, rows] = sets[kind];
    const cell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const text = "﻿" + [head, ...rows].map((r) => r.map(cell).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    a.download = `mahajja-${kind}-${y}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /* ---------------- الأحداث ---------------- */
  const inRoot = (el) => root && root.isConnected && root.contains(el);

  document.addEventListener("click", async (e) => {
    const t = e.target.closest("button, a");
    if (!t || !inRoot(t)) return;
    const d = t.dataset;
    if (d.finReload !== undefined) { mount(root); }
    else if (d.finCsv) { csv(d.finCsv); }
    else if (d.finPrint !== undefined) { window.print(); }
    else if (d.finReceipt) {
      const w = window.open("", "_blank");
      const r = await MH.cloud.fin.receiptUrl(d.finReceipt);
      if (r.error) { if (w) w.close(); toast(MH.cloud.msg(r.error), "warn"); return; }
      if (w) w.location = r.data; else location.href = r.data;
    } else if (d.finDel) {
      if (!allowed()) return;
      if (!confirmTap(t, "تأكيد الحذف؟")) return;
      const [table, id] = d.finDel.split("|");
      const r = await MH.cloud.fin.remove(table, id);
      if (r.error) { toast(MH.cloud.msg(r.error), "warn"); return; }
      log("حذف عنصر من " + ({ fin_donations: "التبرعات", fin_sponsorships: "الكفالات", fin_sponsorship_payments: "دفعات الكفالات", fin_expenses: "المصروفات", fin_budget: "الميزانية" }[table] || table));
      toast("تم الحذف");
      if (params().get("edit") === id) location.hash = href({ edit: null });
      refresh();
    }
  });

  document.addEventListener("change", (e) => {
    const t = e.target;
    if (!inRoot(t)) return;
    if (t.id === "finYear") location.hash = href({ y: t.value, edit: null });
    if (t.id === "finPaySp") { const o = t.selectedOptions[0]; if (o) $("#finPayAmount").value = o.dataset.monthly; }
    if (t.id === "finBudgetKind") $("#finBudgetCat").setAttribute("list", t.value === "income" ? "finPurposes" : "finExpCats");
  });

  document.addEventListener("submit", async (e) => {
    const f = e.target;
    if (!inRoot(f) || !/^fin/.test(f.id)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (busy || !allowed()) return;
    const v = Object.fromEntries(new FormData(f).entries());
    const str = (k) => String(v[k] || "").trim() || null;
    const amount = (k) => { const n = num(v[k]); return n > 0 ? n : NaN; };
    const btn = f.querySelector("button.btn");
    const run = async (fn) => { busy = true; if (btn) btn.disabled = true; try { await fn(); } finally { busy = false; if (btn && btn.isConnected) btn.disabled = false; } };

    const withReceipt = async (row, folder) => {
      const file = f.receiptFile && f.receiptFile.files[0];
      if (!file) return true;
      if (file.size > 8 * 1024 * 1024) { toast("حجم الملف كبير؛ الحد ٨ ميغابايت", "warn"); return false; }
      toast("جارٍ رفع الإيصال…");
      const r = await MH.cloud.fin.uploadReceipt(file, folder);
      if (r.error) { toast("تعذّر رفع الإيصال: " + MH.cloud.msg(r.error), "warn"); return false; }
      row.receipt = r.data; return true;
    };
    const finish = async (r, msg, logText) => {
      if (r.error) { toast(MH.cloud.msg(r.error), "warn"); return; }
      log(logText); toast(msg);
      await load(true);
      if (params().get("edit")) location.hash = href({ edit: null }); else render();
    };

    await run(async () => {
      switch (f.id) {
        case "finDonation": {
          const row = { donor: str("donor") || "فاعل خير", phone: str("phone"), amount: amount("amount"), date: v.date, method: str("method") || "نقدًا", purpose: str("purpose") || "عام", note: str("note") };
          if (!(row.amount > 0)) { toast("أدخل مبلغًا صحيحًا", "warn"); return; }
          if (!(await withReceipt(row, "donations"))) return;
          const id = f.dataset.edit;
          await finish(await MH.cloud.fin.save(T.donations, row, id), id ? "تم حفظ التعديل" : "تم تسجيل التبرع", `${id ? "تعديل" : "تسجيل"} تبرع ${row.amount} أوقية من ${row.donor}`);
          break;
        }
        case "finExpense": {
          const row = { category: str("category") || "أخرى", description: str("description"), amount: amount("amount"), date: v.date, method: str("method") || "نقدًا", beneficiary: str("beneficiary"), note: str("note") };
          if (!(row.amount > 0)) { toast("أدخل مبلغًا صحيحًا", "warn"); return; }
          if (!(await withReceipt(row, "expenses"))) return;
          const id = f.dataset.edit;
          await finish(await MH.cloud.fin.save(T.expenses, row, id), id ? "تم حفظ التعديل" : "تم تسجيل المصروف", `${id ? "تعديل" : "تسجيل"} مصروف ${row.amount} أوقية: ${row.description}`);
          break;
        }
        case "finSponsorship": {
          const m = num(v.monthly);
          const row = { sponsor: str("sponsor"), phone: str("phone"), type: str("type") || "كفالة طالب", beneficiary: str("beneficiary"), monthly: m, status: SP_STATUS.includes(v.status) ? v.status : "نشطة", start_date: v.start_date, end_date: v.end_date || null, note: str("note") };
          if (!(m >= 0)) { toast("أدخل مبلغًا شهريًا صحيحًا", "warn"); return; }
          if (row.end_date && row.end_date < row.start_date) { toast("تاريخ النهاية قبل تاريخ البداية", "warn"); return; }
          const id = f.dataset.edit;
          await finish(await MH.cloud.fin.save(T.sponsorships, row, id), id ? "تم حفظ الكفالة" : "تمت إضافة الكفالة", `${id ? "تعديل" : "إضافة"} كفالة: ${row.sponsor} ← ${row.beneficiary}`);
          break;
        }
        case "finPayment": {
          const row = { sponsorship_id: v.sponsorship_id, period: v.period, amount: amount("amount"), paid_on: v.paid_on, method: str("method") || "نقدًا", note: str("note") };
          if (!(row.amount > 0)) { toast("أدخل مبلغًا صحيحًا", "warn"); return; }
          if (!/^\d{4}-\d{2}$/.test(row.period || "")) { toast("اختر الشهر", "warn"); return; }
          const sp = D.sponsorships.find((s) => s.id === row.sponsorship_id);
          await finish(await MH.cloud.fin.save(T.payments, row), "تم تسجيل الدفعة", `دفعة كفالة ${sp ? sp.sponsor : ""} عن ${row.period}: ${row.amount} أوقية`);
          break;
        }
        case "finBudget": {
          const row = { year: curYear(), kind: v.kind === "income" ? "income" : "expense", category: str("category"), planned: num(v.planned), note: str("note") };
          if (!(row.planned >= 0) || !row.category) { toast("تحقق من البند والمبلغ", "warn"); return; }
          const id = f.dataset.edit;
          const r = id ? await MH.cloud.fin.save(T.budget, row, id) : await MH.cloud.fin.upsertBudget(row);
          await finish(r, "تم حفظ بند الميزانية", `بند ميزانية ${row.year}: ${row.category} = ${row.planned}`);
          break;
        }
      }
    });
  }, true);

  MH.finance = { mount };
})();
