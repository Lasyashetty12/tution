(() => {
  "use strict";
  const cfg = window.VISION_CONFIG || {};
  const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(cfg.supabaseUrl || "") && cfg.supabaseAnonKey && !String(cfg.supabaseAnonKey).includes("YOUR_");
  const db = configured ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const esc = (v = "") => String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[c]);
  const digits = v => String(v || "").replace(/\D/g, "");
  const studentEmail = mobile => `${digits(mobile)}@student.infinite.local`;
  const parentEmail = mobile => `${digits(mobile)}@parent.infinite.local`;
  const fmtDate = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {day:"2-digit",month:"short",year:"numeric"}) : "—";
  const dayName = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {weekday:"short"}) : "—";
  const pct = n => Number.isFinite(Number(n)) ? `${Number(n).toFixed(1)}%` : "—";
  const roleName = role => ({student:"Student",parent:"Parent",teacher:"Sir / Teacher",admin:"Admin"})[role] || role;
  const state = { session:null, profile:null, student:null, students:[], batches:[], subjects:[], attendance:[], leaves:[], marks:[], announcements:[], teachers:[], charts:{} };

  function setStatus(el, message, error = false) {
    if (!el) return;
    el.textContent = message;
    el.classList.toggle("error", error);
  }
  function buttonBusy(button, busy, label) {
    if (!button) return;
    if (busy) { button.dataset.label = button.textContent; button.disabled = true; button.textContent = label || "Please wait…"; }
    else { button.disabled = false; button.textContent = button.dataset.label || button.textContent; }
  }
  function showCredentials(title, rows) {
    $("#credentialsBody").innerHTML = `<h3>${esc(title)}</h3><div class="credentials">${rows.map(([k,v]) => `<small>${esc(k)}</small><code>${esc(v)}</code>`).join("")}</div>`;
    $("#credentialsDialog").showModal();
  }
  $("#closeCredentials").addEventListener("click", () => $("#credentialsDialog").close());

  $("#loginRole").addEventListener("change", e => {
    const staff = e.target.value === "staff";
    $("#loginIdLabel").textContent = staff ? "Email address" : "Parent mobile number";
    $("#loginForm [name=login_id]").placeholder = staff ? "you@example.com" : "10-digit mobile number";
  });
  $("#showSetup").addEventListener("click", () => { $("#loginForm").classList.add("hidden"); $("#setupForm").classList.remove("hidden"); });
  $("#hideSetup").addEventListener("click", () => { $("#setupForm").classList.add("hidden"); $("#loginForm").classList.remove("hidden"); });

  $("#loginForm").addEventListener("submit", async event => {
    event.preventDefault();
    if (!db) return setStatus($("#loginStatus"), "The secure database is not configured.", true);
    const form = event.currentTarget, values = Object.fromEntries(new FormData(form));
    const id = String(values.login_id).trim();
    const email = values.role === "student" ? studentEmail(id) : values.role === "parent" ? parentEmail(id) : id.toLowerCase();
    const button = event.submitter; buttonBusy(button, true, "Signing in…"); setStatus($("#loginStatus"), "");
    const { data, error } = await db.auth.signInWithPassword({ email, password: values.password });
    buttonBusy(button, false);
    if (error || !data.session) return setStatus($("#loginStatus"), "Invalid login details.", true);
    await startPortal(data.session);
  });

  $("#setupForm").addEventListener("submit", async event => {
    event.preventDefault();
    if (!db) return setStatus($("#setupStatus"), "The secure database is not configured.", true);
    const form = event.currentTarget, v = Object.fromEntries(new FormData(form)), button = event.submitter;
    buttonBusy(button, true, "Creating admin…"); setStatus($("#setupStatus"), "");
    let session;
    const signed = await db.auth.signUp({ email:String(v.email).trim().toLowerCase(), password:v.password });
    if (signed.error && !/already registered/i.test(signed.error.message)) {
      buttonBusy(button, false); return setStatus($("#setupStatus"), signed.error.message, true);
    }
    session = signed.data?.session;
    if (!session) {
      const login = await db.auth.signInWithPassword({ email:String(v.email).trim().toLowerCase(), password:v.password });
      session = login.data?.session;
      if (!session) { buttonBusy(button, false); return setStatus($("#setupStatus"), "Check your email to confirm the account, then submit this setup form again.", true); }
    }
    const { error } = await db.rpc("claim_first_admin", { setup_token:v.token, admin_name:v.name });
    buttonBusy(button, false);
    if (error) return setStatus($("#setupStatus"), error.message, true);
    await db.auth.refreshSession();
    await startPortal((await db.auth.getSession()).data.session);
  });

  async function startPortal(session) {
    state.session = session;
    const { data: profile, error } = await db.from("profiles").select("*").eq("user_id", session.user.id).single();
    if (error || !profile) {
      $("#authPage").classList.remove("hidden"); $("#portalApp").classList.add("hidden");
      $("#loginForm").classList.add("hidden"); $("#setupForm").classList.remove("hidden");
      setStatus($("#setupStatus"), "This signed-in account has no role. Complete the one-time admin setup or contact an administrator.", true);
      return;
    }
    state.profile = profile;
    $("#authPage").classList.add("hidden"); $("#portalApp").classList.remove("hidden"); $("#loadingState").classList.remove("hidden");
    $("#userName").textContent = profile.display_name; $("#userRole").textContent = roleName(profile.role); $("#userInitial").textContent = profile.display_name[0]?.toUpperCase() || "I";
    $("#passwordAlert").classList.toggle("hidden", !profile.must_change_password);
    setupNavigation();
    try { await loadAll(); renderAll(); showView("dashboard"); }
    catch (e) { $("#loadingState").textContent = `Dashboard could not load: ${e.message}`; return; }
    $("#loadingState").classList.add("hidden");
  }

  function setupNavigation() {
    $$('[data-roles]').forEach(el => el.classList.toggle("hidden", !el.dataset.roles.split(",").includes(state.profile.role)));
    $$("[data-view]").forEach(button => button.addEventListener("click", () => showView(button.dataset.view)));
  }
  function showView(name) {
    $$(".view").forEach(v => v.classList.add("hidden"));
    $(`#${name}View`)?.classList.remove("hidden");
    $$("#portalNav button").forEach(b => b.classList.toggle("active", b.dataset.view === name));
    const titles = {dashboard:"Overview",profile:"Profile",students:"Students",attendance:"Attendance",leave:"Leave requests",scorecard:"Scorecards",accounts:"Administration",security:"Password & security"};
    $("#pageTitle").textContent = titles[name] || "Portal"; $("#sidebar").classList.remove("open"); window.scrollTo({top:0,behavior:"smooth"});
  }
  $("#portalMenu").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
  $("#signOut").addEventListener("click", async () => { await db.auth.signOut(); location.reload(); });

  async function loadAll() {
    const role = state.profile.role, uid = state.session.user.id;
    const base = await Promise.all([
      db.from("batches").select("*").eq("active",true).order("name"),
      db.from("subjects").select("*").eq("active",true).order("name"),
      db.from("announcements").select("*").order("created_at",{ascending:false}).limit(20)
    ]);
    for (const r of base) if (r.error) throw r.error;
    [state.batches,state.subjects,state.announcements] = base.map(r => r.data || []);

    if (role === "student") {
      const { data, error } = await db.from("students").select("*,batches(*)").eq("user_id",uid).single();
      if (error) throw error; state.student = data; state.students = [data];
    } else if (role === "parent") {
      const { data, error } = await db.from("parent_student_links").select("student_id,students(*,batches(*))").eq("parent_user_id",uid).eq("active",true);
      if (error) throw error; state.students = (data || []).map(x => x.students).filter(Boolean); state.student = state.students[0] || null;
    } else {
      const { data, error } = await db.from("students").select("*,batches(*)").eq("active",true).order("full_name");
      if (error) throw error; state.students = data || [];
      if (role === "admin") {
        const teachers = await db.from("profiles").select("user_id,display_name").eq("role","teacher").eq("active",true).order("display_name");
        state.teachers = teachers.data || [];
      }
    }
    const [attendance, leaves, marks] = await Promise.all([
      db.from("attendance").select("*,students(full_name),batches(name)").order("attendance_date",{ascending:false}).limit(1000),
      db.from("leave_requests").select("*,students(full_name)").order("created_at",{ascending:false}).limit(500),
      db.from("marks").select("*,students(full_name,board),tests(name,test_date,maximum_marks,subjects(name)),test_papers(*)").order("created_at",{ascending:false}).limit(1000)
    ]);
    for (const r of [attendance,leaves,marks]) if (r.error) throw r.error;
    state.attendance=attendance.data||[]; state.leaves=leaves.data||[]; state.marks=marks.data||[];
    fillSelects();
  }

  function fillSelect(select, rows, label, includeBlank = true) {
    if (!select) return;
    select.innerHTML = `${includeBlank?'<option value="">Select</option>':''}${rows.map(r=>`<option value="${esc(r.id || r.user_id)}">${esc(label(r))}</option>`).join("")}`;
  }
  function fillSelects() {
    [$("#profileBatch"),$("#editStudentBatch"),$("#studentBatchFilter"),$("#attendanceBatch"),$("#assignmentBatch")].forEach(s => fillSelect(s,state.batches,b=>b.name));
    [$("#scoreStudent"),$("#parentStudent")].forEach(s => fillSelect(s,state.students,x=>`${x.full_name} (${x.student_code})`));
    fillSelect($("#teacherSelect"),state.teachers,t=>t.display_name);
    updateScoreSubjects();
  }
  $("#scoreStudent").addEventListener("change", updateScoreSubjects);
  function updateScoreSubjects() {
    const student = state.students.find(s=>s.id===$("#scoreStudent").value) || state.student;
    const rows = student?.board ? state.subjects.filter(s=>s.board===student.board) : state.subjects;
    fillSelect($("#scoreSubject"),rows,s=>`${s.name} — ${s.board}`);
  }

  function renderAll() { renderDashboard(); renderProfile(); renderStudents(); renderAttendance(); renderLeaves(); renderScorecards(); renderAdmin(); }
  function currentStudentMarks() { return state.student ? state.marks.filter(m=>m.student_id===state.student.id) : state.marks; }
  function currentAttendance() { return state.student ? state.attendance.filter(a=>a.student_id===state.student.id) : state.attendance; }
  function average(rows, field="percentage") { return rows.length ? rows.reduce((s,r)=>s+Number(r[field]||0),0)/rows.length : 0; }
  function attendanceRate(rows) { return rows.length ? rows.filter(r=>r.status==="Present").length/rows.length*100 : 0; }

  async function signedPhoto(path) {
    if (!path) return "";
    const { data } = await db.storage.from("student-photos").createSignedUrl(path,3600); return data?.signedUrl || "";
  }
  async function profileHtml(student) {
    if (!student) return `<div class="empty-state">No linked student record.</div>`;
    const photo = await signedPhoto(student.photo_path);
    return `<div class="profile-summary">${photo?`<img src="${esc(photo)}" alt="${esc(student.full_name)}">`:`<div class="profile-placeholder">${esc(student.full_name[0]||"S")}</div>`}<div><h2>${esc(student.full_name)}</h2><p>${esc(student.class_code||"Profile incomplete")} · ${esc(student.board||"Board not selected")}</p><p>${esc(student.batches?.name||"Batch not selected")} · ${esc(student.school_name||"School not added")}</p></div></div>`;
  }
  function metric(label,value,help){return `<article class="card metric"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(help)}</small></article>`;}
  function createChart(key,canvas,labels,values,label,color="#17375f") {
    state.charts[key]?.destroy(); if (!canvas) return;
    state.charts[key]=new Chart(canvas,{type:"bar",data:{labels,datasets:[{label,data:values,backgroundColor:color,borderRadius:7,maxBarThickness:45}]},options:{responsive:true,maintainAspectRatio:false,scales:{y:{beginAtZero:true,max:100,grid:{color:"#edf1f5"}},x:{grid:{display:false}}},plugins:{legend:{display:false}}}});
  }
  async function renderDashboard() {
    const marks=currentStudentMarks(), attendance=currentAttendance(), latest=marks[0];
    if (["student","parent"].includes(state.profile.role)) {
      $("#metricGrid").innerHTML=metric("Attendance",pct(attendanceRate(attendance)),`${attendance.length} sessions recorded`)+metric("Overall score",pct(average(marks)),`${marks.length} results included`)+metric("Tests completed",String(marks.length),"Complete history retained")+metric("Latest test",latest?pct(latest.percentage):"—",latest?.tests?.name||"No test yet");
    } else {
      const pending=state.leaves.filter(l=>l.status==="Pending").length;
      $("#metricGrid").innerHTML=metric("Students",String(state.students.length),"Accessible student records")+metric("Attendance",pct(attendanceRate(attendance)),"Across visible sessions")+metric("Average score",pct(average(marks)),"Across recorded tests")+metric("Pending leave",String(pending),"Awaiting review");
    }
    $("#dashboardProfile").innerHTML=`<div class="card-head"><div><p class="eyebrow">${state.student?"Student profile":"Signed-in account"}</p><h2>At a glance</h2></div><button class="text-action" data-view="profile">View profile</button></div>${state.student?await profileHtml(state.student):`<div class="profile-summary"><div class="profile-placeholder">${esc(state.profile.display_name[0])}</div><div><h2>${esc(state.profile.display_name)}</h2><p>${esc(roleName(state.profile.role))}</p><p>Secure Infinite Tutorial account</p></div></div>`}`;
    $("#dashboardProfile [data-view]")?.addEventListener("click",()=>showView("profile"));
    $("#recentResults").innerHTML=marks.slice(0,5).map(m=>`<tr><td>${esc(m.tests?.name)}</td><td>${esc(m.tests?.subjects?.name)}</td><td>${m.obtained_marks} / ${m.maximum_marks}</td><td><span class="status Present">${pct(m.percentage)}</span></td></tr>`).join("")||'<tr><td colspan="4">No test results yet.</td></tr>';
    $("#announcementList").innerHTML=state.announcements.slice(0,5).map(a=>`<div class="stack-item"><strong>${esc(a.title)}</strong><small>${esc(a.body)} · ${new Date(a.created_at).toLocaleDateString("en-IN")}</small></div>`).join("")||'<div class="empty-state">No announcements yet.</div>';
    $("#overallEmpty").classList.toggle("hidden",marks.length>0); if(marks.length) createChart("dash",$("#overallChart"),marks.slice(0,8).reverse().map(m=>m.tests?.name),marks.slice(0,8).reverse().map(m=>m.percentage),"Score %","#e6ad28");
  }

  async function renderProfile() {
    const student=state.student;
    if (state.profile.role==="student" && student && !student.profile_locked) {
      $("#profileForm").classList.remove("hidden"); $("#profileLocked").classList.add("hidden");
      const f=$("#profileForm"); f.elements.full_name.value=student.full_name; f.elements.parent_mobile.value=student.parent_mobile; f.elements.date_of_birth.value=student.date_of_birth; return;
    }
    $("#profileForm").classList.add("hidden"); $("#profileLocked").classList.remove("hidden");
    if (!student) { $("#profileLocked").innerHTML=`<div class="card-head"><h2>${esc(state.profile.display_name)}</h2></div><p>Role: ${esc(roleName(state.profile.role))}</p><p class="muted">Account information is managed by an administrator.</p>`; return; }
    const photo=await signedPhoto(student.photo_path);
    const fields=[["Student ID",student.student_code],["School",student.school_name],["Parent",student.parent_name],["Parent mobile",student.parent_mobile],["Date of birth",fmtDate(student.date_of_birth)],["Class",student.class_code],["Board",student.board],["Batch",student.batches?.name],["Profile",student.profile_locked?"Locked":"Incomplete"]];
    $("#profileLocked").innerHTML=`<div class="card-head"><div><p class="eyebrow">Read-only profile</p><h2>Student information</h2></div><span class="status ${student.profile_locked?"locked":"unlocked"}">${student.profile_locked?"Locked":"Incomplete"}</span></div><div class="profile-detail">${photo?`<img src="${esc(photo)}" alt="${esc(student.full_name)}">`:`<div class="profile-placeholder">${esc(student.full_name[0])}</div>`}<div><h2>${esc(student.full_name)}</h2><div class="detail-grid">${fields.map(([k,v])=>`<div class="detail"><small>${esc(k)}</small><strong>${esc(v||"—")}</strong></div>`).join("")}</div></div></div>`;
  }

  $("#profileForm").addEventListener("submit",async event=>{
    event.preventDefault(); const f=event.currentTarget,v=Object.fromEntries(new FormData(f)),file=f.elements.photo.files[0],button=event.submitter;
    if(!file) return setStatus($("#profileStatus"),"Choose a student photo.",true);
    buttonBusy(button,true,"Securing profile…"); const ext=file.name.split(".").pop().toLowerCase(),path=`${state.session.user.id}/profile-${Date.now()}.${ext}`;
    const upload=await db.storage.from("student-photos").upload(path,file,{upsert:false});
    if(upload.error){buttonBusy(button,false);return setStatus($("#profileStatus"),upload.error.message,true);}
    const {error}=await db.rpc("complete_student_profile",{p_photo_path:path,p_school_name:v.school_name,p_parent_name:v.parent_name,p_class_code:v.class_code,p_board:v.board,p_batch_id:v.batch_id});
    buttonBusy(button,false); if(error)return setStatus($("#profileStatus"),error.message,true);
    await loadAll(); renderAll(); setStatus($("#profileStatus"),"Profile completed and locked.");
  });

  function filteredStudents(){const q=$("#studentSearch").value.toLowerCase(),c=$("#studentClassFilter").value,b=$("#studentBoardFilter").value,bt=$("#studentBatchFilter").value;return state.students.filter(s=>(!q||`${s.full_name} ${s.parent_mobile} ${s.school_name||""}`.toLowerCase().includes(q))&&(!c||s.class_code===c)&&(!b||s.board===b)&&(!bt||s.batch_id===bt));}
  function renderStudents(){if(!["teacher","admin"].includes(state.profile.role))return;const rows=filteredStudents();$("#studentsTable").innerHTML=rows.map(s=>`<tr><td><strong>${esc(s.full_name)}</strong><small>${esc(s.student_code)}</small></td><td>${esc(s.class_code||"—")}</td><td>${esc(s.board||"—")}</td><td>${esc(s.batches?.name||"—")}</td><td>${esc(s.parent_mobile)}</td><td><span class="status ${s.profile_locked?"locked":"unlocked"}">${s.profile_locked?"Locked":"Incomplete"}</span></td><td><div class="row-actions"><button class="mini-button" data-edit-student="${s.id}">Correct</button><button class="mini-button" data-reset="${s.id}">Reset password</button></div></td></tr>`).join("")||'<tr><td colspan="7">No students match these filters.</td></tr>';$$('[data-edit-student]').forEach(b=>b.onclick=()=>openStudentEdit(b.dataset.editStudent));$$('[data-reset]').forEach(b=>b.onclick=()=>resetPassword(b.dataset.reset));}
  ["#studentSearch","#studentClassFilter","#studentBoardFilter","#studentBatchFilter"].forEach(id=>$(id).addEventListener("input",renderStudents));
  function openStudentEdit(id){const s=state.students.find(x=>x.id===id),f=$("#editStudentForm");if(!s)return;for(const key of ["student_id","full_name","school_name","parent_name","parent_mobile","date_of_birth","class_code","board","batch_id"])if(f.elements[key])f.elements[key].value=s[key]||"";f.classList.remove("hidden");f.scrollIntoView({behavior:"smooth"});}
  $("#cancelEditStudent").onclick=()=>$("#editStudentForm").classList.add("hidden");
  $("#editStudentForm").addEventListener("submit",async event=>{event.preventDefault();const v=Object.fromEntries(new FormData(event.currentTarget)),id=v.student_id;delete v.student_id;v.parent_mobile=digits(v.parent_mobile);const b=event.submitter;buttonBusy(b,true,"Saving…");const{error}=await db.from("students").update(v).eq("id",id);buttonBusy(b,false);if(error)return setStatus($("#editStudentStatus"),error.message,true);setStatus($("#editStudentStatus"),"Correction saved with audit history.");await loadAll();renderAll();});
  async function resetPassword(studentId){if(!confirm("Reset this student to the DOB password?"))return;const{data,error}=await db.functions.invoke("account-admin",{body:{action:"reset_student_password",student_id:studentId}});if(error||data?.error)return alert(data?.error||error.message);showCredentials("Password reset",[["Temporary DOB password",data.temporary_password]]);}

  function renderAttendance(){const staff=["teacher","admin"].includes(state.profile.role);$("#attendanceMarker").classList.toggle("hidden",!staff);const rows=currentAttendance();$("#attendancePercent").textContent=pct(attendanceRate(rows));$("#attendanceTable").innerHTML=rows.map(a=>`<tr><td>${fmtDate(a.attendance_date)}</td><td>${dayName(a.attendance_date)}</td><td>${esc(a.session)}</td><td>${esc(a.batches?.name||"—")}</td><td>${esc(a.students?.full_name||state.student?.full_name||"—")}</td><td><span class="status ${a.status}">${a.status}</span></td></tr>`).join("")||'<tr><td colspan="6">No attendance records yet.</td></tr>';}
  $("#loadAttendance").addEventListener("click",()=>{const f=$("#attendanceMarker"),batch=f.elements.batch_id.value,date=f.elements.date.value,session=f.elements.session.value;if(!batch||!date)return setStatus($("#attendanceMarkStatus"),"Select date and batch.",true);if(new Date(`${date}T00:00:00`).getDay()===0)return setStatus($("#attendanceMarkStatus"),"Attendance is maintained Monday to Saturday only.",true);const students=state.students.filter(s=>s.batch_id===batch);$("#attendanceRoster").innerHTML=students.map(s=>{const existing=state.attendance.find(a=>a.student_id===s.id&&a.attendance_date===date&&a.session===session)?.status||"Present";return `<div class="attendance-item"><strong>${esc(s.full_name)}</strong><div class="attendance-toggle"><label><input type="radio" name="att-${s.id}" value="Present" ${existing==="Present"?"checked":""}><span>Present</span></label><label><input type="radio" name="att-${s.id}" value="Absent" ${existing==="Absent"?"checked":""}><span>Absent</span></label></div></div>`}).join("")||'<p>No students are assigned to this batch.</p>';$("#saveAttendance").classList.toggle("hidden",!students.length);});
  $("#attendanceMarker").addEventListener("submit",async event=>{event.preventDefault();const f=event.currentTarget,date=f.elements.date.value,session=f.elements.session.value,batch=f.elements.batch_id.value,students=state.students.filter(s=>s.batch_id===batch),rows=students.map(s=>({student_id:s.id,batch_id:batch,attendance_date:date,session,status:f.querySelector(`[name="att-${s.id}"]:checked`).value,marked_by:state.session.user.id})),b=event.submitter;buttonBusy(b,true,"Saving…");const{error}=await db.from("attendance").upsert(rows,{onConflict:"student_id,attendance_date,session"});buttonBusy(b,false);if(error)return setStatus($("#attendanceMarkStatus"),error.message,true);setStatus($("#attendanceMarkStatus"),"Attendance saved permanently.");await loadAll();renderAll();});

  function renderLeaves(){const student=state.profile.role==="student";$("#leaveForm").classList.toggle("hidden",!student);$("#leaveFilter").classList.toggle("hidden",!["teacher","admin"].includes(state.profile.role));const filter=$("#leaveFilter").value,rows=state.leaves.filter(l=>!filter||l.status===filter);$("#leaveTable").innerHTML=rows.map(l=>`<tr><td>${esc(l.students?.full_name||state.student?.full_name||"—")}</td><td>${fmtDate(l.leave_date)}</td><td>${esc(l.session)}</td><td title="${esc(l.message||"")}">${esc(l.reason)}</td><td><span class="status ${l.status}">${l.status}</span></td><td>${["teacher","admin"].includes(state.profile.role)&&l.status==="Pending"?`<div class="row-actions"><button class="mini-button" data-leave="${l.id}" data-decision="Approved">Approve</button><button class="mini-button danger" data-leave="${l.id}" data-decision="Rejected">Reject</button></div>`:"—"}</td></tr>`).join("")||'<tr><td colspan="6">No leave requests.</td></tr>';$$('[data-leave]').forEach(b=>b.onclick=()=>decideLeave(b.dataset.leave,b.dataset.decision));}
  $("#leaveFilter").addEventListener("change",renderLeaves);
  $("#leaveForm").addEventListener("submit",async event=>{event.preventDefault();const v=Object.fromEntries(new FormData(event.currentTarget)),b=event.submitter;v.student_id=state.student.id;buttonBusy(b,true,"Submitting…");const{error}=await db.from("leave_requests").insert(v);buttonBusy(b,false);if(error)return setStatus($("#leaveStatus"),error.message,true);event.currentTarget.reset();setStatus($("#leaveStatus"),"Leave request submitted to Sir.");await loadAll();renderAll();});
  async function decideLeave(id,status){const{error}=await db.from("leave_requests").update({status,reviewed_by:state.session.user.id,reviewed_at:new Date().toISOString()}).eq("id",id);if(error)return alert(error.message);await loadAll();renderAll();}

  function renderScorecards(){const staff=["teacher","admin"].includes(state.profile.role);$("#scoreForm").classList.toggle("hidden",!staff);const rows=currentStudentMarks(),totalMax=rows.reduce((s,r)=>s+Number(r.maximum_marks),0),obtained=rows.reduce((s,r)=>s+Number(r.obtained_marks),0);$("#scoreMetrics").innerHTML=metric("Total tests",String(rows.length),"All examinations retained")+metric("Total marks",String(totalMax||0),"Maximum available")+metric("Marks obtained",String(obtained||0),"Across all tests")+metric("Overall percentage",totalMax?pct(obtained/totalMax*100):"—","Weighted result");$("#scoreTable").innerHTML=rows.map(m=>`<tr><td>${esc(m.students?.full_name||state.student?.full_name||"—")}</td><td>${esc(m.tests?.subjects?.name||"—")}</td><td>${esc(m.tests?.name||"—")}</td><td>${fmtDate(m.tests?.test_date)}</td><td>${m.obtained_marks} / ${m.maximum_marks}</td><td><span class="status Present">${pct(m.percentage)}</span></td><td>${m.test_papers?.length&& (m.paper_visible||staff)?`<button class="paper-link" data-paper="${esc(m.test_papers[0].storage_path)}">View</button>`:"—"}</td></tr>`).join("")||'<tr><td colspan="7">No examination records yet.</td></tr>';$$('[data-paper]').forEach(b=>b.onclick=()=>openPaper(b.dataset.paper));$("#scoreOverallEmpty").classList.toggle("hidden",rows.length>0);if(rows.length)createChart("scoreOverall",$("#scoreOverallChart"),rows.slice().reverse().map(m=>m.tests?.name),rows.slice().reverse().map(m=>m.percentage),"Percentage","#17375f");const groups={};rows.forEach(m=>{const name=m.tests?.subjects?.name||"Other";(groups[name]||=[]).push(m)});$("#subjectCharts").innerHTML=Object.keys(groups).map((name,i)=>`<article class="card"><div class="card-head"><h2>${esc(name)}</h2></div><div class="chart-box"><canvas id="subjectChart${i}"></canvas></div></article>`).join("");Object.entries(groups).forEach(([name,list],i)=>createChart(`sub-${name}`,$(`#subjectChart${i}`),list.slice().reverse().map(m=>m.tests?.name),list.slice().reverse().map(m=>m.percentage),name,"#e6ad28"));}
  async function openPaper(path){const{data,error}=await db.storage.from("test-papers").createSignedUrl(path,300);if(error)return alert(error.message);window.open(data.signedUrl,"_blank","noopener");}
  $("#scoreForm").addEventListener("submit",async event=>{event.preventDefault();const f=event.currentTarget,v=Object.fromEntries(new FormData(f)),student=state.students.find(s=>s.id===v.student_id),subject=state.subjects.find(s=>s.id===v.subject_id),obt=Number(v.obtained_marks),max=Number(v.maximum_marks),file=f.elements.paper.files[0],b=event.submitter;if(!student||!subject)return setStatus($("#scoreStatus"),"Select student and subject.",true);if(subject.board!==student.board)return setStatus($("#scoreStatus"),"Subject does not match the student's board.",true);if(obt>max)return setStatus($("#scoreStatus"),"Obtained marks cannot exceed maximum marks.",true);buttonBusy(b,true,"Saving result…");const test=await db.from("tests").insert({name:v.test_name,subject_id:v.subject_id,test_date:v.test_date,maximum_marks:max,batch_id:student.batch_id,created_by:state.session.user.id}).select("id").single();if(test.error){buttonBusy(b,false);return setStatus($("#scoreStatus"),test.error.message,true);}const mark=await db.from("marks").insert({student_id:v.student_id,test_id:test.data.id,obtained_marks:obt,maximum_marks:max,teacher_remarks:v.remarks||null,paper_visible:v.paper_visible==="on",entered_by:state.session.user.id}).select("id").single();if(mark.error){buttonBusy(b,false);return setStatus($("#scoreStatus"),mark.error.message,true);}if(file){const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"-");const path=`${student.id}/${mark.data.id}/${Date.now()}-${safe}`,up=await db.storage.from("test-papers").upload(path,file,{upsert:false});if(up.error){buttonBusy(b,false);return setStatus($("#scoreStatus"),`Marks saved, but paper upload failed: ${up.error.message}`,true);}const paper=await db.from("test_papers").insert({mark_id:mark.data.id,paper_type:v.paper_type,file_name:file.name,storage_path:path,mime_type:file.type,size_bytes:file.size,uploaded_by:state.session.user.id});if(paper.error){buttonBusy(b,false);return setStatus($("#scoreStatus"),`Marks saved, but paper link failed: ${paper.error.message}`,true);}}buttonBusy(b,false);f.reset();setStatus($("#scoreStatus"),"Test result saved and scorecard updated.");await loadAll();renderAll();});

  function renderAdmin(){if(state.profile.role!=="admin")return;fillSelect($("#parentStudent"),state.students,x=>`${x.full_name} (${x.student_code})`);fillSelect($("#teacherSelect"),state.teachers,t=>t.display_name);}
  async function invokeAccount(form,statusEl,action){const v=Object.fromEntries(new FormData(form)),b=form.querySelector('button[type=submit]');buttonBusy(b,true,"Creating…");const{data,error}=await db.functions.invoke("account-admin",{body:{action,...v}});buttonBusy(b,false);if(error||data?.error){setStatus(statusEl,data?.error||error.message,true);return null;}setStatus(statusEl,"Account created successfully.");return data;}
  $("#createStudentForm").addEventListener("submit",async e=>{e.preventDefault();const d=await invokeAccount(e.currentTarget,$("#createStudentStatus"),"create_student");if(!d)return;e.currentTarget.reset();showCredentials("Student login",[["Username",d.username],["Initial DOB password",d.initial_password]]);await loadAll();renderAll();});
  $("#createStaffForm").addEventListener("submit",async e=>{e.preventDefault();const d=await invokeAccount(e.currentTarget,$("#createStaffStatus"),"create_staff");if(!d)return;e.currentTarget.reset();showCredentials("Staff account created",[["Status","Ready to sign in"],["Reminder","Share the email and temporary password securely"]]);await loadAll();renderAll();});
  $("#createParentForm").addEventListener("submit",async e=>{e.preventDefault();const d=await invokeAccount(e.currentTarget,$("#createParentStatus"),"create_parent");if(!d)return;e.currentTarget.reset();showCredentials("Parent login",[["Username",d.username],["Password","The temporary password you entered"]]);});
  $("#batchForm").addEventListener("submit",async e=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.currentTarget)),b=e.submitter;v.created_by=state.session.user.id;buttonBusy(b,true,"Creating…");const{error}=await db.from("batches").insert(v);buttonBusy(b,false);if(error)return setStatus($("#batchStatus"),error.message,true);e.currentTarget.reset();setStatus($("#batchStatus"),"Batch created.");await loadAll();renderAll();});
  $("#assignmentForm").addEventListener("submit",async e=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.currentTarget)),b=e.submitter;buttonBusy(b,true,"Assigning…");const{error}=await db.from("teacher_batch_assignments").upsert({...v,active:true},{onConflict:"teacher_user_id,batch_id"});buttonBusy(b,false);if(error)return setStatus($("#assignmentStatus"),error.message,true);setStatus($("#assignmentStatus"),"Batch assigned to teacher.");});
  $("#passwordForm").addEventListener("submit",async e=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.currentTarget));if(v.password!==v.confirm_password)return setStatus($("#passwordStatus"),"Passwords do not match.",true);const b=e.submitter;buttonBusy(b,true,"Updating…");const{error}=await db.auth.updateUser({password:v.password});if(!error)await db.rpc("mark_password_changed");buttonBusy(b,false);if(error)return setStatus($("#passwordStatus"),error.message,true);state.profile.must_change_password=false;$("#passwordAlert").classList.add("hidden");e.currentTarget.reset();setStatus($("#passwordStatus"),"Password changed securely.");});

  (async()=>{if(!db){setStatus($("#loginStatus"),"Secure portal setup is incomplete.",true);return;}const{data}=await db.auth.getSession();if(data.session)await startPortal(data.session);})();
})();
