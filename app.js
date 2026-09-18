(() => {
  "use strict";

  // Every fresh load begins at the hero. Navigation clicks still work normally
  // after the page has opened.
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  if (location.hash) {
    history.replaceState(null, "", location.pathname + location.search);
  }
  window.scrollTo(0, 0);
  window.addEventListener("load", () => {
    requestAnimationFrame(() => window.scrollTo(0, 0));
  }, { once: true });

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
  // Motion is an explicit part of this site experience. Keep the effects
  // gentle, but do not silently disable them because of browser media detection.
  const reduceMotion = false;
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
          window.dispatchEvent(new Event("vision:intro-complete"));
        }, 760);
        window.setTimeout(() => intro.remove(), 1800);
      }, remaining);
    };

    if (document.readyState === "complete") finishIntro();
    else window.addEventListener("load", finishIntro, { once: true });
  } else {
    intro?.remove();
  }

  // Each content group gets its own calm entrance. Reveals happen once so
  // scrolling never repeatedly flashes or moves content the user has already read.
  const revealGroups = [
    { selector: ".hero .eyebrow, .hero h1, .hero-text, .hero-actions, .hero-proof", motion: "rise" },
    { selector: ".hero-panel", motion: "scale-soft" },
    { selector: ".about > :first-child", motion: "left-soft" },
    { selector: ".about > :last-child", motion: "fade" },
    { selector: ".section-heading", motion: "fade" },
    { selector: ".class-card", motion: "scale-soft" },
    { selector: ".steps article", motion: "rise" },
    { selector: ".achievements > :first-child", motion: "right-soft" },
    { selector: ".achievements > :last-child", motion: "scale-soft" },
    { selector: ".registration > :first-child", motion: "fade" },
    { selector: ".registration > :last-child", motion: "rise" },
    { selector: ".footer > *", motion: "fade" }
  ];

  const animatedElements = [];
  revealGroups.forEach((group) => {
    $$(group.selector).forEach((element, index) => {
      element.dataset.reveal = group.motion;
      element.style.setProperty("--reveal-delay", (index % 4) * 70 + "ms");
      animatedElements.push(element);
    });
  });

  // Reveal heading and supporting text from a clipped baseline without
  // changing its measured space in the layout.
  const textRevealTargets = $$(
    ".hero h1, .section h2, .section h3, .eyebrow, .hero-text, .section-heading > p, .class-card p, .steps p"
  );
  textRevealTargets.forEach((element) => {
    if (element.querySelector(":scope > .text-reveal-inner")) return;
    const inner = document.createElement("span");
    inner.className = "text-reveal-inner";
    while (element.firstChild) inner.appendChild(element.firstChild);
    element.appendChild(inner);
    const isHeading = element.matches("h1, h2, h3, .eyebrow");
    element.classList.add(isHeading ? "text-reveal" : "copy-reveal");
    if (isHeading) {
      const walker = document.createTreeWalker(inner, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      let wordIndex = 0;
      nodes.forEach((node) => {
        const fragment = document.createDocumentFragment();
        node.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) fragment.appendChild(document.createTextNode(part));
          else {
            const word = document.createElement("span");
            word.className = "oxygen-word";
            word.style.setProperty("--word-delay", Math.min(wordIndex * 42, 420) + "ms");
            word.textContent = part;
            fragment.appendChild(word);
            wordIndex += 1;
          }
        });
        node.replaceWith(fragment);
      });
    }
  });
  const oxygenItems = $$(
    ".class-card, .steps article, .achievement-stats > div, .achievements blockquote, .registration .form-card"
  );
  oxygenItems.forEach((item, index) => {
    item.classList.add("oxygen-layer");
    item.style.setProperty("--oxygen-direction", index % 2 === 0 ? "1" : "-1");
    item.style.setProperty("--oxygen-speed", String(10 + index % 3 * 4));
  });

  if ("IntersectionObserver" in window) {
    let observer;
    const revealOnce = (element) => {
      element.classList.add("revealed");
      observer?.unobserve(element);
    };

    const revealVisibleElements = () => {
      animatedElements.forEach((element) => {
        const box = element.getBoundingClientRect();
        if (box.top < innerHeight * .94 && box.bottom > innerHeight * .06) {
          revealOnce(element);
        }
      });
    };

    observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        if (!document.body.classList.contains("intro-active")) {
          revealOnce(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "-3% 0px -3% 0px" });

    animatedElements.forEach((element) => observer.observe(element));
    window.addEventListener("vision:intro-complete", revealVisibleElements, { once: true });
    if (!document.body.classList.contains("intro-active")) revealVisibleElements();
  } else {
    animatedElements.forEach((element) => element.classList.add("revealed"));
  }

  let ticking = false;
  const updateScrollMotion = () => {
    $(".site-header")?.classList.toggle("scrolled", scrollY > 24);

    $("#heroPanel")?.style.setProperty("--panel-y", Math.min(scrollY * .035, 14) + "px");
    $(".hero")?.style.setProperty("--hero-scroll-y", Math.min(scrollY * .024, 16) + "px");
    $$(".section").forEach((section) => {
      const rect = section.getBoundingClientRect();
      const offset = Math.max(-14, Math.min(14, (innerHeight / 2 - rect.top) * .016));
      section.style.setProperty("--section-parallax", offset + "px");
      const progress = Math.max(0, Math.min(1, 1 - rect.top / innerHeight));
      section.style.setProperty("--scene-progress", progress.toFixed(3));
    });
    oxygenItems.forEach((item) => {
      const rect = item.getBoundingClientRect();
      const distance = (rect.top + rect.height / 2 - innerHeight / 2) / innerHeight;
      const direction = Number(item.style.getPropertyValue("--oxygen-direction")) || 1;
      const speed = Number(item.style.getPropertyValue("--oxygen-speed")) || 10;
      const lift = Math.max(-18, Math.min(18, distance * speed * direction));
      item.style.setProperty("--oxygen-lift", lift.toFixed(2) + "px");
    });
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

  if ("PointerEvent" in window) {
    window.addEventListener("pointermove", (event) => {
      if (event.pointerType === "touch") return;
      const mouseX = event.clientX / innerWidth - .5;
      const mouseY = event.clientY / innerHeight - .5;
      document.documentElement.style.setProperty("--mouse-ambient-x", mouseX * 10 + "px");
      document.documentElement.style.setProperty("--mouse-ambient-y", mouseY * 8 + "px");
      document.documentElement.style.setProperty("--mouse-panel-x", mouseX * 7 + "px");
      document.documentElement.style.setProperty("--mouse-panel-y", mouseY * 5 + "px");
    }, { passive: true });

    document.documentElement.addEventListener("mouseleave", () => {
      document.documentElement.style.setProperty("--mouse-ambient-x", "0px");
      document.documentElement.style.setProperty("--mouse-ambient-y", "0px");
      document.documentElement.style.setProperty("--mouse-panel-x", "0px");
      document.documentElement.style.setProperty("--mouse-panel-y", "0px");
    });
  }

  const counterElements = $$(".hero-proof strong, .achievement-stats strong");
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

  const adminWhatsAppNumber = "918147065530";

  $("#registrationForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = $("#registrationStatus");
    const button = event.submitter;
    const values = Object.fromEntries(new FormData(form));
    const showValue = (value) => String(value || "").trim() || "Not provided";

    const whatsappMessage = [
      "🎓 *New Infinite Tutorial Registration*",
      "",
      "*Student details*",
      "Name: " + showValue(values.student_name),
      "Class: " + showValue(values.class_level),
      "School: " + showValue(values.school),
      "Subjects: " + showValue(values.subjects),
      "Preferred batch: " + showValue(values.preferred_batch),
      "",
      "*Parent / guardian*",
      "Name: " + showValue(values.parent_name),
      "Phone: " + showValue(values.phone),
      "Email: " + showValue(values.email),
      "",
      "*Previous academic result*",
      "Previous class: " + showValue(values.previous_class),
      "Board / syllabus: " + showValue(values.board),
      "Last examination: " + showValue(values.previous_exam),
      "Result: " + showValue(values.previous_percentage) + "%",
      "",
      "*Message*",
      showValue(values.message)
    ].join("\n");

    const whatsappUrl =
      "https://wa.me/" + adminWhatsAppNumber +
      "?text=" + encodeURIComponent(whatsappMessage);

    button.disabled = true;
    button.textContent = "Opening WhatsApp…";
    setStatus(status, "");

    // Opening occurs directly from the submit action so browsers do not block it.
    const whatsappWindow = window.open(whatsappUrl, "_blank");
    if (whatsappWindow) {
      whatsappWindow.opener = null;
    } else {
      window.location.href = whatsappUrl;
      return;
    }
    button.disabled = false;
    button.textContent = "Submit registration";
    form.reset();
    setStatus(
      status,
      "WhatsApp opened with your completed registration. Review the details and tap Send to submit it to the admin."
    );
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
