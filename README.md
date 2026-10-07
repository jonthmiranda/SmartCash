# 💰 SmartCash

Sistema de finanças pessoais que funciona direto no navegador, como um app (PWA). Seus dados ficam **somente no seu dispositivo** (IndexedDB) — sem servidor, sem cadastro.

## Funcionalidades

- 📊 **Dashboard** com resumo do mês e gráficos
- 📋 **Contas** fixas e parceladas, com **dia de vencimento** e indicação de situação (paga, vence hoje, vence amanhã, atrasada)
- 💳 **Dívidas** com projeção de juros
- 🏦 **Patrimônio**: reservas e investimentos
- 📅 **Planejamento semanal** de gastos
- 🔔 **Lembretes** de vencimento um dia antes
- 📲 **Instalável** no celular ou computador, com uso offline
- 💾 Backup e exportação em JSON/CSV

## Tecnologias

HTML5, CSS3, JavaScript puro, IndexedDB, Service Worker e [Chart.js](https://www.chartjs.org/).

## Como executar

O app precisa ser servido por HTTP(S) (o service worker não funciona abrindo o arquivo direto).

```bash
# dentro da pasta do projeto
python3 -m http.server 8000
# abra http://localhost:8000
```

Para usar no celular, publique em qualquer hospedagem HTTPS estática (GitHub Pages, Netlify, Vercel etc.).

## Instalar como aplicativo

Em **Configurações → 📲 Aplicativo**, toque em **Instalar aplicativo**.

- **Android / Chrome / Edge:** instala com um clique.
- **iPhone / iPad:** no Safari, toque em Compartilhar → *Adicionar à Tela de Início*.

## Lembretes de vencimento

1. Cadastre cada conta com o **Dia do Vencimento** (1–31). Em meses mais curtos, vence no último dia do mês.
2. Em **Configurações → 🔔 Lembretes de Vencimento**, ative a opção e permita as notificações.
3. Você recebe um aviso **um dia antes** de cada conta ainda não paga. Contas já pagas no mês não geram aviso.

> **Importante:** como o SmartCash não tem servidor, os avisos são gerados no próprio dispositivo. Eles são conferidos ao abrir o app e, com o app instalado no Chrome/Edge (Android e desktop), também em segundo plano — nesse caso o navegador decide o horário exato da verificação. No iPhone, o app precisa estar instalado na Tela de Início e a verificação ocorre ao abri-lo.

## Estrutura

```
index.html            # telas e modais
manifest.json         # configuração do PWA
service-worker.js     # cache offline e notificações
css/style.css
js/
  db.js               # IndexedDB
  vencimentos.js      # datas de vencimento e lembretes
  app.js              # navegação, tema, instalação do PWA
  dashboard.js  contas.js  dividas.js
  patrimonio.js  planejamento.js  configuracoes.js
assets/icons/         # ícones do app
```

## Licença

Uso pessoal. Defina a licença que preferir antes de publicar.
