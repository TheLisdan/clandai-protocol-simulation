/**
 * ONCLND / CLNDAI Protocol Simulation
 *
 * Формулы:
 * - Депозит: ONCLND_locked = DAI_in × 0.95 (5% комиссия)
 * - Рейтинг: R_i = 1 + (CLNDAI_game_i / D_i)
 * - Вывод: Вывод_i = P × (D_i × R_i) / Σ(D_j × R_j)
 */

class ProtocolSimulation {
  constructor() {
    // Константы протокола
    this.DEPOSIT_FEE = 0.05; // 5% комиссия при входе

    // Состояние симуляции
    this.currentPeriod = 0;
    this.activePlayers = [];
    this.exitedPlayers = [];
    this.history = [];
    this.playerIdCounter = 0;
    this.selectedPeriods = 1; // Выбранный период для симуляции

    // Периоды для сравнения
    this.periodLabels = [
      { days: 1, label: "1 день" },
      { days: 7, label: "1 неделя" },
      { days: 30, label: "1 месяц" },
      { days: 90, label: "3 месяца" },
      { days: 180, label: "6 месяцев" },
      { days: 365, label: "1 год" },
    ];

    // Статистика
    this.totalDepositsDAI = 0;
    this.totalFees = 0;
    this.totalClndaiFarmed = 0;
    this.totalClndaiFree = 0;

    this.init();
  }

  init() {
    this.bindEvents();
    this.updateUI();
    // Автозагрузка пресета при старте
    this.loadAutoPreset();
  }

  bindEvents() {
    document
      .getElementById("runSimulation")
      .addEventListener("click", () => this.runFullSimulation());
    document
      .getElementById("resetSimulation")
      .addEventListener("click", () => this.reset());
    document
      .getElementById("stepSimulation")
      .addEventListener("click", () => this.stepPeriod());
    document
      .getElementById("addPlayer")
      .addEventListener("click", () => this.addPlayerFromForm());
    document
      .getElementById("clndaiPrice")
      .addEventListener("change", () => this.updateExitedPlayersTable());

    // Сценарии
    document
      .getElementById("scenario1")
      .addEventListener("click", () => this.loadScenario1());
    document
      .getElementById("scenario2")
      .addEventListener("click", () => this.loadScenario2());
    document
      .getElementById("scenario3")
      .addEventListener("click", () => this.loadScenario3());
    document
      .getElementById("scenario4")
      .addEventListener("click", () => this.loadScenario4());

    // Time tabs
    document.querySelectorAll(".time-tab").forEach((tab) => {
      tab.addEventListener("click", (e) => this.selectPeriod(e.target));
    });
  }

  selectPeriod(tab) {
    document
      .querySelectorAll(".time-tab")
      .forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    this.selectedPeriods = parseInt(tab.dataset.periods);
    document.getElementById("selectedPeriod").textContent = tab.textContent;
  }

  // ==================== ОСНОВНЫЕ ФОРМУЛЫ ====================

  /**
   * Расчёт комиссии и чистого депозита
   * @param {number} daiIn - Входящие DAI
   * @returns {object} { fee, netDeposit }
   */
  calculateDeposit(daiIn) {
    const fee = daiIn * this.DEPOSIT_FEE;
    const netDeposit = daiIn - fee;
    return { fee, netDeposit };
  }

  /**
   * Расчёт рейтинга игрока
   * R_i = 1 + (CLNDAI_game_i / D_i)
   * @param {object} player
   * @returns {number} R_i
   */
  calculateRating(player) {
    if (player.deposit <= 0) return 1;
    return 1 + player.clndaiGame / player.deposit;
  }

  /**
   * Эффективный рейтинг D_i × R_i
   * @param {object} player
   * @returns {number}
   */
  calculateEffectiveRating(player) {
    return player.deposit * this.calculateRating(player);
  }

  /**
   * Общий пул P = Σ(D_i)
   * @returns {number}
   */
  calculateTotalPool() {
    return this.activePlayers.reduce((sum, p) => sum + p.deposit, 0);
  }

  /**
   * Сумма эффективных рейтингов Σ(D_j × R_j)
   * @returns {number}
   */
  calculateTotalEffectiveRating() {
    return this.activePlayers.reduce(
      (sum, p) => sum + this.calculateEffectiveRating(p),
      0,
    );
  }

  /**
   * Расчёт вывода игрока
   * Вывод_i = P × (D_i × R_i) / Σ(D_j × R_j)
   * @param {object} player
   * @returns {number}
   */
  calculateWithdrawal(player) {
    const pool = this.calculateTotalPool();
    const totalEffectiveRating = this.calculateTotalEffectiveRating();

    if (totalEffectiveRating === 0) return 0;

    const effectiveRating = this.calculateEffectiveRating(player);
    return (pool * effectiveRating) / totalEffectiveRating;
  }

  /**
   * Доля игрока в пуле (%)
   * @param {object} player
   * @returns {number}
   */
  calculatePoolShare(player) {
    const totalEffectiveRating = this.calculateTotalEffectiveRating();
    if (totalEffectiveRating === 0) return 0;

    const effectiveRating = this.calculateEffectiveRating(player);
    return (effectiveRating / totalEffectiveRating) * 100;
  }

  // ==================== ДЕЙСТВИЯ ====================

  /**
   * Добавление игрока в игру
   */
  addPlayer(name, daiDeposit, farmRate = 0) {
    const { fee, netDeposit } = this.calculateDeposit(daiDeposit);

    const player = {
      id: ++this.playerIdCounter,
      name: name,
      daiDeposited: daiDeposit,
      fee: fee,
      deposit: netDeposit, // D_i в ONCLND
      clndaiGame: 0, // CLNDAI_game
      farmRate: farmRate, // CLNDAI за период
      entryPeriod: this.currentPeriod,
      isActive: true,
    };

    this.activePlayers.push(player);

    // Обновляем статистику
    this.totalDepositsDAI += daiDeposit;
    this.totalFees += fee;

    this.recordEvent(
      `${name} вошёл в игру. DAI: ${daiDeposit}, ONCLND: ${netDeposit.toFixed(2)}`,
    );
    this.updateUI();

    return player;
  }

  /**
   * Добавление игрока из формы
   */
  addPlayerFromForm() {
    const nameInput = document.getElementById("playerName");
    const depositInput = document.getElementById("playerDeposit");
    const farmRateInput = document.getElementById("playerFarmRate");

    const name = nameInput.value.trim() || `Игрок ${this.playerIdCounter + 1}`;
    const deposit = parseFloat(depositInput.value) || 0;
    const farmRate = parseFloat(farmRateInput.value) || 0;

    if (deposit <= 0) {
      alert("Депозит должен быть больше 0");
      return;
    }

    this.addPlayer(name, deposit, farmRate);

    // Очищаем форму
    nameInput.value = "";
    depositInput.value = "";
    farmRateInput.value = "";
  }

  /**
   * Фарм CLNDAI для игрока
   */
  farmClndai(playerId, amount) {
    const player = this.activePlayers.find((p) => p.id === playerId);
    if (!player) return;

    player.clndaiGame += amount;
    this.totalClndaiFarmed += amount;

    this.updateUI();
  }

  /**
   * Выход игрока из игры
   */
  exitPlayer(playerId) {
    const playerIndex = this.activePlayers.findIndex((p) => p.id === playerId);
    if (playerIndex === -1) return;

    const player = this.activePlayers[playerIndex];

    // Расчёт вывода
    const withdrawal = this.calculateWithdrawal(player);
    const rating = this.calculateRating(player);

    // P/L по ONCLND
    const profitLossOnclnd = withdrawal - player.deposit;

    // Создаём запись о выходе
    const exitRecord = {
      ...player,
      exitPeriod: this.currentPeriod,
      periodsInGame: this.currentPeriod - player.entryPeriod,
      ratingAtExit: rating,
      clndaiAtExit: player.clndaiGame,
      withdrawalOnclnd: withdrawal,
      withdrawalDai: withdrawal, // 1:1 курс ONCLND к DAI
      clndaiFree: player.clndaiGame, // После выхода CLNDAI становится свободным
      profitLossOnclnd: profitLossOnclnd,
      isActive: false,
    };

    // Убираем из активных
    this.activePlayers.splice(playerIndex, 1);

    // Добавляем в вышедших
    this.exitedPlayers.push(exitRecord);

    // Обновляем статистику
    this.totalClndaiFree += player.clndaiGame;

    this.recordEvent(
      `${player.name} вышел из игры. Получил: ${withdrawal.toFixed(2)} ONCLND, ${player.clndaiGame.toFixed(2)} CLNDAI_free`,
    );
    this.updateUI();

    return exitRecord;
  }

  /**
   * Шаг времени (период)
   */
  stepPeriod() {
    this.currentPeriod++;

    // Автоматический фарм CLNDAI для всех активных игроков
    this.activePlayers.forEach((player) => {
      if (player.farmRate > 0) {
        player.clndaiGame += player.farmRate;
        this.totalClndaiFarmed += player.farmRate;
      }
    });

    // Записываем состояние в историю
    this.recordHistory();
    this.updateUI();
  }

  /**
   * Запуск симуляции на выбранное количество периодов
   */
  runFullSimulation() {
    for (let i = 0; i < this.selectedPeriods; i++) {
      this.stepPeriod();
    }
  }

  /**
   * Сброс симуляции
   */
  reset() {
    this.currentPeriod = 0;
    this.activePlayers = [];
    this.exitedPlayers = [];
    this.history = [];
    this.playerIdCounter = 0;
    this.totalDepositsDAI = 0;
    this.totalFees = 0;
    this.totalClndaiFarmed = 0;
    this.totalClndaiFree = 0;

    this.updateUI();
  }

  // ==================== ИСТОРИЯ ====================

  recordEvent(event) {
    const lastHistory = this.history[this.history.length - 1];
    if (lastHistory && lastHistory.period === this.currentPeriod) {
      lastHistory.events.push(event);
    } else {
      this.history.push({
        period: this.currentPeriod,
        activePlayers: this.activePlayers.length,
        totalPool: this.calculateTotalPool(),
        totalEffectiveRating: this.calculateTotalEffectiveRating(),
        events: [event],
      });
    }
  }

  recordHistory() {
    const existing = this.history.find((h) => h.period === this.currentPeriod);
    if (existing) {
      existing.activePlayers = this.activePlayers.length;
      existing.totalPool = this.calculateTotalPool();
      existing.totalEffectiveRating = this.calculateTotalEffectiveRating();
    } else {
      this.history.push({
        period: this.currentPeriod,
        activePlayers: this.activePlayers.length,
        totalPool: this.calculateTotalPool(),
        totalEffectiveRating: this.calculateTotalEffectiveRating(),
        events: [`Период ${this.currentPeriod}`],
      });
    }
  }

  // ==================== СЦЕНАРИИ ====================

  loadScenario1() {
    this.reset();

    // Базовый сценарий из документации
    this.addPlayer("Вася", 1052.63, 12); // После 5% будет ~1000
    this.addPlayer("Дима", 2105.26, 48); // После 5% будет ~2000
    this.addPlayer("Олег", 7368.42, 56); // После 5% будет ~7000
    this.addPlayer("Новый", 10526.32, 35); // После 5% будет ~10000

    // Запускаем 10 периодов
    for (let i = 0; i < 10; i++) {
      this.stepPeriod();
    }

    this.recordEvent(
      "Загружен сценарий 1: Базовый (4 игрока с разными депозитами и скоростями фарма)",
    );
  }

  loadScenario2() {
    this.reset();

    // Сценарий с поздним входом
    this.addPlayer("Ранний_1", 5000, 20);
    this.addPlayer("Ранний_2", 3000, 15);

    // 5 периодов
    for (let i = 0; i < 5; i++) {
      this.stepPeriod();
    }

    // Новый игрок входит позже
    this.addPlayer("Поздний", 10000, 50);

    // Ещё 5 периодов
    for (let i = 0; i < 5; i++) {
      this.stepPeriod();
    }

    // Ранний_1 выходит
    const player = this.activePlayers.find((p) => p.name === "Ранний_1");
    if (player) this.exitPlayer(player.id);

    this.recordEvent(
      "Загружен сценарий 2: Поздний вход (демонстрация влияния времени входа)",
    );
  }

  loadScenario3() {
    this.reset();

    // Сценарий с разными скоростями фарма
    this.addPlayer("Активный", 2000, 100); // Много фармит
    this.addPlayer("Средний", 2000, 30);
    this.addPlayer("Пассивный", 2000, 5); // Почти не фармит
    this.addPlayer("Нулевой", 2000, 0); // Вообще не фармит

    // 10 периодов
    for (let i = 0; i < 10; i++) {
      this.stepPeriod();
    }

    // Все выходят для сравнения
    const players = [...this.activePlayers];
    players.forEach((p) => this.exitPlayer(p.id));

    this.recordEvent(
      "Загружен сценарий 3: Разные скорости фарма (сравнение активности)",
    );
  }

  loadScenario4() {
    this.reset();

    // Реалистичный сценарий с 10 игроками
    // Разные типы игроков: киты, средние, мелкие
    this.addPlayer("Кит_Алекс", 50000, 150); // Крупный игрок, активный фармер
    this.addPlayer("Кит_Борис", 40000, 80); // Крупный, средний фармер
    this.addPlayer("Средний_Вика", 10000, 45);
    this.addPlayer("Средний_Гена", 8000, 60);
    this.addPlayer("Средний_Даша", 12000, 35);
    this.addPlayer("Малый_Евген", 2000, 25);
    this.addPlayer("Малый_Женя", 1500, 15);
    this.addPlayer("Малый_Зина", 3000, 40); // Мелкий но активный
    this.addPlayer("Пассив_Игорь", 5000, 2); // Почти не фармит
    this.addPlayer("Новичок_Катя", 1000, 10);

    // Симулируем 30 дней (месяц)
    for (let i = 0; i < 30; i++) {
      this.stepPeriod();
    }

    this.recordEvent(
      "Загружен сценарий 4: Реалистичный (10 игроков разных типов, 30 дней)",
    );
  }

  /**
   * Автоматическая загрузка пресета при старте
   */
  loadAutoPreset() {
    // Загружаем игроков сразу
    this.addPlayer("Вася", 1052.63, 12);
    this.addPlayer("Дима", 2105.26, 48);
    this.addPlayer("Олег", 7368.42, 56);
    this.addPlayer("Новый", 10526.32, 35);
    this.addPlayer("Маша", 3000, 25);
    this.addPlayer("Петя", 5000, 40);

    // Симулируем разные периоды и сохраняем результаты
    this.generatePeriodComparison();
  }

  /**
   * Генерация сравнительной таблицы по периодам
   */
  generatePeriodComparison() {
    const container = document.getElementById("periodComparisonContainer");
    if (!container) return;

    // Сохраняем текущее состояние
    const savedState = JSON.stringify({
      activePlayers: this.activePlayers,
      currentPeriod: this.currentPeriod,
      totalClndaiFarmed: this.totalClndaiFarmed,
    });

    const clndaiPrice =
      parseFloat(document.getElementById("clndaiPrice")?.value) || 0.1;
    const results = [];

    // Для каждого периода делаем симуляцию
    this.periodLabels.forEach((period) => {
      // Сбрасываем к начальному состоянию
      const state = JSON.parse(savedState);

      // Симулируем клонов игроков
      const simPlayers = state.activePlayers.map((p) => ({
        ...p,
        clndaiGame: 0,
      }));

      // Симулируем период
      const periodResults = [];
      simPlayers.forEach((player) => {
        const clndaiEarned = player.farmRate * period.days;
        const rating = 1 + clndaiEarned / player.deposit;

        // Рассчитываем эффективные рейтинги всех
        let totalEffective = 0;
        simPlayers.forEach((p) => {
          const pClndai = p.farmRate * period.days;
          const pRating = 1 + pClndai / p.deposit;
          totalEffective += p.deposit * pRating;
        });

        const pool = simPlayers.reduce((s, p) => s + p.deposit, 0);
        const effectiveRating = player.deposit * rating;
        const withdrawal = (pool * effectiveRating) / totalEffective;
        const profitLossOnclnd = withdrawal - player.deposit;
        const clndaiValue = clndaiEarned * clndaiPrice;
        const totalPL = profitLossOnclnd + clndaiValue;

        periodResults.push({
          name: player.name,
          deposit: player.deposit,
          daiDeposited: player.daiDeposited,
          clndaiEarned,
          rating,
          withdrawal,
          profitLossOnclnd,
          clndaiValue,
          totalPL,
        });
      });

      results.push({
        period: period.label,
        days: period.days,
        players: periodResults,
      });
    });

    // Строим таблицу
    let html =
      '<table class="comparison-table"><thead><tr><th>Игрок</th><th>D_i (ONCLND)</th>';
    this.periodLabels.forEach((p) => {
      html += `<th colspan="3">${p.label}</th>`;
    });
    html += "</tr><tr><th></th><th></th>";
    this.periodLabels.forEach(() => {
      html += "<th>CLNDAI</th><th>P/L ONCLND</th><th>Общий P/L</th>";
    });
    html += "</tr></thead><tbody>";

    // Для каждого игрока
    if (results.length > 0 && results[0].players.length > 0) {
      results[0].players.forEach((player, idx) => {
        html += `<tr><td><strong>${player.name}</strong></td><td>${player.deposit.toFixed(2)}</td>`;

        results.forEach((periodResult) => {
          const p = periodResult.players[idx];
          const plClass = p.profitLossOnclnd >= 0 ? "positive" : "negative";
          const totalClass = p.totalPL >= 0 ? "positive" : "negative";

          html += `<td class="positive">${p.clndaiEarned.toFixed(1)}</td>`;
          html += `<td class="${plClass}">${p.profitLossOnclnd >= 0 ? "+" : ""}${p.profitLossOnclnd.toFixed(2)}</td>`;
          html += `<td class="${totalClass}">${p.totalPL >= 0 ? "+" : ""}${p.totalPL.toFixed(2)}</td>`;
        });

        html += "</tr>";
      });
    }

    html += "</tbody></table>";
    container.innerHTML = html;
  }

  // ==================== UI ОБНОВЛЕНИЕ ====================

  updateUI() {
    this.updateActivePlayersTable();
    this.updateExitedPlayersTable();
    this.updateHistoryTable();
    this.updateStats();
    this.generatePeriodComparison();

    document.getElementById("currentPeriod").textContent = this.currentPeriod;
    document.getElementById("totalPool").textContent =
      this.calculateTotalPool().toFixed(2);
  }

  updateActivePlayersTable() {
    const tbody = document.querySelector("#activePlayersTable tbody");
    tbody.innerHTML = "";

    this.activePlayers.forEach((player) => {
      const rating = this.calculateRating(player);
      const effectiveRating = this.calculateEffectiveRating(player);
      const poolShare = this.calculatePoolShare(player);
      const potentialWithdrawal = this.calculateWithdrawal(player);
      const profitLoss = potentialWithdrawal - player.deposit;

      const row = document.createElement("tr");
      row.innerHTML = `
                <td><strong>${player.name}</strong></td>
                <td>${player.entryPeriod}</td>
                <td>${player.daiDeposited.toFixed(2)}</td>
                <td class="negative">-${player.fee.toFixed(2)}</td>
                <td>${player.deposit.toFixed(2)}</td>
                <td class="positive">${player.clndaiGame.toFixed(2)}</td>
                <td class="neutral">${rating.toFixed(4)}</td>
                <td>${effectiveRating.toFixed(2)}</td>
                <td>${poolShare.toFixed(2)}%</td>
                <td class="${profitLoss >= 0 ? "positive" : "negative"}">${potentialWithdrawal.toFixed(2)}</td>
                <td>
                    <button class="action-btn farm" onclick="simulation.farmClndai(${player.id}, 10)">+10 CLNDAI</button>
                    <button class="action-btn exit" onclick="simulation.exitPlayer(${player.id})">Выйти</button>
                </td>
            `;
      tbody.appendChild(row);
    });
  }

  updateExitedPlayersTable() {
    const tbody = document.querySelector("#exitedPlayersTable tbody");
    const clndaiPrice =
      parseFloat(document.getElementById("clndaiPrice").value) || 0.1;
    tbody.innerHTML = "";

    this.exitedPlayers.forEach((player) => {
      // Расчёт общего P/L с учётом CLNDAI
      const clndaiValue = player.clndaiFree * clndaiPrice;
      const totalProfitLoss = player.profitLossOnclnd + clndaiValue;

      const row = document.createElement("tr");
      row.innerHTML = `
                <td><strong>${player.name}</strong></td>
                <td>${player.entryPeriod}</td>
                <td>${player.exitPeriod}</td>
                <td>${player.periodsInGame}</td>
                <td>${player.daiDeposited.toFixed(2)}</td>
                <td>${player.deposit.toFixed(2)}</td>
                <td>${player.clndaiAtExit.toFixed(2)}</td>
                <td class="neutral">${player.ratingAtExit.toFixed(4)}</td>
                <td>${player.withdrawalOnclnd.toFixed(2)}</td>
                <td>${player.withdrawalDai.toFixed(2)}</td>
                <td class="positive">${player.clndaiFree.toFixed(2)}</td>
                <td class="${player.profitLossOnclnd >= 0 ? "positive" : "negative"}">
                    ${player.profitLossOnclnd >= 0 ? "+" : ""}${player.profitLossOnclnd.toFixed(2)}
                </td>
                <td class="${totalProfitLoss >= 0 ? "positive" : "negative"}">
                    ${totalProfitLoss >= 0 ? "+" : ""}${totalProfitLoss.toFixed(2)}
                    <br><small>(CLNDAI: +${clndaiValue.toFixed(2)})</small>
                </td>
            `;
      tbody.appendChild(row);
    });
  }

  updateHistoryTable() {
    const tbody = document.querySelector("#historyTable tbody");
    tbody.innerHTML = "";

    this.history.slice(-20).forEach((record) => {
      const row = document.createElement("tr");
      row.innerHTML = `
                <td>${record.period}</td>
                <td>${record.activePlayers}</td>
                <td>${record.totalPool.toFixed(2)}</td>
                <td>${record.totalEffectiveRating.toFixed(2)}</td>
                <td style="text-align: left; font-size: 0.85em">${record.events.join("<br>")}</td>
            `;
      tbody.appendChild(row);
    });
  }

  updateStats() {
    document.getElementById("totalDeposits").textContent =
      this.totalDepositsDAI.toFixed(2) + " DAI";
    document.getElementById("totalFees").textContent =
      this.totalFees.toFixed(2) + " DAI";
    document.getElementById("totalClndaiFarmed").textContent =
      this.totalClndaiFarmed.toFixed(2);
    document.getElementById("totalClndaiFree").textContent =
      this.totalClndaiFree.toFixed(2);
  }
}

// Создаём глобальный экземпляр симуляции
const simulation = new ProtocolSimulation();
