(() => {
  "use strict";

  const config = window.VISION_CONFIG || {};
  const configured =
    /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.supabaseUrl || "") &&
    !String(config.supabaseUrl).includes("YOUR_PROJECT") &&
    config.supabaseAnonKey &&
    !String(config.supabaseAnonKey).includes("YOUR_");

  const db = configured && window.supabase
    ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey)
    : null;

  const state = { students: [], performance: [], charts: {} };
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);

  $("#year").textContent = new Date().getFullYear();

  // Opening sequence and motion effects. All effects respect reduced-motion settings.
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const intro = $("#intro");
  document.documentElement.classList.add("motion-ready");

  if (!reduceMotion && intro) {
    const introStarted = performance.now();
    document.body.classList.add("intro-active");

    const finishIntro = () => {
      const remaining = Math.max(1850 - (performance.now() - introStarted), 0);
      window.setTimeout(() => {
        intro.classList.add("curtain");
        window.setTimeout(() => {
          intro.classList.add("exit");
          document.body.classList.remove("intro-active");
        }, 760);
        window.setTimeout(() => intro.remove(), 1800);
      }, remaining);
    };

    if (document.readyState === "complete") finishIntro();
    else window.addEventListener("load", finishIntro, { once: true });
  } else {
    intro?.remove();
  }

  const revealGroups = [
    { selector: ".hero .eyebrow, .hero h1, .hero-text, .hero-actions, .hero-proof", direction: "left" },
    { selector: ".hero-panel", direction: "right" },
    { selector: ".about > :first-child", direction: "left" },
    { selector: ".about > :last-child", direction: "right" },
    { selector: ".section-heading", direction: "up" },
    { selector: ".class-card", direction: "alternate" },
    { selector: ".steps article", direction: "alternate" },
    { selector: ".achievements > :first-child", direction: "left" },
    { selector: ".achievements > :last-child", direction: "right" },
    { selector: ".registration > :first-child", direction: "left" },
    { selector: ".registration > :last-child", direction: "right" },
    { selector: ".footer > *", direction: "up" }
  ];

  const animatedElements = [];
  revealGroups.forEach((group) => {
    $$(group.selector).forEach((element, index) => {
      const direction = group.direction === "alternate"
        ? (index % 2 === 0 ? "left" : "right")
        : group.direction;
      element.dataset.reveal = direction;
      element.style.setProperty("--reveal-delay", (index % 4) * 95 + "ms");
      animatedElements.push(element);
    });
  });

  if (!reduceMotion && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("revealed");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -7% 0px" });
    animatedElements.forEach((element) => observer.observe(element));
  } else {
    animatedElements.forEach((element) => element.classList.add("revealed"));
  }

  let ticking = false;
  const updateScrollMotion = () => {
    const scrollable = Math.max(document.documentElement.scrollHeight - innerHeight, 1);
    document.documentElement.style.setProperty("--scroll-progress", Math.min(scrollY / scrollable, 1));
    $(".site-header")?.classList.toggle("scrolled", scrollY > 24);

    if (!reduceMotion) {
      $("#heroPanel")?.style.setProperty("--panel-y", Math.min(scrollY * .08, 32) + "px");
      $(".section").forEach((section) => {
        const rect = section.getBoundingClientRect();
        const offset = Math.max(-45, Math.min(45, (innerHeight / 2 - rect.top) * .045));
        section.style.setProperty("--section-parallax", offset + "px");
      });
    }
  };

  window.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      updateScrollMotion();
      ticking = false;
    });
  }, { passive: true });
  updateScrollMotion();

  if (!reduceMotion && window.matchMedia("(pointer:fine)").matches) {
    window.addEventListener("pointermove", (event) => {
      document.documentElement.style.setProperty("--cursor-x", event.clientX + "px");
      document.documentElement.style.setProperty("--cursor-y", event.clientY + "px");
    }, { passive: true });

    const panel = $("#heroPanel");
    panel?.addEventListener("pointermove", (event) => {
      const box = panel.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width - .5;
      const y = (event.clientY - box.top) / box.height - .5;
      panel.style.setProperty("--panel-ry", x * 5 + "deg");
      panel.style.setProperty("--panel-rx", y * -5 + "deg");
    });
    panel?.addEventListener("pointerleave", () => {
      panel.style.setProperty("--panel-ry", "0deg");
      panel.style.setProperty("--panel-rx", "0deg");
    });

    $(".button, .text-link").forEach((element) => {
      element.classList.add("magnetic");
      element.addEventListener("pointermove", (event) => {
        const box = element.getBoundingClientRect();
        element.style.setProperty("--magnetic-x", (event.clientX - box.left - box.width / 2) * .12 + "px");
        element.style.setProperty("--magnetic-y", (event.clientY - box.top - box.height / 2) * .16 + "px");
      });
      element.addEventListener("pointerleave", () => {
        element.style.setProperty("--magnetic-x", "0px");
        element.style.setProperty("--magnetic-y", "0px");
      });
    });

    $(".class-card").forEach((card) => {
      card.classList.add("motion-card");
      card.addEventListener("pointermove", (event) => {
        if (!card.classList.contains("revealed")) return;
        const box = card.getBoundingClientRect();
        const x = (event.clientX - box.left) / box.width - .5;
        const y = (event.clientY - box.top) / box.height - .5;
        const lift = card.classList.contains("featured") ? -12 : -6;
        card.style.transform = `perspective(900px) translateY(${lift}px) rotateX(${y * -7}deg) rotateY(${x * 8}deg)`;
      });
      card.addEventListener("pointerleave", () => {
        card.style.removeProperty("transform");
      });
    });
  }

  const counterElements = $(".hero-proof strong, .achievement-stats strong");
  const animateCounter = (element) => {
    if (element.dataset.counted) return;
    element.dataset.counted = "true";
    const original = element.textContent.trim();
    const target = Number.parseInt(original.replace(/\D/g, ""), 10);
    if (!Number.isFinite(target)) return;
    const suffix = original.replace(/[\d,.]/g, "");
    const started = performance.now();
    const duration = 1100;
    element.classList.add("counter-active");

    const frame = (now) => {
      const progress = Math.min((now - started) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      element.textContent = Math.round(target * eased).toLocaleString() + suffix;
      if (progress < 1) requestAnimationFrame(frame);
      else element.textContent = original;
    };
    requestAnimationFrame(frame);
  };

  if (!reduceMotion && "IntersectionObserver" in window) {
    const counterObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          counterObserver.unobserve(entry.target);
        }
      });
    }, { threshold: .65 });
    counterElements.forEach((element) => counterObserver.observe(element));
  }

  $("#menuToggle").addEventListener("click", () => {
    const nav = $("#mainNav");
    const open = nav.classList.toggle("open");
    $("#menuToggle").setAttribute("aria-expanded", String(open));
  });
  $$("#mainNav a").forEach((link) => link.addEventListener("click", () => {
    $("#mainNav").classList.remove("open");
    $("#menuToggle").setAttribute("aria-expanded", "false");
  }));

  function setStatus(element, message, isError = false) {
    element.textContent = message;
    element.classList.toggle("error", isError);
  }

  $("#registrationForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = $("#registrationStatus");
    if (!db) {
      setStatus(status, "Online registration is being configured. Please call +91 98765 43210.", true);
      return;
    }

    const button = event.submitter;
    button.disabled = true;
    button.textContent = "Submitting…";
    setStatus(status, "");
    const values = Object.fromEntries(new FormData(event.currentTarget));

    const { error } = await db.from("students").insert({
      student_name: values.student_name.trim(),
      class_level: Number(values.class_level),
      parent_name: values.parent_name.trim(),
      phone: values.phone.trim(),
      email: values.email.trim() || null,
      school: values.school.trim() || null,
      previous_class: Number(values.previous_class),
      board: values.board,
      previous_exam: values.previous_exam.trim(),
      previous_percentage: Number(values.previous_percentage),
      subjects: values.subjects.split(",").map((item) => item.trim()).filter(Boolean),
      preferred_batch: values.preferred_batch || null,
      message: values.message.trim() || null
    });

    button.disabled = false;
    button.textContent = "Submit registration";
    if (error) {
      console.error("Registration error:", error.message);
      setStatus(status, "We could not submit the form. Please call us for assistance.", true);
      return;
    }

    event.currentTarget.reset();
    setStatus(status, "Registration received. Our team will contact you shortly.");
  });

  const closeLogin = () => $("#adminLogin").classList.add("hidden");
  $("#openAdmin").addEventListener("click", () => {
    $("#adminLogin").classList.remove("hidden");
    $("#loginForm input").focus();
  });
  $("#closeAdmin").addEventListener("click", closeLogin);
  $("#adminLogin").addEventListener("click", (event) => {
    if (event.target === $("#adminLogin")) closeLogin();
  });

  async function verifyAdmin() {
    if (!db) return false;
    const { data, error } = await db.rpc("is_admin");
    return !error && data === true;
  }

  $("#loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = $("#loginStatus");
    if (!db) {
      setStatus(status, "Secure admin access is not configured yet.", true);
      return;
    }

    const values = Object.fromEntries(new FormData(event.currentTarget));
    const button = event.submitter;
    button.disabled = true;
    button.textContent = "Signing in…";
    setStatus(status, "");

    const { data, error } = await db.auth.signInWithPassword({
      email: values.email.trim(),
      password: values.password
    });
    const authorised = !error && data.session && await verifyAdmin();

    button.disabled = false;
    button.textContent = "Sign in securely";
    if (!authorised) {
      if (data?.session) await db.auth.signOut();
      setStatus(status, "Invalid credentials or this account is not authorised.", true);
      return;
    }

    event.currentTarget.reset();
    closeLogin();
    await showAdmin(data.user);
  });

  async function showAdmin(user) {
    $("#publicApp").classList.add("hidden");
    $("#adminApp").classList.remove("hidden");
    $("#adminEmail").textContent = user.email || "Admin";
    await loadDashboard();
  }

  async function restoreSession() {
    if (!db) return;
    const { data } = await db.auth.getSession();
    if (data.session && await verifyAdmin()) await showAdmin(data.session.user);
  }

  $("#logoutButton").addEventListener("click", async () => {
    if (db) await db.auth.signOut();
    $("#adminApp").classList.add("hidden");
    $("#publicApp").classList.remove("hidden");
    location.hash = "home";
  });

  async function loadDashboard() {
    const [studentResult, performanceResult] = await Promise.all([
      db.from("students").select("*").order("created_at", { ascending: false }),
      db.from("performance").select("*, students(student_name, class_level)").order("test_date", { ascending: false })
    ]);

    if (studentResult.error || performanceResult.error) {
      console.error("Dashboard error:", studentResult.error || performanceResult.error);
      alert("The dashboard data could not be loaded.");
      return;
    }

    state.students = studentResult.data || [];
    state.performance = performanceResult.data || [];
    renderAll();
  }

  function renderAll() {
    const active = state.students.filter((student) => student.status !== "inactive");
    const pending = state.students.filter((student) => student.status === "pending");
    const scores = state.performance
      .filter((row) => Number(row.max_score) > 0)
      .map((row) => Number(row.score) / Number(row.max_score) * 100);
    const attendance = state.performance
      .map((row) => Number(row.attendance))
      .filter(Number.isFinite);

    $("#totalStudents").textContent = active.length;
    $("#pendingStudents").textContent = pending.length;
    $("#averageScore").textContent = scores.length
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) + "%"
      : "—";
    $("#averageAttendance").textContent = attendance.length
      ? Math.round(attendance.reduce((a, b) => a + b, 0) / attendance.length) + "%"
      : "—";

    renderStudents(state.students.slice(0, 5), $("#recentStudents"), true);
    renderStudents(state.students, $("#studentsTable"), false);
    renderStudentOptions();
    renderPerformance();
    renderCharts();
  }

  function renderStudents(students, target, compact) {
    if (!students.length) {
      target.innerHTML = '<tr><td colspan="7">No student records yet.</td></tr>';
      return;
    }

    target.innerHTML = students.map((student) => compact
      ? `<tr>
          <td><strong>${escapeHtml(student.student_name)}</strong><small>${new Date(student.created_at).toLocaleDateString()}</small></td>
          <td>Class ${escapeHtml(student.class_level)}</td>
          <td>${escapeHtml(student.parent_name)}</td>
          <td>${escapeHtml(student.phone)}</td>
          <td><span class="status-pill ${student.status === "active" ? "active" : ""}">${escapeHtml(student.status)}</span></td>
        </tr>`
      : `<tr>
          <td><strong>${escapeHtml(student.student_name)}</strong><small>${escapeHtml(student.school || "School not provided")}</small></td>
          <td>Class ${escapeHtml(student.class_level)}</td>
          <td>${escapeHtml(student.parent_name)}</td>
          <td><strong>${escapeHtml(student.phone)}</strong><small>${escapeHtml(student.email || "")}</small></td>
          <td>${escapeHtml((student.subjects || []).join(", "))}</td>
          <td>${student.previous_percentage == null ? "Not provided" : `<strong>${escapeHtml(student.previous_percentage)}%</strong><small>${escapeHtml(student.previous_exam || "")} · Class ${escapeHtml(student.previous_class || "")}</small>`}</td>
          <td><select class="status-select" data-student-id="${student.id}" aria-label="Status for ${escapeHtml(student.student_name)}">
            <option value="pending" ${student.status === "pending" ? "selected" : ""}>Pending</option>
            <option value="active" ${student.status === "active" ? "selected" : ""}>Active</option>
            <option value="inactive" ${student.status === "inactive" ? "selected" : ""}>Inactive</option>
          </select></td>
        </tr>`
    ).join("");

    if (!compact) {
      target.querySelectorAll(".status-select").forEach((select) => {
        select.addEventListener("change", updateStudentStatus);
      });
    }
  }

  async function updateStudentStatus(event) {
    const select = event.currentTarget;
    select.disabled = true;
    const { error } = await db.from("students")
      .update({ status: select.value })
      .eq("id", select.dataset.studentId);
    select.disabled = false;

    if (error) {
      alert("The student status could not be updated.");
      await loadDashboard();
      return;
    }
    const student = state.students.find((item) => item.id === select.dataset.studentId);
    if (student) student.status = select.value;
    renderAll();
  }

  function renderStudentOptions() {
    $("#performanceStudent").innerHTML = '<option value="">Select student</option>' +
      state.students
        .filter((student) => student.status !== "inactive")
        .map((student) => `<option value="${student.id}">${escapeHtml(student.student_name)} — Class ${student.class_level}</option>`)
        .join("");
  }

  function renderPerformance() {
    const target = $("#performanceTable");
    if (!state.performance.length) {
      target.innerHTML = '<tr><td colspan="5">No performance records yet.</td></tr>';
      return;
    }

    target.innerHTML = state.performance.slice(0, 20).map((row) => {
      const percentage = Number(row.max_score)
        ? Math.round(Number(row.score) / Number(row.max_score) * 100)
        : 0;
      return `<tr>
        <td>${escapeHtml(row.students?.student_name || "Student")}</td>
        <td>${escapeHtml(row.subject)}</td>
        <td><strong>${escapeHtml(row.test_name)}</strong><small>${new Date(row.test_date).toLocaleDateString()}</small></td>
        <td>${escapeHtml(row.score)}/${escapeHtml(row.max_score)} (${percentage}%)</td>
        <td>${escapeHtml(row.attendance)}%</td>
      </tr>`;
    }).join("");
  }

  $("#performanceForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const status = $("#performanceStatus");
    const score = Number(values.score);
    const maximum = Number(values.max_score);

    if (score > maximum) {
      setStatus(status, "Score cannot be greater than maximum score.", true);
      return;
    }

    const { error } = await db.from("performance").insert({
      student_id: values.student_id,
      subject: values.subject.trim(),
      test_name: values.test_name.trim(),
      score,
      max_score: maximum,
      attendance: Number(values.attendance),
      test_date: values.test_date
    });

    if (error) {
      setStatus(status, "Performance could not be saved.", true);
      return;
    }
    event.currentTarget.reset();
    setStatus(status, "Performance saved successfully.");
    await loadDashboard();
  });

  function renderCharts() {
    if (!window.Chart) return;
    const levels = ["9", "10", "11", "12"];
    const classValues = levels.map((level) =>
      state.students.filter((student) => String(student.class_level) === level).length
    );

    const subjects = {};
    state.performance.forEach((row) => {
      if (!Number(row.max_score)) return;
      const name = row.subject.trim();
      subjects[name] ||= [];
      subjects[name].push(Number(row.score) / Number(row.max_score) * 100);
    });
    const subjectLabels = Object.keys(subjects).slice(0, 7);
    const subjectValues = subjectLabels.map((subject) =>
      Math.round(subjects[subject].reduce((a, b) => a + b, 0) / subjects[subject].length)
    );

    state.charts.class?.destroy();
    state.charts.subject?.destroy();

    state.charts.class = new Chart($("#classChart"), {
      type: "bar",
      data: {
        labels: levels.map((level) => "Class " + level),
        datasets: [{ data: classValues, backgroundColor: "#f2bd40", borderRadius: 7 }]
      },
      options: chartOptions(false)
    });
    state.charts.subject = new Chart($("#subjectChart"), {
      type: "line",
      data: {
        labels: subjectLabels.length ? subjectLabels : ["No results"],
        datasets: [{
          data: subjectValues.length ? subjectValues : [0],
          borderColor: "#1b3b68",
          backgroundColor: "rgba(27,59,104,.1)",
          fill: true,
          tension: .35
        }]
      },
      options: chartOptions(true)
    });
  }

  function chartOptions(isPercentage) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, suggestedMax: isPercentage ? 100 : undefined, grid: { color: "#edf0f5" } },
        x: { grid: { display: false } }
      }
    };
  }

  function switchAdminView(view) {
    $$(".admin-view").forEach((section) => section.classList.add("hidden"));
    $("#" + view + "View").classList.remove("hidden");
    $$(".admin-sidebar nav button").forEach((button) => {
      button.classList.toggle("active", button.dataset.adminView === view);
    });
    $("#adminPageTitle").textContent = view[0].toUpperCase() + view.slice(1);
  }

  $$(".admin-sidebar nav button").forEach((button) => {
    button.addEventListener("click", () => switchAdminView(button.dataset.adminView));
  });
  $$("[data-jump]").forEach((button) => {
    button.addEventListener("click", () => switchAdminView(button.dataset.jump));
  });
  $("#classFilter").addEventListener("change", (event) => {
    const selected = event.target.value;
    renderStudents(
      selected
        ? state.students.filter((student) => String(student.class_level) === selected)
        : state.students,
      $("#studentsTable"),
      false
    );
  });

  restoreSession();
})();
