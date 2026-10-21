# Tibia Diary

Registro de caçadas do Tibia: cole o report do **Hunt Analyzer** e cada caçada vira uma
caixa no estilo da janela do client do Tibia.

## Testar no navegador

**Opção 1 — servidor local (recomendado)**

```bash
node serve.cjs          # abre em http://localhost:8000
node serve.cjs 3000     # usa outra porta
```

`serve.cjs` é só de desenvolvimento e não é publicado. Ele envia `Cache-Control: no-store`,
então qualquer alteração que você faça no `app.js`, `core.js` ou `styles.css` aparece
na hora ao recarregar a página (F5).

**Opção 2 — abrir o arquivo direto**

Dê duplo clique em `index.html`. Funciona no Chrome, Edge e Firefox (o `localStorage` é
compartilhado entre os arquivos `file://`). No Safari o armazenamento local é bloqueado e
o site avisa que os dados não puderam ser lidos.

**Opção 3 — publicar**

O `.github/workflows/pages.yml` roda os testes e publica no GitHub Pages a cada `push`
na branch `main`.

## Como usar

1. **Cole o report com `Ctrl+V` em qualquer lugar da página.** Não há campo de texto: o
   app reconhece o formato do Hunt Analyzer e salva sozinho, avisando no rodapé da tela.
   Colar texto que não é um report mostra o erro do que está errado.
2. **Cada caçada vira uma caixa**, com os números do report, as moedas, o `Balance` em
   verde e as seções `Killed Monsters` / `Looted Items`.
3. **Você pode colar quantas caçadas quiser.** As caixas do dia selecionado ficam na tela.
   O botão **Week** abre a semana e o **Month** abre o mês: cada dia aparece só com a data
   e o **saldo final** (balance do analyzer − despesas do dia). Clicar numa data abre o
   **extrato** do dia: o Raw XP e o balance de cada analyzer, as despesas e o total. A aba de **calendario** na barra lateral traz a semana ou o mes (botao Week/Month) em **tabela**: uma linha por dia com a **data** (dia da semana, data e quantas caçadas teve), o **Raw XP** e o **balance final** (balance do analyzer − despesas do dia), sempre em numero exato para dar para comparar os dias de lado a lado. O dia selecionado fica marcado e o dia de hoje ganha a etiqueta `today`. O mes mostra **todos** os dias do periodo (os dias sem caça ficam finos e apagados, os com caça se destacam). Do lado direito da tabela fica o **resumo do periodo** (Raw XP e balance total), sempre na tela. Clicar num dia abre a **janela de detalhe** com cada hunt (Raw XP, XP ganho, loot, supplies, tempo, balance) e as despesas dela.
4. **O botão `-` no canto da caixa minimiza ela** (fica so **Session**, **Raw XP** e **Balance**, uma linha cada, com o Raw XP no meio) e o `+` expande. As seções de loot começam minimizadas e continuam como você deixou quando a página se redesenha.
5. **O alfinete** fica no canto direito de dentro da caixa **Week total** ou **Month total**, na aba de calendario: clicar nele **fixa aquele card na tela principal**, no **rodape** da aba `Daily hunts`, embaixo das caçadas do dia, para ver o extrato total sem precisar ir ate a aba de calendario. O mesmo alfinete, agora preenchido, desfixa. Cada card e fixado por conta propria (da para fixar so a semana, so o mes ou os dois), a escolha fica guardada no perfil (e vai no backup) e os numeros se atualizam a cada mudanca. Os cards mostram so o **Raw XP** e o **balance** do periodo, para a tela principal ficar simples.
5. **A barra do topo e minimalista**: a data do dia selecionado (clique para abrir o calendario), `Week` e `Month`. O **icone de engrenagem** na barra lateral abre os **ajustes**: o horario do `Daily reset` e o filtro `Fields` (o que aparece em cada caixa e no backup). Ao lado da data aparece o dia da semana.
6. **`Daily reset`** define o horário que troca o dia: uma caçada que começou antes das
   06:00 conta para o dia anterior.
7. **`View report`** abre o report original. Para apagar uma caçada, **arraste a caixa até a
   lixeira** (canto inferior direito) — ela só aparece durante o arraste.
8. **O nome da hunt muda clicando no título da caixa** (ele vira um campo na hora) ou pelo
   campo **Name** em `View report`: digite o nome e salve. O título passa a mostrar esse
   nome — se você quiser, apague o `Hunt Analyser` e use só o seu. O nome fica salvo no
   backup e no CSV.

## Formato esperado do report

```
Session data: From 2026-10-19, 21:32:26 to 2026-10-19, 22:40:26
Session: 01:08h
Raw XP Gain: 7,053,159
XP Gain: 8,412,237
Raw XP/h: 6,155,048
XP/h: 7,341,066
Loot: 913,657
Supplies: 418,900
Balance: 494,757
Damage: 1,200,000
Damage/h: 14,300,000
Healing: 500,000
Healing/h: 5,960,000
Killed Monsters:
  2x dragon
Looted Items:
  1x gold coin
```

O app valida o report inteiro: números, datas, campos obrigatórios e seções duplicadas
são recusados com mensagem clara, em vez de virar zero.

## Titulo

Clique no titulo **Tibia Diary** no topo para renomear o site (ate 60 caracteres). O nome
novo e guardado no navegador e vai no backup .json. Deixe o campo vazio para voltar ao
nome padrao.

## Aparencia

As janelas e as caixas usam a mesma skin do client do Tibia: textura de pedra (recortada de ssets/tibiabattle.png para ssets/stone.png), moldura com bisel de 1px (luz em cima/esquerda, sombra embaixo/direita) e barra de titulo escura. A cor de destaque e neutra (prateada), sem tons de amarelo. A pasta ssets/ e publicada junto com o site.

## Menu lateral

A barra fixa na esquerda tem duas abas: **caças** (a tela principal) e **personagens**, e o **backup** no rodão dela.
que soma o profit de todos os perfis — cada character com suas caçadas, seu Raw XP e o
profit ja com as despesas descontadas, e o total geral no rodape.

## Despesas extras

O Hunt Analyzer nao conta tudo: um *recall* de 1 hora por 80k, suprimentos comprados na
cidade, qualquer coisa paga fora da caca. Agora cada **caçada** tem a secao **Expenses**
dentro da propria caixa (clique no titulo **EXPENSES** para adicionar, ou no nome de uma despesa para editar): o valor e a descricao ficam
ligados aquela hunt, e a e o **Balance** da propria caixa passa a mostrar o valor real (balance do analyzer - despesas da hunt). Passe o mouse no valor para edita-lo direto na linha e o **x** (que so aparece no hover) apaga a despesa. O + da caixa
abre a mesma janela de edicao. A lista semanal e o extrato somam as despesas do dia.

## Despesas extras

O Hunt Analyzer não conta tudo: um *recall* de 1 hora por 80k, suprimentos comprados na
cidade, qualquer coisa paga fora da caça. Em **Expenses**, logo abaixo das caixas, você
lança esses custos à mão:

- **+ Add** abre uma janela pequena com o formulário (descrição + valor), sem alterar o
  tamanho do painel. `Enter` salva.
- Valores grandes aparecem resumidos: `80k` = 80.000, `80kk` = 80 milhões.
- O valor aceita atalho: `1k` = 1.000, `10k` = 10.000, `100k` = 100.000, `1kk` (ou `1m`)
  = 1.000.000. O equivalente aparece ao lado enquanto você digita.
- A descrição pode começar com a quantidade: `2 silver token` ou `2x silver token` com o
  preço de `40k` viram uma despesa de `80.000`.
- Clicar no nome de uma despesa edita ela; o `×` remove.
- O painel mostra o **Total** das despesas e o **Balance after expenses** — o balance
  real do dia (soma dos balances do analyzer − despesas).

As despesas ficam separadas dos reports (não entram no balance de nenhuma caixa) e são
salvas junto do perfil, no dia e no backup.

## Perfis

Cada perfil é um character: tem as suas próprias caçadas, os seus campos visíveis, uma foto
e o seu próprio horário de reset. Use o botão **+** na barra lateral para abrir a janela de perfis (criação, renomear, foto, travar e apagar)
(ele começa zerado) e o seletor ao lado para trocar de perfil a qualquer momento. O botão
**Photo** no diálogo de perfis escolhe a imagem (PNG/JPG/WebP): ela é recortada em quadrado,
reduzida e aparece ao lado do nome — no topo e na lista. O botão **×** sobre a foto remove.
O botão **Lock** trava o perfil: ele ganha um cadeado e o **Delete** fica desabilitado — só
dá para apagar depois de destravar. O backup `.json` guarda todos os perfis (e as fotos);
o `.csv` exporta só o perfil ativo.

## Dados consistentes

Ao apagar uma hunt, as despesas dela vao junto. Ao abrir o app, os custos de hunts que nao existem mais sao descartados, e os custos sem hunt ficam na primeira hunt do mesmo dia.

## Tempo real

As janelas Week, Month, o extrato e os detalhes sao redesenhados a cada mudanca, entao os numeros que aparecem abertos estao sempre atualizados.

## Backup

`Backup` no topo da tela exporta um `.json` (formato versionado, `v3`, com todos os perfis)
e um `.csv` (separador `;`, BOM UTF-8 e escape de fórmulas de planilha). O `.json` é o
backup: o `localStorage` do navegador pode ser limpo a qualquer momento. Backups antigos em
`v1` (entradas manuais) e `v2` (perfil único) são migrados automaticamente ao restaurar.

## Estrutura

| Arquivo | Conteúdo |
|---|---|
| `core.js` | Toda a lógica (parse, aggregate, preferences, validate, csv, period). Sem DOM, roda em Node. |
| `app.js` | Interface: render das caixas, diálogos, backup, tema. |
| `styles.css` | Temas claro/escuro e a skin do client do Tibia. |
| `index.html` | Estrutura da página. |
| `tests/core.test.cjs` | Testes da lógica (`node --test tests/core.test.cjs`). |
| `serve.cjs` | Servidor local de desenvolvimento. |

## Testes

```bash
node --test tests/core.test.cjs
```

O CI roda os mesmos testes antes de publicar.
