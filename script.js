(function(){
  "use strict";

  var STORAGE_KEY = "checklist-app-data-v1";
  var CATEGORY_COLORS = ["#007ACC", "#4EC9B0", "#CE9178", "#C586C0", "#DCDCAA", "#F14C4C"];
  var QR_MAX_CHARS = 1400; // safe margin under the ~1476-char measured limit at EC level L

  // ---------- state ----------
  var state = load() || { categories: [], archive: [] };
  if (!Array.isArray(state.archive)) state.archive = [];

  function load(){
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.categories)) return null;
      return parsed;
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
  // archive entry: { id, name, color, items, archivedAt (ISO string) }

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

  var FA_DIGITS = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
  function toFa(n){
    return String(n).replace(/[0-9]/g, function(d){ return FA_DIGITS[+d]; });
  }

  function escapeHtml(str){
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function el(tag, cls, html){
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  // ---------- icons ----------
  var CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  var TRASH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';
  var EDIT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  var CHEVRON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
  var DRAG_SVG = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>';
  var ARCHIVE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9"/><path d="M10 13h4"/></svg>';
  var RESTORE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>';
  var MIC_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><path d="M12 18v4"/><path d="M8 22h8"/></svg>';

  // ---------- rendering ----------
  var root = document.getElementById('categoriesRoot');
  var emptyState = document.getElementById('emptyState');
  var noResultsState = document.getElementById('noResultsState');
  var addCategoryInlineWrap = document.getElementById('addCategoryInlineWrap');

  var currentSearchTerm = '';

  function renderAll(){
    root.innerHTML = '';

    var hasCategories = state.categories.length > 0;
    var term = currentSearchTerm.trim();

    if (!hasCategories){
      emptyState.style.display = 'block';
      noResultsState.style.display = 'none';
      addCategoryInlineWrap.style.display = 'block';
    } else if (term){
      var anyVisible = false;
      state.categories.forEach(function(cat){
        var rendered = renderCategory(cat, term);
        if (rendered){
          root.appendChild(rendered);
          anyVisible = true;
        }
      });
      emptyState.style.display = 'none';
      noResultsState.style.display = anyVisible ? 'none' : 'block';
      addCategoryInlineWrap.style.display = 'none';
    } else {
      state.categories.forEach(function(cat){
        root.appendChild(renderCategory(cat, ''));
      });
      emptyState.style.display = 'none';
      noResultsState.style.display = 'none';
      addCategoryInlineWrap.style.display = 'block';
    }

    updateProgress();
    updateArchiveLink();
  }

  function updateProgress(){
    var g = countGlobal();
    var pct = g.total === 0 ? 0 : Math.round((g.done / g.total) * 100);
    document.getElementById('progressFill').style.width = pct + '%';
    document.getElementById('progressText').textContent =
      toFa(g.done) + ' از ' + toFa(g.total) + ' انجام شد';
  }

  function updateArchiveLink(){
    var row = document.getElementById('archiveLinkRow');
    var label = document.getElementById('archiveLinkLabel');
    if (state.archive.length > 0){
      row.style.display = 'flex';
      label.textContent = 'آرشیو (' + toFa(state.archive.length) + ')';
    } else {
      row.style.display = 'none';
    }
  }

  // ---------- search matching ----------
  // Returns true if this item or any descendant matches the term.
  function itemMatchesSearch(item, term){
    if (item.text.toLowerCase().indexOf(term) !== -1) return true;
    for (var i=0;i<item.children.length;i++){
      if (itemMatchesSearch(item.children[i], term)) return true;
    }
    return false;
  }

  function highlightText(text, term){
    if (!term) return escapeHtml(text);
    var lower = text.toLowerCase();
    var idx = lower.indexOf(term);
    if (idx === -1) return escapeHtml(text);
    var before = text.slice(0, idx);
    var match = text.slice(idx, idx + term.length);
    var after = text.slice(idx + term.length);
    return escapeHtml(before) + '<mark class="search-match-hit">' + escapeHtml(match) + '</mark>' + escapeHtml(after);
  }

  function renderCategory(cat, searchTerm){
    var term = searchTerm ? searchTerm.toLowerCase() : '';
    var visibleItems = cat.items;
    var catNameMatches = false;

    if (term){
      catNameMatches = cat.name.toLowerCase().indexOf(term) !== -1;
      visibleItems = cat.items.filter(function(it){ return itemMatchesSearch(it, term); });
      if (!catNameMatches && visibleItems.length === 0) return null;
      // when searching, force-open so results are visible
    }

    var forceOpen = !!term;
    var wrap = el('div', 'category' + ((cat.collapsed && !forceOpen) ? ' collapsed' : ''));
    wrap.style.setProperty('--cat-color', cat.color);
    wrap.dataset.id = cat.id;
    wrap.draggable = !term;

    if (!term){
      wrap.addEventListener('dragstart', function(e){ onCategoryDragStart(e, cat.id); });
      wrap.addEventListener('dragover', function(e){ onCategoryDragOver(e, wrap); });
      wrap.addEventListener('dragleave', function(){ wrap.classList.remove('drag-over-top'); });
      wrap.addEventListener('drop', function(e){ onCategoryDrop(e, cat.id, wrap); });
      wrap.addEventListener('dragend', function(){ clearDragState(); });
    }

    var head = el('div', 'category-head');

    if (!term){
      var dragHandle = el('div', 'drag-handle', DRAG_SVG);
      dragHandle.title = 'جابه‌جایی دسته';
      dragHandle.onclick = function(e){ e.stopPropagation(); };
      attachTouchDragHandle(dragHandle, 'category', cat.id, state.categories);
      head.appendChild(dragHandle);
    }

    var chevron = el('div', 'category-collapse-icon', CHEVRON_SVG);
    head.appendChild(chevron);

    var titleWrap = el('div', 'category-title-wrap');
    var nameEl = el('div', 'category-name', term ? highlightText(cat.name, term) : escapeHtml(cat.name));
    var c = countAll(cat.items);
    var metaEl = el('div', 'category-meta', toFa(c.done) + ' / ' + toFa(c.total));
    titleWrap.appendChild(nameEl);
    titleWrap.appendChild(metaEl);
    head.appendChild(titleWrap);

    var actions = el('div', 'category-actions');
    var editBtn = el('button', 'icon-btn', EDIT_SVG);
    editBtn.title = 'تغییر نام دسته';
    editBtn.onclick = function(e){ e.stopPropagation(); renameCategory(cat.id); };
    var archiveBtn = el('button', 'icon-btn', ARCHIVE_SVG);
    archiveBtn.title = 'انتقال به آرشیو';
    archiveBtn.onclick = function(e){ e.stopPropagation(); archiveCategory(cat.id); };
    var delBtn = el('button', 'icon-btn danger', TRASH_SVG);
    delBtn.title = 'حذف دسته';
    delBtn.onclick = function(e){ e.stopPropagation(); deleteCategory(cat.id); };
    actions.appendChild(editBtn);
    actions.appendChild(archiveBtn);
    actions.appendChild(delBtn);
    head.appendChild(actions);

    head.onclick = function(){
      if (term) return; // don't collapse while searching
      cat.collapsed = !cat.collapsed;
      save();
      renderAll();
    };

    wrap.appendChild(head);

    var body = el('div', 'category-body');

    var itemsList = el('div', 'items-list');
    visibleItems.forEach(function(item, idx){
      itemsList.appendChild(renderItem(item, cat.id, 0, term, cat.items));
    });
    body.appendChild(itemsList);

    if (!term){
      var addRow = buildAddRow(function(text){
        cat.items.push(makeItem(text));
        save();
        renderAll();
      }, 'مورد جدید...');
      body.appendChild(addRow);
    }

    wrap.appendChild(body);
    return wrap;
  }

  // Builds a text-input + add-button row, with a mic button for voice input.
  // onSubmit(text) is called with the trimmed, non-empty value.
  function buildAddRow(onSubmit, placeholder){
    var addRow = el('div', 'add-item-row');
    var input = el('input');
    input.type = 'text';
    input.placeholder = placeholder;

    function submit(){
      var val = input.value.trim();
      if (!val) return;
      input.value = '';
      onSubmit(val);
    }

    if (isSpeechSupported()){
      var micBtn = el('button', 'mic-btn', MIC_SVG);
      micBtn.type = 'button';
      micBtn.title = 'افزودن با صدا';
      micBtn.onclick = function(){
        startVoiceCapture(micBtn, function(transcript){
          input.value = transcript;
          input.focus();
        });
      };
      addRow.appendChild(micBtn);
    }

    var addBtn = el('button', 'mini-add-btn', 'افزودن');
    addBtn.onclick = submit;
    input.addEventListener('keydown', function(e){
      if (e.key === 'Enter') submit();
    });

    addRow.appendChild(input);
    addRow.appendChild(addBtn);
    return addRow;
  }

  function renderItem(item, catId, depth, searchTerm, siblingList){
    var term = searchTerm || '';
    var visibleChildren = item.children;
    if (term){
      visibleChildren = item.children.filter(function(c){ return itemMatchesSearch(c, term); });
    }

    var outer = el('div', 'item' + (item.done ? ' done' : ''));
    outer.dataset.id = item.id;
    outer.draggable = !term;

    if (!term){
      outer.addEventListener('dragstart', function(e){ e.stopPropagation(); onItemDragStart(e, item.id, siblingList); });
      outer.addEventListener('dragover', function(e){ e.stopPropagation(); onItemDragOver(e, outer); });
      outer.addEventListener('dragleave', function(e){ e.stopPropagation(); outer.classList.remove('drag-over-top'); });
      outer.addEventListener('drop', function(e){ e.stopPropagation(); onItemDrop(e, item.id, siblingList, outer); });
      outer.addEventListener('dragend', function(e){ e.stopPropagation(); clearDragState(); });
    }

    var swipeWrap = el('div', 'swipe-wrap');
    var deleteBg = el('div', 'swipe-delete-bg', TRASH_SVG + '<span>حذف</span>');
    var content = el('div', 'swipe-content');

    var row = el('div', 'item-row');

    if (!term){
      var itemDragHandle = el('div', 'drag-handle', DRAG_SVG);
      itemDragHandle.title = 'جابه‌جایی';
      itemDragHandle.onclick = function(e){ e.stopPropagation(); };
      attachTouchDragHandle(itemDragHandle, 'item', item.id, siblingList);
      row.appendChild(itemDragHandle);
    }

    var cb = el('div', 'checkbox' + (item.done ? ' checked' : ''), CHECK_SVG);
    cb.onclick = function(){ toggleDone(item.id); };
    row.appendChild(cb);

    var mainWrap = el('div', 'item-main');
    var textEl = el('div', 'item-text', term ? highlightText(item.text, term) : escapeHtml(item.text));
    textEl.onclick = function(){ editItemText(catId, item.id); };
    mainWrap.appendChild(textEl);

    var subCount = countAll(item.children);
    var isOpen = item.subOpen || !!term;
    var toggleSub = el('div', 'item-toggle-sub' + (isOpen ? ' open' : ''));
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

    if (!term){
      var itemActions = el('div', 'item-actions');
      var delBtn = el('button', 'icon-btn danger', TRASH_SVG);
      delBtn.onclick = function(){ deleteItem(catId, item.id); };
      itemActions.appendChild(delBtn);
      row.appendChild(itemActions);
    }

    content.appendChild(row);

    if (isOpen){
      var subList = el('div', 'subitem-list open');
      visibleChildren.forEach(function(child){
        subList.appendChild(renderItem(child, catId, depth+1, term, item.children));
      });

      if (!term){
        var addSubRow = buildAddRow(function(text){
          item.children.push(makeItem(text));
          save();
          renderAll();
        }, 'زیربخش جدید...');
        subList.appendChild(addSubRow);
      }

      content.appendChild(subList);
    }

    swipeWrap.appendChild(deleteBg);
    swipeWrap.appendChild(content);
    outer.appendChild(swipeWrap);

    if (!term){
      attachSwipeToDelete(content, swipeWrap, function(){ deleteItem(catId, item.id); });
    }

    return outer;
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
    showPrompt('ویرایش متن', found.item.text, function(next){
      next = next.trim();
      if (!next) return;
      found.item.text = next;
      save();
      renderAll();
    });
  }

  function renameCategory(catId){
    var cat = findCategory(catId);
    if (!cat) return;
    showPrompt('نام جدید دسته', cat.name, function(next){
      next = next.trim();
      if (!next) return;
      cat.name = next;
      save();
      renderAll();
    });
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
    showPrompt('نام دستهٔ جدید', '', function(name){
      name = name.trim();
      if (!name) return;
      var color = CATEGORY_COLORS[state.categories.length % CATEGORY_COLORS.length];
      state.categories.push(makeCategory(name, color));
      save();
      renderAll();
    });
  }

  // ---------- archive ----------
  function archiveCategory(catId){
    var cat = findCategory(catId);
    if (!cat) return;
    showConfirm(
      'انتقال «' + cat.name + '» به آرشیو',
      'این دسته از فهرست اصلی برداشته می‌شه ولی می‌تونی بعداً از آرشیو برش گردونی.',
      function(){
        state.categories = state.categories.filter(function(c){ return c.id !== catId; });
        state.archive.unshift({
          id: cat.id,
          name: cat.name,
          color: cat.color,
          items: cat.items,
          archivedAt: new Date().toISOString()
        });
        save();
        renderAll();
        showToast('به آرشیو منتقل شد');
      }
    );
  }

  function restoreFromArchive(entryId){
    var idx = -1;
    for (var i=0;i<state.archive.length;i++){
      if (state.archive[i].id === entryId){ idx = i; break; }
    }
    if (idx === -1) return;
    var entry = state.archive[idx];
    state.archive.splice(idx, 1);
    state.categories.push({
      id: entry.id,
      name: entry.name,
      color: entry.color,
      collapsed: false,
      items: entry.items
    });
    save();
    renderAll();
    renderArchiveList();
    showToast('دسته بازگردانده شد');
  }

  function deleteFromArchivePermanently(entryId){
    var entry = null;
    for (var i=0;i<state.archive.length;i++){
      if (state.archive[i].id === entryId){ entry = state.archive[i]; break; }
    }
    if (!entry) return;
    showConfirm(
      'حذف همیشگی «' + entry.name + '»',
      'این دسته برای همیشه از آرشیو پاک می‌شه.',
      function(){
        state.archive = state.archive.filter(function(e){ return e.id !== entryId; });
        save();
        renderAll();
        renderArchiveList();
        showToast('برای همیشه حذف شد');
      }
    );
  }

  function faRelativeDate(isoString){
    try {
      var d = new Date(isoString);
      return new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' }).format(d);
    } catch(e){ return ''; }
  }

  function renderArchiveList(){
    var listEl = document.getElementById('archiveList');
    listEl.innerHTML = '';
    if (state.archive.length === 0){
      listEl.appendChild(el('div', 'archive-empty', 'آرشیو خالیه.'));
      return;
    }
    state.archive.forEach(function(entry){
      var row = el('div', 'archive-item');
      var c = countAll(entry.items);

      var info = el('div', 'archive-item-info');
      var nameEl = el('div', 'archive-item-name', escapeHtml(entry.name) + ' · ' + toFa(c.done) + '/' + toFa(c.total));
      var dateEl = el('div', 'archive-item-date', faRelativeDate(entry.archivedAt));
      info.appendChild(nameEl);
      info.appendChild(dateEl);
      row.appendChild(info);

      var actions = el('div', 'archive-item-actions');
      var restoreBtn = el('button', 'icon-btn', RESTORE_SVG);
      restoreBtn.title = 'بازگردانی';
      restoreBtn.onclick = function(){ restoreFromArchive(entry.id); };
      var delBtn = el('button', 'icon-btn danger', TRASH_SVG);
      delBtn.title = 'حذف همیشگی';
      delBtn.onclick = function(){ deleteFromArchivePermanently(entry.id); };
      actions.appendChild(restoreBtn);
      actions.appendChild(delBtn);
      row.appendChild(actions);

      listEl.appendChild(row);
    });
  }

  // ---------- reset ----------
  function resetAll(){
    showConfirm(
      'ریست کامل چک‌لیست',
      'همهٔ دسته‌ها، موارد، زیربخش‌ها و آرشیو برای همیشه پاک می‌شن. پیشنهاد می‌کنم قبلش با دکمهٔ «دانلود PDF» یه نسخهٔ پشتیبان بگیری.',
      function(){
        state = { categories: [], archive: [] };
        save();
        renderAll();
        showToast('همه‌چیز ریست شد');
      }
    );
  }

  // ---------- drag & drop: shared reorder logic ----------
  // Used by both desktop mouse-based HTML5 DnD and mobile touch-based dragging,
  // since HTML5 Drag and Drop is not supported on touch in mobile browsers.
  function reorderList(list, fromId, toId){
    var fromIdx = -1, toIdx = -1;
    for (var i=0;i<list.length;i++){
      if (list[i].id === fromId) fromIdx = i;
      if (list[i].id === toId) toIdx = i;
    }
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return false;
    var moved = list.splice(fromIdx, 1)[0];
    list.splice(toIdx, 0, moved);
    return true;
  }

  // ---------- drag & drop: categories (desktop mouse via HTML5 DnD) ----------
  var dragCatId = null;
  var dragItemCtx = null; // { itemId, list }

  function onCategoryDragStart(e, catId){
    dragCatId = catId;
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', catId); } catch(err){}
    setTimeout(function(){
      var node = e.target.closest ? e.target.closest('.category') : null;
      if (node) node.classList.add('dragging');
    }, 0);
  }

  function onCategoryDragOver(e, wrapEl){
    if (dragCatId === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    wrapEl.classList.add('drag-over-top');
  }

  function onCategoryDrop(e, targetCatId, wrapEl){
    e.preventDefault();
    wrapEl.classList.remove('drag-over-top');
    if (dragCatId === null) { clearDragState(); return; }
    if (reorderList(state.categories, dragCatId, targetCatId)){
      save();
    }
    clearDragState();
    renderAll();
  }

  // ---------- drag & drop: items (desktop mouse via HTML5 DnD, same sibling list only) ----------
  function onItemDragStart(e, itemId, siblingList){
    dragItemCtx = { itemId: itemId, list: siblingList };
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', itemId); } catch(err){}
    setTimeout(function(){
      var node = e.target.closest ? e.target.closest('.item') : null;
      if (node) node.classList.add('dragging');
    }, 0);
  }

  function onItemDragOver(e, outerEl){
    if (!dragItemCtx) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    outerEl.classList.add('drag-over-top');
  }

  function onItemDrop(e, targetItemId, siblingList, outerEl){
    e.preventDefault();
    outerEl.classList.remove('drag-over-top');
    if (!dragItemCtx) { clearDragState(); return; }
    // Only allow reordering within the same sibling list (same parent / same depth context)
    if (dragItemCtx.list === siblingList){
      if (reorderList(siblingList, dragItemCtx.itemId, targetItemId)){
        save();
      }
    }
    clearDragState();
    renderAll();
  }

  function clearDragState(){
    dragCatId = null;
    dragItemCtx = null;
    document.querySelectorAll('.dragging').forEach(function(n){ n.classList.remove('dragging'); });
    document.querySelectorAll('.drag-over-top').forEach(function(n){ n.classList.remove('drag-over-top'); });
  }

  // ---------- drag & drop: touch-based reordering (mobile) ----------
  // HTML5 Drag and Drop is mouse-only in mobile browsers, so real touch dragging
  // needs its own implementation. Activated only from the drag-handle icon, so it
  // never competes with tap-to-expand or swipe-to-delete on the rest of the row.
  var touchDrag = null; // { kind:'category'|'item', id, list, ghostEl, allNodes:[{el,id,rect}] }

  function attachTouchDragHandle(handleEl, kind, id, list){
    handleEl.addEventListener('touchstart', function(e){
      if (e.touches.length !== 1) return;
      e.preventDefault();
      e.stopPropagation(); // don't let this also trigger swipe-to-delete on the parent row
      startTouchDrag(e.touches[0], kind, id, list, handleEl);
    }, { passive: false });
  }

  function startTouchDrag(touch, kind, id, list, handleEl){
    var rowSelector = kind === 'category' ? '.category' : '.item';
    var sourceRow = handleEl.closest(rowSelector);
    if (!sourceRow || !sourceRow.parentElement) return;

    var rect = sourceRow.getBoundingClientRect();
    var ghost = sourceRow.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.style.width = rect.width + 'px';
    ghost.style.top = rect.top + 'px';
    ghost.style.left = rect.left + 'px';
    document.body.appendChild(ghost);

    sourceRow.classList.add('dragging');

    // Scope siblings to actual DOM children of the same direct parent container
    // (the specific .items-list or .subitem-list this row lives in), NOT a global
    // selector — otherwise items from unrelated branches of the tree could match.
    var siblingInfo = Array.prototype.slice.call(sourceRow.parentElement.children)
      .filter(function(n){ return n !== sourceRow && n.classList.contains(rowSelector.slice(1)) && n.dataset.id; })
      .map(function(n){
        return { el: n, id: n.dataset.id, rect: n.getBoundingClientRect() };
      });

    touchDrag = {
      kind: kind,
      id: id,
      list: list,
      sourceRow: sourceRow,
      ghost: ghost,
      startX: touch.clientX,
      startY: touch.clientY,
      offsetX: touch.clientX - rect.left,
      offsetY: touch.clientY - rect.top,
      siblingInfo: siblingInfo,
      currentTargetId: null
    };

    document.addEventListener('touchmove', onTouchDragMove, { passive: false });
    document.addEventListener('touchend', onTouchDragEnd);
    document.addEventListener('touchcancel', onTouchDragEnd);
  }

  function onTouchDragMove(e){
    if (!touchDrag) return;
    if (e.touches.length !== 1) return;
    e.preventDefault();

    var touch = e.touches[0];
    touchDrag.ghost.style.top = (touch.clientY - touchDrag.offsetY) + 'px';
    touchDrag.ghost.style.left = (touch.clientX - touchDrag.offsetX) + 'px';

    // Find which sibling row the finger's Y position is currently over
    var overId = null;
    for (var i=0;i<touchDrag.siblingInfo.length;i++){
      var s = touchDrag.siblingInfo[i];
      if (touch.clientY >= s.rect.top && touch.clientY <= s.rect.bottom){
        overId = s.id;
        break;
      }
    }

    if (overId !== touchDrag.currentTargetId){
      touchDrag.siblingInfo.forEach(function(s){ s.el.classList.remove('drag-over-top'); });
      if (overId){
        var match = touchDrag.siblingInfo.filter(function(s){ return s.id === overId; })[0];
        if (match) match.el.classList.add('drag-over-top');
      }
      touchDrag.currentTargetId = overId;
    }
  }

  function onTouchDragEnd(){
    if (!touchDrag) return;

    var targetId = touchDrag.currentTargetId;
    var list = touchDrag.list;
    var fromId = touchDrag.id;

    touchDrag.ghost.remove();
    touchDrag.sourceRow.classList.remove('dragging');
    touchDrag.siblingInfo.forEach(function(s){ s.el.classList.remove('drag-over-top'); });

    document.removeEventListener('touchmove', onTouchDragMove);
    document.removeEventListener('touchend', onTouchDragEnd);
    document.removeEventListener('touchcancel', onTouchDragEnd);

    touchDrag = null;

    if (targetId && reorderList(list, fromId, targetId)){
      save();
      renderAll();
    }
  }

  // ---------- swipe to delete (touch) ----------
  function attachSwipeToDelete(contentEl, wrapEl, onDelete){
    var startX = 0, startY = 0, currentX = 0, dragging = false, decided = false, isHorizontal = false;
    var threshold = 70; // px to trigger delete confirmation
    var maxSwipe = 90;

    contentEl.addEventListener('touchstart', function(e){
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      currentX = 0;
      dragging = true;
      decided = false;
      isHorizontal = false;
      contentEl.style.transition = 'none';
    }, { passive: true });

    contentEl.addEventListener('touchmove', function(e){
      if (!dragging) return;
      var dx = e.touches[0].clientX - startX;
      var dy = e.touches[0].clientY - startY;

      if (!decided){
        if (Math.abs(dx) > 8 || Math.abs(dy) > 8){
          decided = true;
          isHorizontal = Math.abs(dx) > Math.abs(dy);
        } else {
          return;
        }
      }

      if (!isHorizontal) return; // let vertical scroll happen normally

      e.preventDefault();
      // RTL layout: swipe left (negative dx) reveals delete on the right side visually,
      // but since content is RTL, we reveal by moving content to the left (negative translateX)
      currentX = Math.min(0, Math.max(dx, -maxSwipe));
      contentEl.style.transform = 'translateX(' + currentX + 'px)';
    }, { passive: false });

    function endSwipe(){
      if (!dragging) return;
      dragging = false;
      contentEl.style.transition = 'transform 0.2s ease';
      if (isHorizontal && Math.abs(currentX) > threshold){
        contentEl.style.transform = 'translateX(-100%)';
        setTimeout(function(){ onDelete(); }, 180);
      } else {
        contentEl.style.transform = 'translateX(0)';
      }
      currentX = 0;
    }

    contentEl.addEventListener('touchend', endSwipe);
    contentEl.addEventListener('touchcancel', endSwipe);
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

  // ---------- compact serialization (for sync: QR + text code) ----------
  // Strips UI-only fields (collapsed, subOpen, ids) to minimize payload size.
  // Format: [ [name, color, [ [text, done01, [children...]], ... ] ], ... ]
  function toCompactItem(item){
    return [item.text, item.done ? 1 : 0, item.children.map(toCompactItem)];
  }
  function toCompactCategory(cat){
    return [cat.name, cat.color, cat.items.map(toCompactItem)];
  }
  function toCompactState(){
    return state.categories.map(toCompactCategory);
  }

  function fromCompactItem(arr){
    return { id: uid(), text: String(arr[0]), done: !!arr[1], subOpen: false, children: (arr[2]||[]).map(fromCompactItem) };
  }
  function fromCompactCategory(arr){
    return { id: uid(), name: String(arr[0]), color: String(arr[1]), collapsed: false, items: (arr[2]||[]).map(fromCompactItem) };
  }
  function fromCompactState(compact){
    return compact.map(fromCompactCategory);
  }

  // ---------- confirm modal ----------
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

  // ---------- inline prompt modal (replaces browser prompt()) ----------
  var promptOverlay = document.getElementById('promptOverlay');
  var promptTitle = document.getElementById('promptTitle');
  var promptInput = document.getElementById('promptInput');
  var promptConfirm = document.getElementById('promptConfirm');
  var promptCancel = document.getElementById('promptCancel');
  var pendingPromptAction = null;

  function showPrompt(title, initialValue, onConfirm){
    promptTitle.textContent = title;
    promptInput.value = initialValue || '';
    pendingPromptAction = onConfirm;
    promptOverlay.classList.add('open');
    setTimeout(function(){
      promptInput.focus();
      promptInput.select();
    }, 50);
  }

  function hidePrompt(){
    promptOverlay.classList.remove('open');
    pendingPromptAction = null;
  }

  function submitPrompt(){
    var action = pendingPromptAction;
    var val = promptInput.value;
    hidePrompt();
    if (action) action(val);
  }

  promptConfirm.onclick = submitPrompt;
  promptCancel.onclick = hidePrompt;
  promptInput.addEventListener('keydown', function(e){
    if (e.key === 'Enter') submitPrompt();
  });
  promptOverlay.onclick = function(e){
    if (e.target === promptOverlay) hidePrompt();
  };

  // ---------- archive modal ----------
  var archiveOverlay = document.getElementById('archiveOverlay');
  document.getElementById('openArchiveBtn').onclick = function(){
    renderArchiveList();
    archiveOverlay.classList.add('open');
  };
  document.getElementById('closeArchiveBtn').onclick = function(){
    archiveOverlay.classList.remove('open');
  };
  archiveOverlay.onclick = function(e){
    if (e.target === archiveOverlay) archiveOverlay.classList.remove('open');
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

  // ---------- search wiring ----------
  var searchInput = document.getElementById('searchInput');
  var searchClear = document.getElementById('searchClear');

  searchInput.addEventListener('input', function(){
    currentSearchTerm = searchInput.value;
    searchClear.style.display = currentSearchTerm ? 'flex' : 'none';
    renderAll();
  });

  searchClear.onclick = function(){
    searchInput.value = '';
    currentSearchTerm = '';
    searchClear.style.display = 'none';
    renderAll();
    searchInput.focus();
  };

  // ---------- voice input (Web Speech API) ----------
  var SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition || null;

  function isSpeechSupported(){
    return !!SpeechRecognitionCtor;
  }

  function startVoiceCapture(buttonEl, onResult){
    if (!SpeechRecognitionCtor){
      showToast('مرورگر شما از ورودی صوتی پشتیبانی نمی‌کنه');
      return;
    }

    var recognition = new SpeechRecognitionCtor();
    recognition.lang = 'fa-IR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    buttonEl.classList.add('listening');

    var finished = false;
    function finish(){
      if (finished) return;
      finished = true;
      buttonEl.classList.remove('listening');
    }

    recognition.onresult = function(event){
      var transcript = '';
      if (event.results && event.results.length > 0){
        transcript = event.results[0][0].transcript;
      }
      finish();
      if (transcript) onResult(transcript);
    };

    recognition.onerror = function(event){
      finish();
      if (event.error === 'not-allowed' || event.error === 'permission-denied'){
        showToast('اجازهٔ دسترسی به میکروفون داده نشد');
      } else if (event.error === 'no-speech'){
        showToast('صدایی شنیده نشد، دوباره امتحان کن');
      } else {
        showToast('خطا در تشخیص صدا');
      }
    };

    recognition.onend = finish;

    try {
      recognition.start();
    } catch(e){
      finish();
      showToast('امکان شروع ضبط صدا نبود');
    }
  }

  // ---------- sync modal (QR + text code) ----------
  var syncOverlay = document.getElementById('syncOverlay');
  var syncTabShow = document.getElementById('syncTabShow');
  var syncTabScan = document.getElementById('syncTabScan');
  var syncPanelShow = document.getElementById('syncPanelShow');
  var syncPanelScan = document.getElementById('syncPanelScan');

  document.getElementById('syncBtn').onclick = function(){
    openSyncModal();
  };
  document.getElementById('closeSyncBtn').onclick = function(){
    syncOverlay.classList.remove('open');
  };
  syncOverlay.onclick = function(e){
    if (e.target === syncOverlay) syncOverlay.classList.remove('open');
  };

  function switchSyncTab(tab){
    if (tab === 'show'){
      syncTabShow.classList.add('active');
      syncTabScan.classList.remove('active');
      syncPanelShow.style.display = 'block';
      syncPanelScan.style.display = 'none';
    } else {
      syncTabScan.classList.add('active');
      syncTabShow.classList.remove('active');
      syncPanelScan.style.display = 'block';
      syncPanelShow.style.display = 'none';
    }
  }

  syncTabShow.onclick = function(){ switchSyncTab('show'); };
  syncTabScan.onclick = function(){ switchSyncTab('scan'); };

  function openSyncModal(){
    var hasData = state.categories.length > 0;

    if (hasData){
      syncTabShow.disabled = false;
      switchSyncTab('show');
      buildSyncCode();
    } else {
      // Nothing to show yet, but the person may still want to receive someone
      // else's checklist -- don't block the whole modal, just skip straight
      // to the tab that's actually usable right now.
      syncTabShow.disabled = true;
      switchSyncTab('scan');
    }

    syncOverlay.classList.add('open');
  }

  function buildSyncCode(){
    var compact = toCompactState();
    var codeStr = JSON.stringify(compact);

    var codeOutput = document.getElementById('syncCodeOutput');
    codeOutput.value = codeStr;

    var qrTooBig = document.getElementById('qrTooBig');
    var qrWrap = document.getElementById('qrWrap');

    if (codeStr.length > QR_MAX_CHARS){
      qrTooBig.style.display = 'block';
      qrWrap.style.display = 'none';
    } else {
      qrTooBig.style.display = 'none';
      qrWrap.style.display = 'flex';
      try {
        var canvas = document.getElementById('qrCanvas');
        renderQrToCanvas(canvas, codeStr, { cellSize: 4, ecLevel: QRErrorCorrectLevel.L });
      } catch(e){
        qrTooBig.style.display = 'block';
        qrWrap.style.display = 'none';
      }
    }
  }

  document.getElementById('copyCodeBtn').onclick = function(){
    var codeOutput = document.getElementById('syncCodeOutput');
    codeOutput.select();
    codeOutput.setSelectionRange(0, 999999);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(codeOutput.value);
        showToast('کد کپی شد');
      } else {
        document.execCommand('copy');
        showToast('کد کپی شد');
      }
    } catch(e){
      showToast('کپی خودکار کار نکرد — دستی کپی کن');
    }
  };

  document.getElementById('applyCodeBtn').onclick = function(){
    var input = document.getElementById('syncCodeInput');
    var raw = input.value.trim();
    if (!raw){
      showToast('اول کد رو پیست کن');
      return;
    }

    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch(e){
      showToast('کد معتبر نیست');
      return;
    }

    if (!Array.isArray(parsed)){
      showToast('کد معتبر نیست');
      return;
    }

    var incomingCategories;
    try {
      incomingCategories = fromCompactState(parsed);
    } catch(e){
      showToast('خواندن کد با خطا مواجه شد');
      return;
    }

    // Close the sync modal first so the confirmation question isn't competing
    // with the sync UI behind it (z-index already guarantees the confirm dialog
    // would render on top regardless, but hiding sync keeps focus on the decision).
    syncOverlay.classList.remove('open');

    showConfirm(
      'دریافت چک‌لیست',
      'این چک‌لیست به دسته‌های فعلی شما اضافه می‌شه (چیزی پاک نمی‌شه).',
      function(){
        state.categories = state.categories.concat(incomingCategories);
        save();
        renderAll();
        input.value = '';
        showToast('چک‌لیست دریافت و اضافه شد');
      }
    );
  };

  // ---------- wire up static buttons ----------
  document.getElementById('addCategoryBtn').onclick = addCategory;
  document.getElementById('resetBtn').onclick = resetAll;
  document.getElementById('exportBtn').onclick = exportPdf;

  // ---------- init ----------
  setDateStamp();
  renderAll();

})();
