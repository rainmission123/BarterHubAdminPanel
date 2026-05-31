applyTheme(localStorage.getItem("barterhub-admin-theme") || "light");

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.textContent = "";

  const email = $("loginEmail").value.trim();
  const password = $("loginPassword").value;

  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (error) {
    loginError.textContent = error.message || "Could not sign in.";
  }
});

signOutBtn.addEventListener("click", () => auth.signOut());

themeToggleBtn.addEventListener("click", () => {
  const currentTheme = document.body.dataset.theme || "light";
  const nextTheme = currentTheme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
  localStorage.setItem("barterhub-admin-theme", nextTheme);
  renderCharts();
});

auth.onAuthStateChanged(async (user) => {
  if (!user) {
    showLogin();
    return;
  }

  const adminSnap = await db.ref("admin_users/" + user.uid).get();
  const isAdmin = adminSnap.val() === true;

  if (!isAdmin) {
    loginError.textContent = "This account is not an admin.";
    await auth.signOut();
    return;
  }

  state.adminUid = user.uid;
  adminEmail.textContent = user.email || user.uid;
  showApp();
  startListeners();
  initCandleRangeButtons();
});

document.querySelectorAll(".nav-btn").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach((btn) => btn.classList.remove("active"));
    document.querySelectorAll(".view").forEach((view) => view.classList.add("hidden"));
    button.classList.add("active");
    $(button.dataset.view).classList.remove("hidden");
  });
});

$("refreshBtn").addEventListener("click", renderAll);
[
  "idSearchInput", "idStatusFilter", "deletionSearchInput",
  "deletionStatusFilter", "userSearchInput", "userStatusFilter",
  "transactionSearchInput", "transactionTypeFilter",
].forEach((id) => {
  $(id).addEventListener("input", renderAll);
  $(id).addEventListener("change", renderAll);
});

window.addEventListener("resize", () => {
  window.clearTimeout(window.__barterhubChartResize);
  window.__barterhubChartResize = window.setTimeout(renderCharts, 120);
});

reasonCancelBtn.addEventListener("click", closeReasonModal);
reasonConfirmBtn.addEventListener("click", async () => {
  if (!state.pendingAction) return;
  const action = state.pendingAction;
  closeReasonModal();
  await action(reasonInput.value.trim());
});

