// js/game.js — Core game logic, UI updates, player actions

'use strict';

const Game = (function () {
  let _state     = null;
  let _startTime = null;

  // -------------------------------------------------------------------------
  // Initialisation
  // -------------------------------------------------------------------------

  function init() {
    _state = _deepClone(INITIAL_STATE);
    Economy.init();
    Renderer.init();
    _setupEventListeners();
    _updateUI();
    _startGameLoop();
    _addMessage('🚀 欢迎来到银河历 3045 年！您的星际贸易之旅由此开始……', 'info');
    _addMessage(
      '💡 提示：点击星图上的星系前往贸易，买低卖高赚取差价。' +
      '目标：积累 ' + VICTORY_NET_WORTH.toLocaleString() + ' 信用积分，建立商业帝国！',
      'tip'
    );
  }

  function _deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  // -------------------------------------------------------------------------
  // Event listeners
  // -------------------------------------------------------------------------

  function _setupEventListeners() {
    const mapCanvas = document.getElementById('map-canvas');

    mapCanvas.addEventListener('mousemove', function (e) {
      const r   = mapCanvas.getBoundingClientRect();
      const sys = Renderer.getSystemAtPoint(
        e.clientX - r.left, e.clientY - r.top,
        mapCanvas.width, mapCanvas.height
      );
      const newId = sys ? sys.id : null;
      if (newId !== _state.hoveredSystem) {
        _state.hoveredSystem = newId;
        if (newId && newId !== _state.currentSystem) {
          const cost = Economy.getFuelCost(_state.currentSystem, newId, _state.fuelEfficiency);
          mapCanvas.title = '前往 ' + sys.name + '（需要 ' + cost + ' 燃料）';
        } else {
          mapCanvas.title = '';
        }
      }
    });

    mapCanvas.addEventListener('mouseleave', function () {
      _state.hoveredSystem = null;
    });

    mapCanvas.addEventListener('click', function (e) {
      const r   = mapCanvas.getBoundingClientRect();
      const sys = Renderer.getSystemAtPoint(
        e.clientX - r.left, e.clientY - r.top,
        mapCanvas.width, mapCanvas.height
      );
      if (sys && sys.id !== _state.currentSystem) {
        _travelTo(sys.id);
      }
    });

    // Tab buttons
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
        document.querySelectorAll('.tab-pane').forEach(function (p) { p.classList.remove('active'); });
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
      });
    });

    // Trade modal controls
    document.getElementById('modal-decrease').addEventListener('click', function () {
      const inp = document.getElementById('modal-amount');
      inp.value = Math.max(1, parseInt(inp.value) - 1);
      _refreshModalTotal();
    });

    document.getElementById('modal-increase').addEventListener('click', function () {
      const inp = document.getElementById('modal-amount');
      inp.value = Math.min(parseInt(inp.max), parseInt(inp.value) + 1);
      _refreshModalTotal();
    });

    document.getElementById('modal-amount').addEventListener('input', _refreshModalTotal);

    document.getElementById('modal-cancel').addEventListener('click', function () {
      document.getElementById('trade-modal').classList.add('hidden');
    });

    document.getElementById('restart-btn').addEventListener('click', function () {
      document.getElementById('gameover-modal').classList.add('hidden');
      init();
    });
  }

  // -------------------------------------------------------------------------
  // Travel
  // -------------------------------------------------------------------------

  function _travelTo(systemId) {
    const cost = Economy.getFuelCost(_state.currentSystem, systemId, _state.fuelEfficiency);
    if (_state.fuel < cost) {
      const dest = SYSTEMS.find(function (s) { return s.id === systemId; });
      _addMessage(
        '⛽ 燃料不足！前往 ' + dest.name + ' 需要 ' + cost +
        ' 燃料，当前只有 ' + Math.floor(_state.fuel) + '。',
        'error'
      );
      return;
    }

    _state.fuel         -= cost;
    _state.currentSystem = systemId;
    _state.day          += 1;
    Economy.advanceDay();

    const sys = SYSTEMS.find(function (s) { return s.id === systemId; });
    _addMessage('🚀 已抵达 ' + sys.name + '！消耗 ' + cost + ' 燃料。银河历第 ' + _state.day + ' 天。', 'travel');

    // Fuel depot bonus
    if (systemId === 'fuel_depot') {
      const free = Math.min(15, _state.maxFuel - _state.fuel);
      if (free > 0) {
        _state.fuel += free;
        _addMessage('⚡ 补给站赠送了 ' + free + ' 单位免费燃料！', 'info');
      }
    }

    _updateUI();
    _checkVictory();
  }

  // -------------------------------------------------------------------------
  // Trade actions
  // -------------------------------------------------------------------------

  function _buyGood(goodId, quantity) {
    const price     = Economy.getBuyPrice(_state.currentSystem, goodId);
    const totalCost = price * quantity;

    if (totalCost > _state.credits) {
      _addMessage('💰 信用积分不足！', 'error');
      return false;
    }
    if (_getTotalCargo() + quantity > _state.maxCargo) {
      _addMessage('📦 货舱空间不足！', 'error');
      return false;
    }

    _state.credits           -= totalCost;
    _state.cargo[goodId]      = (_state.cargo[goodId] || 0) + quantity;
    const good = GOODS.find(function (g) { return g.id === goodId; });
    _addMessage('✅ 购买了 ' + quantity + ' 单位 ' + good.name + '，花费 ' + totalCost + ' 积分。', 'buy');
    _updateUI();
    return true;
  }

  function _sellGood(goodId, quantity) {
    const available = _state.cargo[goodId] || 0;
    if (quantity > available) {
      _addMessage('📦 货物数量不足！', 'error');
      return false;
    }

    const price       = Economy.getSellPrice(_state.currentSystem, goodId);
    const totalEarned = price * quantity;
    _state.credits   += totalEarned;
    _state.cargo[goodId] -= quantity;
    if (_state.cargo[goodId] <= 0) delete _state.cargo[goodId];

    const good = GOODS.find(function (g) { return g.id === goodId; });
    _addMessage('💸 出售了 ' + quantity + ' 单位 ' + good.name + '，获得 ' + totalEarned + ' 积分。', 'sell');
    _updateUI();
    _checkVictory();
    return true;
  }

  function _buyUpgrade(upgradeId) {
    const upg = UPGRADES.find(function (u) { return u.id === upgradeId; });
    if (!upg) return;

    if (_state.purchasedUpgrades.includes(upgradeId)) {
      _addMessage('⚙️ 该升级已安装！', 'error');
      return;
    }
    if (upg.requires && !_state.purchasedUpgrades.includes(upg.requires)) {
      const req = UPGRADES.find(function (u) { return u.id === upg.requires; });
      _addMessage('⚙️ 需要先安装「' + req.name + '」！', 'error');
      return;
    }
    if (_state.credits < upg.cost) {
      _addMessage('💰 信用积分不足！', 'error');
      return;
    }

    _state.credits -= upg.cost;
    _state.purchasedUpgrades.push(upgradeId);

    if (upg.effect.cargo)          _state.maxCargo += upg.effect.cargo;
    if (upg.effect.maxFuel) {
      _state.maxFuel += upg.effect.maxFuel;
      _state.fuel     = Math.min(_state.fuel + upg.effect.maxFuel, _state.maxFuel);
    }
    if (upg.effect.fuelEfficiency) _state.fuelEfficiency *= upg.effect.fuelEfficiency;

    _addMessage('⚙️ 升级安装成功：' + upg.name + '！', 'upgrade');
    _updateUI();
  }

  function _refuel() {
    const needed = _state.maxFuel - _state.fuel;
    if (needed <= 0) { _addMessage('⚡ 燃料已满！', 'info'); return; }

    const pricePerUnit = Economy.getBuyPrice(_state.currentSystem, 'fuel');
    const canAfford    = Math.floor(_state.credits / pricePerUnit);
    const toBuy        = Math.min(Math.ceil(needed), canAfford);

    if (toBuy <= 0) { _addMessage('💰 没有足够积分购买燃料！', 'error'); return; }

    const cost       = toBuy * pricePerUnit;
    _state.fuel     += toBuy;
    _state.credits  -= cost;
    _addMessage('⚡ 补充了 ' + toBuy + ' 单位燃料，花费 ' + cost + ' 积分。', 'info');
    _updateUI();
  }

  // -------------------------------------------------------------------------
  // Trade modal
  // -------------------------------------------------------------------------

  let _modalAction = null;
  let _modalGood   = null;

  function _openTradeModal(action, good) {
    _modalAction = action;
    _modalGood   = good;

    const price  = action === 'buy'
      ? Economy.getBuyPrice(_state.currentSystem, good.id)
      : Economy.getSellPrice(_state.currentSystem, good.id);

    const maxQty = action === 'buy'
      ? Math.min(
          Math.floor(_state.credits / price),
          _state.maxCargo - _getTotalCargo()
        )
      : (_state.cargo[good.id] || 0);

    const safeMax = Math.max(0, maxQty);

    document.getElementById('modal-title').textContent =
      (action === 'buy' ? '💰 购买 ' : '💸 出售 ') + good.emoji + ' ' + good.name;
    document.getElementById('modal-desc').textContent =
      '单价: ' + price + ' 积分  ·  最多可' +
      (action === 'buy' ? '购买' : '出售') + ': ' + safeMax + ' 单位';

    const inp = document.getElementById('modal-amount');
    inp.max   = safeMax;
    inp.value = Math.min(1, safeMax);

    // Store price for total calc
    inp.dataset.price = price;
    _refreshModalTotal();

    document.getElementById('modal-confirm').onclick = function () {
      const qty = parseInt(inp.value) || 0;
      if (qty > 0) {
        if (_modalAction === 'buy') _buyGood(_modalGood.id, qty);
        else                        _sellGood(_modalGood.id, qty);
      }
      document.getElementById('trade-modal').classList.add('hidden');
    };

    document.getElementById('trade-modal').classList.remove('hidden');
  }

  function _refreshModalTotal() {
    const inp   = document.getElementById('modal-amount');
    const qty   = parseInt(inp.value) || 0;
    const price = parseInt(inp.dataset.price) || 0;
    document.getElementById('modal-total').textContent = '总计: ' + (qty * price) + ' 积分';
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function _getTotalCargo() {
    return Object.values(_state.cargo).reduce(function (s, q) { return s + q; }, 0);
  }

  function _getNetWorth() {
    let worth = _state.credits;
    Object.entries(_state.cargo).forEach(function (entry) {
      const goodId = entry[0];
      const qty    = entry[1];
      worth += Economy.getSellPrice(_state.currentSystem, goodId) * qty;
    });
    return worth;
  }

  function _checkVictory() {
    if (_getNetWorth() >= VICTORY_NET_WORTH) {
      document.getElementById('gameover-title').textContent   = '🎉 银河商业帝国建立！';
      document.getElementById('gameover-message').textContent =
        '恭喜！您在银河历第 ' + _state.day + ' 天建立了属于自己的商业帝国！\n' +
        '最终净资产：' + Math.floor(_getNetWorth()).toLocaleString() + ' 信用积分';
      document.getElementById('gameover-modal').classList.remove('hidden');
    }
  }

  function _addMessage(text, type) {
    const log  = document.getElementById('message-log');
    const div  = document.createElement('div');
    div.className   = 'msg msg-' + (type || 'info');
    div.textContent = text;
    log.insertBefore(div, log.firstChild);
    while (log.children.length > 10) log.removeChild(log.lastChild);
  }

  // -------------------------------------------------------------------------
  // UI rendering
  // -------------------------------------------------------------------------

  function _updateUI() {
    const netWorth = _getNetWorth();

    document.getElementById('credits').textContent    = Math.floor(_state.credits).toLocaleString();
    document.getElementById('galactic-day').textContent = '第 ' + _state.day + ' 天';
    document.getElementById('net-worth').textContent  = Math.floor(netWorth).toLocaleString();

    // Victory progress bar
    const pct = Math.min(100, (netWorth / VICTORY_NET_WORTH) * 100);
    document.getElementById('empire-progress').style.width = pct + '%';
    document.getElementById('empire-pct').textContent      = Math.floor(pct) + '%';

    const sys = SYSTEMS.find(function (s) { return s.id === _state.currentSystem; });
    document.getElementById('current-location').textContent = '📍 ' + sys.name;
    document.getElementById('location-desc').textContent    = sys.description;

    _renderMarket();
    _renderCargo();
    _renderUpgrades();
    _renderShipStats();
  }

  function _renderMarket() {
    const tbody = document.getElementById('market-tbody');
    tbody.innerHTML = '';

    GOODS.forEach(function (good) {
      const buyPrice  = Economy.getBuyPrice(_state.currentSystem, good.id);
      const sellPrice = Economy.getSellPrice(_state.currentSystem, good.id);
      const inCargo   = _state.cargo[good.id] || 0;
      const mult      = Economy.getSystemMultiplier(_state.currentSystem, good.id);
      const isCheap   = mult < 0.7;
      const isExpensive = mult > 1.4;

      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td><span class="good-icon">' + good.emoji + '</span>' + good.name + '</td>' +
        '<td class="' + (isCheap ? 'price-low' : isExpensive ? 'price-high' : '') + '">' + buyPrice + '</td>' +
        '<td class="' + (isCheap ? 'price-low' : isExpensive ? 'price-high' : '') + '">' + sellPrice + '</td>' +
        '<td>' + (inCargo > 0 ? '<span class="qty-badge">' + inCargo + '</span>' : '—') + '</td>' +
        '<td class="action-cell">' +
          '<button class="btn-action buy-btn" data-id="' + good.id + '">买入</button>' +
          (inCargo > 0 ? '<button class="btn-action sell-btn" data-id="' + good.id + '">卖出</button>' : '') +
        '</td>';

      tr.querySelector('.buy-btn').addEventListener('click', function () {
        _openTradeModal('buy', good);
      });
      const sellBtn = tr.querySelector('.sell-btn');
      if (sellBtn) {
        sellBtn.addEventListener('click', function () {
          _openTradeModal('sell', good);
        });
      }
      tbody.appendChild(tr);
    });

    // Refuel row
    const fuelNeeded = Math.ceil(_state.maxFuel - _state.fuel);
    if (fuelNeeded > 0) {
      const tr = document.createElement('tr');
      tr.className = 'refuel-row';
      tr.innerHTML =
        '<td colspan="5">' +
          '<button id="refuel-btn" class="btn-refuel">⚡ 补充燃料（' + fuelNeeded + ' 单位）</button>' +
        '</td>';
      tr.querySelector('#refuel-btn').addEventListener('click', _refuel);
      tbody.appendChild(tr);
    }
  }

  function _renderCargo() {
    const list  = document.getElementById('cargo-list');
    const items = Object.entries(_state.cargo);

    if (items.length === 0) {
      list.innerHTML = '<p class="empty-note">货舱为空</p>';
      return;
    }

    list.innerHTML = items.map(function (entry) {
      const goodId    = entry[0];
      const qty       = entry[1];
      const good      = GOODS.find(function (g) { return g.id === goodId; });
      const sellPrice = Economy.getSellPrice(_state.currentSystem, goodId);
      return '<div class="cargo-row">' +
        '<span>' + good.emoji + ' ' + good.name + '</span>' +
        '<span class="cargo-meta">' + qty + ' 单位 · 当前售价 ' + sellPrice + '</span>' +
      '</div>';
    }).join('');
  }

  function _renderUpgrades() {
    const container = document.getElementById('upgrade-list');
    container.innerHTML = '';

    UPGRADES.forEach(function (upg) {
      const purchased = _state.purchasedUpgrades.includes(upg.id);
      const prereqOk  = !upg.requires || _state.purchasedUpgrades.includes(upg.requires);
      const canAfford = _state.credits >= upg.cost;

      const btn = document.createElement('button');
      btn.className = 'upg-btn' +
        (purchased  ? ' purchased'   : '') +
        (!prereqOk  ? ' locked'      : '') +
        (!canAfford && !purchased ? ' unaffordable' : '');

      btn.innerHTML =
        '<span class="upg-name">' + upg.name + '</span>' +
        '<span class="upg-desc">' + (purchased ? '✅ 已安装' : upg.desc) + '</span>' +
        (purchased ? '' : '<span class="upg-cost">' + upg.cost.toLocaleString() + ' 积分</span>');

      btn.disabled = purchased || !prereqOk;
      if (!purchased && prereqOk) {
        btn.addEventListener('click', function () { _buyUpgrade(upg.id); });
      }
      container.appendChild(btn);
    });
  }

  function _renderShipStats() {
    const totalCargo = _getTotalCargo();
    document.getElementById('cargo-text').textContent = totalCargo + ' / ' + _state.maxCargo;
    document.getElementById('cargo-fill').style.width = (totalCargo / _state.maxCargo * 100) + '%';
    document.getElementById('fuel-text').textContent  = Math.floor(_state.fuel) + ' / ' + _state.maxFuel;
    document.getElementById('fuel-fill').style.width  = (_state.fuel / _state.maxFuel * 100) + '%';
  }

  // -------------------------------------------------------------------------
  // Game loop
  // -------------------------------------------------------------------------

  function _startGameLoop() {
    _startTime = performance.now();
    (function loop(ts) {
      const t = ts - _startTime;
      Renderer.renderStars(t);
      Renderer.renderMap(_state, t);
      requestAnimationFrame(loop);
    }(_startTime));
  }

  return { init };
}());

window.addEventListener('load', function () { Game.init(); });
