const PAGE_SIZE = 10;

window.pageState = window.pageState || {
  verification: 1,
  deletion: 1,
  users: 1,
  transactions: 1,
};

function renderAll() {
  renderDashboard();
  renderVerification();
  renderDeletionRequests();
  renderUsers();
  renderTransactions();
  renderCharts();
}


function renderDashboard() {
  const users = userRows();

  const pendingIds = users.filter((user) =>
    getIdStatus(user) === "pending" && hasIdUpload(user)
  ).length;

  const pendingDeletion = Object.values(state.deletionRequests).filter(
    (request) => request.status === "pending"
  ).length;

  const stats = state.adminStats || {};

  // TOP CARDS ONLY:
  // Direct total from Firebase node: paymongo_payments
  // Hindi ito gumagamit ng PayMongo Candles daily calculation.
  const paymongoRows = Object.values(state.paymongoPayments || {});

  const payments = paymongoRows.length;

  const revenue = paymongoRows.reduce((sum, item) => {
    const amount = Number(item.amount || 0);

    if (!Number.isFinite(amount) || amount <= 0) {
      return sum;
    }

    // PayMongo usually stores amount in centavos.
    // Example: 25000 = ₱250.00
    if (amount > 999) {
      return sum + amount / 100;
    }

    // If already stored as peso amount.
    return sum + amount;
  }, 0);

  $("statUsers").textContent =
    stats.totalUsers !== undefined ? stats.totalUsers : users.length;

  $("statPendingIds").textContent =
    stats.pendingIdVerifications !== undefined
      ? stats.pendingIdVerifications
      : pendingIds;

  $("statDeletion").textContent =
    stats.pendingDeletionRequests !== undefined
      ? stats.pendingDeletionRequests
      : pendingDeletion;

  $("statPayments").textContent = payments;
  $("statRevenue").textContent = formatPeso(revenue);
}


function renderVerification() {
  const search = getValue("idSearchInput").toLowerCase();
  const status = getValue("idStatusFilter");
  const rows = userRows().filter(hasIdUpload).filter((user) => {
    const idStatus = getIdStatus(user);
    if (status !== "all" && idStatus !== status) return false;
    return searchUser(user, search);
  });

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

    if (window.pageState.verification > totalPages) {
      window.pageState.verification = totalPages;
    }

    const start = (window.pageState.verification - 1) * PAGE_SIZE;
    const pagedRows = rows.slice(start, start + PAGE_SIZE);

  const list = $("verificationList");
  if (pagedRows.length === 0) {
    list.innerHTML = empty("No ID verification records found.");
    return;
  }

  list.innerHTML = pagedRows.map((user) => {
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
  renderPagination(
    "verificationPagination",
    "verification",
    totalPages
  );
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

function renderPagination(containerId, key, totalPages) {
  const container = $(containerId);
  if (!container) return;

  const current = window.pageState[key] || 1;

  container.innerHTML = `
    <button class="secondary-btn" ${current <= 1 ? "disabled" : ""}
      onclick="changePage('${key}', -1)">
      Previous
    </button>

    <span class="page-indicator">
      Page ${current} of ${totalPages}
    </span>

    <button class="secondary-btn" ${current >= totalPages ? "disabled" : ""}
      onclick="changePage('${key}', 1)">
      Next
    </button>
  `;
}

function changePage(key, direction) {
  window.pageState[key] = Math.max(1, (window.pageState[key] || 1) + direction);
  renderAll();
}

