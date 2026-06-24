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
  idImageUrls: {},
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

