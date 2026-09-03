# Engenharia Reversa - WEBESC (produto de crédito legado)

**Insumo para o CredX7i**
Rodadas 1 e 2 - varredura da URL. Rodada 3 - Manual WebSec/SEC (7B). Rodada 3b - Manual WEBESC ESC (7C).
Data: 27/08/2026
Ambiente analisado: `https://esc.demonstracao.rbm.digital/` (versão demonstração, dados fictícios)
Documentos analisados:
- "Manual do Sistema SEC / WebSec" v1.1.4, 09/12/2024 (Dimensa, versão securitizadora) - seção 7B
- "Manual das Funcionalidades do Sistema WEBESC", RBM WEB, abril/2020 (versão ESC) - seção 7C
Usuário: acesso concedido pelo Carlos; login feito por ele, sessão seguida.

> **Nota importante:** a demo varrida (`esc.demonstracao`) é a versão **ESC enxuta**. O
> manual descreve a versão **SEC / securitizadora (WebSec)**, um superconjunto com
> funding, rating, comitê formal, esteiras de checagem/cobrança/financeiro e integrações
> (LiberaCred, Serasa, CERC/CRDC, Vadu, DimensaSign). As regras de crédito e de
> antecipação de recebíveis abaixo vêm predominantemente do manual (seção 7B) e são a
> referência mais completa que temos até o código-fonte chegar.

---

## 1. Método e cobertura

### 1.1 Como foi feito

- Navegação autenticada na demo, leitura de DOM e das respostas HTTP.
- Coleta da estrutura das telas: campos de formulário, domínios de dropdown, colunas
  de grade, rótulos, JavaScript de validação e de cálculo.
- **Uma chamada ao motor de cálculo** (`ajx/calcEmp.php`) com parâmetros mínimos
  (R$ 1.000, 4 parcelas), autorizada pelo Carlos, sem gravar operação. O retorno JSON
  permitiu reconstruir as fórmulas na seção 5.

### 1.2 O que esta rodada cobre

Telas do núcleo de crédito: pesquisa e ficha de cliente PJ, RUP (dossiê), central do
cliente, simulador, cadastro de operação, alteração de proposta, coeficientes de
produto, comitê, atividade econômica, relatório de risco. Mais o mapa completo do menu.

### 1.3 O que esta rodada NÃO cobre (precisa do código-fonte)

- Regras server-side de aprovação: como o limite é calculado, o que reprova
  automaticamente, política de alçada do comitê.
- Schema real do banco (nomes de tabela e coluna, tipos, índices, constraints).
- Cálculo completo de "custo" e "rentabilidade" da operação (parte roda no servidor).
- Módulos periféricos: contábil, CNAB (remessa/retorno bancário), CERC/B3, cheque
  devolvido, comissão de agentes, SMS/e-mail, jurídico/cartório.
- Formulário de operação "Empréstimo por Parcela ou Taxa" na íntegra (renderizado por
  postback do framework, não capturável por GET simples).

---

## 2. Identificação do produto

| Item | Constatação |
|------|-------------|
| Nome | WEBESC - Sistema para Empresa Simples de Crédito |
| Fornecedor | RBMWEB Sistemas Inteligentes (rodapé "2017©") |
| Framework | `webfactor+` (RAD proprietário da RBMWEB), componentes `Edit1`, `ComboBox1`, `DBRepeater1`, canvas `jsGraphics` |
| Linguagem | PHP |
| Encoding | ISO-8859-1 (latin1) |
| Front-end | jQuery, DataTables, bootstrap-datepicker, select2, fancybox |
| Padrão de página | Casca fixa (menu, header, chat interno) com o módulo carregado em `<iframe>` |
| Comunicação | POST de formulário com HTML de resposta (postback `serverevent`/`serverparams`); AJAX pontual em `ajx/*.php` retornando JSON |
| Segmento de dados demo | Empresa "DEMONSTRACAO DIMENSA", carteira "PROPRIO" |

**Não existe API REST.** A integração se dá por replay de formulário. Para o CredX7i,
isso significa que a engenharia reversa de contrato de dados vem da estrutura das telas
e dos poucos endpoints AJAX, não de uma especificação.

---

## 3. Mapa de módulos (menu completo)

### CADASTROS
Rup, Clientes (PJ), Sacado, Atividade Econômica, Bancos, Conta Contábil, Crédito,
Feriados, Empresas, Usuários, Usuários do Comitê, Alteração Contratos, Agentes,
Coeficientes Produtos.

### OPERACIONAL
Operações, Baixa Seletiva, Registros CERC, Cheque Devolvido, Registro B3, Reabrir
Operações, Baixas de Desconto, Envio de SMS e Email, Comissões Agentes, Env. Jurídico
Cartório, Rel. Comissão, Integração Tecpay, Registro de Títulos.

### MOV. BANCÁRIA
Remessa Bancária, Retorno Bancário, Títulos na Cobrança, Relatório de Retorno, Contas
na Cobrança. (CNAB - integração com bancos para cobrança dos títulos.)

### CONTÁBIL
Lançamento Contábil, Transação Contábil, Remessa Contábil, Encerramento Anual.

### RELATÓRIOS
~30 relatórios. Os que revelam campos calculados: Ficha de Crédito, Risco do Cliente,
Risco por Faixa, Valor Presente, Classificação de Carteira, Concentração de Sacados,
IOF, Impostos, Impostos por Parcela, Desembolso, Rendas Efetivas.

### FINANCEIRO
Fornecedores, Contas a Pagar, Tipo de Documento, Carteiras, Conta Corrente, Relatório
de Contas.

**Leitura para o CredX7i:** o WEBESC é um ERP de factoring/ESC completo, não só um
motor de crédito. O CredX7i deve delimitar o escopo. O núcleo reaproveitável é
Cadastro de cedente + Sacado + Análise/Comitê + Simulação + Operação + Títulos +
Cobrança. Contábil e CNAB são candidatos a integração, não a reconstrução.

---

## 4. Modelo de domínio inferido

Nomes são hipóteses (o framework usa rótulos genéricos `Edit1..EditN`). Relações
derivadas dos parâmetros de URL (`cpfsocio`, `codclistatus`, `codibanco`, `ref`,
`averbador`, `cod`, `codcliente`).

### 4.1 Cliente / Cedente (PJ)

Fonte: `entclientepj.php`, `rupclientepj.php`, `centralcliente.php`.

| Grupo | Campos observados |
|-------|-------------------|
| Identificação | código (5 dígitos, ex. `00053`), CNPJ, razão social, nome fantasia |
| Endereço | CEP, endereço, número, complemento, bairro, cidade, UF |
| Contato | telefone, celular |
| Situação de crédito | status: `ANÁLISE` / `APROVADO` / `REPROVADO` (enum), analista responsável, data/hora, limite |
| Atividade | atividade econômica (tabela com ~130 itens, ligada a segmento Indústria/Comércio/Serviço/Público) |
| Sócios | lista: CPF do sócio, nome, % de participação (ex. "11168782678 MICHELE LIMA 10.00") |
| Referências | lista: tipo (`Comercial` / `Bancária` / `Pessoal`), dados da referência |
| Contas bancárias | lista: banco (código FEBRABAN + nome), agência, conta |
| Averbador | referência a `hf_averbador` (entidade que averba/confirma recebíveis) |
| Histórico de status | `codclistatus` com data, usuário e situação - trilha de análise |

### 4.2 Sacado (devedor do título)

Fonte: `entsacado.php`. Pesquisa por Nome ou CPF/CNPJ. Cadastro de pessoa (PF ou PJ)
que deve o título descontado. Relatório "Concentração de Sacados" indica que o sistema
controla exposição por sacado.

### 4.3 Proposta / Operação

Fontes: `simulador.php`, `cadastroperacao.php`, `alteraproposta.php`, `operacoes.php`.

**Máquina de estado da operação (9 status):**

| Código | Status | Interpretação |
|--------|--------|---------------|
| 01 | DIGITANDO | rascunho, em preenchimento |
| 02 | AGUARDANDO | submetida, aguardando triagem |
| 04 | EM ANÁLISE | em análise de crédito |
| 08 | PENDENTE | pendência (documento, garantia) |
| 09 | DEFERIDO | aprovada pela análise/comitê |
| 06 | INDEFERIDA | recusada |
| 03 | A PAGAR | aprovada e liberada para desembolso |
| 07 | PAGO | desembolsada ao cliente |
| 05 | CANCELADA | cancelada |

Status separado da proposta (nível de crédito): `ANÁLISE` / `APROVADO` / `REPROVADO`.

**Tipo de título (carteira de recebíveis):**

| Código | Tipo |
|--------|------|
| CH | Cheque |
| DP | Duplicata |
| NP | Nota Promissória |
| OU | Outros |

Natureza da duplicata: `MERCANTIL` / `SERVIÇO`.

**Modalidade (simulador):** `EM` Empréstimo / `FI` Financiamento.

**Tipos de operação (`cadastroperacao.php`):**
- `0` Empréstimo por Parcela ou Taxa
- `4` Empréstimo Amortização Juros
- `2` Simulador de Empréstimo
- `3` Simulador de Cartão de Crédito

**Liquidação:** `M` Mensal / `Q` Quinzenal / `S` Semanal / `D` Diário. Para diário, há
seleção de dias válidos da semana (Dom a Sáb) e o cálculo pula feriados (tabela
`feriados.php`).

### 4.4 Título / Parcela

Do retorno de `calcEmp.php`, cada parcela (`titulo`) tem: número, vencimento, valor da
prestação, amortização, juros, saldo devedor, dias corridos, taxa de IOF, valor de IOF,
coeficiente de valor presente.

### 4.5 Coeficiente de Produto (precificação)

Fonte: `entcoeficienteprod.php`. Dois métodos:
- **OPERAÇÃO - DESÁGIO** (id 3): desconto sobre o valor de face do título.
- **OPERAÇÃO - VALOR DE FACE** (id 4): valor de face é o alvo, encargos por fora.
- Variante CARTÃO usa "Valor de Face".

Tabela de coeficiente por produto/prazo (o número `1.12` aparece como fator base).

### 4.6 Custos operacionais da operação

Campos no simulador, somados à operação: TED, Boleto, Comissão [1], Comissão [2],
Comissão [3], CERC, Análise de Crédito, Software, Outros, IR, IR Adicional,
Inadimplência. Flags: Garantia, Financia IOF.

### 4.7 Comitê de Crédito

Fonte: `vercomite.php`, cadastro "Usuários do Comitê". Conjunto de usuários habilitados
a votar aprovação. Indica workflow de alçada (mais de um parecer por proposta).

### 4.8 Agente / Representante

Fonte: `entrepresentantes.php`, `contacorrenteagente.php`, `relcomissionamento.php`.
Originador externo que traz a operação e recebe comissão (conta corrente de comissões,
nota fiscal, bônus).

### 4.9 Entidades de apoio

Bancos (FEBRABAN), Conta Contábil / Conta Desembolso, Feriados, Empresas (multi-empresa
interna), Usuários, Tipo de Documento, Carteiras, Fornecedores, Atividade Econômica.

---

## 5. Motor de cálculo (reconstruído de `ajx/calcEmp.php`)

Entrada de teste: valor R$ 1.000,00, juros 2%/mês, 4 parcelas mensais, IOF diário
0,00559%, IOF adicional 0,38%, carência 0, data 28/08/2026.

Saída (resumo): coeficiente 0,26262375; parcela R$ 262,62; IOF total R$ 8,03; total
R$ 1.050,50; valor a desembolsar R$ 991,97.

### 5.1 Parcela pela Tabela Price

```
coeficiente = [ i·(1+i)^n ] / [ (1+i)^n − 1 ]
valor_parcela = valor_financiado × coeficiente
```

Confirmado: i=0,02, n=4 → coeficiente 0,26262375 → parcela 262,62. **Sistema francês
(Price), parcela fixa.**

### 5.2 Decomposição de cada parcela k (1..n)

```
fator_vp_k     = (1 + i)^(−k)                      // "coeficiente" da parcela
amortizacao_k  = valor_parcela × fator_vp_k
juros_k        = valor_parcela × (1 − fator_vp_k)  // = valor_parcela − amortizacao_k
saldo_devedor_k = Σ (amortizacao_j) para j = k..n
```

Verificação (parcela 1): 262,62 × (1,02)^−1 = 257,47 amortização; 262,62 − 257,47 =
5,15 juros. Soma das amortizações = 1.000,00 = saldo devedor inicial. Confere.

Observação: o WEBESC apresenta a decomposição em **valor presente** (a amortização é o
VP da parcela), não a Price contábil clássica (onde juros_1 = saldo × i). É a visão de
carteira de recebíveis descontados, coerente com o relatório "Valor Presente".

### 5.3 IOF

```
aliquota_iof_dia       = 0,0000559   (0,00559% ao dia)
aliquota_iof_adicional = 0,0038      (0,38% fixo)

taxa_iof_k  = min(dias_corridos_k, 365) × aliquota_iof_dia
valor_iof_k = amortizacao_k × taxa_iof_k

iof_adicional = valor_financiado × aliquota_iof_adicional
tot_iof       = Σ valor_iof_k + iof_adicional
```

Verificação: Σ valor_iof_k = 4,23; adicional = 1.000 × 0,0038 = 3,80; total 8,03.
Confere. `dias_corridos_k` conta da data da operação até o vencimento da parcela k.

> **Atenção regulatória:** as alíquotas de IOF são definidas por decreto e mudam. No
> WEBESC elas chegam como parâmetro de tela (`inputIOF`, `inputIOFAdicional`), o que
> sugere configuração manual. No CredX7i isso deve ser tabela parametrizada com
> vigência (ver seção 6).

### 5.4 Totais

```
juros_total    = Σ juros_k
total          = valor_financiado + juros_total          // 1.000 + 50,50 = 1.050,50
valor_desembolso = valor_requerido − tot_iof             // 1.000 − 8,03 = 991,97
```

Se `financiar_iof = true`, o IOF entra no valor financiado em vez de ser retido no
desembolso (flag "Financia IOF").

### 5.5 Datas

- `primeiro_vencimento` = data da operação + 1 período + carência.
- Períodos seguem a liquidação (mês, quinzena, semana, dia).
- Liquidação diária: gera vencimento a cada dia útil conforme `dias_validos` (dias da
  semana marcados) e pula `feriados`.

### 5.6 Custo e rentabilidade

Calculados no cliente após o retorno do `calcEmp.php`, somando os custos operacionais
(TED, boleto, comissões, CERC, análise, software, outros, IR, inadimplência) ao IOF e
aos juros. A fórmula final de rentabilidade roda parcialmente no servidor e **não foi
capturada nesta rodada** - precisa do código.

### 5.7 Endpoints AJAX identificados

| Endpoint | Função |
|----------|--------|
| `ajx/calcEmp.php` | Motor de cálculo da simulação (POST form, retorna JSON `simulacao`) |
| `ajx/salvaOperacao.php` | Persiste a operação simulada como proposta |
| `ajx/consultarup.php` | Consulta dados do RUP (dossiê do cliente) |
| `ajx/ajxconsultasaldo.php` | Consulta saldo/limite do cliente |
| `ajx/ajxconsultacomissao.php` | Consulta comissão de agente |
| `ajx/consultasaldocliente_valor3.php` | Saldo do cliente (variante) |
| `ajx/renovasessao.php` | Mantém sessão viva (timeout ~10 min) |
| `consultaEmpregadorCNPJ` (JS) | Consulta externa de CNPJ na ficha do cliente |

Contrato do `calcEmp.php` (campos de entrada relevantes): `inputCodcliente`,
`flag_tipo`, `cnpj`, `inputValorEmprestimo`, `inputNParcelas`, `inputDataEmprestimo`,
`inputModalidade`, `inputJuros`, `inputCarencia`, `inputIOF`, `inputIOFAdicional`,
`inputLiquidacao`, `inputDiasSemana[]`, `inputCarencia`, `inputFinanciaIOF`,
`inputGarantia`, e os custos `inputTED`, `inputBoleto`, `inputComissao[1..3]`,
`inputCERC`, `inputAnaliseDeCredito`, `inputSoftware`, `inputOutros`, `inputIR`,
`inputIRAdicional`, `inputInadimplencia`. Valores monetários em formato pt-BR
(`1.000,00`), percentuais com vírgula.

---

## 5A. Fórmulas gerais de crédito - consolidado para o CredX7i

Sim, dá para inferir o conjunto geral de fórmulas de crédito parcelado prefixado PJ
(capital de giro), com IOF e com as duas tabelas de amortização. Abaixo, o que está
**verificado** contra o WEBESC (`calcEmp.php`, seção 5) e o que é **padrão de mercado**
ainda a validar contra o produto legado.

### 5A.1 Escopo coberto

- Crédito **parcelado**, taxa **prefixada** (juros fixo por período, definido na
  contratação).
- Tomador **PJ**, uso capital de giro. Na prática do WEBESC isto é a modalidade
  "Empréstimo" (`EM`); "capital de giro" não é um produto separado, é o caso de uso.
- Liquidação periódica: mensal, quinzenal, semanal ou diária.
- **Tabela Price** (parcela constante) - verificada.
- **Tabela SAC** (amortização constante) - padrão de mercado, a validar (é o tipo de
  operação 4 do WEBESC, "Empréstimo Amortização Juros", cujo formulário não foi
  capturado).
- IOF PJ (adicional fixo + diário sobre o principal).
- Carência.

Fora deste escopo: taxa pós-fixada / indexada (CDI, IPCA), crédito rotativo, cartão,
e o desconto de recebíveis puro (esse usa deságio sobre valor de face, não Price/SAC -
ver seção 7B.1).

### 5A.2 Notação

| Símbolo | Significado |
|---------|-------------|
| `PV` | valor principal financiado (o que entra no cálculo da parcela) |
| `i` | taxa de juros efetiva **por período**, prefixada (ex. 0,02 = 2% a.p.) |
| `n` | número de parcelas |
| `k` | índice da parcela, `1..n` |
| `c` | carência, em número de períodos |
| `PMT` | valor da parcela (Price, constante) |
| `A_k` | amortização da parcela `k` |
| `J_k` | juros da parcela `k` |
| `SD_k` | saldo devedor após a parcela `k` (`SD_0 = PV`) |
| `d_k` | dias corridos entre a liberação e o vencimento da parcela `k` |

### 5A.3 Tabela Price (Sistema Francês) - VERIFICADO

Parcela constante:

```
PMT = PV × i / ( 1 − (1 + i)^(−n) )
```

Equivalente ao coeficiente devolvido pelo WEBESC:

```
coef = i·(1+i)^n / ( (1+i)^n − 1 )
PMT  = PV × coef
```

Verificado: `PV=1000, i=0,02, n=4` → `coef = 0,26262375` → `PMT = 262,62` (bate com
`calcEmp.php`).

**Cronograma recomendado para o CredX7i (padrão de mercado, exigido para CET/BACEN):**

```
J_k  = SD_{k−1} × i
A_k  = PMT − J_k
SD_k = SD_{k−1} − A_k
SD_0 = PV ,  SD_n = 0
```

> **Divergência a decidir:** o WEBESC não usa esse cronograma. Ele decompõe a parcela em
> **valor presente**: `A_k = PMT × (1+i)^(−k)` e `J_k = PMT − A_k` (seção 5.2). Os dois
> métodos dão a **mesma parcela** e o **mesmo total**, mas distribuem juros/amortização
> de forma diferente entre as parcelas, o que muda a base de cálculo de IOF, de PDD e do
> imposto por parcela. Para o CredX7i, a recomendação é adotar o cronograma padrão de
> mercado (juros sobre saldo devedor); se a paridade com o legado for requisito, replicar
> a decomposição em VP e documentar.

Total de juros Price: `Σ J_k = n·PMT − PV`.

### 5A.4 Tabela SAC (Amortização Constante) - PADRÃO DE MERCADO, A VALIDAR

```
A_k    = PV / n                       (amortização constante)
J_k    = SD_{k−1} × i
PMT_k  = A_k + J_k                     (parcela decrescente)
SD_k   = SD_{k−1} − A_k = PV × (1 − k/n)
```

- Primeira parcela (maior): `PV/n + PV·i`.
- Última parcela (menor): `PV/n + (PV/n)·i`.
- Total de juros SAC: `Σ J_k = i · PV · (n + 1) / 2`.

### 5A.5 Price vs SAC

| | Price | SAC |
|---|-------|-----|
| Parcela | constante | decrescente |
| Amortização | crescente | constante |
| Juros | decrescentes | decrescentes (mais rápido) |
| 1ª parcela | menor que SAC | maior (mais pesada) |
| Total de juros | **maior** | **menor** |
| Uso típico | capital de giro, quando o tomador quer parcela previsível | quando o tomador aceita parcela inicial alta para pagar menos juros |

Regra de implementação: uma única função `gerar_cronograma(sistema, PV, i, n, c) -> [parcelas]`
com `sistema ∈ {PRICE, SAC}`. O resto do motor (IOF, CET, vencimentos) opera sobre o
cronograma, indiferente ao sistema.

### 5A.6 Carência (`c` períodos)

Duas convenções de mercado:

**(a) Carência com pagamento de juros** - durante `c` períodos o tomador paga só
`J = PV·i`; a amortização começa depois, em `n` parcelas. `PV` não muda.

**(b) Carência com capitalização** - os juros da carência são incorporados ao principal:

```
PV' = PV × (1 + i)^c
```

e então aplica-se Price ou SAC sobre `PV'` e `n` parcelas.

O WEBESC parece usar a convenção (b): na rodada 2, carência elevou o total de forma
compatível com capitalização exponencial. **Mas a unidade do campo `inputCarencia` e a
fórmula exata não foram confirmadas** (o salto observado foi grande demais para `c` em
períodos mensais - possível bug da demo, ou unidade diferente). Item para a rodada 4.

### 5A.7 IOF PJ - VERIFICADO (estrutura), alíquotas PARAMETRIZÁVEIS

```
IOF_total = IOF_adicional + Σ_k IOF_principal_k

IOF_adicional     = PV × α_adic
IOF_principal_k   = A_k × min(d_k, 365) × α_dia
```

| Parâmetro | Valor na demo | Valor legal vigente (PJ) |
|-----------|---------------|--------------------------|
| `α_adic` (adicional, fixo, independe do prazo) | 0,38% | 0,38% |
| `α_dia` (diário sobre o principal, teto 365 dias) | 0,00559% | 0,0082% (Dec. 6.306/2007 e alterações) |

Verificado numericamente (seção 5.3): `PV=1000, n=4` → `IOF_adicional = 3,80`,
`Σ IOF_principal_k = 4,23`, `IOF_total = 8,03`.

Observações:
- A alíquota diária **não é constante**: muda por decreto e há redução para optantes do
  Simples em faixa de faturamento. O WEBESC resolve isso via `ajx/consultaiof.php`
  (parâmetros cliente + data + modalidade). No CredX7i, isto **tem que ser** tabela
  `parametro_fiscal` versionada por vigência, nunca constante no código.
- **Base do IOF diário** = amortização de cada parcela (o principal que fica em aberto
  até aquele vencimento), não a parcela inteira. Confirmado no WEBESC.
- `d_k` conta da data de **liberação** até o **vencimento** da parcela `k`.

### 5A.8 Financiamento do IOF

Se o IOF é financiado (flag "Financia IOF"), ele entra no valor financiado:

```
PV_financiado = PV_liberado + IOF_total
```

Como `IOF_total` depende de `A_k`, que depende de `PV_financiado`, há **dependência
circular**: resolve-se por iteração (2 a 3 passos convergem) ou pela fórmula fechada
equivalente. O WEBESC resolve (rodada 2: parcela subiu de 346,75 para 349,25 com o flag
ligado). Sem o flag, o IOF é retido no desembolso: `valor_liberado = PV − IOF_total`.

### 5A.9 Vencimentos

```
venc_1 = data_liberacao + (1 período) + carência
venc_k = venc_1 + (k−1) períodos
```

Período = mês / quinzena (15 dias) / semana (7 dias) / dia. Para liquidação **diária**,
só contam os dias marcados como úteis (`dias_validos`) e pula-se feriados. Verificado na
rodada 2.

### 5A.10 CET (Custo Efetivo Total) - NÃO capturado, padrão a implementar

O CET é a taxa `j` por período que zera o valor presente do fluxo:

```
valor_liberado_liquido = Σ_k  PMT_k / (1 + j)^k
```

onde `valor_liberado_liquido = PV − IOF_retido − custos_operacionais_retidos` (TED,
boleto, comissão, análise, etc. - ver 4.6). Resolve-se `j` por Newton-Raphson ou
bisseção. O WEBESC calcula "custo" e "rentabilidade", mas a fórmula final roda no
servidor e não foi capturada. Para o CredX7i, o CET é obrigatório na oferta ao cliente
PJ e deve sair do mesmo motor.

### 5A.11 Situação: verificado x a validar

| Fórmula | Status |
|---------|--------|
| Price - parcela e coeficiente | **Verificado** (`calcEmp.php`) |
| IOF adicional + IOF diário sobre amortização, teto 365 dias | **Verificado** |
| Juros aplicados por período (não anualizados) | **Verificado** (rodada 2) |
| Financiamento do IOF | **Verificado** (comportamento) |
| Geração de vencimentos por periodicidade e dias úteis | **Verificado** |
| Cronograma Price padrão de mercado (juros sobre saldo) | Inferido - WEBESC usa decomposição em VP |
| Tabela SAC | Padrão de mercado - **não verificado** no WEBESC (tipo 4) |
| Carência (capitalização `(1+i)^c`) | Hipótese - comportamento anômalo, a confirmar |
| Alíquota IOF diária correta por regime (Simples/faixa) | A parametrizar - demo usa 0,00559% |
| CET | Não capturado - implementar pelo padrão BACEN |

### 5A.12 Recomendação de arquitetura do motor

```
motor_credito(entrada) -> resultado
  entrada:  sistema (PRICE|SAC), PV, i, n, c, periodicidade, dias_uteis[],
            data_liberacao, financia_iof, parametros_fiscais (por vigência),
            custos_operacionais[]
  passos:
    1. PV_efetivo = aplicar_carencia(PV, i, c, convencao)
    2. se financia_iof: iterar PV_financiado
    3. cronograma = gerar_cronograma(sistema, PV_efetivo, i, n)
    4. vencimentos = gerar_vencimentos(data_liberacao, periodicidade, c, dias_uteis, feriados)
    5. iof = calcular_iof(cronograma, vencimentos, data_liberacao, parametros_fiscais)
    6. desembolso = PV - iof_retido - custos_retidos
    7. cet = resolver_cet(desembolso, cronograma.parcelas)
    8. retornar { cronograma, vencimentos, iof, desembolso, cet, snapshot_completo }
  função pura, server-side, coberta por testes com os casos desta seção como baseline.
```

O `snapshot_completo` do passo 8 é o que vai para `proposta.simulacao_snapshot` (decisão
imutável, ver seção 6.3).

---

## 6. Proposta de reengenharia de dados para o CredX7i

Objetivo: preservar a lógica de negócio provada acima, corrigir as fraquezas estruturais
do legado e encaixar no modelo multitenant do [PLANO_TECNICO.md](PLANO_TECNICO.md).

### 6.1 Fraquezas do modelo legado a corrigir

| # | No WEBESC | Problema | No CredX7i |
|---|-----------|----------|------------|
| 1 | Proposta e operação parecem a mesma entidade com status | Difícil auditar "o que foi pedido" vs "o que foi feito" | Separar `proposta` (pedido) de `operacao` (efetivada) de `titulo` (recebível) |
| 2 | Alíquotas de IOF digitadas na tela | Erro humano, sem histórico, risco fiscal | Tabela `parametro_fiscal` com vigência (data início/fim, alíquota dia, alíquota adicional) |
| 3 | Coeficientes e taxas em campos soltos | Precificação não versionada | `tabela_precificacao` versionada por produto, prazo e vigência |
| 4 | Status como código string (`01`..`09`) sem transições formais | Transição inválida possível por update direto | Enum + tabela de transições permitidas + trigger |
| 5 | Histórico de status ad hoc (`codclistatus`) | Trilha incompleta | `auditoria` append-only + snapshot da simulação no momento da decisão |
| 6 | "Empresas" internas + carteira "PROPRIO" | Multi-empresa improvisado | `tenant_id` em tudo (ver plano) |
| 7 | Encoding latin1, valores pt-BR como string | Bug de formatação, ordenação incorreta | UTF-8, `NUMERIC`, `DATE`; formatação só na borda |
| 8 | Cálculo de rentabilidade espalhado (cliente + servidor) | Difícil manter e testar | Motor de cálculo único, server-side, com suíte de testes usando os casos capturados aqui |

### 6.2 Modelo alvo (entidades principais)

```
tenant (do plano)

cedente                      -- cliente PJ que desconta recebíveis
  tenant_id, cnpj, razao_social, nome_fantasia, endereco..., atividade_economica_id,
  situacao_credito (ANALISE|APROVADO|REPROVADO), limite_aprovado, analista_id
cedente_socio
  cedente_id, cpf, nome, percentual_participacao
cedente_referencia
  cedente_id, tipo (COMERCIAL|BANCARIA|PESSOAL), dados
cedente_conta_bancaria
  cedente_id, banco_codigo, agencia, conta, tipo
cedente_situacao_hist        -- trilha de análise (append-only)
  cedente_id, situacao, motivo, usuario_id, ocorrido_em

sacado                       -- devedor do titulo
  tenant_id, documento (CPF|CNPJ), nome, ...
sacado_exposicao (view)      -- concentração por sacado

atividade_economica
  codigo, descricao, segmento (INDUSTRIA|COMERCIO|SERVICO|PUBLICO)

parametro_fiscal             -- IOF e afins, versionado
  tenant_id (ou global), vigencia_inicio, vigencia_fim,
  iof_aliquota_dia, iof_aliquota_adicional, teto_dias_iof

tabela_precificacao          -- coeficientes / taxas, versionada
  tenant_id, produto (DESAGIO|VALOR_DE_FACE|CARTAO), prazo_de, prazo_ate,
  taxa_mes, coeficiente, vigencia_inicio, vigencia_fim

proposta                     -- o pedido
  tenant_id, cedente_id, agente_id, modalidade (EM|FI),
  tipo_operacao (PARCELA_TAXA|AMORT_JUROS|SIM_EMPRESTIMO|SIM_CARTAO),
  valor_solicitado, n_parcelas, data_operacao, taxa_juros_mes, carencia,
  liquidacao (M|Q|S|D), dias_semana[], financia_iof, garantia,
  status (DIGITANDO|AGUARDANDO|EM_ANALISE|PENDENTE|DEFERIDO|INDEFERIDO|A_PAGAR|PAGO|CANCELADA),
  simulacao_snapshot jsonb,  -- retorno integral do motor no momento da decisao
  criado_em, decidido_em, decidido_por
proposta_custo               -- custos operacionais (linha por tipo)
  proposta_id, tipo (TED|BOLETO|COMISSAO_1..3|CERC|ANALISE|SOFTWARE|OUTROS|IR|IR_ADIC|INADIMPLENCIA),
  valor
proposta_parecer             -- votos do comite
  proposta_id, usuario_id, voto (APROVA|REPROVA|PENDENCIA), justificativa, ocorrido_em

operacao                     -- proposta efetivada / desembolsada
  tenant_id, proposta_id, valor_financiado, valor_iof_total, valor_desembolso,
  valor_total, data_desembolso, conta_desembolso_id
titulo                       -- cada recebivel / parcela
  operacao_id, sacado_id, numero, tipo_titulo (CH|DP|NP|OU), natureza (MERCANTIL|SERVICO),
  vencimento, valor_face, valor_prestacao, amortizacao, juros, saldo_devedor,
  dias_corridos, taxa_iof, valor_iof, fator_valor_presente,
  status_baixa (ABERTO|LIQUIDADO|DEVOLVIDO|RECOMPRADO|CARTORIO)
titulo_baixa
  titulo_id, data, valor, tipo_baixa, forma

agente
  tenant_id, documento, nome, regra_comissao
agente_comissao_cc           -- conta corrente de comissoes
```

### 6.3 Decisões de otimização

1. **`simulacao_snapshot jsonb` na proposta.** O retorno de `calcEmp.php` (parcelas,
   IOF, totais, alíquotas usadas) é gravado inteiro no momento da decisão. É a prova de
   "com que números essa proposta foi aprovada", e alimenta o requisito de decisão
   imutável do plano. Recalcular depois nunca substitui o snapshot.

2. **Motor de cálculo como serviço único.** Uma função server-side pura
   `simular(parametros) -> resultado`, coberta por testes que usam os casos capturados
   nesta engenharia reversa como baseline (o caso R$ 1.000 / 2% / 4x já está
   documentado com resultado esperado na seção 5). Nada de cálculo em JavaScript além
   de máscara e feedback visual.

3. **Parâmetros fiscais e de precificação versionados por vigência.** Consulta sempre
   "qual alíquota valia na data da operação". Elimina a digitação manual de IOF e o
   risco fiscal associado.

4. **Status como máquina de estado explícita.** Enum no banco + tabela
   `transicao_permitida(de, para, papel_minimo)` + trigger que rejeita transição não
   listada. O legado permite qualquer status por update.

5. **Concentração por sacado como view materializada** com alerta quando um sacado
   passa de X% da carteira do tenant (o legado tem o relatório, não o controle ativo).

6. **Tudo com `tenant_id`** e RLS, conforme o plano. A "empresa" e a "carteira" do
   WEBESC deixam de ser gambiarra e viram tenant + carteira formal.

### 6.4 De-para rápido (legado -> CredX7i)

| WEBESC | CredX7i |
|--------|---------|
| Cliente PJ (`entclientepj`) | `cedente` + `cedente_socio` + `cedente_referencia` + `cedente_conta_bancaria` |
| RUP (`rupclientepj`) | visão consolidada `cedente` (não é entidade nova) |
| Status cliente `ANÁLISE/APROVADO/REPROVADO` | `cedente.situacao_credito` + `cedente_situacao_hist` |
| Simulador (`simulador.php`) | `proposta` + motor `simular()` + `simulacao_snapshot` |
| Operação (`operacoes.php`, status 01-09) | `proposta.status` (pedido) e `operacao` (efetivada) |
| Tipos CH/DP/NP/OU | `titulo.tipo_titulo` |
| Coeficientes Produto | `tabela_precificacao` versionada |
| IOF nas telas | `parametro_fiscal` versionado |
| Usuários do Comitê | `proposta_parecer` + papel `comite` |
| Agentes / comissões | `agente` + `agente_comissao_cc` |
| Empresas + carteira PROPRIO | `tenant` + carteira |
| Mov. Bancária (CNAB) | integração externa, fora do core inicial |
| Contábil | integração / exportação, fora do core inicial |

---

## 7. Regras de negócio catalogadas (rodada 1)

| # | Regra | Origem | Confiança |
|---|-------|--------|-----------|
| R1 | Parcela calculada pela Tabela Price (parcela fixa) | `calcEmp.php` retorno | Alta (verificado numericamente) |
| R2 | Decomposição da parcela em valor presente: amortização = parcela × (1+i)^−k | `calcEmp.php` | Alta |
| R3 | IOF principal = Σ (amortização_k × min(dias_k,365) × alíquota_dia) | `calcEmp.php` | Alta |
| R4 | IOF adicional = valor financiado × 0,38% | `calcEmp.php` | Alta |
| R5 | Valor a desembolsar = valor solicitado − IOF total (salvo "Financia IOF") | `calcEmp.php` | Alta |
| R6 | 1º vencimento = data + 1 período + carência; períodos por liquidação M/Q/S/D | `calcEmp.php` | Média (carência não testada) |
| R7 | Liquidação diária pula fins de semana não marcados e feriados | campos + retorno `feriados` | Média |
| R8 | Proposta passa por status DIGITANDO→AGUARDANDO→EM ANÁLISE→(PENDENTE)→DEFERIDO/INDEFERIDO→A PAGAR→PAGO, ou CANCELADA | dropdown `operacoes.php` | Média (ordem inferida) |
| R9 | Crédito do cliente tem trilha ANÁLISE→APROVADO/REPROVADO com analista e limite | `rupclientepj`, `entclientepj` | Alta |
| R10 | Comitê de crédito: múltiplos usuários habilitados a parecer | `vercomite`, cadastro comitê | Média |
| R11 | Dois métodos de precificação: deságio sobre face, ou valor de face com encargos por fora | `entcoeficienteprod` | Alta |
| R12 | Título é CH, DP, NP ou OU; duplicata tem natureza mercantil ou serviço | `alteraproposta` | Alta |
| R13 | Custos operacionais avulsos entram no custo/rentabilidade da operação | `simulador` campos | Alta (existência); Baixa (fórmula) |
| R14 | Controle de concentração por sacado | relatório "Concentração de Sacados" | Média |
| R15 | Operação pode ter agente originador com comissão em conta corrente | menu Agentes/Comissões | Média |

**Faltando (precisa do código):** como o limite é calculado, critérios de reprovação
automática, alçada do comitê (quantos pareceres, por faixa de valor), fórmula de
rentabilidade, regras de recompra e de envio a cartório, integração CERC/B3.

---

## 7A. Rodada 2 - achados adicionais por navegação

Segunda passada, ainda sem código-fonte. Drivagem do postback do formulário de operação
e novas chamadas ao motor de cálculo.

### 7A.1 Formulário real de operação (`opemprestimo.php`)

O fluxo é `cadastroperacao.php` (escolhe o tipo) -> `opemprestimo.php?cod=NNNNN` (tipo 0
e 2, "Empréstimo por Parcela/Taxa" e "Simulador"). O tipo 4 ("Amortização Juros") usa
outra rota, não capturada. Campos e domínios:

| Campo | Domínio | Papel |
|-------|---------|-------|
| Carteira | `PROPRIO` (id 1) | carteira da operação (= tenant/carteira no CredX7i) |
| Conta de desembolso | conta bancária cadastrada (ex. "02072114 - BANCO BRADESCO") | de onde sai o dinheiro |
| Modalidade | Empréstimo / Financiamento | |
| Forma de liberação | `BL` boleto / `CH` cheque / `DB` débito / `CC` conta corrente | |
| Periodicidade | Mensal / Semanal / Quinzenal | |
| Método de cálculo | `TOT_FAC` (por Taxa) / `VL_FACE` (por Parcela) | dirige a fórmula |
| Financia IOF | Sim / Não | |
| Garantia | Sim / Não | |
| Observação | texto livre (`Memo1`) | |
| Averbador | `hf_averbador` | entidade que confirma o recebível |

Endpoints novos: `ajx/consultaiof.php` (retorna alíquota de IOF por cliente/data/modalidade
- confirmado: `codcliente=00053&data=2026-08-28&modalidade=EM` devolveu `0.00274`),
`ajx/atualizaempregador.php`, `ajx/consultarup.php`.

### 7A.2 Comportamento do motor de cálculo (variações testadas)

| Cenário | Resultado | Regra deduzida |
|---------|-----------|----------------|
| Liquidação quinzenal vs semanal vs mensal, mesmo nº de parcelas | juros idênticos (R$ 40,26 em todos), só o IOF muda (menos dias = menos IOF) | **A taxa de juros é aplicada por parcela, não por tempo.** Período mais curto = mesmo custo nominal = custo anual efetivo muito maior. Ponto de atenção de transparência ao tomador. |
| Liquidação diária, 5 parcelas | vencimentos em dias corridos pulando fim de semana (29-30/08 saltados) | confirmação de R7 |
| "Financia IOF" ligado | `valor a desembolsar = valor solicitado` cheio; IOF entra no valor financiado; parcela sobe (R$ 346,75 -> R$ 349,25) | confirmação de R5 |
| Carência = 30 | total saltou para R$ 1.884 sobre principal de R$ 1.000 em 3 parcelas (juros implícito ~88%) | **Anômalo.** O campo carência produz capitalização desproporcional na demo. Unidade do campo (dias? períodos? meses?) e a fórmula de capitalização durante a carência **precisam do código** antes de qualquer reimplementação. |
| Modalidade FI vs EM | diferença pequena só no IOF | modalidade tem efeito fiscal/contábil, não muda a Price |

### 7A.3 Taxonomia expandida (de `relparametrizado.php` e afins)

**Famílias de produto:** Desconto, Empréstimo, Financiamento. (O "Desconto" é a operação
clássica de factoring; "Empréstimo"/"Financiamento" são as linhas de crédito.)

**Situação do título:** Em aberto, A vencer, Vencido, Liquidado, Estornado.

**Tipos de documento (completo):** `BL` boleto, `CC` conta corrente, `CH` cheque,
`DB` débito, `DP` duplicata, `NP` nota promissória, `OU` outros. (A rodada 1 só tinha
visto CH/DP/NP/OU.)

**Papéis na operação:** Cliente (cedente), Sacado (devedor do título), **Devedor**
(devedor solidário / avalista - entidade distinta do sacado).

**Régua de cobrança / jurídico:** Não enviado -> Enviado para Jurídico -> Enviado para
Cartório -> Jurídico e Cartório; e Enviado ao SPC (negativação).

**Situação cadastral (cliente/sacado):** Normal, Bloqueado, Jurídico, Negativado.

**Datas controladas por título:** vencimento, liquidação, inserção, **aceite** (do
sacado), **PDD** (data de provisão para devedores duvidosos), envio ao SPC.

> **PDD é rastreada por título.** O sistema provisiona perda por título vencido. No
> CredX7i isso vira campo/rotina de `titulo` (data e valor de PDD, classificação de
> risco por atraso), alinhado ao relatório "Classificação de Carteira".

**Tipos de agente:** Agente, Operadores, Promotora, Revenda. Status Ativo / Inativo.

**Feriados:** Municipal, Nacional, Estadual, Mundial (afeta o cálculo de vencimentos).

**Alteração de contrato** (`enttermocontrato.php`): termo aditivo formal sobre a
operação (prorrogação, repactuação).

### 7A.4 Impacto no modelo alvo (seção 6)

Acréscimos ao modelo da seção 6.2:

```
devedor_solidario            -- avalista, distinto de sacado
  operacao_id | titulo_id, documento, nome

titulo  (campos adicionais)
  data_aceite, data_pdd, valor_pdd, classificacao_risco,
  situacao_cobranca (NAO_ENVIADO|JURIDICO|CARTORIO|JURIDICO_CARTORIO|SPC),
  data_liquidacao, data_estorno

cedente / sacado (campo adicional)
  situacao_cadastral (NORMAL|BLOQUEADO|JURIDICO|NEGATIVADO)

operacao (campos adicionais)
  carteira, conta_desembolso_id, forma_liberacao (BL|CH|DB|CC),
  metodo_calculo (POR_TAXA|POR_PARCELA), periodicidade, averbador_id,
  familia_produto (DESCONTO|EMPRESTIMO|FINANCIAMENTO)

termo_aditivo
  operacao_id, tipo, descricao, data, usuario_id

agente (campo adicional)
  tipo (AGENTE|OPERADOR|PROMOTORA|REVENDA), situacao (ATIVO|INATIVO)

parametro_fiscal
  origem: ajx/consultaiof.php mostra que o IOF ja e resolvido por cliente+data+modalidade
```

Novas regras catalogadas:

| # | Regra | Origem | Confiança |
|---|-------|--------|-----------|
| R16 | Juros aplicados por parcela, independentes da duração do período | `calcEmp.php` (quinzenal = mensal em juros) | Alta |
| R17 | "Financia IOF": IOF vai para o valor financiado e o desembolso sai cheio | `calcEmp.php` | Alta |
| R18 | Carência capitaliza o saldo de forma desproporcional na demo - fórmula e unidade desconhecidas | `calcEmp.php` | Baixa (anômalo, precisa do código) |
| R19 | PDD provisionada por título, com data própria | `relparametrizado` | Média |
| R20 | Régua de cobrança: Jurídico -> Cartório -> SPC, com estados combinados | `relparametrizado` | Alta |
| R21 | Operação tem devedor solidário além do sacado | `relparametrizado` (papel DEVEDOR) | Média |
| R22 | IOF resolvido por cliente + data + modalidade (parametrizado, não fixo na tela) | `ajx/consultaiof.php` | Alta |
| R23 | Três famílias de produto: Desconto, Empréstimo, Financiamento | múltiplos relatórios | Alta |

### 7A.5 Ainda não mapeado por navegação

- Formulário do tipo 4 "Empréstimo Amortização Juros" (rota não descoberta).
- Simulador de Cartão de Crédito (tipo 3; `simuladorcartao.php` deu 404, rota diferente).
- Payload de `ajx/salvaOperacao.php` (gravação) - exigiria criar operação de teste.
- Contrato completo de `ajx/consultaiof.php` (o retorno `0.00274` isolado precisa de mais
  parâmetros para interpretar).
- Telas de Bancos, Conta Contábil, Plano de Contas, Feriados no modo edição (só a busca
  foi vista; o formulário abre por postback).
- Módulos CERC, B3, CNAB, cheque devolvido, contábil - só a tela de entrada foi tocada.

---

## 7B. Rodada 3 - regras de crédito e antecipação de recebíveis (Manual WebSec)

Fonte: "Manual do Sistema SEC / WebSec" v1.1.4 (Dimensa). Descreve a versão completa da
plataforma. É texto descritivo, não código: as regras abaixo são o que o manual afirma,
não o que foi verificado em execução.

### 7B.1 O negócio, na definição do próprio manual

Antecipação de recebíveis = operação de **desconto**: o cedente (cliente) vende seus
direitos creditórios (duplicata, cheque, NP, outros) para a securitizadora, que paga
antecipado um valor abaixo do nominal. A diferença é o **deságio**, custo da
antecipação. "Qualquer título com valor a receber no futuro pode ser trazido ao valor
presente para negociação."

Três modalidades:
- **Desconto** - factoring clássico, sacado notificado.
- **Empréstimo / Financiamento** - linhas de crédito com parcelas.
- **Operação comissária** - o sacado **não** é notificado; o cedente continua
  responsável por cobrar e repassar o valor à securitizadora. Marcada por título
  (`sacados_comissaria`).

### 7B.2 Análise de crédito (tela `analiseopdesconto.php`)

A tela de análise da operação (antes do deferimento) reúne:

| Bloco | Conteúdo |
|-------|----------|
| Dados do Cliente | código, CPF/CNPJ, nome, **limite de crédito**, operações do cliente, **rating** |
| Informações Gerenciais / Estatísticas | **risco**, **margem** do cliente, títulos vencidos |
| **Análise Digital** | contrato, limite e margem, títulos vencidos, **recompra prioritária**, **vencidos no grupo econômico**, **rentabilidade da operação** |
| Borderô | nº da operação, valor de face, **taxas** (herdadas da parametrização da empresa, editáveis só nesta operação ou globalmente) |
| Informações Tesouraria / Financeiro | empresa, **deságio**, **funding** (fonte do recurso), conta de desembolso, status |
| Borderô - Ações digitais | raio-X do cedente, raio-X do sacado, consulta Serasa, consulta LiberaCred |

Definições do manual:
- **Risco do cliente** = soma de todos os títulos **em aberto** daquele cliente.
- **Margem** = limite de crédito − risco (espaço ainda disponível para operar).
- **Rating** - classificação do cliente (o manual não detalha a escala; provável origem
  LiberaCred + histórico interno).

### 7B.3 LiberaCred (motor de score)

"Ferramenta da Dimensa, integrada com ferramentas de terceiros, para verificar o
**score** dos solicitantes de crédito." Produto pago, contratado à parte. Disponível
tanto para cliente (RUP) quanto para sacado. É a fonte externa de score; a decisão final
é do financiador conforme apetite de risco.

**Para o CredX7i:** o motor de score é integração externa, não lógica a reconstruir.
Modelar `consulta_score(entidade, data) -> {score, faixa, bureau, payload}` e guardar o
retorno com a proposta.

### 7B.4 Central do Cliente - parametrização de crédito por cedente

Botões citados: Dados Básicos, **Parametrização de taxas/tarifas**, **Limites**,
**Tranches**, **Política de Confirmação/Canhoto**, **Critérios de Aceitação de Risco
(CAR)**, Configurações de Impressão no Aditivo, Parametrização de Boleto PI.

- **Limites + Tranches** - o limite do cedente é dividido em tranches (faixas), não um
  número único.
- **CAR (Critérios de Aceitação de Risco)** - regras configuráveis por cliente que
  determinam o que o sistema aceita automaticamente. É o ponto onde mora a regra de
  reprovação/aceite automático que a rodada 1 não achou. O detalhe dos critérios **exige
  o código ou a tela** (não está no manual).
- **Política de Confirmação/Canhoto** - se e como os títulos precisam ser confirmados
  com o sacado (checagem) e se exigem canhoto (comprovante de entrega da mercadoria)
  antes de operar.

### 7B.5 Central do Sacado - o sacado também tem crédito

`centralsacado.php`: limites de crédito **do sacado**, títulos em aberto, títulos
liquidados, total a vencer, total operado, bloqueio, e **outros clientes que já operaram
com o sacado**. Ou seja, a exposição é controlada nos dois lados: por cedente e por
sacado. O relatório "Concentração de Sacados" e o "raio-X do sacado" reforçam isso.

### 7B.6 Comitê de crédito (`comitecredito.php`)

Grupo que analisa e decide a concessão com base em perfil do cliente, valor da operação,
risco, histórico. Decisões viram **pareceres** com justificativa de aprovação/recusa e
**condições aplicáveis à operação**. Há **títulos em caução** (`caucaotitulos.php`) -
garantia atrelada à operação.

### 7B.7 Ciclo de vida do título

**Inclusão** (6 formas): arquivo de remessa CRDC, Excel (modelo fixo), XML, CMC7 (linha
do cheque), número do documento fiscal (DP), manual.

**Análise:** cada título nasce com status inicial definido pela parametrização da
empresa (ex.: empresa configurada para recusar título vencido). **Importante:** o status
do título é informativo, não bloqueia. "Uma operação pode ser deferida mesmo que seus
títulos não estejam aprovados." Status editável enquanto for proposta.

**Eventos sobre o título:**
- **Baixa / liquidação** (`baixartitulo.php`) - manual ou por arquivo de retorno bancário.
- **Baixa parcial / amortização** (`baixaparcialtitulo.php`) - recalcula, amortiza,
  estornável.
- **Estorno** de título liquidado.
- **Prorrogação** (`prorrogartitulo.php`) - adia o vencimento **com recálculo e acréscimo
  de taxas**. Individual ou em lote.
- **Baixa PDD / Estorna PDD** (`baixartitulopdd.php`) - baixa contábil por inadimplência
  prolongada sem pagamento real; estornável se o devedor pagar depois.
- **Recompra** - o cedente recompra o título (vira crédito do cliente); há flag de
  **recompra prioritária**.
- **Envio jurídico / cartório / SPC**, cobrança interna, carta de anuência, cheque
  devolvido.
- **Ocorrências bancárias** (CNAB) e histórico de prorrogações/amortizações na
  timeline do título (`infotitulo.php`).

### 7B.8 Regra de imutabilidade (confirmada e precisada)

"Uma vez deferida, a operação não pode mais ser alterada." Reabertura só se **a data de
aceite estiver no mês atual** OU **o deferimento tiver ocorrido há até 5 dias úteis**.
Depois disso, imutável de vez.

**Para o CredX7i:** isto é exatamente o `simulacao_snapshot` + decisão imutável do
plano. A janela de reabertura vira uma regra explícita de transição de status com
verificação de data.

### 7B.9 Funding

- **Funding** (`entfundos.php`): fonte do recurso da operação (código, sigla,
  descrição). Cada operação aponta para um funding. Para o CredX7i, considerar apenas
  **capital próprio** por ora.

> **Fora de escopo (decisão do Carlos, 27/08/2026):** securitização via FIDC (cota,
> gestora/administradora, remessa a portal externo, elegibilidade por operação) não
> entra no CredX7i nesta fase. Suprimido desta documentação.

### 7B.10 Custos, taxas e comissão

- **Tabela de Custos** (`cadcustos.php`): várias tabelas por empresa, uma padrão. Custos
  da operação vêm dela.
- **Taxas/tarifas**: parametrizadas na empresa, herdadas pela operação, editáveis na
  operação (efeito local) ou na empresa (efeito global futuro).
- **Tarifas de operação** = cobranças sobre a antecipação (custo do serviço), reportadas
  por dia e acumuladas.
- **Comissão de gerente/agente**: % das operações que ele origina, parametrizada por
  agente (limites, taxas, valores). Categorias: Gerente, Agente, Operador, Promotora,
  Revenda. Gerada por período e produto; paga por conta corrente de comissões.

### 7B.11 Classificação de carteira e risco

- **Classificação da carteira** (`relclasscarteira.php`): "distribuição em níveis de
  valores em porcentagem que estabelece condições para os diferentes tipos de operação".
  Faixas de risco com percentuais - a taxonomia exata precisa da tela/código.
- **Carteira global** (`relcarteiraglobal`): a vencer, vencidos, **vencidos com PDD**,
  por região.
- **Relatório de deságio**: deságio por título.
- **Relatório de valor presente**: VP do título com o deságio já descontado.

### 7B.12 Esteiras e status configuráveis

Cinco esteiras independentes, cada uma com status editáveis (`editar_status.php`):
**Operacional, Financeiro, Cobrança, Checagem, Comercial**. A operação transita em várias
delas em paralelo. Isso explica por que a rodada 1 viu só uma lista de 9 status: era só
a esteira operacional.

**Esteira de checagem** (`confirmacao_titulov2.php`): confirmação prévia do recebível com
o sacado antes de operar (liga para o sacado, confirma a duplicata, aplica tags). Tem
relatório de produtividade.

### 7B.13 Integrações externas citadas (todas terceiros)

| Integração | Uso |
|------------|-----|
| **LiberaCred** (Dimensa) | score de crédito |
| **Serasa** | consulta e reciprocidade (troca de dados de pagamento por desconto na consulta) |
| **CERC / CRDC** | registradoras de recebíveis |
| **Vadu** | monitoramento de NF-e |
| **DimensaSign** | assinatura eletrônica de contrato, NP, duplicata |
| **Bancos (CNAB)** | remessa/retorno de cobrança |
| **OFX** | conciliação bancária contábil |

### 7B.14 Impacto no modelo alvo (consolidação)

Acréscimos e ajustes sobre a seção 6:

```
cedente (novos campos / relações)
  rating, score_externo, score_atualizado_em
cedente_limite
  cedente_id, tranche, valor, vigencia          -- limite em tranches
cedente_car                                     -- Criterios de Aceitacao de Risco
  cedente_id, regra (jsonb), ativo
cedente_politica_confirmacao
  cedente_id, exige_confirmacao, exige_canhoto, regra

sacado (novos campos)
  limite_credito, situacao_bloqueio
sacado_exposicao (view)                         -- total operado, a vencer, por cedente

grupo_economico
  id, nome
grupo_economico_membro
  grupo_id, entidade_tipo (CEDENTE|SACADO), entidade_id

funding
  id, sigla, descricao, tipo (PROPRIO)          -- FIDC fora de escopo nesta fase

operacao (novos campos)
  funding_id, deságio_total, rating_na_operacao,
  rentabilidade, categoria_id, data_aceite, data_deferimento,
  janela_reabertura_ate                          -- calculada: fim do mes do aceite ou +5 dias uteis
operacao_parecer_comite
  operacao_id, membro_id, voto, justificativa, condicoes, ocorrido_em
operacao_caucao
  operacao_id, titulo_id                          -- titulos dados em garantia

titulo (novos campos / eventos)
  forma_inclusao (REMESSA_CRDC|EXCEL|XML|CMC7|DP|MANUAL),
  status_checagem, confirmado_em, tem_canhoto,
  recompra_prioritaria, valor_presente, valor_desagio
titulo_evento                                     -- timeline unica
  titulo_id, tipo (LIQUIDACAO|BAIXA_PARCIAL|ESTORNO|PRORROGACAO|BAIXA_PDD|ESTORNO_PDD
                   |RECOMPRA|ENVIO_JURIDICO|OCORRENCIA_BANCARIA), dados jsonb, ocorrido_em
titulo_prorrogacao
  titulo_id, venc_antigo, venc_novo, taxa_aplicada, juros, multa, valor_recalculado

credito_cliente                                   -- "Creditos Clientes" do legado
  cedente_id, categoria_credito_id, origem (MANUAL|RECOMPRA|AUTOMATICO),
  valor, gerado_em, baixado_em

tabela_custo / tabela_taxa                         -- versionadas por empresa/tenant, uma padrao

esteira_status
  esteira (OPERACIONAL|FINANCEIRO|COBRANCA|CHECAGEM|COMERCIAL), codigo, descricao, ordem
operacao_status_esteira
  operacao_id, esteira, status_codigo, alterado_em, alterado_por
```

Regras catalogadas nesta rodada:

| # | Regra | Origem | Confiança |
|---|-------|--------|-----------|
| R24 | Risco do cliente = Σ títulos em aberto; Margem = Limite − Risco | manual 6.7 / análise | Alta |
| R25 | Limite do cedente é dividido em tranches | manual 2.2.5 | Média |
| R26 | CAR: critérios de aceitação de risco configuráveis por cedente decidem aceite automático | manual 2.2.5 | Média (existência); detalhe falta |
| R27 | Sacado tem limite de crédito e exposição controlada independente do cedente | manual 2.3.1 | Alta |
| R28 | Operação pode ser deferida com títulos não aprovados; status de título é informativo | manual 3.1.2 | Alta |
| R29 | Empresa pode recusar automaticamente título vencido na importação (parametrizável) | manual 3.1.2 | Alta |
| R30 | Operação deferida é imutável; reabre só se aceite no mês atual ou deferida há ≤ 5 dias úteis | manual 3.1.2 / 3.8 | Alta |
| R31 | Prorrogação recalcula o título e acrescenta taxas | manual 3.2.4 / 6.11 | Alta |
| R32 | PDD: baixa contábil por inadimplência sem pagamento, estornável | manual 3.2.5 | Alta |
| R33 | Operação comissária: sacado não notificado, cedente cobra e repassa | manual 2.13 | Alta |
| R34 | Vencidos no grupo econômico entram na análise da operação | manual 3.1.2 | Média |
| R35 | Cada operação aponta para um funding (fonte do recurso) | manual 3.1.2 / 2.9 | Alta |
| R36 | Taxas herdadas da empresa, editáveis por operação (local) ou global | manual 3.1.2 (Borderô) | Alta |
| R37 | Cinco esteiras paralelas com status configuráveis (Operacional, Financeiro, Cobrança, Checagem, Comercial) | manual 2.15 | Alta |
| R38 | Checagem: confirmação prévia do recebível com o sacado antes de operar, conforme política do cedente | manual 3.4 / 2.2.5 | Alta |
| R39 | IOF diferente para PF e PJ | manual 6.3 | Alta |
| R40 | Perfis de usuário: Empresa, Gerente Interno, Gerente Externo, Cliente, Sacado; permissão por tela | manual 2.8 | Alta |

### 7B.15 O que o manual NÃO resolve (continua precisando do código)

- Escala e cálculo do **rating** e das **faixas da classificação de carteira** (os %).
- Conteúdo concreto dos **CAR** (que condição reprova o quê).
- Fórmula da **rentabilidade** e do **deságio** por modalidade (o manual define o
  conceito, não a conta).
- **Alçada do comitê**: quantos pareceres, por faixa de valor, quórum.
- Regra de **cálculo do limite** do cedente e do sacado.
- Parâmetros de **PDD** (quantos dias de atraso disparam, % provisionado por faixa).
- Comportamento da **carência** (anomalia da rodada 2).

---

## 7C. Rodada 3b - Manual WEBESC ESC (RBM WEB, abril/2020)

Fonte: "Manual das Funcionalidades do Sistema WEBESC", Equipe de Suporte ESC, RBM WEB
(Leopoldina/MG), abril de 2020. É a versão **específica para ESC** (Empresa Simples de
Crédito), anterior à Dimensa. Como o público do CredX7i são ESCs, este é o documento
mais alinhado ao escopo. Complementa e, em alguns pontos, precisa o que os outros deram.

### 7C.1 Contexto legal da ESC (LC 167/2019) refletido no sistema

| Regra da ESC | Como aparece no WEBESC |
|--------------|------------------------|
| Opera só no **município-sede e municípios limítrofes** | Tela inicial "Proposta por municípios: local que a ESC está localizada, e as cidades limítrofes onde pode operar" |
| Só opera com **PJ** (ME, EPP, MEI e empresário individual) | Cadastro de cliente exige CNPJ; não há operação para PF pura |
| **Capital próprio** apenas, sem captação | Não há módulo de funding de terceiros nesta versão (o funding/FIDC só aparece na versão SEC) |
| **Registro obrigatório** das operações em registradora | CERC/B3; "o cliente possui 30 dias para registrar as operações" |
| Cessão de crédito notificada ao devedor | "Notificação de Compra: carta de notificação ao sacado sobre a cessão de crédito realizada" |

**Para o CredX7i:** o limite geográfico é regra de negócio de primeira classe. Cada
tenant (ESC) tem uma lista de **municípios habilitados** (sede + limítrofes), e o
cadastro de cliente/sacado e a criação de operação devem validar contra ela.

```
tenant_municipio_habilitado
  tenant_id, municipio_ibge, tipo (SEDE | LIMITROFE)
```

### 7C.2 Parametrização de taxas por cliente (Central do Cliente) - LISTA COMPLETA

O manual de 2020 lista todos os campos, o que a navegação não tinha dado:

| Campo | Significado |
|-------|-------------|
| **Fator** | taxa de desconto a ser operada com o cliente (custo da antecipação) |
| **Taxa mínima** | piso de taxa para operações desse cliente |
| **Floating** | dias de compensação do cheque, somados no cálculo do prazo |
| **Limite** | limite de crédito liberado |
| **Prazo de Protesto** | dias após o vencimento para o banco protestar |
| **Prazo Rec.** (recompra) | prazo para o cliente recomprar títulos vencidos |
| **Receita Bruta** | faturamento declarado do cliente |
| **Juros de mora** | % ao mês por atraso no título |
| **Multa** | % fixo por atraso no título |
| **Fator Prorrogação** | % cobrado para prorrogar o vencimento de um título |
| **Declara Simples** | se o cliente é optante do Simples Nacional |

> **Regra de IOF do Simples confirmada:** "Clientes que declaram o Simples possuem
> desconto no IOF de operações de até R$ 30.000,00." Isto resolve a pendência da seção
> 5A.7: a alíquota reduzida de IOF (LC 123/2006, art. 65-B) vale para o optante do
> Simples **na parcela da operação até R$ 30 mil**. No CredX7i:
> `parametro_fiscal` precisa de alíquota normal e alíquota Simples, e o motor aplica a
> reduzida sobre o principal até R$ 30.000 e a normal sobre o excedente, quando
> `cedente.declara_simples = true`.

```
cedente_parametro_taxa
  cedente_id, fator, taxa_minima, floating_dias, limite,
  prazo_protesto_dias, prazo_recompra_dias, receita_bruta,
  juros_mora_mes, multa_pct, fator_prorrogacao_pct, declara_simples,
  vigencia_inicio, vigencia_fim
```

### 7C.3 Garantias e formalização

Da Central do Cliente e do fluxo de deferimento:

- **Avalista** (garantia pessoal) - por operação.
- **Devedor(es) solidário(s)** - por cliente/operação.
- **Garantia real** - bem, imóvel, veículo, alienação fiduciária, vinculada ao contrato.
- **Nota Promissória do limite** - NP emitida pelo valor do limite liberado, como
  garantia guarda-chuva.
- **Contrato-mãe** - contrato base do cliente; cada operação gera um aditivo/contrato de
  desconto sob ele.
- **Declaração PNMPO** - declaração de que o cliente não tem outra operação de crédito
  no Programa Nacional de Microcrédito Produtivo Orientado.
- **Procuradores** e **acionistas/cotistas** cadastrados.

```
cedente_garantia
  cedente_id, tipo (AVALISTA | DEVEDOR_SOLIDARIO | GARANTIA_REAL | NP_LIMITE),
  descricao, documento_pessoa, valor, bem_tipo, dados jsonb
operacao_garantia
  operacao_id, cedente_garantia_id | avalista_documento, tipo
contrato_mae
  cedente_id, numero, assinado_em, documento_url
operacao_contrato
  operacao_id, contrato_mae_id, tipo (DESCONTO | EMPRESTIMO | ADITIVO), documento_url
```

### 7C.4 Empréstimo: por Taxa, por Parcela, ou Simulador

Três formas de entrada da operação de empréstimo/financiamento:

| Modo | O usuário informa | O sistema calcula |
|------|-------------------|-------------------|
| **Por Taxa** | modalidade, financia tarifa/IOF (diluir nas parcelas ou descontar do desembolso), tipo de pagamento, renegociação, periodicidade, valor nominal, nº de parcelas, 1º vencimento, **taxa** | o **valor da parcela** (Price) |
| **Por Parcela** | idem, mas informa o **valor da parcela** em vez da taxa | a **taxa efetiva** (resolve `i` que produz aquela parcela) |
| **Simulador** | idem "Por Taxa" | só simula, não grava |

**Para o CredX7i:** o motor precisa dos dois sentidos:
- `taxa -> parcela`: fórmula fechada (Price, seção 5A.3).
- `parcela -> taxa`: `i` tal que `PMT = PV · i / (1 − (1+i)^−n)`. Sem forma fechada;
  resolver por Newton-Raphson (converge em poucas iterações; é a mesma rotina do CET).

### 7C.5 Impostos sobre a operação

O relatório "Impostos" lista, por operação: **IOF, IRRF, PIS, COFINS**. A ESC recolhe
esses tributos sobre as operações. O relatório "Impostos por Parcela" detalha por
parcela.

**Para o CredX7i:** modelar `operacao_imposto (operacao_id, tributo, base, aliquota,
valor)` e incluir o cálculo de PIS/COFINS/IRRF no motor, além do IOF. As alíquotas
entram no `parametro_fiscal` versionado. (O detalhe do cálculo de IRRF/PIS/COFINS sobre
receita de ESC precisa de confirmação contábil e/ou do código.)

### 7C.6 Ciclo da operação e imutabilidade (versão ESC)

- Deferimento = mudar o Status da Operação para **07 (pago/deferido)**. "Sempre 07."
- **Recompra só é validada quando a operação chega ao status 07.**
- Operação deferida ou paga **não pode ser excluída**.
- **Reabertura**: janela de **5 dias**.
- **Operação registrada na CERC não pode ser reaberta** - o registro na registradora
  trava a operação de vez (mais forte que a janela de 5 dias).
- Prazo de **30 dias** para registrar a operação na registradora após o deferimento.

Isto refina R30: há **duas** travas de imutabilidade - a janela de reabertura (tempo) e
o registro na registradora (evento). A que ocorrer primeiro vale.

### 7C.7 Operação de desconto - entrada de títulos (versão ESC)

- **XML de NF-e** -> o sistema gera as **duplicatas**.
- **CMC7** -> cheques, manual ou por máquina leitora.
- **Chave de acesso da NF** -> manual.
- **Inclusão manual** dos dados do título.
- Passos extras no deferimento do desconto: **Gerador de Duplicatas**, **Notificação de
  Compra** (carta de cessão ao sacado), Recompra/Refinanciamento, Alterar títulos.

### 7C.8 Juros de mora em título vencido

"Caso o título esteja vencido, os juros vão continuar correndo até o pagamento completo."
Na baixa de título vencido, o sistema recalcula com juros de mora + multa (parâmetros do
cliente, seção 7C.2) antes de liquidar. Vale para baixa manual, baixa parcial e
prorrogação.

```
titulo (campos de mora)
  dias_atraso, juros_mora_acumulado, multa_aplicada, valor_atualizado
```

### 7C.9 Cheque devolvido (versão ESC)

Por cheque: data de depósito, data da 1ª devolução, **motivo (alínea Bacen)**, data de
reapresentação. Até **3 devoluções** por cheque. Na resolução: juros e multa da
devolução, recalcular, confirmar pagamento.

```
cheque_devolucao
  titulo_id, sequencia (1..3), data_deposito, data_devolucao,
  alinea, data_reapresentacao, juros, multa, resolvido_em
```

### 7C.10 Regras catalogadas nesta rodada

| # | Regra | Origem | Confiança |
|---|-------|--------|-----------|
| R41 | ESC opera só no município-sede e limítrofes; validar cliente/sacado/operação contra lista de municípios habilitados | manual ESC p.3 / LC 167/2019 | Alta |
| R42 | ESC opera só com PJ (ME/EPP/MEI/empresário individual), capital próprio | LC 167/2019 / ausência de PF e funding | Alta |
| R43 | Optante do Simples tem IOF reduzido na parcela da operação até R$ 30.000 | manual ESC p.5 / LC 123/2006 art. 65-B | Alta |
| R44 | Taxa do cliente parametrizada: fator, taxa mínima, floating, juros de mora, multa, fator de prorrogação, prazo de recompra, prazo de protesto | manual ESC p.5 | Alta |
| R45 | Floating (dias de compensação do cheque) entra no cálculo de prazo | manual ESC p.5 | Média |
| R46 | Empréstimo "por Parcela": sistema resolve a taxa a partir da parcela informada | manual ESC p.7 | Alta |
| R47 | "Financia tarifa/IOF": diluir nas parcelas ou descontar do desembolso (escolha por operação) | manual ESC p.7 | Alta |
| R48 | Impostos por operação: IOF, IRRF, PIS, COFINS (e por parcela) | manual ESC p.22 | Alta (existência); fórmula a confirmar |
| R49 | Deferimento = status 07; recompra só efetiva no status 07; operação deferida não é excluível | manual ESC p.8-9, p.14 | Alta |
| R50 | Operação registrada em registradora (CERC/B3) não pode ser reaberta; prazo de 30 dias para registrar | manual ESC p.16 | Alta |
| R51 | Título vencido: juros de mora + multa correm até a quitação; recalculados na baixa/prorrogação | manual ESC p.15 | Alta |
| R52 | Cheque devolvido: até 3 devoluções, com alínea Bacen, reapresentação, juros/multa | manual ESC p.17 | Alta |
| R53 | Garantias: avalista, devedor solidário, garantia real, NP do limite; contrato-mãe + aditivo por operação | manual ESC p.5-8 | Alta |
| R54 | Declaração PNMPO exigida no cadastro do cliente | manual ESC p.5 | Média |
| R55 | Notificação de cessão ao sacado na operação de desconto | manual ESC p.9 | Alta |

### 7C.11 Impacto no plano do CredX7i

Além dos acréscimos de modelo acima, dois pontos sobem para o
[PLANO_TECNICO.md](PLANO_TECNICO.md):

1. **Município habilitado por tenant** vira parte do provisionamento de cliente (ESC):
   ao cadastrar a ESC, define-se sede + limítrofes; toda operação valida contra isso.
   É também um controle de conformidade (a ESC não pode operar fora da área).

2. **Motor fiscal** não é só IOF. O CredX7i precisa de um componente de tributos
   (IOF com regra do Simples, IRRF, PIS, COFINS) parametrizado por vigência, porque o
   público-alvo são ESCs e esses tributos incidem sobre a receita da operação.

---

## 8. Próximos passos

### Rodada 2 (ainda sem código, se necessário)

- Dirigir o postback de `cadastroperacao.php` para capturar o formulário completo de
  "Empréstimo por Parcela ou Taxa" e "Amortização Juros".
- Rodar `calcEmp.php` com carência > 0, liquidação quinzenal/semanal/diária, e
  "Financia IOF" ligado, para fechar R6 e R7.
- Capturar `ajx/salvaOperacao.php` (payload de gravação) com uma operação de teste
  mínima, se você autorizar a gravação.
- Ler telas de Bancos, Conta Contábil, Feriados, Tipo de Documento para fechar as
  tabelas de apoio.

### Rodada 4 (com o código-fonte)

- Extrair o schema real (nomes, tipos, índices, FKs) e fazer o de-para definitivo.
- Documentar o cálculo de limite, as regras de reprovação e a alçada do comitê.
- Mapear os módulos periféricos (CNAB, contábil, CERC/B3) para decidir integração vs
  reconstrução.
- Confrontar este documento com o código e corrigir o que a inferência errou.

---

## 9. Referências

- [PLANO_TECNICO.md](PLANO_TECNICO.md) - arquitetura multitenant do CredX7i.
- Ambiente analisado: `https://esc.demonstracao.rbm.digital/` (demo, dados fictícios).
- Endpoint-chave: `ajx/calcEmp.php` (motor de simulação).
