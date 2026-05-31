const firebaseConfig = {
  apiKey: "AIzaSyB8z_w1xGFyK2ZcjYieImlyaHdOPv6RQS4",
  authDomain: "barterhub-3c947.firebaseapp.com",
  databaseURL: "https://barterhub-3c947-default-rtdb.firebaseio.com",
  projectId: "barterhub-3c947",
  storageBucket: "barterhub-3c947.appspot.com",
  messagingSenderId: "812276220118",
  appId: "1:812276220118:web:6c4893c3ad05c0fb598977",
  measurementId: "G-XLD6NQ0KLY",
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.database();
const functions = firebase.app().functions("us-central1");

const state = {
  users: {},
  publicUsers: {},
  deletionRequests: {},
  adminStats: {},
  transactions: [],
  usingAdminTransactionFeed: false,
  transactionReadStatus: {},
  transactionSourceListeners: {},
  transactionUserListeners: {},
  adminUid: "",
  pendingAction: null,
};

const $ = (id) => document.getElementById(id);
const loginPage = $("loginPage");
const appShell = $("appShell");
const loginForm = $("loginForm");
const loginError = $("loginError");
const signOutBtn = $("signOutBtn");
const themeToggleBtn = $("themeToggleBtn");
const adminEmail = $("adminEmail");
const reasonModal = $("reasonModal");
const reasonTitle = $("reasonTitle");
const reasonText = $("reasonText");
const reasonInput = $("reasonInput");
const reasonConfirmBtn = $("reasonConfirmBtn");
const reasonCancelBtn = $("reasonCancelBtn");

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

function showLogin() {
  appShell.classList.add("hidden");
  loginPage.classList.remove("hidden");
}

function showApp() {
  loginPage.classList.add("hidden");
  appShell.classList.remove("hidden");
}

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  if (themeToggleBtn) {
    themeToggleBtn.textContent = theme === "dark" ? "Light mode" : "Dark mode";
  }
}

function startListeners() {
  db.ref("users").on("value", (snapshot) => {
    state.users = snapshot.val() || {};
    syncLegacyTransactionListeners();
    renderAll();
  });

  db.ref("public_users").on("value", (snapshot) => {
    state.publicUsers = snapshot.val() || {};
    syncLegacyTransactionListeners();
    renderAll();
  });

  db.ref("account_deletion_requests").on("value", (snapshot) => {
    state.deletionRequests = snapshot.val() || {};
    renderAll();
  });

  db.ref("admin_stats").on("value", (snapshot) => {
    state.adminStats = snapshot.val() || {};
    renderAll();
  }, () => {
    state.adminStats = {};
    renderAll();
  });

  listenAdminTransactions();
  listenTransactions();
}

function listenAdminTransactions() {
  const source = "admin_transactions";

  db.ref(source).orderByChild("timestamp").limitToLast(150).on("value", (snapshot) => {
    const rows = flattenNode(source, snapshot.val() || {})
      .map((item) => Object.assign({
        rawSource: source,
        originalSource: item.originalSource || item.sourcePath || source,
      }, item));

    state.transactions = state.transactions
      .filter((item) => item.rawSource !== source)
      .concat(rows);
    state.usingAdminTransactionFeed = rows.length > 0;
    setTransactionReadStatus(source, rows.length);
    syncLegacyTransactionListeners();
    renderAll();
  }, (error) => {
    state.usingAdminTransactionFeed = false;
    setTransactionReadStatus(source, 0, error);
    syncLegacyTransactionListeners();
    renderAll();
  });
}

function listenTransactions() {
  [
    "coin_transactions",
    "coinTransactions",
    "coin_transfers",
    "coinTransfers",
    "coin_transfer_transactions",
    "coin_history",
    "coinHistory",
    "coin_purchase_history",
    "coinPurchaseHistory",
    "wallet_transactions",
    "walletTransactions",
    "wallet_history",
    "walletHistory",
    "wallets",
    "user_wallets",
    "userWallets",
    "premium_transactions",
    "premiumTransactions",
    "paymongo_payments",
    "paymongoPayments",
    "paymongo_checkout_sessions",
    "paymongoCheckoutSessions",
    "processed_paymongo_payments",
    "processedPaymongoPayments",
    "transaction_history",
    "transactionHistory",
    "payments",
    "payment_history",
    "paymentHistory",
    "orders",
    "checkout_sessions",
    "checkoutSessions",
    "user_transactions",
    "userTransactions",
  ].forEach((source) => {
    if (state.usingAdminTransactionFeed || state.transactionSourceListeners[source]) return;

    const ref = db.ref(source).limitToLast(80);
    const handler = (snapshot) => {
      const rows = flattenNode(canonicalSource(source), snapshot.val() || {})
        .map((item) => Object.assign({rawSource: source}, item));
      state.transactions = state.transactions
        .filter((item) => item.rawSource !== source)
        .concat(rows);
      setTransactionReadStatus(source, rows.length);
      renderAll();
    };
    const errorHandler = (error) => {
      setTransactionReadStatus(source, 0, error);
      renderAll();
    };

    ref.on("value", handler, errorHandler);
    state.transactionSourceListeners[source] = {ref, handler};
  });
}

function syncLegacyTransactionListeners() {
  if (state.usingAdminTransactionFeed) {
    stopLegacyTransactionListeners();
    return;
  }

  listenTransactions();
  listenUserTransactions();
}

function listenUserTransactions() {
  const uids = Array.from(new Set([
    ...Object.keys(state.users || {}),
    ...Object.keys(state.publicUsers || {}),
    state.adminUid,
  ].filter(Boolean)));

  uids.forEach((uid) => {
    if (state.transactionUserListeners[uid]) return;

    const source = "transactions/" + uid;
    const ref = db.ref(source).limitToLast(80);
    const handler = (snapshot) => {
      const rows = flattenNode("transactions", snapshot.val() || {}, uid)
        .map((item) => Object.assign({rawSource: source, uid}, item));
      state.transactions = state.transactions
        .filter((item) => item.rawSource !== source)
        .concat(rows);
      setTransactionReadStatus(source, rows.length);
      renderAll();
    };
    const errorHandler = (error) => {
      state.transactions = state.transactions.filter((item) => item.rawSource !== source);
      setTransactionReadStatus(source, 0, error);
      console.warn("Could not read " + source, error);
      renderAll();
    };

    ref.on("value", handler, errorHandler);
    state.transactionUserListeners[uid] = {ref, handler};
  });

  Object.keys(state.transactionUserListeners).forEach((uid) => {
    if (uids.includes(uid)) return;
    const listener = state.transactionUserListeners[uid];
    listener.ref.off("value", listener.handler);
    delete state.transactionUserListeners[uid];
    state.transactions = state.transactions.filter((item) => item.rawSource !== "transactions/" + uid);
  });
}

function stopUserTransactionListeners() {
  Object.keys(state.transactionUserListeners).forEach((uid) => {
    const listener = state.transactionUserListeners[uid];
    listener.ref.off("value", listener.handler);
    delete state.transactionUserListeners[uid];
    state.transactions = state.transactions.filter((item) => item.rawSource !== "transactions/" + uid);
    delete state.transactionReadStatus["transactions/" + uid];
  });
}

function stopLegacyTransactionListeners() {
  Object.keys(state.transactionSourceListeners).forEach((source) => {
    const listener = state.transactionSourceListeners[source];
    listener.ref.off("value", listener.handler);
    delete state.transactionSourceListeners[source];
    state.transactions = state.transactions.filter((item) => item.rawSource !== source);
    delete state.transactionReadStatus[source];
  });

  stopUserTransactionListeners();
}

function setTransactionReadStatus(source, count, error) {
  state.transactionReadStatus[source] = {
    count,
    error: error ? (error.code || error.message || String(error)) : "",
  };
}

function flattenNode(source, value, parentKey = "") {
  if (!value || typeof value !== "object") return [];

  return Object.entries(value).flatMap(([key, child]) => {
    const id = parentKey ? parentKey + "/" + key : key;
    const looksLikeRecord = child && typeof child === "object" && (
      child.status || child.type || child.amount || child.coins ||
      child.coinsDeducted || child.senderUid || child.receiverUid ||
      child.fromUid || child.toUid || child.paymentId || child.sessionId ||
      child.checkoutSessionId || child.timestamp || child.createdAt ||
      child.updatedAt || child.paidAt || child.completedAt ||
      (child.data && child.data.attributes) || child.attributes || child.metadata
    );

    if (looksLikeRecord) return [Object.assign({id, source, uid: inferUidFromPath(id, child)}, child)];
    if (child && typeof child === "object") return flattenNode(source, child, id);
    return [{id, source, value: child}];
  });
}

function inferUidFromPath(id, item) {
  if (item && (item.uid || item.userId || item.userUID || item.user_uid || item.user_id)) {
    return item.uid || item.userId || item.userUID || item.user_uid || item.user_id;
  }
  const metadataUid = getFirstValue(item, [
    "metadata.uid",
    "metadata.userId",
    "data.attributes.metadata.uid",
    "data.attributes.metadata.userId",
    "attributes.metadata.uid",
    "attributes.metadata.userId",
  ]);
  if (metadataUid) return metadataUid;
  const firstSegment = String(id || "").split("/")[0];
  if (/^[A-Za-z0-9_-]{20,}$/.test(firstSegment) && !firstSegment.startsWith("cs_") && !firstSegment.startsWith("pay_")) {
    return firstSegment;
  }
  return "";
}

function canonicalSource(source) {
  const value = String(source || "");
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, "");

  if (normalized.includes("premium")) return "premium_transactions";
  if (normalized.includes("checkout")) return "paymongo_checkout_sessions";
  if (normalized.includes("processedpaymongo")) return "processed_paymongo_payments";
  if (normalized.includes("paymongo") || normalized === "payments" || normalized.includes("payment")) return "paymongo_payments";
  if (normalized.includes("wallet") || normalized.includes("coin") || normalized.includes("transfer")) return "coin_transactions";
  if (normalized.includes("history")) return "transactions";
  return value;
}

function renderAll() {
  renderDashboard();
  renderVerification();
  renderDeletionRequests();
  renderUsers();
  renderTransactions();
  renderCharts();
}

function userRows() {
  const merged = Object.assign({}, state.publicUsers, state.users);
  return Object.entries(merged).map(([uid, user]) => Object.assign({uid}, user || {}));
}

function allTransactionRows() {
  const rows = state.transactions
    .concat(userTransactionRows())
    .concat(walletTransferRows())
    .concat(payMongoCoinRows())
    .map(normalizeTransaction)
    .filter(Boolean);
  const seen = new Set();

  return rows.filter((item) => {
    const key = [
      item.source,
      item.id,
      item.uid,
      item.type,
      item.status,
      item.timestamp,
      item.amount,
      item.coins,
      item.coinsDeducted,
    ].join("|");

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function walletTransferRows() {
  return state.transactions
    .filter((item) => ["coin_transactions", "transactions"].includes(canonicalSource(item.source)))
    .filter(isWalletTransfer)
    .map((item) => Object.assign({}, item, {
      id: "wallet_transfer/" + item.id,
      source: "user_transactions",
      originalSource: item.rawSource || item.source,
    }));
}

function isWalletTransfer(item) {
  const type = String(item.type || item.action || item.category || item.event || item.id || "").toLowerCase();
  return type.includes("send") || type.includes("sent") || type.includes("receive") ||
    type.includes("received") || type.includes("transfer") ||
    Boolean(item.senderUid || item.fromUid || item.senderId || item.fromUserId ||
      item.receiverUid || item.toUid || item.receiverId || item.toUserId);
}

function payMongoCoinRows() {
  return state.transactions
    .filter((item) => canonicalSource(item.source) === "paymongo_payments")
    .filter((item) => item.coins || item.coinAmount || item.coin_amount || item.coinsAdded)
    .map((item) => Object.assign({}, item, {
      id: "coin_purchase/" + item.id,
      source: "coin_transactions",
      originalSource: item.rawSource || item.source,
      currency: item.currency || "PHP",
      type: item.type || "coin_purchase",
    }));
}

function userTransactionRows() {
  const rows = [];
  const keys = [
    "transactions",
    "transactionHistory",
    "coinTransactions",
    "coin_transactions",
    "walletTransactions",
    "wallet_transactions",
    "transferTransactions",
    "transfer_transactions",
    "premiumTransactions",
    "premium_transactions",
  ];

  Object.entries(state.users).forEach(([uid, user]) => {
    if (!user || typeof user !== "object") return;

    keys.forEach((key) => {
      if (user[key] && typeof user[key] === "object") {
        rows.push(...flattenNode("user_transactions", user[key], uid + "/" + key)
          .map((item) => Object.assign({uid, originalSource: "users/" + uid + "/" + key}, item)));
      }
    });

    if (user.wallet && typeof user.wallet === "object") {
      ["transactions", "history", "coinTransactions", "transfers"].forEach((key) => {
        if (user.wallet[key] && typeof user.wallet[key] === "object") {
          rows.push(...flattenNode("user_transactions", user.wallet[key], uid + "/wallet/" + key)
            .map((item) => Object.assign({uid, originalSource: "users/" + uid + "/wallet/" + key}, item)));
        }
      });
    }
  });

  return rows;
}

function userRecord(uid) {
  return (state.users && state.users[uid]) || (state.publicUsers && state.publicUsers[uid]) || {};
}

function renderDashboard() {
  const users = userRows();
  const pendingIds = users.filter((user) => getIdStatus(user) === "pending" && hasIdUpload(user)).length;
  const pendingDeletion = Object.values(state.deletionRequests).filter((request) => request.status === "pending").length;
  const payments = allTransactionRows().filter((item) => item.source.indexOf("paymongo") >= 0).length;
  const revenue = payMongoRevenue();
  const stats = state.adminStats || {};

  $("statUsers").textContent = stats.totalUsers !== undefined ? stats.totalUsers : users.length;
  $("statPendingIds").textContent = stats.pendingIdVerifications !== undefined ? stats.pendingIdVerifications : pendingIds;
  $("statDeletion").textContent = stats.pendingDeletionRequests !== undefined ? stats.pendingDeletionRequests : pendingDeletion;
  $("statPayments").textContent = stats.totalPayments !== undefined ? stats.totalPayments : payments;
  $("statRevenue").textContent = formatPeso(stats.totalRevenue !== undefined ? stats.totalRevenue : revenue);
}

function renderCharts() {
  renderActivityChart();
  renderStatusChart();
  renderPaymentBars();
  renderRevenueCandleChart();
}

function renderActivityChart() {
  const canvas = $("activityChart");
  if (!canvas) return;

  const buckets = buildActivityBuckets(7);
  const ctx = setupCanvas(canvas);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight || Number(canvas.getAttribute("height")) || 180;
  const maxValue = Math.max(1, ...buckets.map((item) => item.value));
  const padding = 28;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  ctx.clearRect(0, 0, width, height);
  drawGrid(ctx, width, height, padding);

  ctx.strokeStyle = getCss("--primary");
  ctx.lineWidth = 3;
  ctx.beginPath();

  buckets.forEach((item, index) => {
    const x = padding + (chartWidth / Math.max(1, buckets.length - 1)) * index;
    const y = padding + chartHeight - (item.value / maxValue) * chartHeight;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.stroke();

  buckets.forEach((item, index) => {
    const x = padding + (chartWidth / Math.max(1, buckets.length - 1)) * index;
    const y = padding + chartHeight - (item.value / maxValue) * chartHeight;
    ctx.fillStyle = getCss("--surface-strong");
    ctx.strokeStyle = getCss("--accent");
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = getCss("--muted");
    ctx.font = "12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(item.label, x, height - 6);
  });

  const total = buckets.reduce((sum, item) => sum + item.value, 0);
  $("activityTotal").textContent = total + " events";
}

function buildActivityBuckets(days) {
  const now = new Date();
  const buckets = [];

  for (let index = days - 1; index >= 0; index--) {
    const date = new Date(now);
    date.setDate(now.getDate() - index);
    const key = date.toISOString().slice(0, 10);
    buckets.push({
      key,
      label: date.toLocaleDateString(undefined, {weekday: "short"}),
      value: 0,
    });
  }

  const byKey = Object.fromEntries(buckets.map((item) => [item.key, item]));
  const events = [];

  Object.values(state.deletionRequests).forEach((item) => {
    events.push(item.requestedAt || item.completedAt || item.reviewedAt);
  });

  allTransactionRows().forEach((item) => {
    events.push(transactionTimestamp(item));
  });

  events.forEach((value) => {
    const number = Number(value || 0);
    if (!number) return;
    const key = new Date(number).toISOString().slice(0, 10);
    if (byKey[key]) byKey[key].value += 1;
  });

  return buckets;
}

function renderStatusChart() {
  const canvas = $("statusChart");
  if (!canvas) return;

  const users = userRows();
  const values = [
    {
      label: "Verified",
      value: users.filter((user) => getIdStatus(user) === "verified").length,
      color: "#22c55e",
    },
    {
      label: "Pending",
      value: users.filter((user) => getIdStatus(user) === "pending").length,
      color: "#f59e0b",
    },
    {
      label: "Rejected",
      value: users.filter((user) => getIdStatus(user) === "rejected").length,
      color: "#ef4444",
    },
    {
      label: "Deleted",
      value: users.filter((user) => user.accountStatus === "deleted").length,
      color: "#94a3b8",
    },
  ];

  const ctx = setupCanvas(canvas);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight || Number(canvas.getAttribute("height")) || 220;
  const total = Math.max(1, values.reduce((sum, item) => sum + item.value, 0));
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.34;
  let start = -Math.PI / 2;

  ctx.clearRect(0, 0, width, height);

  values.forEach((item) => {
    const angle = (item.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, start, start + angle);
    ctx.closePath();
    ctx.fillStyle = item.color;
    ctx.fill();
    start += angle;
  });

  ctx.beginPath();
  ctx.fillStyle = getCss("--surface-strong");
  ctx.arc(centerX, centerY, radius * 0.58, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = getCss("--ink");
  ctx.font = "700 22px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(String(users.length), centerX, centerY + 2);
  ctx.fillStyle = getCss("--muted");
  ctx.font = "12px system-ui";
  ctx.fillText("users", centerX, centerY + 22);

  $("statusLegend").innerHTML = values.map((item) => `
    <div class="legend-row">
      <span class="legend-dot" style="background:${item.color}"></span>
      <span>${escapeHtml(item.label)}</span>
      <strong>${item.value}</strong>
    </div>
  `).join("");
}

function renderPaymentBars() {
  const container = $("paymentBars");
  if (!container) return;

  const groups = [
    ["Checkout", "paymongo_checkout_sessions"],
    ["Payments", "paymongo_payments"],
    ["Processed", "processed_paymongo_payments"],
    ["Premium", "premium_transactions"],
    ["User coins", "user_transactions"],
  ].map(([label, source]) => ({
    label,
    value: allTransactionRows().filter((item) => item.source === source).length,
  }));

  const maxValue = Math.max(1, ...groups.map((item) => item.value));
  container.innerHTML = groups.map((item) => {
    const width = Math.max(5, (item.value / maxValue) * 100);
    return `
      <div class="bar-row">
        <span>${escapeHtml(item.label)}</span>
        <div class="bar-track">
          <div class="bar-fill" style="width:${width}%"></div>
        </div>
        <strong>${item.value}</strong>
      </div>
    `;
  }).join("");
}

function renderRevenueCandleChart() {
  const canvas = $("revenueCandleChart");
  if (!canvas) return;

  const candles = buildRevenueCandles(7);
  const gross = candles.reduce((sum, item) => sum + item.total, 0);
  const maxValue = Math.max(1, ...candles.map((item) => item.high));
  const ctx = setupCanvas(canvas);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight || Number(canvas.getAttribute("height")) || 180;
  const padding = Math.min(34, Math.max(24, width * 0.06));
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const step = chartWidth / Math.max(1, candles.length - 1);
  const candleWidth = Math.min(22, Math.max(10, step * 0.28));

  ctx.clearRect(0, 0, width, height);
  drawGrid(ctx, width, height, padding);

  candles.forEach((item, index) => {
    const x = padding + step * index;
    const openY = candleY(item.open, maxValue, padding, chartHeight);
    const closeY = candleY(item.close, maxValue, padding, chartHeight);
    const highY = candleY(item.high, maxValue, padding, chartHeight);
    const lowY = candleY(item.low, maxValue, padding, chartHeight);
    const isUp = item.close >= item.open;
    const color = item.total > 0 ? (isUp ? "#22c55e" : "#ef4444") : "#94a3b8";
    const bodyTop = Math.min(openY, closeY);
    const bodyHeight = Math.max(4, Math.abs(openY - closeY));

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, highY);
    ctx.lineTo(x, lowY);
    ctx.stroke();

    ctx.fillStyle = item.total > 0 ? color : "transparent";
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
    ctx.strokeRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);

    ctx.fillStyle = getCss("--muted");
    ctx.font = "12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(item.label, x, height - 6);
  });

  if (gross === 0) {
    ctx.fillStyle = getCss("--muted");
    ctx.font = "13px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("No paid PayMongo records yet.", width / 2, height / 2);
  }

  const pill = $("candleTotal");
  if (pill) pill.textContent = formatPeso(gross) + " gross";
}

function candleY(value, maxValue, padding, chartHeight) {
  return padding + chartHeight - (value / maxValue) * chartHeight;
}

function buildRevenueCandles(days) {
  const now = new Date();
  const buckets = [];

  for (let index = days - 1; index >= 0; index--) {
    const date = new Date(now);
    date.setDate(now.getDate() - index);
    const key = date.toISOString().slice(0, 10);
    buckets.push({
      key,
      label: date.toLocaleDateString(undefined, {weekday: "short"}),
      values: [],
      open: 0,
      close: 0,
      high: 0,
      low: 0,
      total: 0,
    });
  }

  const byKey = Object.fromEntries(buckets.map((item) => [item.key, item]));

  paidPayMongoPayments().forEach((item) => {
    const amount = payMongoAmountToPeso(item.amount);
    if (!amount) return;

    const key = new Date(payMongoTimestamp(item)).toISOString().slice(0, 10);
    const bucket = byKey[key] || buckets[buckets.length - 1];
    bucket.values.push(amount);
  });

  buckets.forEach((bucket) => {
    if (!bucket.values.length) return;
    bucket.open = bucket.values[0];
    bucket.close = bucket.values[bucket.values.length - 1];
    bucket.high = Math.max(...bucket.values);
    bucket.low = Math.min(...bucket.values);
    bucket.total = bucket.values.reduce((sum, value) => sum + value, 0);
  });

  return buckets;
}

function setupCanvas(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 400;
  const height = canvas.clientHeight || Number(canvas.getAttribute("height")) || 180;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return ctx;
}

function drawGrid(ctx, width, height, padding) {
  ctx.strokeStyle = getCss("--line");
  ctx.lineWidth = 1;

  for (let index = 0; index < 4; index++) {
    const y = padding + ((height - padding * 2) / 3) * index;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }
}

function getCss(name) {
  return getComputedStyle(document.body).getPropertyValue(name).trim();
}

function renderVerification() {
  const search = getValue("idSearchInput").toLowerCase();
  const status = getValue("idStatusFilter");
  const rows = userRows().filter(hasIdUpload).filter((user) => {
    const idStatus = getIdStatus(user);
    if (status !== "all" && idStatus !== status) return false;
    return searchUser(user, search);
  });

  const list = $("verificationList");
  if (rows.length === 0) {
    list.innerHTML = empty("No ID verification records found.");
    return;
  }

  list.innerHTML = rows.map((user) => {
    const idStatus = getIdStatus(user);
    const front = user.idFrontUrl || user.idFrontPath || "";
    const back = user.idBackUrl || user.idBackPath || "";
    const approveDisabled = idStatus === "verified" ? "disabled" : "";
    const rejectDisabled = idStatus === "rejected" ? "disabled" : "";
    const pendingDisabled = idStatus === "pending" ? "disabled" : "";

    return `
      <article class="record-card">
        <div class="record-top">
          <div>
            <h3>${escapeHtml(displayName(user))}</h3>
            <div class="meta">
              <span>Email: ${escapeHtml(user.email || "No email")}</span>
              <span>Phone: ${escapeHtml(user.phoneNumber || "")}</span>
              <span>UID: ${escapeHtml(user.uid)}</span>
            </div>
          </div>
          <span class="badge ${idStatus}">${escapeHtml(idStatus)}</span>
        </div>
        <div class="image-row">${imageTag(front, "Front ID")}${imageTag(back, "Back ID")}</div>
        <div class="actions">
          <button class="success-btn" ${approveDisabled} onclick="setIdStatus('${user.uid}', 'verified')">Approve</button>
          <button class="danger-btn" ${rejectDisabled} onclick="setIdStatus('${user.uid}', 'rejected')">Reject</button>
          <button class="secondary-btn" ${pendingDisabled} onclick="setIdStatus('${user.uid}', 'pending')">Reset Pending</button>
        </div>
      </article>`;
  }).join("");
}

function renderDeletionRequests() {
  const search = getValue("deletionSearchInput").toLowerCase();
  const status = getValue("deletionStatusFilter");
  const rows = Object.entries(state.deletionRequests)
    .map(([uid, request]) => Object.assign({uid}, request || {}))
    .filter((request) => {
      const user = state.users[request.uid] || {};
      if (status !== "all" && request.status !== status) return false;
      return searchRequest(request, user, search);
    })
    .sort((a, b) => Number(b.requestedAt || 0) - Number(a.requestedAt || 0));

  const list = $("deletionList");
  if (rows.length === 0) {
    list.innerHTML = empty("No account deletion requests found.");
    return;
  }

  list.innerHTML = rows.map((request) => {
    const user = state.users[request.uid] || {};
    const requestStatus = request.status || "pending";

    return `
      <article class="record-card">
        <div class="record-top">
          <div>
            <h3>${escapeHtml(displayName(user))}</h3>
            <div class="meta">
              <span>Email: ${escapeHtml(user.email || "No email")}</span>
              <span>UID: ${escapeHtml(request.uid)}</span>
              <span>Requested: ${formatTime(request.requestedAt)}</span>
              <span>Source: ${escapeHtml(request.source || "")}</span>
            </div>
          </div>
          <span class="badge ${requestStatus}">${escapeHtml(requestStatus)}</span>
        </div>
        <div class="actions">
          <button class="danger-btn" onclick="confirmCompleteDeletion('${request.uid}')">Complete Deletion</button>
          <button class="secondary-btn" onclick="confirmRejectDeletion('${request.uid}')">Reject Request</button>
        </div>
      </article>`;
  }).join("");
}

function renderUsers() {
  const search = getValue("userSearchInput").toLowerCase();
  const status = getValue("userStatusFilter");
  const rows = userRows().filter((user) => {
    if (!searchUser(user, search)) return false;
    if (status === "all") return true;
    if (status === "premium") return user.isPremium === true;
    return user.accountStatus === status;
  });

  const list = $("usersList");
  if (rows.length === 0) {
    list.innerHTML = empty("No users found.");
    return;
  }

  list.innerHTML = rows.map((user) => {
    const coins = user.wallet && user.wallet.coins !== undefined ? user.wallet.coins : 0;
    const premiumExpiry = user.premiumExpiry ? formatTime(user.premiumExpiry) : "Not premium";
    const statusText = user.accountStatus || getIdStatus(user);

    return `
      <article class="record-card">
        <div class="record-top">
          <div>
            <h3>${escapeHtml(displayName(user))}</h3>
            <div class="meta">
              <span>Email: ${escapeHtml(user.email || "No email")}</span>
              <span>Username: ${escapeHtml(user.username || "")}</span>
              <span>UID: ${escapeHtml(user.uid)}</span>
              <span>Coins: ${escapeHtml(String(coins))}</span>
              <span>Premium expiry: ${escapeHtml(premiumExpiry)}</span>
            </div>
          </div>
          <span class="badge ${statusText}">${escapeHtml(statusText)}</span>
        </div>
      </article>`;
  }).join("");
}

function renderTransactions() {
  const search = getValue("transactionSearchInput").toLowerCase();
  const source = getValue("transactionTypeFilter");
  const rows = allTransactionRows()
    .filter((item) => source === "all" || item.source === source)
    .filter((item) => transactionSearchText(item).includes(search))
    .sort((a, b) => transactionTimestamp(b) - transactionTimestamp(a))
    .slice(0, 150);

  const list = $("transactionsList");
  renderTransactionDiagnostics(source);
  if (rows.length === 0) {
    list.innerHTML = empty("No transaction records found.");
    return;
  }

  list.innerHTML = rows.map((item) => {
    const time = transactionTimestamp(item);
    const statusText = normalizeStatus(item.status);
    const details = transactionDetails(item);

    return `
      <article class="record-card">
        <div class="record-top">
          <div>
            <h3>${escapeHtml(transactionTitle(item))}</h3>
            <div class="meta">
              <span>Source: ${escapeHtml(item.source)}</span>
              <span>ID: ${escapeHtml(item.id)}</span>
              <span>User: ${escapeHtml(userLabel(transactionUid(item)))}</span>
              ${details.map((detail) => `<span>${escapeHtml(detail.label)}: ${escapeHtml(detail.value)}</span>`).join("")}
              <span>Time: ${formatTime(time)}</span>
            </div>
          </div>
          <span class="badge ${statusText}">${escapeHtml(statusText)}</span>
        </div>
      </article>`;
  }).join("");
}

function renderTransactionDiagnostics(selectedSource) {
  const container = $("transactionsDiagnostics");
  if (!container) return;

  const statuses = Object.entries(state.transactionReadStatus || {});
  const relevant = statuses.filter(([source]) => {
    if (selectedSource === "all") return true;
    if (selectedSource === "user_transactions") {
      return source === "transactions" || source.indexOf("transactions/") === 0 ||
        canonicalSource(source) === "user_transactions";
    }
    return canonicalSource(source) === selectedSource;
  });
  const errors = relevant.filter(([, status]) => status.error);

  if (errors.length === 0) {
    container.classList.add("hidden");
    container.innerHTML = "";
    return;
  }

  container.classList.remove("hidden");
  container.innerHTML = errors.slice(0, 6).map(([source, status]) => `
    <span class="diagnostic-pill error">${escapeHtml(source)}: ${escapeHtml(status.error)}</span>
  `).join("");
}

async function setIdStatus(uid, status) {
  const user = state.users[uid] || {};
  const currentStatus = getIdStatus(user);
  if (currentStatus === status) return;

  if (!window.confirm("Set ID verification to " + status + "?")) return;
  try {
    await functions.httpsCallable("adminSetIdVerification")({uid, status});
    window.alert("ID verification updated.");
  } catch (error) {
    window.alert(error.message || "Could not update ID verification.");
  }
}

function confirmCompleteDeletion(uid) {
  reasonTitle.textContent = "Complete Account Deletion";
  reasonText.textContent = "This will anonymize the user profile and delete the Auth account.";
  reasonInput.value = "Processed by admin.";
  state.pendingAction = async (note) => {
    try {
      await functions.httpsCallable("adminCompleteAccountDeletion")({uid, note});
      window.alert("Account deletion completed.");
    } catch (error) {
      window.alert(error.message || "Could not complete deletion.");
    }
  };
  reasonModal.classList.add("open");
}

function confirmRejectDeletion(uid) {
  reasonTitle.textContent = "Reject Deletion Request";
  reasonText.textContent = "Add a short reason or note for rejecting this request.";
  reasonInput.value = "";
  state.pendingAction = async (reason) => {
    try {
      await functions.httpsCallable("adminRejectAccountDeletion")({uid, reason});
      window.alert("Deletion request rejected.");
    } catch (error) {
      window.alert(error.message || "Could not reject request.");
    }
  };
  reasonModal.classList.add("open");
}

function closeReasonModal() {
  reasonModal.classList.remove("open");
  state.pendingAction = null;
}

function hasIdUpload(user) {
  return Boolean(user.idFrontUrl || user.idBackUrl || user.idFrontPath || user.idBackPath);
}

function getIdStatus(user) {
  return user.isIDVerified || user.idVerificationStatus || "pending";
}

function displayName(user) {
  return user.fullName || user.username || user.name || "No name";
}

function searchUser(user, search) {
  const target = [user.uid, user.fullName, user.username, user.email, user.phone, user.phoneNumber].join(" ").toLowerCase();
  return target.includes(search);
}

function searchRequest(request, user, search) {
  const target = [request.uid, request.status, request.source, user.fullName, user.username, user.email].join(" ").toLowerCase();
  return target.includes(search);
}

function getValue(id) {
  return $(id).value;
}

function transactionSearchText(item) {
  return [
    JSON.stringify(item),
    userLabel(transactionUid(item)),
    participantLabel(item, "from"),
    participantLabel(item, "to"),
  ].join(" ").toLowerCase();
}

function userLabel(uid) {
  if (!uid) return "Unknown user";
  const user = userRecord(uid);
  const name = displayName(user);
  if (name && name !== "No name") return name + " (" + uid + ")";
  if (user.email) return user.email + " (" + uid + ")";
  return uid;
}

function participantLabel(item, side) {
  const uidPaths = side === "from"
    ? ["senderUid", "fromUid", "senderId", "fromUserId", "from", "sender.uid"]
    : ["receiverUid", "toUid", "receiverId", "toUserId", "to", "receiver.uid"];
  const namePaths = side === "from"
    ? ["fromName", "senderName", "sender.username", "sender.name"]
    : ["toName", "receiverName", "receiver.username", "receiver.name"];
  const uid = getFirstValue(item, uidPaths);
  const name = getFirstValue(item, namePaths);

  if (name && uid) return name + " (" + uid + ")";
  if (name) return name;
  return userLabel(uid);
}

function normalizeTransaction(item) {
  if (!item || typeof item !== "object") return null;
  const normalized = Object.assign({}, item);
  normalized.source = canonicalSource(normalized.source);
  if (normalized.source === "transactions" && isWalletTransfer(normalized)) {
    normalized.source = "user_transactions";
  }
  normalized.uid = transactionUid(normalized);
  normalized.status = normalizeStatus(normalized.status || normalized.paymentStatus || normalized.state ||
    getFirstValue(normalized, ["data.attributes.status", "attributes.status", "payment.status"]) || "record");
  normalized.timestamp = transactionTimestamp(normalized);
  return normalized;
}

function transactionUid(item) {
  return item.uid || item.userId || item.userUID || item.user_uid || item.user_id ||
    getFirstValue(item, [
      "metadata.uid",
      "metadata.userId",
      "data.attributes.metadata.uid",
      "data.attributes.metadata.userId",
      "attributes.metadata.uid",
      "attributes.metadata.userId",
      "checkout.metadata.uid",
      "payment.metadata.uid",
    ]) ||
    inferUidFromPath(item.id, item) || "";
}

function transactionTimestamp(item) {
  const value = getFirstValue(item, [
    "paidAt",
    "completedAt",
    "timestamp",
    "createdAt",
    "updatedAt",
    "created_at",
    "updated_at",
    "date",
    "time",
    "data.attributes.paid_at",
    "data.attributes.created_at",
    "data.attributes.updated_at",
    "attributes.paid_at",
    "attributes.created_at",
    "attributes.updated_at",
    "payment.createdAt",
    "checkout.createdAt",
  ]);
  const number = Number(value || 0);

  if (Number.isFinite(number) && number > 0) {
    return number < 1000000000000 ? number * 1000 : number;
  }

  const parsed = Date.parse(value || "");
  if (!Number.isNaN(parsed)) return parsed;

  return relatedTransactionTimestamp(item);
}

function normalizeStatus(value) {
  return String(value || "record").toLowerCase().replace(/\s+/g, "_");
}

function relatedTransactionTimestamp(item) {
  const uid = transactionUid(item);
  const amount = getFirstValue(item, ["amount", "data.attributes.amount", "attributes.amount", "payment.amount"]);
  const coins = getFirstValue(item, ["coins", "coinAmount", "coin_amount", "coinsAdded", "coinsDeducted"]);
  const itemId = String(item.id || "");

  const related = state.transactions
    .filter((candidate) => candidate !== item)
    .map((candidate) => ({
      candidate,
      timestamp: directTransactionTimestamp(candidate),
    }))
    .filter((entry) => entry.timestamp > 0)
    .filter((entry) => {
      const candidate = entry.candidate;
      const candidateUid = transactionUid(candidate);
      const candidateAmount = getFirstValue(candidate, ["amount", "data.attributes.amount", "attributes.amount", "payment.amount"]);
      const candidateCoins = getFirstValue(candidate, ["coins", "coinAmount", "coin_amount", "coinsAdded", "coinsDeducted"]);
      const candidateId = String(candidate.id || "");

      if (uid && candidateUid && uid !== candidateUid) return false;
      if (amount && candidateAmount && String(amount) !== String(candidateAmount)) return false;
      if (coins && candidateCoins && String(coins) !== String(candidateCoins)) return false;

      return itemId.includes(candidateId) || candidateId.includes(itemId) ||
        (uid && (amount || coins));
    })
    .sort((a, b) => b.timestamp - a.timestamp);

  return related.length ? related[0].timestamp : 0;
}

function directTransactionTimestamp(item) {
  const value = getFirstValue(item, [
    "paidAt",
    "completedAt",
    "timestamp",
    "createdAt",
    "updatedAt",
    "created_at",
    "updated_at",
    "date",
    "time",
    "data.attributes.paid_at",
    "data.attributes.created_at",
    "data.attributes.updated_at",
    "attributes.paid_at",
    "attributes.created_at",
    "attributes.updated_at",
    "payment.createdAt",
    "checkout.createdAt",
  ]);
  const number = Number(value || 0);

  if (Number.isFinite(number) && number > 0) {
    return number < 1000000000000 ? number * 1000 : number;
  }

  const parsed = Date.parse(value || "");
  return Number.isNaN(parsed) ? 0 : parsed;
}

function transactionTitle(item) {
  const raw = item.type || item.action || item.category || item.event ||
    getFirstValue(item, ["data.attributes.type", "attributes.type"]) ||
    item.status || item.source;
  return titleCase(raw);
}

function titleCase(value) {
  return String(value || "record")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function transactionDetails(item) {
  const details = [];
  const amount = transactionAmountLabel(item);

  if (amount) details.push({label: "Amount", value: amount});
  const coins = getFirstValue(item, ["coins", "coinAmount", "coin_amount", "coinsAdded", "coinsDeducted"]);
  if (coins) {
    details.push({label: "Coins", value: coinLabel(coins)});
  }
  const from = getFirstValue(item, ["senderUid", "fromUid", "senderId", "fromUserId", "from", "sender.uid"]);
  if (from) {
    details.push({label: "From", value: participantLabel(item, "from")});
  }
  const to = getFirstValue(item, ["receiverUid", "toUid", "receiverId", "toUserId", "to", "receiver.uid"]);
  if (to) {
    details.push({label: "To", value: participantLabel(item, "to")});
  }
  const paymentId = getFirstValue(item, ["paymentId", "paymongoPaymentId", "data.id", "payment.id"]);
  if (paymentId) {
    details.push({label: "Payment ID", value: paymentId});
  }
  const sessionId = getFirstValue(item, ["sessionId", "checkoutSessionId", "checkout.id"]);
  if (sessionId) {
    details.push({label: "Session ID", value: sessionId});
  }
  if (item.originalSource) {
    details.push({label: "Saved at", value: item.originalSource});
  }

  return details;
}

function transactionAmountLabel(item) {
  const amount = getFirstValue(item, [
    "amount",
    "totalAmount",
    "price",
    "value",
    "amountPaid",
    "amount_paid",
    "data.attributes.amount",
    "attributes.amount",
    "payment.amount",
  ]);
  if (amount === undefined || amount === null || amount === "") return "";

  const typeText = String(item.type || item.source || item.originalSource || "").toLowerCase();
  const coins = getFirstValue(item, ["coins", "coinAmount", "coin_amount", "coinsAdded", "coinsDeducted"]);
  if (coins && String(coins) === String(amount) && isWalletTransfer(item)) return "";

  const currency = String(getFirstValue(item, [
    "currency",
    "paymentCurrency",
    "data.attributes.currency",
    "attributes.currency",
    "payment.currency",
  ]) || "").toUpperCase();

  if (currency === "PHP" || typeText.includes("paymongo") || String(item.source || "").indexOf("paymongo") >= 0 ||
    String(item.originalSource || "").indexOf("paymongo") >= 0) {
    return formatPeso(payMongoAmountToPeso(amount));
  }

  if (typeText.includes("premium") || typeText.includes("coin") || item.coins || item.coinAmount || item.coinsAdded || item.coinsDeducted) {
    return coinLabel(amount);
  }

  return String(amount);
}

function coinLabel(value) {
  const coins = Number(value || 0);
  if (Number.isFinite(coins)) {
    return new Intl.NumberFormat("en-US", {maximumFractionDigits: 0}).format(coins) + " coins";
  }
  return String(value);
}

function getFirstValue(item, paths) {
  for (const path of paths) {
    const value = getPath(item, path);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

function getPath(item, path) {
  return String(path).split(".").reduce((current, key) => {
    if (current === undefined || current === null) return undefined;
    return current[key];
  }, item);
}

function imageTag(src, alt) {
  if (!src || src.indexOf("id_verifications/") === 0) {
    return `<div class="empty">${escapeHtml(alt)} path saved</div>`;
  }
  return `<a href="${escapeHtml(src)}" target="_blank" rel="noopener"><img class="id-image" src="${escapeHtml(src)}" alt="${alt}"></a>`;
}

function empty(message) {
  return `<div class="panel empty">${escapeHtml(message)}</div>`;
}

function formatTime(value) {
  const number = Number(value || 0);
  if (!number) return "Unknown";
  return new Date(number).toLocaleString();
}

function payMongoRevenue() {
  return paidPayMongoPayments()
    .reduce((total, item) => total + payMongoAmountToPeso(item.amount), 0);
}

function paidPayMongoPayments() {
  return allTransactionRows()
    .filter((item) => item.source === "paymongo_payments")
    .filter(isPaidPayMongo);
}

function isPaidPayMongo(item) {
  const status = String(item.status || "").toLowerCase();
  return ["paid", "completed", "succeeded", "success"].includes(status);
}

function payMongoTimestamp(item) {
  const value = item.paidAt || item.completedAt || item.timestamp ||
    item.createdAt || item.updatedAt || item.created_at || item.updated_at;
  const number = Number(value || 0);
  if (number) return number;

  const parsed = Date.parse(value || "");
  if (!Number.isNaN(parsed)) return parsed;

  return Date.now();
}

function payMongoAmountToPeso(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return amount / 100;
}

function formatPeso(value) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
  }).format(value);
}

function escapeHtml(value) {
  return String(value === undefined || value === null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
