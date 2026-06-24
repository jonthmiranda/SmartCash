/**
 * SmartCash — dashboard.js
 * Tela 1: Dashboard
 * -----------------------------------------------
 * Renderiza os cards de resumo financeiro e os três
 * gráficos do dashboard (pizza, barras, linha).
 */

'use strict';

// Instâncias dos gráficos Chart.js (mantidas para destruição antes de recrear)
let _chartPizza  = null;
let _chartBarras = null;
let _chartLinha  = null;

// ============================================================
// RENDER PRINCIPAL
// ============================================================

/**
 * Renderiza toda a tela do Dashboard.
 * Carrega dados do banco e atualiza cards + gráficos.
 */
async function renderDashboard() {
  try {
    const mes    = getCurrentMonth();
    const config = AppState.config;

    // Carrega dados em paralelo para melhor performance
    const [contas, pagamentos, gastos, reservas, investimentos] = await Promise.all([
      dbGetAll('contas'),
      dbGetPagamentosPorMes(mes),
      dbGetGastosPorMes(mes),
      dbGetAll('reservas'),
      dbGetAll('investimentos')
    ]);

    // ── Cálculos ────────────────────────────────────────────

    const salario      = config.salarioMensal || 0;
    const contasAtivas = contas.filter(c => c.ativa);

    // Total das parcelas das contas ativas no mês
    const totalContas = contasAtivas.reduce((s, c) => s + (c.valorParcela || 0), 0);

    // Total efetivamente pago no mês (via pagamentos registrados)
    const totalPago = pagamentos.reduce((s, p) => s + (p.valorPago || 0), 0);

    // Total de gastos do mês
    const totalGastos = gastos.reduce((s, g) => s + (g.valor || 0), 0);

    // Total guardado em reservas no mês
    const reservasMes   = reservas.filter(r => r.mesReferencia === mes);
    const totalGuardado = reservasMes.reduce((s, r) => s + (r.valorGuardado || 0), 0);

    // Saldo disponível = Salário − Contas Pagas − Gastos − Guardado
    const saldoDisponivel = salario - totalPago - totalGastos - totalGuardado;

    // ── Atualiza Cards ───────────────────────────────────────

    setEl('dashSalario',  formatCurrency(salario));
    setEl('dashContas',   formatCurrency(totalContas));
    setEl('dashGastos',   formatCurrency(totalGastos));
    setEl('dashGuardado', formatCurrency(totalGuardado));

    const saldoEl = document.getElementById('dashSaldo');
    if (saldoEl) {
      saldoEl.textContent = formatCurrency(saldoDisponivel);
      saldoEl.className   = 'card-value ' + (saldoDisponivel < 0 ? 'text-danger' : 'text-success');
    }

    // Mês no cabeçalho do dashboard
    setEl('dashboardMonth', formatMonth(mes));

    // ── Gráficos ─────────────────────────────────────────────

    renderChartPizza(gastos);
    renderChartBarras(gastos);
    await renderChartLinha(reservas, investimentos);

  } catch (err) {
    console.error('[Dashboard] Erro:', err);
    showToast('Erro ao carregar o dashboard.', 'error');
  }
}

// ============================================================
// HELPERS
// ============================================================

/** Define o texto de um elemento pelo ID (sem lançar se não existir). */
function setEl(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/** Retorna a cor do texto dos gráficos conforme o tema atual. */
function chartTextColor() {
  return document.documentElement.getAttribute('data-theme') === 'dark'
    ? '#94a3b8' : '#64748b';
}

/** Retorna a cor da grade dos gráficos conforme o tema atual. */
function chartGridColor() {
  return document.documentElement.getAttribute('data-theme') === 'dark'
    ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
}

/** Paleta de cores para gráficos */
const CHART_COLORS = [
  '#4f6ef7','#ef4444','#10b981','#f59e0b','#8b5cf6',
  '#ec4899','#06b6d4','#84cc16','#f97316','#6366f1'
];

// ============================================================
// GRÁFICO: PIZZA — Gastos por Categoria
// ============================================================

/**
 * Renderiza o gráfico de rosca com gastos por categoria.
 * @param {Array} gastos  Lista de gastos do mês
 */
function renderChartPizza(gastos) {
  const canvas = document.getElementById('chartPizza');
  if (!canvas) return;

  // Destrói instância anterior para evitar memory leak
  if (_chartPizza) { _chartPizza.destroy(); _chartPizza = null; }

  // Agrupa por categoria
  const porCategoria = {};
  gastos.forEach(g => {
    const cat = g.categoria || 'Outros';
    porCategoria[cat] = (porCategoria[cat] || 0) + (g.valor || 0);
  });

  const labels = Object.keys(porCategoria);
  const data   = Object.values(porCategoria);

  if (labels.length === 0) {
    canvas.parentElement.innerHTML =
      '<div class="chart-empty">Nenhum gasto lançado este mês</div>';
    return;
  }

  _chartPizza = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: CHART_COLORS.slice(0, labels.length),
        borderWidth:     0,
        hoverOffset:     6
      }]
    },
    options: {
      responsive:          true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color:     chartTextColor(),
            padding:   10,
            font:      { size: 11 },
            boxWidth:  12
          }
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${formatCurrency(ctx.parsed)}`
          }
        }
      }
    }
  });
}

// ============================================================
// GRÁFICO: BARRAS — Gastos Semanais
// ============================================================

/**
 * Renderiza o gráfico de barras com gastos por semana.
 * @param {Array} gastos  Lista de gastos do mês
 */
function renderChartBarras(gastos) {
  const canvas = document.getElementById('chartBarras');
  if (!canvas) return;

  if (_chartBarras) { _chartBarras.destroy(); _chartBarras = null; }

  // Soma por semana (1 a 5)
  const porSemana = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  gastos.forEach(g => {
    const sem = parseInt(g.semana, 10) || getWeekOfMonth(g.data);
    if (sem >= 1 && sem <= 5) porSemana[sem] += (g.valor || 0);
  });

  _chartBarras = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: ['Sem. 1', 'Sem. 2', 'Sem. 3', 'Sem. 4', 'Sem. 5'],
      datasets: [{
        label:           'Gastos',
        data:            Object.values(porSemana),
        backgroundColor: '#4f6ef7',
        borderRadius:    6,
        borderSkipped:   false
      }]
    },
    options: {
      responsive:          true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${formatCurrency(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: chartTextColor(), font: { size: 11 } },
          grid:  { display: false }
        },
        y: {
          ticks: {
            color:    chartTextColor(),
            font:     { size: 11 },
            callback: val => `R$ ${val}`
          },
          grid: { color: chartGridColor() },
          beginAtZero: true
        }
      }
    }
  });
}

// ============================================================
// GRÁFICO: LINHA — Evolução do Patrimônio
// ============================================================

/**
 * Renderiza o gráfico de linha com evolução do patrimônio
 * nos últimos 6 meses (reservas acumuladas + investimentos).
 * @param {Array} reservas      Todas as reservas
 * @param {Array} investimentos Todos os investimentos
 */
async function renderChartLinha(reservas, investimentos) {
  const canvas = document.getElementById('chartLinha');
  if (!canvas) return;

  if (_chartLinha) { _chartLinha.destroy(); _chartLinha = null; }

  const now        = new Date();
  const labels     = [];
  const dadosReserva = [];
  const dadosInvest  = [];

  // Gera dados dos últimos 6 meses (do mais antigo ao mais recente)
  for (let i = 5; i >= 0; i--) {
    const d      = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mesStr = toMonthString(d);
    labels.push(formatMonth(mesStr).replace('/', '\n'));

    // Reserva acumulada ATÉ este mês
    const reservaAcum = reservas
      .filter(r => r.mesReferencia <= mesStr)
      .reduce((s, r) => s + (r.valorGuardado || 0), 0);
    dadosReserva.push(reservaAcum);

    // Investimentos projetados até este mês (meses decorridos desde início)
    const mesesDecorridos = 6 - i;
    const totalInvest = investimentos.reduce((s, inv) => {
      return s + calcValorFuturoComAportes(
        inv.saldoInicial       || 0,
        inv.aporteMensal       || 0,
        inv.rentabilidadeMensal || 0,
        mesesDecorridos
      );
    }, 0);
    dadosInvest.push(totalInvest);
  }

  _chartLinha = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label:           'Reservas',
          data:            dadosReserva,
          borderColor:     '#10b981',
          backgroundColor: 'rgba(16,185,129,0.1)',
          tension:         0.4,
          fill:            true,
          pointRadius:     5,
          pointHoverRadius:7
        },
        {
          label:           'Investimentos',
          data:            dadosInvest,
          borderColor:     '#4f6ef7',
          backgroundColor: 'rgba(79,110,247,0.1)',
          tension:         0.4,
          fill:            true,
          pointRadius:     5,
          pointHoverRadius:7
        }
      ]
    },
    options: {
      responsive:          true,
      maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: {
            color:    chartTextColor(),
            font:     { size: 11 },
            boxWidth: 12
          }
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: chartTextColor(), font: { size: 11 } },
          grid:  { color: chartGridColor() }
        },
        y: {
          ticks: {
            color:    chartTextColor(),
            font:     { size: 11 },
            callback: val => `R$ ${Number(val).toFixed(0)}`
          },
          grid:        { color: chartGridColor() },
          beginAtZero: true
        }
      }
    }
  });
}

/** Necessário para o gráfico de linha usar toMonthString */
function toMonthString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
