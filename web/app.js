(() => {
  "use strict";

  const STORAGE_KEY = "cho-nho-pos-v1";
  const categories = ["Tất cả", "Đồ uống", "Thực phẩm", "Gia dụng", "Chăm sóc cá nhân"];
  const icons = {
    "Đồ uống": ["🥛", "☕", "🧃", "🍵"],
    "Thực phẩm": ["🍚", "🍜", "🍪", "🥫", "🍞"],
    "Gia dụng": ["🧻", "🧼", "🧽"],
    "Chăm sóc cá nhân": ["🪥", "🧴", "🧻"]
  };
  const defaults = [
    { name: "Sữa tươi ít đường", sku: "SUA-001", stock: 24, priceCents: 3200000, category: "Đồ uống", icon: "🥛" },
    { name: "Cà phê rang xay", sku: "CF-002", stock: 8, priceCents: 6800000, category: "Đồ uống", icon: "☕" },
    { name: "Gạo ST25 túi 5kg", sku: "GAO-003", stock: 15, priceCents: 14500000, category: "Thực phẩm", icon: "🍚" },
    { name: "Mì gói Hảo Hảo", sku: "MI-004", stock: 42, priceCents: 450000, category: "Thực phẩm", icon: "🍜" },
    { name: "Nước cam nguyên chất", sku: "NC-005", stock: 18, priceCents: 1200000, category: "Đồ uống", icon: "🧃" },
    { name: "Khăn giấy lụa", sku: "KG-006", stock: 6, priceCents: 550000, category: "Gia dụng", icon: "🧻" },
    { name: "Bánh quy bơ", sku: "BQ-007", stock: 21, priceCents: 850000, category: "Thực phẩm", icon: "🍪" },
    { name: "Nước rửa tay", sku: "NT-008", stock: 12, priceCents: 790000, category: "Chăm sóc cá nhân", icon: "🧴" },
    { name: "Trà xanh đóng chai", sku: "TR-009", stock: 30, priceCents: 1000000, category: "Đồ uống", icon: "🍵" }
  ];

  let state = loadState();
  let core;
  let activeCategory = "Tất cả";
  let search = "";
  let discountRate = 0;
  let toastTimer;
  let lastReceipt;

  const $ = (selector) => document.querySelector(selector);
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
  const money = (cents) => new Intl.NumberFormat("vi-VN", {
    style: "currency", currency: "VND", maximumFractionDigits: 0
  }).format(Math.round(cents / 100));
  const todayKey = () => new Date().toLocaleDateString("en-CA");
  const formatDate = (value, includeTime = false) => new Intl.DateTimeFormat("vi-VN", includeTime
    ? { dateStyle: "short", timeStyle: "short" }
    : { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && Array.isArray(saved.products) && Array.isArray(saved.invoices)) return saved;
    } catch (error) {
      console.warn("Không đọc được dữ liệu cửa hàng đã lưu:", error);
    }
    return {
      products: defaults.map((product) => ({ ...product })),
      invoices: [],
      nextInvoice: 1
    };
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function syncCore() {
    core._pos_reset();
    for (const product of state.products) {
      const name = core.stringToNewUTF8(product.name);
      const sku = core.stringToNewUTF8(product.sku);
      const id = core._pos_add_product(name, sku, product.stock, product.priceCents);
      core._free(name);
      core._free(sku);
      if (!id) throw new Error(`Không thể nạp sản phẩm ${product.sku} vào bộ xử lý POS.`);
      product.id = id;
    }
  }

  function productById(id) {
    return state.products.find((product) => product.id === id);
  }

  function cartItems() {
    const items = [];
    for (let index = 0; index < core._pos_cart_count(); index++) {
      const product = productById(core._pos_cart_product_id(index));
      if (product) items.push({ product, quantity: core._pos_cart_quantity(index) });
    }
    return items;
  }

  function totals() {
    const subtotal = core._pos_cart_subtotal_cents();
    const rate = Math.max(0, Math.min(100, Number($("#tax-rate").value) || 0));
    const discount = core._pos_cart_discount_cents(discountRate);
    const tax = core._pos_cart_tax_cents(Math.round(rate * 100), discountRate);
    return { subtotal, discount, tax, total: subtotal - discount + tax, rate };
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2300);
  }

  function renderCategories() {
    $("#category-chips").innerHTML = categories.map((category) =>
      `<button class="category-chip ${category === activeCategory ? "active" : ""}" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`
    ).join("");
  }

  function renderProducts() {
    const products = state.products.filter((product) => {
      const matchesCategory = activeCategory === "Tất cả" || product.category === activeCategory;
      const needle = search.trim().toLocaleLowerCase("vi");
      const matchesSearch = !needle || `${product.name} ${product.sku}`.toLocaleLowerCase("vi").includes(needle);
      return matchesCategory && matchesSearch;
    });
    $("#catalog-count").textContent = `${products.length} sản phẩm`;
    $("#nav-product-count").textContent = state.products.length;
    $("#product-grid").innerHTML = products.length ? products.map((product, index) => {
      const out = product.stock === 0;
      const low = product.stock > 0 && product.stock <= 8;
      return `<article class="product-card ${out ? "out-of-stock" : ""}" data-add-id="${product.id}">
        <div class="product-visual tone-${index % 6}">${escapeHtml(product.icon || "📦")}<span class="stock-badge ${low ? "low" : ""}">${out ? "Hết hàng" : `Còn ${product.stock}`}</span></div>
        <h3 title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</h3><div class="product-sku">${escapeHtml(product.sku)}</div>
        <div class="product-card-bottom"><span class="product-price">${money(product.priceCents)}</span><button class="add-product" aria-label="Thêm ${escapeHtml(product.name)}" ${out ? "disabled" : ""}>+</button></div>
      </article>`;
    }).join("") : `<div class="empty-products">Không tìm thấy sản phẩm phù hợp.</div>`;
  }

  function renderCart() {
    const items = cartItems();
    const amount = items.reduce((sum, item) => sum + item.quantity, 0);
    const { subtotal, discount, tax, total, rate } = totals();
    $("#cart-item-label").textContent = amount ? `${amount} sản phẩm trong đơn` : "Chưa có sản phẩm";
    $("#cart-items").innerHTML = items.length ? items.map(({ product, quantity }) => `
      <div class="cart-item"><div class="cart-item-icon">${escapeHtml(product.icon || "📦")}</div>
        <div class="cart-item-info"><b title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</b><small>${money(product.priceCents)}</small></div>
        <div class="quantity-control"><button data-qty-id="${product.id}" data-change="-1" aria-label="Giảm số lượng">−</button><span>${quantity}</span><button data-qty-id="${product.id}" data-change="1" aria-label="Tăng số lượng">+</button></div>
        <span class="cart-item-total">${money(product.priceCents * quantity)}</span>
      </div>`).join("") : `<div class="empty-cart"><span>▤</span><b>Đơn hàng đang trống</b><small>Chọn sản phẩm để bắt đầu thêm vào hóa đơn.</small></div>`;
    $(".discount-row").classList.toggle("discount-applied", discountRate > 0);
    $("#discount-button").textContent = discountRate ? `− ${discountRate}% · Sửa` : "＋ Thêm mã";
    $("#subtotal").textContent = money(subtotal);
    $("#tax-caption").textContent = `(${rate}%)`;
    $("#tax-amount").textContent = money(tax);
    $("#total").textContent = money(total);
    $("#checkout-total").textContent = money(total);
    $("#checkout-button").disabled = !items.length;
    $("#order-number").textContent = `#${String(state.nextInvoice).padStart(3, "0")}`;
  }

  function renderInventory() {
    const needle = $("#inventory-search").value.trim().toLocaleLowerCase("vi");
    const products = state.products.filter((product) => `${product.name} ${product.sku}`.toLocaleLowerCase("vi").includes(needle));
    const units = state.products.reduce((sum, product) => sum + product.stock, 0);
    const low = state.products.filter((product) => product.stock <= 8).length;
    $("#product-stats").innerHTML = `
      <div class="stat-card"><span>Tổng sản phẩm</span><strong>${state.products.length}</strong><small>Đang kinh doanh</small></div>
      <div class="stat-card"><span>Tổng số lượng tồn</span><strong>${units.toLocaleString("vi-VN")}</strong><small>Đơn vị sản phẩm</small></div>
      <div class="stat-card"><span>Cần nhập thêm</span><strong>${low}</strong><small>Sản phẩm có tồn kho thấp</small></div>`;
    $("#inventory-count").textContent = `${products.length} mặt hàng`;
    $("#inventory-body").innerHTML = products.length ? products.map((product) => {
      const status = product.stock === 0 ? "Hết hàng" : product.stock <= 8 ? "Sắp hết" : "Còn hàng";
      const statusClass = product.stock <= 8 ? "low" : "";
      return `<tr><td><div class="table-product"><span class="table-emoji">${escapeHtml(product.icon || "📦")}</span><span><b>${escapeHtml(product.name)}</b><small>${escapeHtml(product.category)}</small></span></div></td><td>${escapeHtml(product.sku)}</td><td><b>${money(product.priceCents)}</b></td><td>${product.stock}</td><td><span class="status-pill ${statusClass}">${status}</span></td><td><button class="row-actions" data-edit-id="${product.id}" aria-label="Sửa ${escapeHtml(product.name)}">···</button></td></tr>`;
    }).join("") : `<tr><td colspan="6" class="empty-table">Chưa có sản phẩm phù hợp.</td></tr>`;
  }

  function renderInvoices() {
    const needle = $("#invoice-search").value.trim().toLocaleLowerCase("vi");
    const invoices = [...state.invoices].reverse().filter((invoice) => invoice.code.toLocaleLowerCase("vi").includes(needle));
    const today = state.invoices.filter((invoice) => new Date(invoice.date).toLocaleDateString("en-CA") === todayKey());
    const sales = today.reduce((sum, invoice) => sum + invoice.total, 0);
    $("#invoice-stats").innerHTML = `
      <div class="stat-card"><span>Hóa đơn hôm nay</span><strong>${today.length}</strong><small>Giao dịch đã hoàn tất</small></div>
      <div class="stat-card"><span>Doanh thu hôm nay</span><strong>${money(sales)}</strong><small>Đã bao gồm thuế VAT</small></div>
      <div class="stat-card"><span>Giá trị trung bình</span><strong>${money(today.length ? Math.round(sales / today.length) : 0)}</strong><small>Trên mỗi hóa đơn</small></div>`;
    $("#invoice-count").textContent = `${invoices.length} giao dịch`;
    $("#invoice-body").innerHTML = invoices.length ? invoices.map((invoice) => `
      <tr><td><b>${escapeHtml(invoice.code)}</b></td><td>${formatDate(invoice.date, true)}</td><td>An Nguyễn</td><td>${invoice.items.length} mặt hàng</td><td><b>${money(invoice.total)}</b></td><td><span class="status-pill">Hoàn tất</span></td><td><button class="row-actions" data-receipt-id="${escapeHtml(invoice.code)}" aria-label="Xem hóa đơn">↗</button></td></tr>`
    ).join("") : `<tr><td colspan="7" class="empty-table">Chưa có hóa đơn nào. Hóa đơn sẽ xuất hiện sau khi thanh toán.</td></tr>`;
  }

  function renderDashboard() {
    const today = state.invoices.filter((invoice) => new Date(invoice.date).toLocaleDateString("en-CA") === todayKey());
    const sales = today.reduce((sum, invoice) => sum + invoice.total, 0);
    const itemsSold = today.reduce((sum, invoice) => sum + invoice.items.reduce((n, item) => n + item.quantity, 0), 0);
    const low = state.products.filter((product) => product.stock <= 8).sort((a, b) => a.stock - b.stock);
    $("#dashboard-stats").innerHTML = `
      <div class="stat-card"><span>Doanh thu hôm nay</span><strong>${money(sales)}</strong><small>Đã bao gồm thuế VAT</small></div>
      <div class="stat-card"><span>Đơn hàng hôm nay</span><strong>${today.length}</strong><small>Giao dịch thành công</small></div>
      <div class="stat-card"><span>Sản phẩm đã bán</span><strong>${itemsSold}</strong><small>Tổng số lượng trong ngày</small></div>
      <div class="stat-card"><span>Giá trị trung bình</span><strong>${money(today.length ? Math.round(sales / today.length) : 0)}</strong><small>Mỗi đơn hàng</small></div>`;
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      const key = date.toLocaleDateString("en-CA");
      const total = state.invoices.filter((invoice) => new Date(invoice.date).toLocaleDateString("en-CA") === key).reduce((sum, invoice) => sum + invoice.total, 0);
      return { label: new Intl.DateTimeFormat("vi-VN", { weekday: "short" }).format(date), total };
    });
    const max = Math.max(...days.map((day) => day.total), 1);
    $("#sales-chart").innerHTML = days.map((day, index) =>
      `<div class="chart-column"><div class="chart-bar ${index === 6 ? "current" : ""}" style="height:${Math.max(4, Math.round(day.total / max * 100))}%" title="${money(day.total)}"></div><span class="chart-day">${escapeHtml(day.label)}</span></div>`
    ).join("");
    $("#low-stock-list").innerHTML = low.length ? low.slice(0, 6).map((product) => `
      <div class="low-stock-row"><span class="table-emoji">${escapeHtml(product.icon || "📦")}</span><span class="low-stock-info"><b>${escapeHtml(product.name)}</b><small>${escapeHtml(product.sku)}</small></span><span class="low-stock-qty">${product.stock === 0 ? "Hết hàng" : `Còn ${product.stock}`}</span></div>`
    ).join("") : `<div class="empty-table">Tồn kho đang ở mức tốt.</div>`;
  }

  function renderAll() {
    renderCategories();
    renderProducts();
    renderCart();
    renderInventory();
    renderInvoices();
    renderDashboard();
  }

  function addToCart(id, change = 1) {
    const product = productById(id);
    if (!product || !core._pos_set_cart_quantity(id, change)) {
      showToast(product ? "Số lượng trong kho không đủ." : "Không tìm thấy sản phẩm.");
      return;
    }
    renderCart();
  }

  function openProductModal(product) {
    $("#product-form").reset();
    $("#product-error").textContent = "";
    $("#edit-product-id").value = product ? String(product.id) : "";
    $("#product-modal-title").textContent = product ? "Cập nhật sản phẩm" : "Thêm sản phẩm";
    if (product) {
      $("#product-name").value = product.name;
      $("#product-sku").value = product.sku;
      $("#product-price").value = String(product.priceCents / 100);
      $("#product-stock").value = String(product.stock);
    }
    $("#product-modal").hidden = false;
    $("#product-name").focus();
  }

  function submitProduct(event) {
    event.preventDefault();
    const name = $("#product-name").value.trim();
    const sku = $("#product-sku").value.trim().toUpperCase();
    const price = Number($("#product-price").value);
    const stock = Number($("#product-stock").value);
    if (!name || !sku || !Number.isSafeInteger(price) || price <= 0 ||
        !Number.isInteger(stock) || stock < 0 || stock > 1000000) {
      $("#product-error").textContent = "Vui lòng kiểm tra tên, mã SKU, giá bán và số lượng.";
      return;
    }
    const id = Number($("#edit-product-id").value);
    const product = id ? productById(id) : null;
    if (!product && state.products.some((item) => item.sku.toLocaleLowerCase("vi") === sku.toLocaleLowerCase("vi"))) {
      $("#product-error").textContent = "Mã SKU đã được sử dụng.";
      return;
    }
    const next = {
      ...(product || {}),
      name, sku, stock, priceCents: price * 100,
      category: product?.category || "Thực phẩm",
      icon: product?.icon || icons["Thực phẩm"][state.products.length % icons["Thực phẩm"].length]
    };
    if (next.priceCents > 100000000) {
      $("#product-error").textContent = "Giá bán tối đa là 1.000.000 ₫.";
      return;
    }
    if (product) {
      const cartIndex = Array.from({ length: core._pos_cart_count() }, (_, index) => index)
        .find((index) => core._pos_cart_product_id(index) === product.id);
      if (cartIndex !== undefined && core._pos_cart_quantity(cartIndex) > stock) {
        $("#product-error").textContent = "Tồn kho mới thấp hơn số lượng đang có trong đơn hàng.";
        return;
      }
      const namePtr = core.stringToNewUTF8(name);
      const skuPtr = core.stringToNewUTF8(sku);
      const ok = core._pos_update_product(product.id, namePtr, skuPtr, stock, next.priceCents);
      core._free(namePtr);
      core._free(skuPtr);
      if (!ok) {
        $("#product-error").textContent = "Không thể cập nhật. Hãy kiểm tra mã SKU.";
        return;
      }
      Object.assign(product, next);
    } else {
      const namePtr = core.stringToNewUTF8(name);
      const skuPtr = core.stringToNewUTF8(sku);
      const newId = core._pos_add_product(namePtr, skuPtr, stock, next.priceCents);
      core._free(namePtr);
      core._free(skuPtr);
      if (!newId) {
        $("#product-error").textContent = "Không thể thêm sản phẩm. Kiểm tra mã SKU và giới hạn danh mục.";
        return;
      }
      next.id = newId;
      state.products.push(next);
    }
    saveState();
    $("#product-modal").hidden = true;
    renderAll();
    showToast(product ? "Đã cập nhật sản phẩm." : "Đã thêm sản phẩm mới.");
  }

  function makeReceipt(invoice) {
    $("#receipt-content").innerHTML = `
      <h2 class="receipt-brand">CHỢ NHỎ MINI MARKET</h2><p class="receipt-sub">Cảm ơn bạn đã mua sắm tại cửa hàng!</p>
      <div class="receipt-meta"><span>${escapeHtml(invoice.code)}</span><span>${formatDate(invoice.date, true)}</span></div>
      <div class="receipt-lines">${invoice.items.map((item) => `<div class="receipt-line"><span>${escapeHtml(item.name)} × ${item.quantity}</span><b>${money(item.priceCents * item.quantity)}</b></div>`).join("")}</div>
      <div class="receipt-totals"><div class="receipt-total"><span>Tạm tính</span><b>${money(invoice.subtotal)}</b></div>
      ${invoice.discount ? `<div class="receipt-total"><span>Giảm giá (${invoice.discountRate}%)</span><b>−${money(invoice.discount)}</b></div>` : ""}
      <div class="receipt-total"><span>Thuế VAT (${invoice.taxRate}%)</span><b>${money(invoice.tax)}</b></div>
      <div class="receipt-total grand"><span>Tổng thanh toán</span><b>${money(invoice.total)}</b></div></div><p class="receipt-thanks">Hẹn gặp lại bạn lần sau ♡</p>`;
    $("#receipt-modal").hidden = false;
  }

  function checkout() {
    const items = cartItems();
    if (!items.length) return;
    const amount = totals();
    const invoice = {
      code: `HD-${String(state.nextInvoice).padStart(5, "0")}`,
      date: new Date().toISOString(),
      items: items.map(({ product, quantity }) => ({
        name: product.name, sku: product.sku, icon: product.icon,
        priceCents: product.priceCents, quantity
      })),
      subtotal: amount.subtotal, discount: amount.discount, discountRate,
      tax: amount.tax, taxRate: amount.rate, total: amount.total
    };
    if (!core._pos_checkout()) {
      showToast("Thanh toán không thành công: tồn kho đã thay đổi.");
      return;
    }
    items.forEach(({ product, quantity }) => { product.stock -= quantity; });
    state.invoices.push(invoice);
    state.nextInvoice++;
    saveState();
    discountRate = 0;
    renderAll();
    makeReceipt(invoice);
  }

  function openInvoice(code) {
    const invoice = state.invoices.find((item) => item.code === code);
    if (invoice) makeReceipt(invoice);
  }

  function setView(name) {
    document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${name}`));
    document.querySelectorAll(".nav-item[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === name));
    const labels = { pos: "Tạo hóa đơn", products: "Sản phẩm", invoices: "Hóa đơn", dashboard: "Báo cáo bán hàng" };
    $("#crumb-view").textContent = labels[name];
    renderAll();
  }

  document.addEventListener("click", (event) => {
    if (!core) return;
    const nav = event.target.closest("[data-view]");
    if (nav) { setView(nav.dataset.view); return; }
    const go = event.target.closest("[data-go]");
    if (go) { setView(go.dataset.go); return; }
    const category = event.target.closest("[data-category]");
    if (category) { activeCategory = category.dataset.category; renderCategories(); renderProducts(); return; }
    const card = event.target.closest("[data-add-id]");
    if (card && !card.classList.contains("out-of-stock")) { addToCart(Number(card.dataset.addId)); return; }
    const quantity = event.target.closest("[data-qty-id]");
    if (quantity) {
      const id = Number(quantity.dataset.qtyId);
      const index = Array.from({ length: core._pos_cart_count() }, (_, i) => i).find((i) => core._pos_cart_product_id(i) === id);
      if (index !== undefined) addToCart(id, core._pos_cart_quantity(index) + Number(quantity.dataset.change));
      return;
    }
    const edit = event.target.closest("[data-edit-id]");
    if (edit) { openProductModal(productById(Number(edit.dataset.editId))); return; }
    const receipt = event.target.closest("[data-receipt-id]");
    if (receipt) { openInvoice(receipt.dataset.receiptId); return; }
    const close = event.target.closest("[data-close]");
    if (close) { $(`#${close.dataset.close}`).hidden = true; return; }
  });

  $("#product-search").addEventListener("input", (event) => { search = event.target.value; renderProducts(); });
  $("#inventory-search").addEventListener("input", renderInventory);
  $("#invoice-search").addEventListener("input", renderInvoices);
  $("#add-product-button").addEventListener("click", () => openProductModal());
  $("#product-form").addEventListener("submit", submitProduct);
  $("#clear-cart").addEventListener("click", () => { core._pos_clear_cart(); renderAll(); });
  $("#reset-sale").addEventListener("click", () => { core._pos_clear_cart(); discountRate = 0; renderAll(); });
  $("#checkout-button").addEventListener("click", checkout);
  $("#tax-rate").addEventListener("input", renderCart);
  $("#discount-button").addEventListener("click", () => {
    $("#discount-rate").value = discountRate;
    $("#discount-modal").hidden = false;
  });
  $("#discount-form").addEventListener("submit", (event) => {
    event.preventDefault();
    discountRate = Math.max(0, Math.min(100, Number($("#discount-rate").value) || 0));
    $("#discount-modal").hidden = true;
    renderCart();
  });
  $("#print-receipt").addEventListener("click", () => window.print());
  $("#current-date").textContent = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "long", year: "numeric" }).format(new Date());
  $("#shift-label").textContent = `${new Intl.DateTimeFormat("vi-VN", { weekday: "long" }).format(new Date()).toLocaleUpperCase("vi")} · CA SÁNG`;
  $("#choose-customer").addEventListener("click", () => showToast("Đang sử dụng hồ sơ khách lẻ."));
  $("#category-filter").addEventListener("click", () => showToast("Chọn nhóm hàng bên dưới để lọc sản phẩm."));

  window.addEventListener("storage", (event) => {
    if (core && event.key === STORAGE_KEY && event.newValue) {
      state = loadState();
      syncCore();
      renderAll();
      showToast("Dữ liệu cửa hàng đã được đồng bộ.");
    }
  });

  window.addEventListener("error", (event) => {
    console.error("POS gặp lỗi:", event.error || event.message);
    showToast("Ứng dụng gặp lỗi. Hãy tải lại trang và thử lại.");
  });

  async function start() {
    try {
      if (typeof createPosModule !== "function") throw new Error("Chưa tải được bộ xử lý C/WASM.");
      core = await createPosModule();
      syncCore();
      renderAll();
    } catch (error) {
      console.error("Không khởi động được POS:", error);
      document.querySelector(".main-area").innerHTML = `<div style="max-width:600px;margin:12vh auto;padding:24px;color:#344338;font:14px 'DM Sans',sans-serif"><h1>Chưa tải được bộ xử lý POS</h1><p>Hãy kiểm tra tệp <code>pos.js</code> và <code>pos.wasm</code> trong thư mục triển khai. Nếu bạn vừa tải trang lần đầu, hãy thử làm mới sau khi GitHub Actions hoàn tất.</p></div>`;
    }
  }

  start();
})();
