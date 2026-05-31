/* eslint-disable require-jsdoc, max-len, indent, comma-dangle */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.database();

function safeKey(value) {
  return String(value || "record").replace(/[.#$/[\]]/g, "_");
}

function firstValue(record, keys) {
  for (const key of keys) {
    const value = record && record[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

function normalizeStatus(value) {
  return String(value || "record").toLowerCase().replace(/\s+/g, "_");
}

function normalizeWalletTransaction(uid, txId, record) {
  const type = String(record.type || record.title || "wallet_transaction").toLowerCase();
  const isReceive = type.includes("receive");
  const title = record.title || (isReceive ? "Received Coins" : "Sent Coins");

  return {
    source: "user_transactions",
    type: record.type || (isReceive ? "receive" : "send"),
    title,
    status: normalizeStatus(record.status || "completed"),
    uid,
    fromUid: record.from || record.fromUid || record.senderUid || "",
    fromName: record.fromName || record.senderName || "",
    toUid: record.to || record.toUid || record.receiverUid || "",
    toName: record.toName || record.receiverName || "",
    coins: Number(record.coins || record.amount || 0),
    amount: Number(record.amount || record.coins || 0),
    referenceNo: record.referenceNo || "",
    timestamp: Number(record.timestamp || record.createdAt || Date.now()),
    sourcePath: `transactions/${uid}/${txId}`,
  };
}

function normalizePremiumTransaction(txId, record) {
  const uid = firstValue(record, ["uid", "userId", "userUID", "user_uid"]);

  return {
    source: "premium_transactions",
    type: record.type || "premium_activation",
    title: "Premium Activation",
    status: normalizeStatus(record.status || "completed"),
    uid,
    userName: record.userName || record.username || record.fullName || "",
    coins: Number(record.coins || record.coinsDeducted || record.amount || 0),
    amount: Number(record.amount || record.coins || record.coinsDeducted || 0),
    timestamp: Number(record.timestamp || record.createdAt || record.completedAt || Date.now()),
    sourcePath: `premium_transactions/${txId}`,
  };
}

function normalizePayMongoPayment(paymentId, record, sourcePath, source) {
  const attrs = (record.data && record.data.attributes) || record.attributes || {};
  const metadata = attrs.metadata || record.metadata || {};
  const amount = Number(record.amount || attrs.amount || 0);
  const coins = Number(record.coins || record.coinAmount || record.coinsAdded || metadata.coins || 0);

  return {
    source,
    type: coins ? "coin_purchase" : "paymongo_payment",
    title: coins ? "Coin Purchase" : "PayMongo Payment",
    status: normalizeStatus(record.status || attrs.status || "record"),
    uid: firstValue(record, ["uid", "userId", "userUID"]) || metadata.uid || metadata.userId || "",
    userName: record.userName || record.username || metadata.userName || "",
    paymentId,
    amount,
    coins,
    currency: String(record.currency || attrs.currency || "PHP").toUpperCase(),
    timestamp: Number(record.timestamp || record.paidAt || record.createdAt || attrs.paid_at || attrs.created_at || Date.now()),
    sourcePath,
  };
}

async function writeAdminTransaction(key, value) {
  await db.ref(`admin_transactions/${safeKey(key)}`).set(Object.assign({
    updatedAt: admin.database.ServerValue.TIMESTAMP,
  }, value));
}

async function deleteAdminTransaction(key) {
  await db.ref(`admin_transactions/${safeKey(key)}`).remove();
}

exports.mirrorWalletTransactionToAdminFeed = functions.database
  .ref("/transactions/{uid}/{txId}")
  .onWrite(async (change, context) => {
    const {uid, txId} = context.params;
    const key = `wallet_${uid}_${txId}`;

    if (!change.after.exists()) {
      await deleteAdminTransaction(key);
      await rebuildAdminStats();
      return null;
    }

    await writeAdminTransaction(key, normalizeWalletTransaction(uid, txId, change.after.val() || {}));
    await rebuildAdminStats();
    return null;
  });

exports.mirrorPremiumTransactionToAdminFeed = functions.database
  .ref("/premium_transactions/{txId}")
  .onWrite(async (change, context) => {
    const {txId} = context.params;
    const key = `premium_${txId}`;

    if (!change.after.exists()) {
      await deleteAdminTransaction(key);
      await rebuildAdminStats();
      return null;
    }

    await writeAdminTransaction(key, normalizePremiumTransaction(txId, change.after.val() || {}));
    await rebuildAdminStats();
    return null;
  });

exports.mirrorPayMongoPaymentToAdminFeed = functions.database
  .ref("/paymongo_payments/{paymentId}")
  .onWrite(async (change, context) => {
    const {paymentId} = context.params;
    const key = `paymongo_${paymentId}`;

    if (!change.after.exists()) {
      await deleteAdminTransaction(key);
      await rebuildAdminStats();
      return null;
    }

    await writeAdminTransaction(
      key,
      normalizePayMongoPayment(paymentId, change.after.val() || {}, `paymongo_payments/${paymentId}`, "paymongo_payments")
    );
    await rebuildAdminStats();
    return null;
  });

exports.mirrorProcessedPayMongoPaymentToAdminFeed = functions.database
  .ref("/processed_paymongo_payments/{paymentId}")
  .onWrite(async (change, context) => {
    const {paymentId} = context.params;
    const key = `processed_paymongo_${paymentId}`;

    if (!change.after.exists()) {
      await deleteAdminTransaction(key);
      await rebuildAdminStats();
      return null;
    }

    await writeAdminTransaction(
      key,
      normalizePayMongoPayment(
        paymentId,
        change.after.val() || {},
        `processed_paymongo_payments/${paymentId}`,
        "processed_paymongo_payments"
      )
    );
    await rebuildAdminStats();
    return null;
  });

exports.rebuildAdminStatsOnSchedule = functions.pubsub
  .schedule("every 30 minutes")
  .onRun(rebuildAdminStats);

async function rebuildAdminStats() {
  const [usersSnap, deletionSnap, txSnap] = await Promise.all([
    db.ref("users").once("value"),
    db.ref("account_deletion_requests").once("value"),
    db.ref("admin_transactions").once("value"),
  ]);

  const users = usersSnap.val() || {};
  const deletionRequests = deletionSnap.val() || {};
  const transactions = txSnap.val() || {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let premiumUsers = 0;
  let pendingIdVerifications = 0;

  Object.values(users).forEach((user) => {
    if (!user || typeof user !== "object") return;
    if (user.isPremium === true) premiumUsers += 1;
    if ((user.isIDVerified || user.idVerificationStatus) === "pending" &&
      (user.idFrontUrl || user.idBackUrl || user.idFrontPath || user.idBackPath)) {
      pendingIdVerifications += 1;
    }
  });

  let totalPayments = 0;
  let totalRevenue = 0;
  let todayRevenue = 0;

  Object.values(transactions).forEach((tx) => {
    if (!tx || typeof tx !== "object") return;
    if (!String(tx.source || "").includes("paymongo")) return;

    totalPayments += 1;
    const amount = Number(tx.amount || 0);
    const pesoAmount = amount > 999 ? amount / 100 : amount;
    totalRevenue += pesoAmount;
    if (Number(tx.timestamp || 0) >= today.getTime()) todayRevenue += pesoAmount;
  });

  const pendingDeletionRequests = Object.values(deletionRequests)
    .filter((request) => request && request.status === "pending").length;

  await db.ref("admin_stats").set({
    totalUsers: Object.keys(users).length,
    premiumUsers,
    pendingIdVerifications,
    pendingDeletionRequests,
    totalPayments,
    totalRevenue,
    todayRevenue,
    updatedAt: admin.database.ServerValue.TIMESTAMP,
  });

  return null;
}
