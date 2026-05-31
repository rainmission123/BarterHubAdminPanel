window.selectedRange = 7;

function initCandleRangeButtons() {
  const buttons = document.querySelectorAll(".range-btn");
  if (!buttons.length) return;

  const savedRange = localStorage.getItem("paymongoCandleRange") || "7";
  window.selectedRange = Number(savedRange);

  buttons.forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.days === savedRange
    );

    button.addEventListener("click", () => {
      const days = button.dataset.days || "7";

      localStorage.setItem("paymongoCandleRange", days);
      window.selectedRange = Number(days);

      buttons.forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");

      renderRevenueCandleChart();
    });
  });
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

  ctx.strokeStyle = "#22d3ee";
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
    ctx.strokeStyle = "#67e8f9";
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
      color: "#22d3ee",
    },
    {
      label: "Pending",
      value: users.filter((user) => getIdStatus(user) === "pending").length,
      color: "#facc15",
    },
    {
      label: "Rejected",
      value: users.filter((user) => getIdStatus(user) === "rejected").length,
      color: "#fb7185",
    },
    {
      label: "Deleted",
      value: users.filter((user) => user.accountStatus === "deleted").length,
      color: "#64748b",
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

  const candles = buildRevenueCandles(window.selectedRange || 7);
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
    const color = item.total > 0 ? "#22d3ee" : "#334155";
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

