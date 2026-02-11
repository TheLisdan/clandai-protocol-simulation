/**
 * CLNDAI AMM Simulation
 *
 * AMM формула: x * y = k
 * Цена = DAI / CLNDAI
 */

class AMMSimulation {
  constructor() {
    // Состояние пула
    this.poolDai = 10000;
    this.poolClndai = 100000;
    this.k = this.poolDai * this.poolClndai;

    // Начальное состояние пула (для отслеживания LP)
    this.initialPoolDai = 10000;
    this.initialPoolClndai = 100000;

    // Комиссии (в %)
    this.buyFee = 0.3;
    this.sellFee = 0.3;

    // Время
    this.currentDay = 0;

    // Игроки
    this.players = [];
    this.playerIdCounter = 0;

    // История сделок
    this.trades = [];

    // Ежедневные снимки P/L
    this.dailySnapshots = [];

    // Статистика
    this.totalFees = 0;
    this.totalVolume = 0;

    this.init();
  }

  init() {
    this.bindEvents();
    this.addDefaultPlayer();
    this.updateUI();
  }

  bindEvents() {
    document
      .getElementById("resetPool")
      .addEventListener("click", () => this.resetPool());
    document
      .getElementById("stepDay")
      .addEventListener("click", () => this.stepDays(1));
    document
      .getElementById("step7Days")
      .addEventListener("click", () => this.stepDays(7));
    document
      .getElementById("step30Days")
      .addEventListener("click", () => this.stepDays(30));
    document
      .getElementById("resetAll")
      .addEventListener("click", () => this.resetAll());
    document
      .getElementById("addPlayer")
      .addEventListener("click", () => this.addPlayerFromForm());

    document.getElementById("buyFee").addEventListener("change", (e) => {
      this.buyFee = parseFloat(e.target.value) || 0;
    });
    document.getElementById("sellFee").addEventListener("change", (e) => {
      this.sellFee = parseFloat(e.target.value) || 0;
    });
  }

  // ==================== AMM ЛОГИКА ====================

  getPrice() {
    return this.poolDai / this.poolClndai;
  }

  /**
   * Покупка CLNDAI за DAI
   * @param {number} daiIn - сколько DAI тратим
   * @returns {object} { clndaiOut, fee, effectivePrice }
   */
  calculateBuy(daiIn) {
    const fee = daiIn * (this.buyFee / 100);
    const daiAfterFee = daiIn - fee;

    // x * y = k
    // (x + daiAfterFee) * (y - clndaiOut) = k
    // clndaiOut = y - k / (x + daiAfterFee)
    const newPoolDai = this.poolDai + daiAfterFee;
    const newPoolClndai = this.k / newPoolDai;
    const clndaiOut = this.poolClndai - newPoolClndai;

    const effectivePrice = daiIn / clndaiOut;

    return { clndaiOut, fee, effectivePrice, newPoolDai, newPoolClndai };
  }

  /**
   * Продажа CLNDAI за DAI
   * @param {number} clndaiIn - сколько CLNDAI продаём
   * @returns {object} { daiOut, fee, effectivePrice }
   */
  calculateSell(clndaiIn) {
    // (x - daiOut) * (y + clndaiIn) = k
    // daiOut = x - k / (y + clndaiIn)
    const newPoolClndai = this.poolClndai + clndaiIn;
    const newPoolDai = this.k / newPoolClndai;
    const daiOutBeforeFee = this.poolDai - newPoolDai;

    const fee = daiOutBeforeFee * (this.sellFee / 100);
    const daiOut = daiOutBeforeFee - fee;

    const effectivePrice = daiOut / clndaiIn;

    return { daiOut, fee, effectivePrice, newPoolDai, newPoolClndai };
  }

  executeBuy(playerId, daiAmount) {
    const player = this.players.find((p) => p.id === playerId);
    if (!player || player.dai < daiAmount) return null;

    const result = this.calculateBuy(daiAmount);

    // Обновляем игрока
    player.dai -= daiAmount;
    player.clndai += result.clndaiOut;
    player.totalSpent += daiAmount;

    // Обновляем пул
    this.poolDai = result.newPoolDai;
    this.poolClndai = result.newPoolClndai;

    // Статистика
    this.totalFees += result.fee;
    this.totalVolume += daiAmount;

    // Записываем сделку
    this.trades.push({
      day: this.currentDay,
      player: player.name,
      type: "BUY",
      amountIn: daiAmount,
      amountOut: result.clndaiOut,
      price: result.effectivePrice,
      fee: result.fee,
      poolDai: this.poolDai,
      poolClndai: this.poolClndai,
    });

    this.updateUI();
    return result;
  }

  executeSell(playerId, clndaiAmount) {
    const player = this.players.find((p) => p.id === playerId);
    if (!player || player.clndai < clndaiAmount) return null;

    const result = this.calculateSell(clndaiAmount);

    // Обновляем игрока
    player.clndai -= clndaiAmount;
    player.dai += result.daiOut;
    player.totalReceived += result.daiOut;

    // Обновляем пул
    this.poolDai = result.newPoolDai;
    this.poolClndai = result.newPoolClndai;

    // Статистика
    this.totalFees += result.fee;
    this.totalVolume += result.daiOut;

    // Записываем сделку
    this.trades.push({
      day: this.currentDay,
      player: player.name,
      type: "SELL",
      amountIn: clndaiAmount,
      amountOut: result.daiOut,
      price: result.effectivePrice,
      fee: result.fee,
      poolDai: this.poolDai,
      poolClndai: this.poolClndai,
    });

    this.updateUI();
    return result;
  }

  sellAll(playerId) {
    const player = this.players.find((p) => p.id === playerId);
    if (!player || player.clndai <= 0) return null;
    return this.executeSell(playerId, player.clndai);
  }

  // ==================== ИГРОКИ ====================

  addPlayer(name, dai, strategy = "moderate") {
    const player = {
      id: ++this.playerIdCounter,
      name: name,
      dai: dai,
      initialDai: dai, // Начальный баланс для расчёта P/L
      clndai: 0,
      totalSpent: 0,
      totalReceived: 0,
      strategy: strategy,
      // Параметры стратегии
      tradeChance: this.getTradeChance(strategy),
      tradeSize: this.getTradeSize(strategy),
    };

    this.players.push(player);
    this.updateUI();
    return player;
  }

  getTradeChance(strategy) {
    switch (strategy) {
      case "passive":
        return 0.1; // 10% шанс торговли в день
      case "moderate":
        return 0.3; // 30%
      case "active":
        return 0.6; // 60%
      case "whale":
        return 0.2; // 20% но большие объёмы
      default:
        return 0.3;
    }
  }

  getTradeSize(strategy) {
    switch (strategy) {
      case "passive":
        return 0.1; // 10% от баланса
      case "moderate":
        return 0.25; // 25%
      case "active":
        return 0.15; // 15% (часто но мало)
      case "whale":
        return 0.5; // 50% (редко но много)
      default:
        return 0.25;
    }
  }

  addPlayerFromForm() {
    const nameInput = document.getElementById("playerName");
    const daiInput = document.getElementById("playerDai");
    const strategyInput = document.getElementById("playerStrategy");

    const name = nameInput.value.trim() || `Игрок ${this.playerIdCounter + 1}`;
    const dai = parseFloat(daiInput.value) || 1000;
    const strategy = strategyInput.value;

    this.addPlayer(name, dai, strategy);

    nameInput.value = "";
  }

  addDefaultPlayer() {
    // 10 игроков с разными стратегиями и балансами
    this.addPlayer("Кит_Алекс", 50000, "whale");
    this.addPlayer("Кит_Борис", 30000, "whale");
    this.addPlayer("Активный_Вика", 5000, "active");
    this.addPlayer("Активный_Гена", 8000, "active");
    this.addPlayer("Средний_Даша", 3000, "moderate");
    this.addPlayer("Средний_Евген", 4000, "moderate");
    this.addPlayer("Средний_Женя", 2500, "moderate");
    this.addPlayer("Пассив_Зина", 10000, "passive");
    this.addPlayer("Пассив_Игорь", 15000, "passive");
    this.addPlayer("Новичок_Катя", 1000, "moderate");
  }

  removePlayer(playerId) {
    const idx = this.players.findIndex((p) => p.id === playerId);
    if (idx !== -1) {
      this.players.splice(idx, 1);
      this.updateUI();
    }
  }

  /**
   * Рассчитать стоимость продажи CLNDAI через AMM (с учётом slippage)
   * Это то, сколько DAI игрок получит, если продаст свои CLNDAI (если он ОДИН продаёт)
   */
  calculateRealSellValue(
    clndaiAmount,
    customPoolDai = null,
    customPoolClndai = null,
  ) {
    if (clndaiAmount <= 0) return 0;

    const poolDai = customPoolDai ?? this.poolDai;
    const poolClndai = customPoolClndai ?? this.poolClndai;
    const k = poolDai * poolClndai;

    // Формула AMM: (x - daiOut) * (y + clndaiIn) = k
    // daiOut = x - k / (y + clndaiIn)
    const newPoolClndai = poolClndai + clndaiAmount;
    const newPoolDai = k / newPoolClndai;
    const daiOutBeforeFee = poolDai - newPoolDai;

    // Вычитаем комиссию
    const fee = daiOutBeforeFee * (this.sellFee / 100);
    const daiOut = daiOutBeforeFee - fee;

    return { daiOut: Math.max(0, daiOut), newPoolDai, newPoolClndai };
  }

  /**
   * Рассчитать РЕАЛЬНЫЙ P/L если ВСЕ игроки одновременно продадут свои CLNDAI
   * Это честный расчёт - все влияют на цену
   */
  calculateAllSellResults() {
    // Симулируем последовательную продажу всех игроков
    // Порядок случайный - но это показывает реальность
    let simPoolDai = this.poolDai;
    let simPoolClndai = this.poolClndai;

    const results = [];

    // Сортируем по количеству CLNDAI (кто больше держит - продаёт первым)
    // Или можно сделать случайный порядок
    const playersWithClndai = this.players.filter((p) => p.clndai > 0);

    playersWithClndai.forEach((player) => {
      const sellResult = this.calculateRealSellValue(
        player.clndai,
        simPoolDai,
        simPoolClndai,
      );
      const totalDai = player.dai + sellResult.daiOut;
      const pl = totalDai - player.initialDai;

      results.push({
        id: player.id,
        name: player.name,
        clndaiSold: player.clndai,
        daiReceived: sellResult.daiOut,
        totalDai: totalDai,
        pl: pl,
      });

      // Обновляем симулируемый пул
      simPoolDai = sellResult.newPoolDai;
      simPoolClndai = sellResult.newPoolClndai;
    });

    // Добавляем игроков без CLNDAI
    this.players
      .filter((p) => p.clndai <= 0)
      .forEach((player) => {
        results.push({
          id: player.id,
          name: player.name,
          clndaiSold: 0,
          daiReceived: 0,
          totalDai: player.dai,
          pl: player.dai - player.initialDai,
        });
      });

    return results;
  }

  calculatePL(player) {
    // Индивидуальный P/L (если он один продаёт)
    const sellResult = this.calculateRealSellValue(player.clndai);
    const currentValue = player.dai + sellResult.daiOut;
    return currentValue - player.initialDai;
  }

  /**
   * РЕАЛЬНЫЙ P/L с учётом что все будут продавать
   */
  calculateRealPL(player) {
    const allResults = this.calculateAllSellResults();
    const result = allResults.find((r) => r.id === player.id);
    return result ? result.pl : 0;
  }

  // Теоретическая стоимость (по spot price, без slippage) - для сравнения
  calculateTheoreticalValue(player) {
    return player.dai + player.clndai * this.getPrice();
  }

  /**
   * Статистика пула (LP)
   */
  getPoolStats() {
    // Сколько DAI изменилось в пуле
    const daiChange = this.poolDai - this.initialPoolDai;
    const clndaiChange = this.poolClndai - this.initialPoolClndai;

    // Сумма начальных балансов игроков
    const totalInitialDai = this.players.reduce(
      (sum, p) => sum + p.initialDai,
      0,
    );

    // Текущий DAI игроков + то что они получат при продаже всех CLNDAI
    const allResults = this.calculateAllSellResults();
    const totalFinalDai = allResults.reduce((sum, r) => sum + r.totalDai, 0);

    // Реальный суммарный P/L
    const realTotalPL = totalFinalDai - totalInitialDai;

    return {
      daiChange,
      clndaiChange,
      totalInitialDai,
      totalFinalDai,
      realTotalPL,
    };
  }

  // Записать снимок P/L всех игроков на текущий день
  recordDailySnapshot() {
    // Получаем реальные результаты если все продадут
    const allSellResults = this.calculateAllSellResults();

    const snapshot = {
      day: this.currentDay,
      price: this.getPrice(),
      players: this.players.map((p) => {
        const realResult = allSellResults.find((r) => r.id === p.id);
        return {
          id: p.id,
          name: p.name,
          dai: p.dai,
          clndai: p.clndai,
          totalValue: p.dai + p.clndai * this.getPrice(),
          pl: realResult ? realResult.pl : this.calculatePL(p), // Реальный P/L если все продадут
        };
      }),
    };
    this.dailySnapshots.push(snapshot);
  }

  // ==================== СИМУЛЯЦИЯ ВРЕМЕНИ ====================

  stepDays(days) {
    for (let i = 0; i < days; i++) {
      this.currentDay++;
      this.simulateTrading();
      this.recordDailySnapshot();
    }
    this.updateUI();
  }

  simulateTrading() {
    // Перемешиваем игроков - порядок сделок случайный!
    // Кто первый продал - получил лучшую цену, остальные продают уже дешевле
    const shuffledPlayers = [...this.players].sort(() => Math.random() - 0.5);

    shuffledPlayers.forEach((player) => {
      if (Math.random() > player.tradeChance) return;

      // Решаем покупать или продавать
      const hasDai = player.dai > 10;
      const hasClndai = player.clndai > 0;

      if (hasDai && hasClndai) {
        // Случайно выбираем
        if (Math.random() > 0.5) {
          this.buyRandom(player);
        } else {
          this.sellRandom(player);
        }
      } else if (hasDai) {
        this.buyRandom(player);
      } else if (hasClndai) {
        this.sellRandom(player);
      }
    });
  }

  buyRandom(player) {
    const amount = player.dai * player.tradeSize * (0.5 + Math.random());
    if (amount < 1) return;
    this.executeBuy(player.id, Math.min(amount, player.dai * 0.9));
  }

  sellRandom(player) {
    const amount = player.clndai * player.tradeSize * (0.5 + Math.random());
    if (amount < 0.1) return;
    this.executeSell(player.id, Math.min(amount, player.clndai * 0.9));
  }

  // ==================== СБРОС ====================

  resetPool() {
    this.poolDai =
      parseFloat(document.getElementById("initDai").value) || 10000;
    this.poolClndai =
      parseFloat(document.getElementById("initClndai").value) || 100000;
    this.k = this.poolDai * this.poolClndai;
    this.initialPoolDai = this.poolDai;
    this.initialPoolClndai = this.poolClndai;
    this.updateUI();
  }

  resetAll() {
    this.poolDai =
      parseFloat(document.getElementById("initDai").value) || 10000;
    this.poolClndai =
      parseFloat(document.getElementById("initClndai").value) || 100000;
    this.k = this.poolDai * this.poolClndai;
    this.initialPoolDai = this.poolDai;
    this.initialPoolClndai = this.poolClndai;
    this.currentDay = 0;
    this.players = [];
    this.playerIdCounter = 0;
    this.trades = [];
    this.dailySnapshots = [];
    this.totalFees = 0;
    this.totalVolume = 0;

    this.addDefaultPlayer();
    this.updateUI();
  }

  // ==================== UI ====================

  updateUI() {
    // Пул
    document.getElementById("poolDai").textContent = this.poolDai.toFixed(2);
    document.getElementById("poolClndai").textContent =
      this.poolClndai.toFixed(2);
    document.getElementById("currentPrice").textContent =
      this.getPrice().toFixed(6);
    document.getElementById("constantK").textContent = this.k.toFixed(0);
    document.getElementById("currentDay").textContent = this.currentDay;

    // Статистика
    document.getElementById("totalFees").textContent =
      this.totalFees.toFixed(2);
    document.getElementById("totalTrades").textContent = this.trades.length;
    document.getElementById("totalVolume").textContent =
      this.totalVolume.toFixed(2);

    // РЕАЛЬНЫЙ суммарный P/L (если все продадут)
    const poolStats = this.getPoolStats();
    const totalPL = poolStats.realTotalPL;
    const totalPLEl = document.getElementById("totalPL");
    totalPLEl.textContent = (totalPL >= 0 ? "+" : "") + totalPL.toFixed(2);
    totalPLEl.className = "value " + (totalPL >= 0 ? "positive" : "negative");

    this.updatePlayersTable();
    this.updateTradesTable();
    this.updatePLHistoryTable();
  }

  updatePLHistoryTable() {
    const tbody = document.querySelector("#plHistoryTable tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    // Берём последние 30 снимков
    const snapshots = this.dailySnapshots.slice(-30);

    // Для каждого игрока - строка
    this.players.forEach((player) => {
      const row = document.createElement("tr");

      // Имя игрока
      let html = `<td><strong>${player.name}</strong></td>`;

      // Для каждого дня - P/L
      snapshots.forEach((snap) => {
        const playerSnap = snap.players.find((p) => p.id === player.id);
        if (playerSnap) {
          const pl = playerSnap.pl;
          const cls = pl >= 0 ? "positive" : "negative";
          html += `<td class="${cls}">${pl >= 0 ? "+" : ""}${pl.toFixed(0)}</td>`;
        } else {
          html += `<td>-</td>`;
        }
      });

      row.innerHTML = html;
      tbody.appendChild(row);
    });

    // Обновляем заголовки таблицы
    const thead = document.querySelector("#plHistoryTable thead tr");
    if (thead) {
      let headerHtml = "<th>Игрок</th>";
      snapshots.forEach((snap) => {
        headerHtml += `<th>Д${snap.day}</th>`;
      });
      thead.innerHTML = headerHtml;
    }
  }

  updatePlayersTable() {
    const tbody = document.querySelector("#playersTable tbody");
    tbody.innerHTML = "";

    // Получаем реальные результаты если все продадут
    const allSellResults = this.calculateAllSellResults();

    this.players.forEach((player) => {
      const individualPL = this.calculatePL(player); // P/L если он один продаёт
      const realResult = allSellResults.find((r) => r.id === player.id);
      const realPL = realResult ? realResult.pl : individualPL; // P/L если все продадут

      const theoreticalValue = player.clndai * this.getPrice(); // Теоретическая цена (spot)
      const sellResult = this.calculateRealSellValue(player.clndai);
      const realValue = sellResult.daiOut; // Реальная при продаже одного
      const slippage =
        theoreticalValue > 0
          ? ((theoreticalValue - realValue) / theoreticalValue) * 100
          : 0;

      const row = document.createElement("tr");
      row.innerHTML = `
        <td><strong>${player.name}</strong><br><small>${player.strategy}</small></td>
        <td>${player.dai.toFixed(2)}</td>
        <td>${player.clndai.toFixed(2)}<br><small>Slip: -${slippage.toFixed(1)}%</small></td>
        <td>${player.totalSpent.toFixed(2)}</td>
        <td>${player.totalReceived.toFixed(2)}</td>
        <td class="${individualPL >= 0 ? "positive" : "negative"}">${individualPL >= 0 ? "+" : ""}${individualPL.toFixed(0)}</td>
        <td class="${realPL >= 0 ? "positive" : "negative"}">${realPL >= 0 ? "+" : ""}${realPL.toFixed(0)}</td>
        <td>
          <button class="btn-sm buy" onclick="sim.promptBuy(${player.id})">Buy</button>
          <button class="btn-sm sell" onclick="sim.promptSell(${player.id})">Sell</button>
          <button class="btn-sm sell-all" onclick="sim.sellAll(${player.id})">Sell All</button>
          <button class="btn-sm remove" onclick="sim.removePlayer(${player.id})">x</button>
        </td>
      `;
      tbody.appendChild(row);
    });
  }

  updateTradesTable() {
    const tbody = document.querySelector("#tradesTable tbody");
    tbody.innerHTML = "";

    // Показываем последние 50 сделок
    const recentTrades = this.trades.slice(-50).reverse();

    recentTrades.forEach((trade) => {
      const row = document.createElement("tr");
      const isBuy = trade.type === "BUY";

      row.innerHTML = `
        <td>${trade.day}</td>
        <td>${trade.player}</td>
        <td class="${isBuy ? "positive" : "negative"}">${trade.type}</td>
        <td>${isBuy ? trade.amountIn.toFixed(2) + " DAI" : trade.amountIn.toFixed(2) + " CLNDAI"}</td>
        <td>${isBuy ? trade.amountOut.toFixed(2) + " CLNDAI" : trade.amountOut.toFixed(2) + " DAI"}</td>
        <td>${trade.price.toFixed(6)}</td>
        <td class="negative">${trade.fee.toFixed(4)}</td>
        <td>${trade.poolDai.toFixed(2)}</td>
        <td>${trade.poolClndai.toFixed(2)}</td>
      `;
      tbody.appendChild(row);
    });
  }

  promptBuy(playerId) {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return;

    const amount = prompt(
      `Сколько DAI потратить на покупку CLNDAI?\n(Доступно: ${player.dai.toFixed(2)} DAI)`,
      Math.floor(player.dai * 0.5),
    );
    if (amount === null) return;

    const daiAmount = parseFloat(amount);
    if (isNaN(daiAmount) || daiAmount <= 0) {
      alert("Неверная сумма");
      return;
    }
    if (daiAmount > player.dai) {
      alert("Недостаточно DAI");
      return;
    }

    this.executeBuy(playerId, daiAmount);
  }

  promptSell(playerId) {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return;

    const amount = prompt(
      `Сколько CLNDAI продать?\n(Доступно: ${player.clndai.toFixed(2)} CLNDAI)`,
      Math.floor(player.clndai * 0.5),
    );
    if (amount === null) return;

    const clndaiAmount = parseFloat(amount);
    if (isNaN(clndaiAmount) || clndaiAmount <= 0) {
      alert("Неверная сумма");
      return;
    }
    if (clndaiAmount > player.clndai) {
      alert("Недостаточно CLNDAI");
      return;
    }

    this.executeSell(playerId, clndaiAmount);
  }
}

// Глобальный экземпляр
const sim = new AMMSimulation();
