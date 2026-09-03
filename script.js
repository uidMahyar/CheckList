(function(){
  "use strict";

  var STORAGE_KEY = "checklist-app-data-v1";
  var CATEGORY_COLORS = ["#007ACC", "#4EC9B0", "#CE9178", "#C586C0", "#DCDCAA", "#F14C4C"];

  // ---------- state ----------
  var state = load() || { categories: [] };

  function load(){
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch(e){ return null; }
  }

  function save(){
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch(e){ /* storage full or unavailable, ignore */ }
  }

  function uid(){
    return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2,8);
  }

  // ---------- data model ----------
  // category: { id, name, color, collapsed, items: [item] }
  // item (recursive): { id, text, done, subOpen, children: [item] }

  function makeItem(text){
    return { id: uid(), text: text, done: false, subOpen: false, children: [] };
  }

  function makeCategory(name, color){
    return { id: uid(), name: name, color: color, collapsed: false, items: [] };
  }

  function findCategory(catId){
    for (var i=0;i<state.categories.length;i++){
      if (state.categories[i].id === catId) return state.categories[i];
    }
    return null;
  }

  // recursively find item + its parent array, anywhere under a category
  function findItem(items, itemId){
    for (var i=0;i<items.length;i++){
      if (items[i].id === itemId) return { item: items[i], list: items, index: i };
      var found = findItem(items[i].children, itemId);
      if (found) return found;
    }
    return null;
  }

  // ---------- counting (for progress + meta) ----------
  function countAll(items){
    var total = 0, done = 0;
    for (var i=0;i<items.length;i++){
      total++;
      if (items[i].done) done++;
      var sub = countAll(items[i].children);
      total += sub.total;
      done += sub.done;
    }
    return { total: total, done: done };
  }

  function countGlobal(){
    var total = 0, done = 0;
    state.categories.forEach(function(cat){
      var c = countAll(cat.items);
      total += c.total; done += c.done;
    });
    return { total: total, done: done };
  }

  // ---------- rendering ----------
  var root = document.getElementById('categoriesRoot');
  var emptyState = document.getElementById('emptyState');

  function el(tag, cls, html){
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  var CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  var TRASH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';
  var EDIT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  var CHEVRON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';

  function renderAll(){
    root.innerHTML = '';
    emptyState.style.display = state.categories.length === 0 ? 'block' : 'none';

    state.categories.forEach(function(cat){
      root.appendChild(renderCategory(cat));
    });

    updateProgress();
  }

  function updateProgress(){
    var g = countGlobal();
    var pct = g.total === 0 ? 0 : Math.round((g.done / g.total) * 100);
    document.getElementById('progressFill').style.width = pct + '%';
    document.getElementById('progressText').textContent =
      toFa(g.done) + ' از ' + toFa(g.total) + ' انجام شد';
  }

  var FA_DIGITS = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
  function toFa(n){
    return String(n).replace(/[0-9]/g, function(d){ return FA_DIGITS[+d]; });
  }

  function renderCategory(cat){
    var wrap = el('div', 'category' + (cat.collapsed ? ' collapsed' : ''));
    wrap.style.setProperty('--cat-color', cat.color);
    wrap.dataset.id = cat.id;

    var head = el('div', 'category-head');

    var chevron = el('div', 'category-collapse-icon', CHEVRON_SVG);
    head.appendChild(chevron);

    var titleWrap = el('div', 'category-title-wrap');
    var nameEl = el('div', 'category-name', escapeHtml(cat.name));
    var c = countAll(cat.items);
    var metaEl = el('div', 'category-meta', toFa(c.done) + ' / ' + toFa(c.total));
    titleWrap.appendChild(nameEl);
    titleWrap.appendChild(metaEl);
    head.appendChild(titleWrap);

    var actions = el('div', 'category-actions');
    var editBtn = el('button', 'icon-btn', EDIT_SVG);
    editBtn.title = 'تغییر نام دسته';
    editBtn.onclick = function(e){ e.stopPropagation(); renameCategory(cat.id); };
    var delBtn = el('button', 'icon-btn danger', TRASH_SVG);
    delBtn.title = 'حذف دسته';
    delBtn.onclick = function(e){ e.stopPropagation(); deleteCategory(cat.id); };
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    head.appendChild(actions);

    head.onclick = function(){
      cat.collapsed = !cat.collapsed;
      save();
      renderAll();
    };

    wrap.appendChild(head);

    var body = el('div', 'category-body');

    var itemsList = el('div', 'items-list');
    cat.items.forEach(function(item){
      itemsList.appendChild(renderItem(item, cat.id, 0));
    });
    body.appendChild(itemsList);

    var addRow = el('div', 'add-item-row');
    var input = el('input');
    input.type = 'text';
    input.placeholder = 'مورد جدید...';
    var addBtn = el('button', 'mini-add-btn', 'افزودن');
    function submitAdd(){
      var val = input.value.trim();
      if (!val) return;
      cat.items.push(makeItem(val));
      save();
      input.value = '';
      renderAll();
      focusLastInput(cat.id);
    }
    addBtn.onclick = submitAdd;
    input.addEventListener('keydown', function(e){
      if (e.key === 'Enter') submitAdd();
    });
    addRow.appendChild(input);
    addRow.appendChild(addBtn);
    body.appendChild(addRow);

    wrap.appendChild(body);
    return wrap;
  }

  function renderItem(item, catId, depth){
    var wrap = el('div', 'item' + (item.done ? ' done' : ''));
    wrap.dataset.id = item.id;

    var row = el('div', 'item-row');

    var cb = el('div', 'checkbox' + (item.done ? ' checked' : ''), CHECK_SVG);
    cb.onclick = function(){ toggleDone(item.id); };
    row.appendChild(cb);

    var mainWrap = el('div', 'item-main');
    var textEl = el('div', 'item-text', escapeHtml(item.text));
    textEl.onclick = function(){ editItemText(catId, item.id); };
    mainWrap.appendChild(textEl);

    var subCount = countAll(item.children);
    var toggleSub = el('div', 'item-toggle-sub' + (item.subOpen ? ' open' : ''));
    var caretSpan = el('span', 'caret', '›');
    var labelText = subCount.total > 0
      ? ('زیربخش‌ها (' + toFa(subCount.done) + '/' + toFa(subCount.total) + ')')
      : 'افزودن زیربخش';
    toggleSub.appendChild(caretSpan);
    toggleSub.appendChild(document.createTextNode(' ' + labelText));
    toggleSub.onclick = function(){
      item.subOpen = !item.subOpen;
      save();
      renderAll();
    };
    mainWrap.appendChild(toggleSub);

    row.appendChild(mainWrap);

    var itemActions = el('div', 'item-actions');
    var delBtn = el('button', 'icon-btn danger', TRASH_SVG);
    delBtn.onclick = function(){ deleteItem(catId, item.id); };
    itemActions.appendChild(delBtn);
    row.appendChild(itemActions);

    wrap.appendChild(row);

    if (item.subOpen){
      var subList = el('div', 'subitem-list open');
      item.children.forEach(function(child){
        subList.appendChild(renderItem(child, catId, depth+1));
      });

      var addSubRow = el('div', 'add-item-row');
      var subInput = el('input');
      subInput.type = 'text';
      subInput.placeholder = 'زیربخش جدید...';
      var subAddBtn = el('button', 'mini-add-btn', 'افزودن');
      function submitSubAdd(){
        var val = subInput.value.trim();
        if (!val) return;
        item.children.push(makeItem(val));
        save();
        renderAll();
      }
      subAddBtn.onclick = submitSubAdd;
      subInput.addEventListener('keydown', function(e){
        if (e.key === 'Enter') submitSubAdd();
      });
      addSubRow.appendChild(subInput);
      addSubRow.appendChild(subAddBtn);
      subList.appendChild(addSubRow);

      wrap.appendChild(subList);
    }

    return wrap;
  }

  function escapeHtml(str){
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function focusLastInput(catId){
    // no-op placeholder for potential future focus management
  }

  // ---------- actions ----------
  function toggleDone(itemId){
    for (var i=0;i<state.categories.length;i++){
      var found = findItem(state.categories[i].items, itemId);
      if (found){
        found.item.done = !found.item.done;
        save();
        renderAll();
        return;
      }
    }
  }

  function deleteItem(catId, itemId){
    var cat = findCategory(catId);
    if (!cat) return;
    var found = findItem(cat.items, itemId);
    if (found){
      found.list.splice(found.index, 1);
      save();
      renderAll();
    }
  }

  function editItemText(catId, itemId){
    var cat = findCategory(catId);
    if (!cat) return;
    var found = findItem(cat.items, itemId);
    if (!found) return;
    var next = prompt('ویرایش متن:', found.item.text);
    if (next === null) return;
    next = next.trim();
    if (!next) return;
    found.item.text = next;
    save();
    renderAll();
  }

  function renameCategory(catId){
    var cat = findCategory(catId);
    if (!cat) return;
    var next = prompt('نام جدید دسته:', cat.name);
    if (next === null) return;
    next = next.trim();
    if (!next) return;
    cat.name = next;
    save();
    renderAll();
  }

  function deleteCategory(catId){
    var cat = findCategory(catId);
    if (!cat) return;
    showConfirm(
      'حذف دستهٔ «' + cat.name + '»',
      'همهٔ موارد و زیربخش‌های داخل این دسته هم حذف می‌شن. این کار قابل بازگشت نیست.',
      function(){
        state.categories = state.categories.filter(function(c){ return c.id !== catId; });
        save();
        renderAll();
        showToast('دسته حذف شد');
      }
    );
  }

  function addCategory(){
    var name = prompt('نام دستهٔ جدید:', '');
    if (name === null) return;
    name = name.trim();
    if (!name) return;
    var color = CATEGORY_COLORS[state.categories.length % CATEGORY_COLORS.length];
    state.categories.push(makeCategory(name, color));
    save();
    renderAll();
  }

  // ---------- reset ----------
  function resetAll(){
    showConfirm(
      'ریست کامل چک‌لیست',
      'همهٔ دسته‌ها، موارد و زیربخش‌ها برای همیشه پاک می‌شن. پیشنهاد می‌کنم قبلش با دکمهٔ «دانلود» یه نسخهٔ پشتیبان بگیری.',
      function(){
        state = { categories: [] };
        save();
        renderAll();
        showToast('همه‌چیز ریست شد');
      }
    );
  }

  // ---------- export to PDF (via print) ----------
  function exportPdf(){
    var g = countGlobal();
    if (state.categories.length === 0){
      showToast('چیزی برای دانلود وجود نداره');
      return;
    }

    var now = new Date();
    var faDate = '';
    try {
      faDate = new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' }).format(now);
    } catch(e){ faDate = ''; }

    var pct = g.total === 0 ? 0 : Math.round((g.done / g.total) * 100);

    var html = buildPrintDocument(faDate, g, pct);

    var printFrame = document.getElementById('pdfPrintFrame');
    if (printFrame) printFrame.remove();

    printFrame = document.createElement('iframe');
    printFrame.id = 'pdfPrintFrame';
    printFrame.style.position = 'fixed';
    printFrame.style.right = '-10000px';
    printFrame.style.bottom = '-10000px';
    printFrame.style.width = '1px';
    printFrame.style.height = '1px';
    printFrame.style.border = 'none';
    document.body.appendChild(printFrame);

    var doc = printFrame.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    var triggered = false;
    function triggerPrint(){
      if (triggered) return;
      triggered = true;
      try {
        printFrame.contentWindow.focus();
        printFrame.contentWindow.print();
      } catch(e){
        showToast('چاپ با خطا مواجه شد');
      }
      setTimeout(function(){
        var f = document.getElementById('pdfPrintFrame');
        if (f) f.remove();
      }, 1500);
    }

    printFrame.onload = function(){ setTimeout(triggerPrint, 200); };
    setTimeout(triggerPrint, 700);

    showToast('پنجرهٔ چاپ باز شد — «ذخیره به‌صورت PDF» رو انتخاب کن');
  }

  function buildPrintCategory(cat){
    var c = countAll(cat.items);
    var pct = c.total === 0 ? 0 : Math.round((c.done / c.total) * 100);
    var itemsHtml = cat.items.map(function(item){ return buildPrintItem(item, 0); }).join('');
    return '' +
      '<section class="pcat">' +
        '<div class="pcat-head">' +
          '<span class="pcat-dot" style="background:' + escapeHtml(cat.color) + '"></span>' +
          '<h2>' + escapeHtml(cat.name) + '</h2>' +
          '<span class="pcat-count">' + toFa(c.done) + ' / ' + toFa(c.total) + '</span>' +
        '</div>' +
        '<div class="pcat-items">' + itemsHtml + '</div>' +
      '</section>';
  }

  function buildPrintItem(item, depth){
    var childrenHtml = item.children.map(function(child){ return buildPrintItem(child, depth+1); }).join('');
    var doneClass = item.done ? ' pitem-done' : '';
    var box = item.done ? '&#10003;' : '';
    return '' +
      '<div class="pitem depth-' + depth + doneClass + '">' +
        '<span class="pbox' + (item.done ? ' pbox-checked' : '') + '">' + box + '</span>' +
        '<span class="ptext">' + escapeHtml(item.text) + '</span>' +
      '</div>' +
      (childrenHtml ? '<div class="pchildren">' + childrenHtml + '</div>' : '');
  }

  function buildPrintDocument(faDate, g, pct){
    var bodyHtml = state.categories.map(buildPrintCategory).join('');
    return '<!DOCTYPE html>' +
'<html lang="fa" dir="rtl"><head><meta charset="UTF-8">' +
'<title>چک‌لیست</title>' +
'<link rel="preconnect" href="https://fonts.googleapis.com">' +
'<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
'<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&family=Cascadia+Code:wght@400;600&display=swap" rel="stylesheet">' +
'<style>' + PRINT_CSS + '</style>' +
'</head><body>' +
'<div class="ppage">' +
  '<header class="phead">' +
    '<div class="phead-top">' +
      '<div class="phead-title"><span class="phead-dot"></span><h1>فهرست</h1></div>' +
      '<span class="phead-date">' + escapeHtml(faDate) + '</span>' +
    '</div>' +
    '<div class="phead-bar">' +
      '<div class="phead-track"><div class="phead-fill" style="width:' + pct + '%"></div></div>' +
      '<span class="phead-stat">' + toFa(g.done) + ' از ' + toFa(g.total) + ' مورد انجام شد &middot; ' + toFa(pct) + '&#37;</span>' +
    '</div>' +
  '</header>' +
  '<main class="pmain">' + bodyHtml + '</main>' +
  '<footer class="pfoot">تولید شده با فهرست</footer>' +
'</div>' +
'</body></html>';
  }

  var PRINT_CSS = '' +
    '@page { size: A4; margin: 16mm 14mm; }' +
    '* { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }' +
    'body { font-family: "Vazirmatn", "Segoe UI", Tahoma, sans-serif; background: #1E1E1E; color: #D4D4D4; }' +
    '.ppage { max-width: 100%; }' +
    '.phead { border-bottom: 2px solid #3C3C3C; padding-bottom: 14px; margin-bottom: 22px; }' +
    '.phead-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }' +
    '.phead-title { display: flex; align-items: center; gap: 8px; }' +
    '.phead-dot { width: 9px; height: 9px; border-radius: 50%; background: #4EC9B0; }' +
    '.phead-title h1 { font-size: 26px; font-weight: 700; color: #FFFFFF; }' +
    '.phead-date { font-family: "Cascadia Code", Consolas, monospace; font-size: 11px; color: #969696; }' +
    '.phead-bar { display: flex; align-items: center; gap: 10px; }' +
    '.phead-track { flex: 1; height: 6px; background: #2D2D30; border: 1px solid #3C3C3C; border-radius: 3px; overflow: hidden; }' +
    '.phead-fill { height: 100%; background: linear-gradient(90deg, #007ACC, #4EC9B0); }' +
    '.phead-stat { font-family: "Cascadia Code", Consolas, monospace; font-size: 10.5px; color: #969696; white-space: nowrap; }' +
    '.pmain { display: flex; flex-direction: column; gap: 14px; }' +
    '.pcat { background: #252526; border: 1px solid #3C3C3C; border-radius: 5px; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }' +
    '.pcat-head { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid #3C3C3C; background: #2D2D30; }' +
    '.pcat-dot { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }' +
    '.pcat-head h2 { flex: 1; font-size: 14.5px; font-weight: 600; color: #FFFFFF; }' +
    '.pcat-count { font-family: "Cascadia Code", Consolas, monospace; font-size: 10.5px; color: #6A6A6A; }' +
    '.pcat-items { padding: 10px 14px 12px; }' +
    '.pitem { display: flex; align-items: flex-start; gap: 8px; padding: 4px 0; break-inside: avoid; page-break-inside: avoid; }' +
    '.pbox { width: 13px; height: 13px; border: 1.3px solid #6A6A6A; border-radius: 3px; flex-shrink: 0; margin-top: 2px; display: flex; align-items: center; justify-content: center; font-size: 10px; line-height: 1; color: #1E1E1E; }' +
    '.pbox-checked { background: #4EC9B0; border-color: #4EC9B0; }' +
    '.ptext { font-size: 12px; line-height: 1.55; color: #D4D4D4; }' +
    '.pitem-done .ptext { color: #6A6A6A; text-decoration: line-through; }' +
    '.pchildren { margin-right: 21px; padding-right: 10px; border-right: 1.3px dotted #3C3C3C; }' +
    '.depth-1 .ptext, .depth-2 .ptext, .depth-3 .ptext, .depth-4 .ptext, .depth-5 .ptext { font-size: 11px; }' +
    '.depth-1 .pbox, .depth-2 .pbox, .depth-3 .pbox, .depth-4 .pbox, .depth-5 .pbox { width: 11px; height: 11px; }' +
    '.pfoot { margin-top: 22px; text-align: center; font-family: "Cascadia Code", Consolas, monospace; font-size: 9.5px; color: #4A4A4A; }' +
    '@media print { body { background: #1E1E1E; } .pcat { box-shadow: none; } }';

  // ---------- modal ----------
  var modalOverlay = document.getElementById('modalOverlay');
  var modalTitle = document.getElementById('modalTitle');
  var modalBody = document.getElementById('modalBody');
  var modalConfirm = document.getElementById('modalConfirm');
  var modalCancel = document.getElementById('modalCancel');
  var pendingConfirmAction = null;

  function showConfirm(title, body, onConfirm){
    modalTitle.textContent = title;
    modalBody.textContent = body;
    pendingConfirmAction = onConfirm;
    modalOverlay.classList.add('open');
  }

  function hideConfirm(){
    modalOverlay.classList.remove('open');
    pendingConfirmAction = null;
  }

  modalConfirm.onclick = function(){
    var action = pendingConfirmAction;
    hideConfirm();
    if (action) action();
  };
  modalCancel.onclick = hideConfirm;
  modalOverlay.onclick = function(e){
    if (e.target === modalOverlay) hideConfirm();
  };

  // ---------- toast ----------
  var toastEl = document.getElementById('toast');
  var toastTimer = null;
  function showToast(msg){
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){
      toastEl.classList.remove('show');
    }, 2200);
  }

  // ---------- date stamp ----------
  function setDateStamp(){
    try {
      var f = new Intl.DateTimeFormat('fa-IR', { day: 'numeric', month: 'long' });
      document.getElementById('dateStamp').textContent = f.format(new Date());
    } catch(e){
      document.getElementById('dateStamp').textContent = '';
    }
  }

  // ---------- wire up static buttons ----------
  document.getElementById('addCategoryBtn').onclick = addCategory;
  document.getElementById('resetBtn').onclick = resetAll;
  document.getElementById('exportBtn').onclick = exportPdf;

  // ---------- init ----------
  setDateStamp();
  renderAll();

})();
