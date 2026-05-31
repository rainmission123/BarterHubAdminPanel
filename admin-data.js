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

  db.ref("paymongo_payments").on("value", (snapshot) => {
  state.paymongoPayments = snapshot.val() || {};
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

