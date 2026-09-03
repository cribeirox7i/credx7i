# CredX7i - Especificação Funcional do Módulo de Crédito

Versão 1.5 - 27/08/2026
Documento de especificação funcional. Descreve o comportamento esperado do módulo.
v1.1: operação com taxa pós-fixada indexada ao CDI (seção 8.13, RN-40 a RN-43).
v1.2: Tabela de IOF por tipo de tomador, redução do Simples, alíquota zero / isenção,
IOF em prorrogação e renegociação (RF-PAR-08, seção 8.6, RN-44 a RN-52).
v1.3: vencimento em dia não útil postergado para o próximo dia útil (RF-CAL-10, RN-53 a RN-56).
v1.4: carga de boletos para banco cobrador - CNAB 400 Bradesco (seção 11.2, Anexo A,
RN-57 a RN-64).
v1.5: emissão do boleto pelo banco (RF-COB-08); Nosso Número atribuído pelo banco.

---

## 1. Introdução

### 1.1 Objetivo

Especificar as funcionalidades, regras de negócio e o modelo de informação do **CredX7i**,
um módulo de crédito multicliente (multitenant) para Empresas Simples de Crédito (ESC).

O módulo cobre o ciclo completo: cadastro de tomadores, parametrização de crédito,
análise e decisão, simulação, originação de operações de empréstimo (capital de giro) e
de antecipação de recebíveis (desconto), cálculo financeiro e fiscal, gestão dos títulos,
cobrança e relatórios.

### 1.2 Escopo

**Coberto:**

- Crédito parcelado (empréstimo / capital de giro), tabelas Price e SAC, com taxa
  **prefixada** ou **pós-fixada indexada ao CDI** (CDI + spread, ou percentual do CDI).
- Antecipação de recebíveis (desconto de duplicatas, cheques, notas promissórias).
- Análise de crédito com limite, risco, margem, rating e comitê.
- Motor de cálculo: parcela, cronograma, IOF, tributos incidentes, CET, carência.
- Ciclo de vida da operação com esteiras de status e regras de imutabilidade.
- Gestão de títulos: liquidação, baixa parcial, prorrogação, mora, PDD, recompra, estorno.
- Cobrança interna, cobrança bancária (CNAB), envio a jurídico/cartório, negativação.
- Cheque devolvido.
- Garantias e formalização contratual.
- Registro das operações em registradora de recebíveis.
- Comissionamento de agentes.
- Relatórios operacionais e gerenciais.

**Fora de escopo nesta versão:**

- Securitização via FIDC (cotas, gestora/administradora, cessão a fundo).
- Indexadores diferentes do CDI (IPCA, IGP-M, TR, câmbio).
- Crédito rotativo e cartão de crédito.
- Contabilidade (o módulo expõe eventos contábeis; a escrituração é de outro módulo).
- Captação de recursos (a ESC opera com capital próprio).

### 1.3 Atores

| Ator | Descrição |
|------|-----------|
| **Operador** | Funcionário da ESC que cadastra, analisa e opera. |
| **Analista de crédito** | Avalia propostas, define limite e rating. |
| **Membro do comitê** | Emite parecer de aprovação/recusa em propostas acima de alçada. |
| **Gerente / Agente** | Origina operações; pode ser interno ou externo; recebe comissão. |
| **Cedente** (cliente) | PJ que toma crédito ou antecipa recebíveis. Acesso de consulta ao próprio portfólio. |
| **Sacado** | Devedor do título antecipado. Acesso de consulta aos próprios títulos. |
| **Administrador do tenant** | Configura a ESC: parâmetros, usuários, permissões, municípios. |
| **Sistema** | Rotinas automáticas: cálculo, geração de vencimentos, PDD, régua de cobrança. |

### 1.4 Referências

- LC 167/2019 - Empresa Simples de Crédito.
- LC 123/2006, art. 65-B - IOF reduzido para optantes do Simples Nacional.
- Decreto 6.306/2007 e alterações - IOF.
- [PLANO_TECNICO.md](PLANO_TECNICO.md) - arquitetura, multitenancy, segurança e conformidade.
- Glossário: seção 20.

---

## 2. Contexto de negócio

### 2.1 A Empresa Simples de Crédito

Uma ESC concede empréstimo, financiamento e desconto de títulos exclusivamente a
microempreendedores individuais, microempresas e empresas de pequeno porte, com **recursos
próprios**. O módulo aplica as restrições legais da ESC como regra de sistema:

- **RN-01 - Área de atuação.** A ESC opera apenas no município da sua sede e nos
  municípios limítrofes. O módulo mantém, por tenant, a lista de municípios habilitados
  (sede + limítrofes) e valida contra ela o endereço do cedente, do sacado e o local da
  operação. Operação fora da área habilitada é bloqueada.
- **RN-02 - Tomador elegível.** Apenas pessoa jurídica enquadrada como MEI, ME ou EPP, ou
  empresário individual. O cadastro de cedente exige CNPJ e o porte declarado.
- **RN-03 - Recurso próprio.** Toda operação é lastreada em funding próprio do tenant. Não
  há captação de terceiros.
- **RN-04 - Registro obrigatório.** Toda operação deferida deve ser registrada em
  registradora de recebíveis autorizada, dentro do prazo legal (30 dias corridos a partir
  do deferimento).

### 2.2 Modalidades de operação

| Modalidade | Descrição | Precificação |
|------------|-----------|--------------|
| **Empréstimo / Capital de Giro** | Crédito parcelado; o tomador recebe o principal e paga em parcelas. Taxa prefixada ou pós-fixada ao CDI. | Tabela Price ou SAC sobre o valor principal. |
| **Financiamento** | Igual ao empréstimo, com destinação vinculada; efeito fiscal/contábil distinto. | Tabela Price ou SAC, prefixada ou pós-fixada. |
| **Desconto (antecipação de recebíveis)** | O cedente cede à ESC direitos creditórios (duplicata, cheque, NP); a ESC paga antecipado o valor presente. | Deságio sobre o valor de face de cada título. |
| **Operação comissária** | Variante do desconto em que o sacado não é notificado; o cedente continua responsável por cobrar e repassar. | Deságio. Marcada por título. |

### 2.3 Regras regulatórias que o módulo aplica

Além de RN-01 a RN-04:

- **RN-05 - IOF do Simples.** Cedente optante do Simples Nacional tem alíquota de IOF
  reduzida na parcela da operação cujo somatório de principal não exceda R$ 30.000,00 no
  período de 12 meses; sobre o excedente aplica-se a alíquota normal. O controle do teto
  acumulado é por cedente.
- **RN-06 - Tributos sobre a operação.** Cada operação apura IOF, IRRF, PIS e COFINS,
  conforme parâmetros fiscais vigentes na data da operação.
- **RN-07 - Declaração PNMPO.** O cadastro do cedente registra a declaração de que não
  possui operação de crédito ativa no âmbito do Programa Nacional de Microcrédito
  Produtivo Orientado, quando aplicável.

---

## 3. Visão geral do módulo

### 3.1 Macroprocessos

```
Cadastro          Parametrização        Análise            Originação
de cedente   ->   de crédito       ->   e decisão     ->   da operação
                  (limite, taxa,        (score, risco,     (simulação,
                   CAR, política)        margem, comitê)     títulos, garantias)
                                                                  |
                                                                  v
Encerramento  <-  Cobrança         <-   Gestão dos     <-   Deferimento,
(liquidação)      (interna, banco,      títulos             contrato,
                   jurídico)            (mora, PDD)          desembolso, registro
```

### 3.2 Multitenancy

Cada ESC é um tenant isolado. O isolamento de dados, a resolução de tenant, os papéis de
acesso e os requisitos de segurança, auditoria e conformidade (LGPD) estão definidos no
[PLANO_TECNICO.md](PLANO_TECNICO.md). Para efeito desta especificação:

- **RN-08.** Todo registro de negócio pertence a exatamente um tenant e nunca é visível a
  outro tenant.
- **RN-09.** Todo evento que altera estado financeiro ou decisão de crédito é gravado em
  trilha de auditoria imutável (quem, quando, o quê, valor anterior e novo).

### 3.3 Perfis de acesso

Perfis mínimos, com permissão por funcionalidade e por operação de escrita
(leitura/inclusão/edição/exclusão): Administrador do tenant, Operador, Analista, Comitê,
Gerente interno, Gerente externo, Cedente (consulta), Sacado (consulta). O cedente e o
sacado só enxergam o próprio portfólio.

---

## 4. Cadastros

### 4.1 Cedente

**RF-CAD-01.** O módulo mantém o cadastro do cedente (PJ) com:

- Identificação: CNPJ, razão social, nome fantasia, porte (MEI/ME/EPP), data de abertura,
  atividade econômica.
- Endereço completo, com município (código IBGE) validado contra a área habilitada (RN-01).
- Contatos: telefones, celulares, e-mails.
- Sócios / cotistas: CPF, nome, percentual de participação.
- Procuradores e representantes legais.
- Referências: comerciais, bancárias e pessoais.
- Contas bancárias (para desembolso), com banco, agência, conta e tipo.
- Faturamentos recentes e receita bruta declarada.
- Declaração do Simples Nacional (RN-05) e declaração PNMPO (RN-07).
- Documentos digitalizados (contrato social, documentos dos sócios, etc.).

**RF-CAD-02.** O cedente tem um **status de cadastro** (`RASCUNHO`, `EM_ANALISE`,
`APROVADO`, `REPROVADO`, `SUSPENSO`, `BLOQUEADO`). Cada mudança registra observação, usuário
e data-hora, formando histórico.

- **RN-10.** Só é possível originar operação para cedente com status `APROVADO`.
- **RN-11.** O histórico de status é append-only.

**RF-CAD-03.** O módulo gera a Ficha Cadastral do cedente em PDF com todos os dados
preenchidos.

### 4.2 Sacado

**RF-CAD-04.** O módulo mantém o cadastro do sacado (PF ou PJ): documento, nome/razão
social, endereço (município validado contra a área habilitada), contatos, atividade.

**RF-CAD-05.** O sacado possui **limite de crédito próprio** e indicador de bloqueio.

- **RN-12.** A exposição a um sacado é controlada de forma independente da exposição ao
  cedente. Um título só é aceito se o total em aberto do sacado (somados todos os cedentes
  do tenant) não ultrapassar o limite do sacado.

**RF-CAD-06.** A Central do Sacado apresenta: limite, títulos em aberto, títulos
liquidados, total a vencer, total operado, situação de bloqueio e a relação de cedentes
que já operaram com esse sacado.

### 4.3 Grupo econômico

**RF-CAD-07.** O módulo permite agrupar cedentes e sacados em grupos econômicos.

- **RN-13.** A análise de uma operação considera os títulos vencidos de todo o grupo
  econômico do cedente, não apenas do cedente isolado.

### 4.4 Agente / Gerente

**RF-CAD-08.** Cadastro de agentes com categoria (`GERENTE_INTERNO`, `GERENTE_EXTERNO`,
`AGENTE`, `OPERADOR`, `PROMOTORA`, `REVENDA`), situação (`ATIVO`/`INATIVO`), dados
bancários e parâmetros de comissionamento (percentuais, limites, tetos).

### 4.5 Tabelas de apoio

**RF-CAD-09.** O módulo mantém, por tenant quando aplicável:

| Tabela | Conteúdo |
|--------|----------|
| Municípios habilitados | Município-sede e limítrofes (RN-01). |
| Atividade econômica | Descrição e segmento (Indústria / Comércio / Serviço / Público). |
| Bancos | Código FEBRABAN e nome. |
| Contas contábeis / de desembolso | Conta COSIF, descrição. |
| Feriados | Data, abrangência (Municipal / Estadual / Nacional / Mundial). |
| Categorias de operação | Sigla e descrição, personalizáveis. |
| Tipos de documento de título | `DP` duplicata, `CH` cheque, `NP` nota promissória, `BL` boleto, `CC` conta corrente, `DB` débito, `OU` outros. |
| Categorias de crédito | Para os créditos do cliente (seção 12). |
| Escritórios de cobrança / jurídico | CPF/CNPJ e nome. |

---

## 5. Parametrização de crédito

### 5.1 Limite e tranches

**RF-PAR-01.** Cada cedente tem um limite de crédito aprovado, que pode ser dividido em
**tranches** (faixas com condições próprias, por exemplo por modalidade ou por prazo).

- **RN-14 - Margem.** Margem disponível = limite aprovado − risco. O **risco** é a soma do
  valor em aberto de todos os títulos do cedente (seção 6.4).
- **RN-15.** Uma operação só é deferida se o seu valor couber na margem disponível da
  tranche aplicável, salvo aprovação explícita do comitê registrando o excesso.

**RF-PAR-02.** O limite tem vigência. Alterações de limite são versionadas e auditadas.

### 5.2 Taxas e tarifas por cedente

**RF-PAR-03.** O módulo mantém, por cedente e com vigência:

| Parâmetro | Uso |
|-----------|-----|
| **Fator** | Taxa de referência da operação com esse cedente. |
| **Taxa mínima** | Piso de taxa; nenhuma operação abaixo dela sem autorização. |
| **Floating** | Dias de compensação do cheque, somados ao prazo no cálculo. |
| **Juros de mora** | Percentual ao mês sobre título em atraso. |
| **Multa** | Percentual fixo sobre título em atraso. |
| **Fator de prorrogação** | Percentual cobrado para prorrogar o vencimento de um título. |
| **Prazo de recompra** | Dias para o cedente recomprar título vencido. |
| **Prazo de protesto** | Dias após o vencimento para instruir protesto. |

**RF-PAR-04.** As taxas da operação são herdadas destes parâmetros no momento da
originação. O operador pode ajustá-las na própria operação (efeito local, respeitando a
taxa mínima) ou alterar os parâmetros do cedente (efeito nas operações futuras).

### 5.3 Política de confirmação e canhoto

**RF-PAR-05.** Por cedente, define-se se os títulos precisam de **confirmação prévia** com
o sacado (checagem) e se exigem **canhoto** (comprovante de entrega da mercadoria) antes
da operação ser deferida.

- **RN-16.** Título sujeito a confirmação obrigatória não pode compor operação deferida
  enquanto não estiver confirmado.

### 5.4 Critérios de Aceitação de Risco (CAR)

**RF-PAR-06.** Por cedente (ou por política padrão do tenant), define-se um conjunto de
critérios que o sistema avalia automaticamente sobre a proposta e seus títulos, produzindo
um dos resultados: `ACEITO`, `ACEITO_COM_RESSALVA`, `RECUSADO`, `COMITÊ`.

Os critérios são configuráveis e podem considerar, entre outros: valor da operação, prazo,
concentração por sacado, títulos vencidos do cedente e do grupo, score, rating, situação
cadastral, tipo de documento, presença de garantia. *(O conjunto exato de critérios e seus
limiares é decisão de negócio - seção 19.)*

### 5.5 Tabelas de custo

**RF-PAR-07.** O tenant mantém uma ou mais tabelas de custos operacionais (TED, boleto,
tarifa de análise, tarifa de registro, tarifa de software, outros), sendo uma marcada como
padrão. Os custos entram no cálculo do valor líquido a desembolsar e do CET.

### 5.6 Parâmetros fiscais

**RF-PAR-08.** O módulo mantém os parâmetros fiscais **versionados por vigência**. São
duas estruturas:

**(a) Tabela de IOF/Crédito.** Uma linha por combinação de dimensões, com vigência:

| Dimensão | Valores |
|----------|---------|
| Tipo de tomador | `PJ`, `PJ_SIMPLES`, `MEI`, `PF`, `COOPERATIVA`, `ISENTO` |
| Enquadramento da operação | `PADRAO`, `PNMPO` (microcrédito produtivo orientado), `RURAL`, `HABITACIONAL`, `EXPORTACAO`, `RENEGOCIACAO` |
| Alíquota diária | percentual ao dia sobre o principal em aberto |
| Alíquota diária reduzida | percentual ao dia aplicável até o teto de valor (ver `PJ_SIMPLES`) |
| Teto de valor da redução | limite de principal com alíquota reduzida (ex.: R$ 30.000 acumulados em 12 meses) |
| Alíquota adicional | percentual único sobre o principal, na liberação, independe do prazo |
| Teto de dias | limite de dias corridos para incidência da alíquota diária (ex.: 365) |
| Indicador de isenção total | quando `true`, a operação não sofre IOF (diário nem adicional) |

**(b) Tabela de tributos sobre a receita da operação.** IRRF, PIS, COFINS: base de
cálculo e alíquota, por tipo de tomador e enquadramento, com vigência.

- **RN-17.** O cálculo de qualquer operação usa sempre os parâmetros fiscais vigentes na
  **data da operação**, nunca valores fixos em código.
- **RN-44.** A linha de IOF aplicável é resolvida por: tipo de tomador (do cadastro do
  cedente) + enquadramento da operação (definido na originação, com `PADRAO` como
  default). Não havendo linha específica, aplica-se a de tipo `PJ` / `PADRAO`.
- **RN-45.** Os valores concretos das alíquotas são carregados pelo tenant a partir da
  legislação vigente (Decreto 6.306/2007 e alterações; LC 123/2006, art. 65-B, para o
  Simples). O módulo não embute alíquotas; toda a matriz é dado. *(Conferência dos
  valores vigentes: seção 19.)*

---

## 6. Análise e decisão de crédito

### 6.1 Proposta

**RF-ANA-01.** Uma proposta de crédito é criada para um cedente e contém a modalidade
pretendida, o valor, o prazo e as condições. Enquanto é proposta, todos os campos são
editáveis.

### 6.2 Consulta de score e bureau

**RF-ANA-02.** O módulo integra-se a serviços externos de score e consulta de crédito
(bureau) para cedente e sacado. O retorno (score, faixa, indicadores, data) é armazenado
e vinculado à proposta.

- **RN-18.** A decisão de crédito não é automática pelo score; o score é insumo. A regra de
  uso do score está nos CAR (RF-PAR-06).

### 6.3 Rating

**RF-ANA-03.** O cedente possui um **rating** interno, atribuído pela análise, considerando
score externo, histórico de pagamento, porte, tempo de relacionamento e concentração.
*(Escala e fórmula do rating: decisão de negócio - seção 19.)*

### 6.4 Risco e margem

**RF-ANA-04.** O módulo calcula e exibe, em tempo real, para o cedente:

- **Risco** = Σ valor em aberto de todos os títulos do cedente.
- **Margem** = limite aprovado − risco.
- Títulos vencidos do cedente e do grupo econômico.
- Volume operado e rentabilidade histórica.

### 6.5 Comitê de crédito

**RF-ANA-05.** Propostas encaminhadas ao comitê recebem **pareceres** de seus membros. Cada
parecer registra o voto (`APROVA`, `REPROVA`, `PENDÊNCIA`), a justificativa e as condições
aplicáveis (por exemplo, exigência de garantia adicional, redução de prazo).

**RF-ANA-06.** O deferimento respeita a **alçada**: propostas até um valor podem ser
deferidas pelo analista; acima disso exigem quórum do comitê. *(Faixas de alçada e quórum:
decisão de negócio - seção 19.)*

### 6.6 Deferimento

**RF-ANA-07.** O deferimento da operação:

1. Valida margem (RN-15), área de atuação (RN-01), elegibilidade do tomador (RN-02),
   política de confirmação (RN-16) e resultado dos CAR.
2. Consolida o **snapshot** de decisão: parâmetros usados, resultado do motor de cálculo,
   score, rating, pareceres.
3. Registra data e responsável pelo deferimento.

- **RN-19.** O snapshot de decisão é imutável e é a referência para qualquer contestação
  futura. Recalcular a operação depois não substitui o snapshot.

---

## 7. Simulação e originação da operação

### 7.1 Simulador

**RF-SIM-01.** O módulo oferece um simulador que executa o motor de cálculo (seção 8) sem
criar operação. A simulação pode ser salva e depois convertida em proposta.

### 7.2 Empréstimo / capital de giro

**RF-OPE-01.** A operação de empréstimo é originada em um de dois modos:

| Modo | Entrada do operador | Saída do sistema |
|------|---------------------|------------------|
| **Por taxa** | Modalidade, tratamento do IOF (financiado ou descontado do desembolso), forma de pagamento, periodicidade, valor principal, nº de parcelas, 1ª data de vencimento, **taxa** | Valor da parcela e cronograma |
| **Por parcela** | Idem, mas informa o **valor da parcela** | Taxa efetiva que produz aquela parcela, e cronograma |

**RF-OPE-02.** Parâmetros da operação de empréstimo:

- Modalidade: `EMPRESTIMO` ou `FINANCIAMENTO`.
- Sistema de amortização: `PRICE` ou `SAC`.
- Indexador da taxa: `PREFIXADO` ou `POS_CDI`. Para `POS_CDI`, informa-se a forma
  (`CDI_MAIS_SPREAD` com spread em % a.a., ou `PERCENTUAL_CDI` com o percentual) e a base
  de capitalização (padrão: 252 dias úteis). Ver seção 8.13.
- Periodicidade: `MENSAL`, `QUINZENAL`, `SEMANAL` ou `DIARIA` (com dias úteis configuráveis
  para a diária).
- Carência, em número de períodos.
- Tratamento do IOF: `FINANCIADO` (somado ao principal) ou `DESCONTADO` (retido no
  desembolso).
- Forma de pagamento: `BOLETO`, `CHEQUE`, `DEBITO_EM_CONTA`, `CARTAO`.
- Indicador de renegociação.
- Conta(s) de desembolso e valor por conta.

### 7.3 Operação de desconto (antecipação de recebíveis)

**RF-OPE-03.** A operação de desconto é composta por um ou mais títulos cedidos. Para cada
título: cedente, sacado, tipo de documento, número, valor de face, data de emissão, data
de vencimento, natureza (mercantil/serviço) quando duplicata, indicador comissária.

**RF-OPE-04.** O valor pago ao cedente por título é o **valor presente**: valor de face
menos o **deságio**, calculado com a taxa da operação e o prazo (dias corridos entre a
data da operação e o vencimento, acrescidos do floating quando cheque).

**RF-OPE-05.** Passos adicionais no deferimento do desconto: geração de duplicatas a
partir de NF-e, **notificação de cessão** ao sacado (exceto operação comissária),
confirmação/checagem conforme política (RF-PAR-05).

### 7.4 Inclusão de títulos

**RF-OPE-06.** Títulos podem ser incluídos por: importação de arquivo (layout padrão do
sistema), XML de NF-e, leitura de CMC7 (cheque), chave de acesso de NF-e, ou digitação
manual.

**RF-OPE-07.** Após a inclusão, o operador pode, enquanto a operação for proposta:
alterar em lote o status dos títulos, alterar vencimentos (data direta ou soma/subtração
de dias), normalizar o número do documento (localizar/substituir), e editar título a
título.

- **RN-20.** O status de um título é informativo e não bloqueia o deferimento da operação,
  salvo o caso da política de confirmação obrigatória (RN-16). Uma operação pode ser
  deferida com títulos ainda não aprovados.
- **RN-21.** O tenant pode configurar a recusa automática, na importação, de títulos já
  vencidos.

### 7.5 Garantias

**RF-OPE-08.** A operação pode ter garantias:

- **Avalista** (garantia pessoal), por operação.
- **Devedor solidário**, por cedente ou por operação.
- **Garantia real**: bem, imóvel, veículo, alienação fiduciária, vinculada ao contrato.
- **Nota promissória do limite**: NP emitida pelo valor do limite aprovado, como garantia
  guarda-chuva do cedente.

### 7.6 Formalização

**RF-OPE-09.** Cada cedente tem um **contrato-mãe**. Cada operação gera um instrumento
(contrato de desconto ou de empréstimo, ou aditivo ao contrato-mãe).

**RF-OPE-10.** O módulo integra-se a serviço de assinatura eletrônica para contrato, nota
promissória e duplicata, com seleção de signatários e envio por e-mail ou SMS.

### 7.7 Desembolso

**RF-OPE-11.** O desembolso ao cedente é feito em uma ou mais contas, com valor por conta.
O valor total desembolsado é o resultado do motor de cálculo (seção 8.9): principal (ou
valor presente dos títulos) menos IOF retido, menos tributos retidos, menos custos e
tarifas retidos, menos recompras liquidadas na operação.

---

## 8. Motor de cálculo financeiro

O motor é um componente único, determinístico, executado no servidor, coberto por testes
com casos de referência. Toda operação e toda simulação passam por ele.

### 8.1 Notação

| Símbolo | Significado |
|---------|-------------|
| `PV` | Valor principal financiado (base do cálculo da parcela). |
| `i` | Taxa de juros efetiva por período. Constante quando prefixada; `i_k` variável por parcela quando pós-fixada (seção 8.13). |
| `n` | Número de parcelas. |
| `k` | Índice da parcela, de 1 a `n`. |
| `c` | Carência, em número de períodos. |
| `PMT` | Valor da parcela (constante na Price). |
| `A_k`, `J_k` | Amortização e juros da parcela `k`. |
| `SD_k` | Saldo devedor após a parcela `k` (`SD_0 = PV`). |
| `d_k` | Dias corridos entre a liberação e o vencimento da parcela `k`. |

### 8.2 Tabela Price (parcela constante)

```
PMT = PV · i / ( 1 − (1 + i)^(−n) )
```

Cronograma:

```
J_k  = SD_{k−1} · i
A_k  = PMT − J_k
SD_k = SD_{k−1} − A_k
SD_0 = PV ,  SD_n = 0
```

Total de juros: `Σ J_k = n · PMT − PV`.

### 8.3 Tabela SAC (amortização constante)

```
A_k   = PV / n
J_k   = SD_{k−1} · i
PMT_k = A_k + J_k            (parcela decrescente)
SD_k  = PV · (1 − k/n)
```

Total de juros: `Σ J_k = i · PV · (n + 1) / 2`.

### 8.4 Inversão parcela → taxa

No modo "por parcela" (RF-OPE-01), o sistema resolve `i` tal que
`PMT = PV · i / (1 − (1+i)^(−n))`, por método iterativo (Newton-Raphson), com a mesma
rotina usada no CET.

### 8.5 Carência

Durante `c` períodos não há amortização. Convenção adotada: **capitalização** - os juros
da carência são incorporados ao principal antes da montagem do cronograma:

```
PV' = PV · (1 + i)^c
```

e aplica-se Price ou SAC sobre `PV'` e `n` parcelas. *(Confirmar se haverá também a opção
"carência com pagamento de juros" - seção 19.)*

### 8.6 IOF

#### 8.6.1 Cálculo base

```
IOF_total       = IOF_adicional + Σ_k IOF_principal_k
IOF_adicional   = base · α_adicional
IOF_principal_k = base_k · min(d_k, teto_dias) · α_dia_efetiva_k
```

- `base` / `base_k` - principal da operação / principal em aberto atribuível à parcela
  `k` (a amortização de `k` na Price/SAC).
- `α_adicional` - alíquota adicional, única, sobre o principal, na liberação; independe do
  prazo.
- `α_dia_efetiva_k` - alíquota diária, resolvida conforme 8.6.2 e 8.6.3.
- `teto_dias` - limite de dias corridos para o IOF diário; dias além do teto não geram
  IOF.
- `d_k` conta da data de liberação ao vencimento da parcela `k`; para título em cheque,
  soma-se o floating (RF-PAR-03).

Se o IOF for `FINANCIADO`, ele entra em `PV` e o cálculo itera até convergir (o IOF
depende de `A_k`, que depende de `PV`). Se `DESCONTADO`, é retido no desembolso.

#### 8.6.2 Alíquota por tipo de tomador

A alíquota diária e a adicional vêm da linha da Tabela de IOF (RF-PAR-08a) resolvida por
tipo de tomador + enquadramento (RN-44). A ESC opera com pessoa jurídica; os tipos
previstos são `PJ`, `PJ_SIMPLES`, `MEI`, `COOPERATIVA` e, para casos subjetivos, `ISENTO`.
O tipo `PF` fica previsto na estrutura para eventual uso futuro, sem operação hoje.

- **RN-46.** O tipo de tomador da operação é o do cedente no momento da originação e é
  gravado no snapshot. Alterar o cadastro do cedente depois não altera operações já
  deferidas.

#### 8.6.3 Redução do Simples e faixa de R$ 30.000

Para cedente `PJ_SIMPLES` (optante do Simples Nacional):

```
Seja L o principal já operado pelo cedente nos últimos 12 meses com alíquota reduzida.
Para o principal P desta operação:
  parcela_reduzida = max(0, min(P, teto_reducao − L))
  parcela_normal   = P − parcela_reduzida
IOF diário: aplica α_dia_reduzida sobre parcela_reduzida e α_dia_normal sobre parcela_normal,
proporcionalmente distribuídas entre as parcelas k.
```

- `teto_reducao` = R$ 30.000,00 (parâmetro, RF-PAR-08a).
- **RN-05** (reafirmada): o controle do teto acumulado de R$ 30.000 é por cedente, em
  janela móvel de 12 meses; o módulo mantém o saldo consumido e o expõe na análise.
- **RN-47.** A alíquota adicional (0,38%) **não** tem redução pelo Simples; incide
  integralmente, salvo enquadramento isento (8.6.4).

#### 8.6.4 Alíquota zero e isenção

| Situação | Efeito no IOF | Base |
|----------|---------------|------|
| Operação enquadrada como **PNMPO** (microcrédito produtivo orientado) | **Alíquota zero**: sem IOF diário e sem adicional | Decreto 6.306/2007; conecta com a declaração PNMPO do cedente (RN-07) |
| Operação de **crédito rural** (quando o tomador se enquadra) | Alíquota zero | Decreto 6.306/2007 |
| Tomador com **isenção subjetiva** (órgão público, ente isento) | Isenção total; marca `ISENTO` no tipo de tomador | Decreto 6.306/2007, art. 9º |
| Cooperativa de crédito operando com cooperado | Alíquota zero para a parcela pertinente | Decreto 6.306/2007 |

- **RN-48.** Quando a linha de IOF aplicável tem `isencao_total = true` **ou**
  `α_dia = 0` **e** `α_adicional = 0`, a operação não sofre IOF; o motor grava
  `IOF_total = 0` e registra no snapshot o enquadramento e a base legal.
- **RN-49.** O enquadramento que gera alíquota zero/isenção exige, na originação, o
  documento comprobatório correspondente (declaração PNMPO, comprovação de destinação
  rural, ato de reconhecimento de isenção). Sem o documento, a operação é tratada como
  `PADRAO`.

#### 8.6.5 Prorrogação, renegociação e novação

- **RN-50.** Em prorrogação, renovação, novação ou confissão de dívida **sem
  substituição de devedor**, o IOF incide sobre o **saldo devedor não liquidado**, como
  tributação **complementar** à da operação original, usando a **alíquota vigente na data
  da operação original**, e respeitando o teto de 365 dias somados (original +
  prorrogação). Não há nova cobrança da alíquota adicional.
- **RN-51.** Em renegociação **com** novo desembolso ao cedente, o IOF (diário +
  adicional) incide apenas sobre o **valor acrescido**, não sobre o saldo rolado.
- **RN-52.** Em substituição de devedor / assunção de dívida, não há novo fato gerador de
  IOF sobre o saldo transferido.

#### 8.6.6 IOF em operação pós-fixada

Ver seção 8.13, RF-CAL-08: o IOF diário é provisionado na projeção e ajustado na apuração
de cada parcela; a alíquota (por tipo de tomador e enquadramento) é fixada no fechamento e
não muda na apuração.

### 8.7 Demais tributos

**RF-CAL-01.** Por operação, o motor apura IRRF, PIS e COFINS sobre a base e alíquotas dos
parâmetros fiscais vigentes (RF-PAR-08). O detalhamento por parcela é gerado para o
relatório de impostos por parcela. *(Base e alíquotas de IRRF/PIS/COFINS sobre receita de
ESC: confirmar com a contabilidade - seção 19.)*

### 8.8 Custos e tarifas

**RF-CAL-02.** O motor soma os custos operacionais da tabela vigente (RF-PAR-07) e as
tarifas da operação, retendo-os no desembolso ou diluindo-os nas parcelas conforme
configuração.

### 8.9 Valor líquido a desembolsar

```
desembolso = base_bruta
             − IOF_retido
             − tributos_retidos
             − custos_e_tarifas_retidos
             − recompras_liquidadas
```

onde `base_bruta` é `PV` (empréstimo) ou a soma dos valores presentes dos títulos
(desconto).

### 8.10 CET (Custo Efetivo Total)

**RF-CAL-03.** O motor calcula o CET como a taxa `j` por período que satisfaz:

```
desembolso_liquido = Σ_k  PMT_k / (1 + j)^k
```

resolvida por método iterativo. O CET é apresentado ao cedente na oferta e registrado no
snapshot.

### 8.11 Cronograma de vencimentos

**RF-CAL-04.**

```
venc_nominal_1 = data_liberacao + 1 período + carência
venc_nominal_k = venc_nominal_1 + (k − 1) períodos
venc_k         = ajuste_dia_util(venc_nominal_k)
```

Período conforme a periodicidade. Na periodicidade diária, contam apenas os dias úteis
configurados e pulam-se os feriados.

**RF-CAL-10 - Ajuste de vencimento em dia não útil.** Se o vencimento nominal cair em
sábado, domingo ou feriado (calendário de feriados do tenant - RF-CAD-09 -, considerando
a abrangência aplicável ao município da operação), o vencimento é **postergado para o
próximo dia útil** (convenção "seguinte", sempre para frente, inclusive quando o próximo
dia útil cair no mês seguinte).

- **RN-53.** O vencimento nominal é a referência de cadência: `venc_nominal_k` é sempre
  calculado a partir de `venc_nominal_1`, nunca a partir do vencimento ajustado da parcela
  anterior. Assim o adiamento de uma parcela não desloca as seguintes.
- **RN-54.** A parcela (`PMT` na Price, `PMT_k` na SAC) **não muda** por causa do ajuste;
  o cronograma de juros usa a cadência nominal.
- **RN-55.** O IOF diário e a contagem de `d_k` usam a **data ajustada** (`venc_k`), ou
  seja, os dias efetivos até o pagamento.
- **RN-56.** Juros de mora e multa (RN-29) só começam a correr no dia seguinte ao
  **vencimento ajustado**.
- O mesmo `ajuste_dia_util` aplica-se a prorrogações e a datas de vencimento informadas
  manualmente pelo operador.

### 8.12 Contrato do motor

Entrada: sistema de amortização, indexador, `PV`, `i` prefixado (ou `PMT`, ou spread /
percentual do CDI), `n`, `c`, periodicidade, dias úteis, data de liberação, tratamento do
IOF, parâmetros fiscais vigentes, tabela de custos, floating, e - para pós-fixado - a
curva de projeção do CDI e a série realizada.

Saída: cronograma completo (por parcela: vencimento, prestação, amortização, juros, saldo
devedor, dias, IOF, tributos), IOF total, tributos totais, custos totais, valor líquido a
desembolsar, CET (efetivo para prefixado, estimado para pós-fixado), e o **snapshot**
serializado.

- **RN-22.** A saída do motor no momento do deferimento é gravada integralmente no
  snapshot da operação (RN-19).

### 8.13 Operação pós-fixada (indexada ao CDI)

Aplica-se quando o indexador é `POS_CDI` (RF-OPE-02). A taxa da parcela `k` tem uma
componente indexada (CDI acumulado do período) e uma componente fixa (spread ou fração do
CDI). O valor exato de cada parcela só é conhecido no seu vencimento; até lá o sistema
trabalha com **projeção**.

**RF-CAL-05 - Taxa efetiva do período.**

```
POS_CDI, forma CDI_MAIS_SPREAD:
  i_k = (fator_CDI_do_período_k) · (1 + spread)^(dias_úteis_k / 252) − 1

POS_CDI, forma PERCENTUAL_CDI:
  i_k = (1 + CDI_efetivo_do_período_k)^(percentual) − 1        (aprox. usual)
```

onde `fator_CDI_do_período_k` é o produtório `Π (1 + DI_d)` sobre os dias úteis `d` do
período da parcela `k` (`DI_d` = taxa DI diária, base 252). Na projeção usa-se a curva
futura de DI; na apuração usa-se a série realizada.

**RF-CAL-06 - Cronograma projetado x cronograma apurado.**

- No fechamento, o motor gera o **cronograma projetado** usando a curva de DI vigente:
  parcelas, IOF (sobre o principal projetado), CET estimado.
- A cada vencimento, o sistema executa a **apuração da parcela**: recalcula `i_k` com o
  CDI realizado do período, define a prestação efetiva, a amortização e o novo saldo
  devedor, e recompõe as parcelas seguintes ainda projetadas.
- O cronograma exibido ao tomador é sempre "realizado até a data + projeção do restante".

**RF-CAL-07 - Fonte do CDI.** O módulo mantém a série histórica da taxa DI diária
(`serie_indexador`), alimentada por integração diária, e uma curva de projeção
(estrutura a termo). *(Provedor da série e da curva: seção 19.)*

**RF-CAL-08 - IOF em operação pós-fixada.** O IOF adicional (0,38%) incide sobre o
principal na liberação, igual ao prefixado. O IOF diário incide sobre a amortização de
cada parcela; como a amortização só é definitiva na apuração, o IOF da parcela é
**provisionado** na projeção e **ajustado** na apuração. A diferença é lançada como
complemento/estorno de IOF.

**RF-CAL-09 - CET.** Para pós-fixado o CET é **estimado** (usa a projeção) e rotulado
como tal na oferta. O snapshot guarda a curva usada. Após a liquidação total, o sistema
calcula o **CET realizado** para fins de relatório.

Regras:

- **RN-40.** Em operação pós-fixada, o valor das parcelas não vencidas é sempre uma
  projeção; nenhum número pós-fixado é apresentado como definitivo antes da apuração no
  vencimento.
- **RN-41.** A apuração de cada parcela usa a série DI realizada dos dias úteis do
  período e é registrada como evento auditável, com a série utilizada.
- **RN-42.** O contrato de operação pós-fixada explicita o indexador, a forma (spread ou
  percentual), a base de capitalização (252 dias úteis) e a metodologia de apuração. O
  snapshot de decisão guarda esses parâmetros e a curva de projeção da data.
- **RN-43.** Prorrogação, baixa parcial e recompra de parcela/título pós-fixado
  recalculam sobre o CDI realizado até a data do evento.

**Observação de conformidade:** ver seção 19, item sobre validação jurídica da taxa
pós-fixada e da capitalização diária do CDI para ESC.

---

## 9. Ciclo de vida da operação

### 9.1 Esteiras e status

**RF-CIC-01.** A operação transita, em paralelo, por até cinco esteiras, cada uma com
status configuráveis pelo tenant:

| Esteira | Propósito |
|---------|-----------|
| Comercial | Prospecção e proposta. |
| Checagem | Confirmação dos recebíveis com os sacados. |
| Operacional | Análise, deferimento, contrato, registro. |
| Financeiro | Desembolso e conferência. |
| Cobrança | Acompanhamento de títulos vencidos. |

**RF-CIC-02.** A esteira operacional tem um status terminal de **deferimento**. Ao
deferir, executam-se as validações de RF-ANA-07.

### 9.2 Transições

**RF-CIC-03.** As transições permitidas entre status são definidas por configuração
(estado de origem, estado de destino, perfil mínimo). Transição não prevista é rejeitada.

### 9.3 Imutabilidade e reabertura

- **RN-23.** Operação deferida não pode ser excluída.
- **RN-24.** Operação deferida não pode ser alterada, exceto por **reabertura**, permitida
  somente se: a data de aceite estiver no mês corrente **ou** o deferimento tiver ocorrido
  há no máximo 5 dias úteis.
- **RN-25.** Operação **registrada em registradora** não pode ser reaberta, mesmo dentro
  da janela de 5 dias. O registro é trava definitiva.
- **RN-26.** A reabertura devolve a operação ao estado de proposta, registra motivo e
  responsável, e exige novo deferimento.

### 9.4 Registro em registradora

**RF-CIC-04.** Após o deferimento, o módulo gera a remessa de registro dos títulos/da
operação para a registradora de recebíveis, acompanha o retorno e marca a operação como
registrada.

- **RN-27.** O registro deve ocorrer em até 30 dias corridos do deferimento (RN-04).
- **RN-28.** Uma remessa já enviada à registradora não aceita inclusão ou remoção de
  títulos.

---

## 10. Gestão de títulos

### 10.1 Liquidação

**RF-TIT-01.** Um título pode ser liquidado manualmente (operador informa data e valor
recebido, o sistema recalcula e baixa) ou automaticamente pela integração de retorno
bancário (CNAB) ou por arquivo de retorno do cedente.

### 10.2 Baixa parcial

**RF-TIT-02.** O título pode ser parcialmente amortizado: informa-se o valor recebido, o
sistema recalcula o saldo, gera recibo e mantém o título em aberto pelo remanescente. A
baixa parcial é estornável.

### 10.3 Prorrogação

**RF-TIT-03.** O vencimento de um título ainda não liquidado pode ser prorrogado. O
sistema recalcula com o fator de prorrogação (RF-PAR-03) mais juros e multa aplicáveis,
apresenta prévia e efetiva. Disponível individualmente e em lote.

### 10.4 Juros de mora e multa

- **RN-29.** Título vencido acumula juros de mora e multa (parâmetros do cedente, RF-PAR-03)
  a partir do dia seguinte ao vencimento, até a quitação integral.
- **RN-30.** Toda baixa, baixa parcial ou prorrogação de título vencido recalcula o valor
  atualizado (principal + mora + multa) antes de efetivar.

### 10.5 PDD

**RF-TIT-04.** Título em atraso prolongado pode ter **baixa PDD** (provisão para devedores
duvidosos): baixa-se a parcela sem que o pagamento tenha ocorrido, informando a data. Se o
devedor pagar depois, executa-se o **estorno de PDD**.

- **RN-31.** A baixa PDD dispara e o percentual provisionado seguem a política de PDD do
  tenant, por faixa de dias de atraso. *(Faixas e percentuais: seção 19.)*

### 10.6 Estornos

**RF-TIT-05.** São estornáveis: liquidação, baixa parcial, baixa PDD e prorrogação. Todo
estorno é auditado e reverte os efeitos financeiros e contábeis do evento.

### 10.7 Recompra e refinanciamento

**RF-TIT-06.** O cedente pode recomprar títulos vencidos (próprios ou de terceiros,
conforme regra), parametrizando desconto, juros e multa. A recompra pode ser liquidada no
desembolso de uma nova operação (refinanciamento).

- **RN-32.** A recompra só é efetivada quando a operação que a contém é deferida.
- **RN-33.** Título recomprado sai do risco do cedente original e, se refinanciado, entra
  como crédito na nova operação.

### 10.8 Cheque devolvido

**RF-TIT-07.** Para título em cheque, o módulo registra a devolução: data de depósito,
data da devolução, **alínea** (motivo padronizado), data de reapresentação. São admitidas
até 3 devoluções por cheque. A resolução recalcula juros e multa e confirma o pagamento ou
encaminha à cobrança.

---

## 11. Cobrança

### 11.1 Cobrança interna

**RF-COB-01.** Títulos vencidos podem ser colocados em cobrança interna, com esteira
própria de status, agendamento de contatos, registro de tratativas, e-mail e telefone.

### 11.2 Cobrança bancária (CNAB)

**RF-COB-02.** O módulo gera arquivos de **remessa** de cobrança (registro dos títulos
como boletos) para o banco cobrador, processa os arquivos de **retorno** (confirmação de
entrada, liquidação, baixa, alteração, tarifas, protesto) e mantém o estado de cada
título em cobrança. Suporta remessas de instrução (protesto, sustação, baixa, alteração
de vencimento, abatimento, desconto).

**RF-COB-05 - Padrão de arquivo.** O primeiro banco cobrador suportado é o **Bradesco**,
no padrão **CNAB 400** (registros de 400 bytes). A especificação detalhada do layout,
dos códigos de comando (remessa) e de ocorrência (retorno), do cálculo do Nosso Número e
do mapeamento funcional de cada ocorrência está no **Anexo A**. A arquitetura de
cobrança isola o gerador/parser por banco, de modo que outros bancos e o CNAB 240 possam
ser acrescentados sem alterar o núcleo.

**RF-COB-06 - Conta de cobrança.** Cada tenant cadastra uma ou mais contas de cobrança
com: banco, agência (e dígito), conta (e dígito), **código da empresa/beneficiário**
(fornecido pelo banco), **carteira**, e as tarifas negociadas. Uma conta é marcada como
padrão.

**RF-COB-08 - Emissão do boleto pelo banco.** Na v1, a emissão e a entrega do boleto ao
sacado são feitas pelo **banco** (cobrança com registro, emissão pelo banco). Como
consequência:

- O módulo **não** gera o Nosso Número, o código de barras nem a linha digitável. O
  Nosso Número é **atribuído pelo banco** e devolvido na confirmação de entrada
  (ocorrência 02); o módulo o captura e o vincula ao título.
- O módulo **não** produz o PDF do boleto para o sacado; a entrega é postal, pelo banco.
- 2ª via, reimpressão e envio de boleto por e-mail ao sacado dependem do serviço de
  imagem/2ª via do banco ou da mudança daquele título para emissão pelo módulo (fora do
  escopo da v1; o campo de configuração `emissao_boleto` fica previsto para essa evolução).

**RF-COB-07 - Ciclo da remessa.**

1. O operador seleciona títulos elegíveis (deferidos, com forma de pagamento boleto,
   ainda não em cobrança) por filtros (aceite, vencimento, valor, cliente, sacado,
   operação).
2. O módulo gera o arquivo de remessa com o Nosso Número **zerado** (RF-COB-08) e a
   condição de emissão "pelo banco", e marca os títulos como `EM_REMESSA`.
3. O arquivo é transmitido ao banco (download pelo operador ou envio automático).
4. No retorno, a **ocorrência 02** confirma a entrada, **traz o Nosso Número atribuído
   pelo banco** e o título passa a `EM_COBRANCA`; a **ocorrência 03** rejeita e o título
   volta a `PENDENTE_COBRANCA` com o motivo.

- **RN-57.** Um título só entra em nova remessa se não estiver `EM_COBRANCA` nem
  `EM_REMESSA`, evitando registro em duplicidade no banco.
- **RN-58.** O Nosso Número é atribuído pelo banco e gravado no título na confirmação de
  entrada (ocorrência 02); a partir daí é imutável e é a chave de conciliação com o
  banco.
- **RN-59.** O arquivo de retorno é processado diariamente, mesmo sem remessa no dia
  anterior (o banco envia ocorrências espontâneas: pagamentos, baixas por decurso,
  protestos).
- **RN-60.** Cada ocorrência de retorno é registrada na linha do tempo do título
  (`titulo_evento`), com código, motivos, valores e data; ocorrências financeiras
  (liquidação, tarifa) geram os lançamentos correspondentes (RN-61, RN-62).
- **RN-61.** Ocorrência de **liquidação** (06, 15, 17) baixa o título pelo valor pago,
  registrando juros de mora, desconto e abatimento informados pelo banco, e considerando
  o indicador de crédito disponível/indisponível (float).
- **RN-62.** Ocorrência **28 (débito de tarifas/custas)** gera um lançamento de custo
  operacional no tenant, classificado pelo motivo (registro, permanência, protesto,
  sustação, baixa, etc.).

### 11.3 Jurídico e cartório

**RF-COB-03.** Um título pode ser encaminhado ao jurídico e/ou a protesto em cartório,
com registro de escritório responsável e comunicação. O módulo gera carta de anuência
quando o título é quitado após envio.

### 11.4 Negativação

**RF-COB-04.** O módulo envia e concilia informações de inadimplência com bureau (Serasa),
inclusive no modelo de reciprocidade.

- **RN-34 - Régua de cobrança.** Estados sucessivos: `EM_DIA` → `VENCIDO` →
  `COBRANCA_INTERNA` → `JURIDICO` → `CARTORIO` → `NEGATIVADO`, com combinações permitidas.
  A progressão automática segue prazos configuráveis (inclui o prazo de protesto de
  RF-PAR-03).

---

## 12. Créditos do cliente

**RF-CRE-01.** O módulo mantém "créditos" a favor do cedente, gerados manualmente ou
automaticamente (por recompra, por acerto), classificados por categoria de crédito, com
saldo, data de geração e data de baixa. Os créditos podem abater desembolsos ou ser
pagos ao cedente.

---

## 13. Comissionamento de agentes

**RF-COM-01.** Cada operação originada por um agente gera comissão conforme a parametrização
do agente (percentual por modalidade, limites, tetos). As comissões são apuradas por
período e produto, disponibilizadas em conta corrente do agente e pagas em lote, com
detalhamento exportável.

- **RN-35.** A comissão só é apurada sobre operação deferida.

---

## 14. Relatórios

**RF-REL-01.** O módulo oferece, no mínimo, os relatórios (PDF e planilha, com filtros):

| Grupo | Relatórios |
|-------|------------|
| Operações | Parametrizado (genérico), operações realizadas, operações por cliente, operações liquidadas, aquisições no período, por ramo de atividade. |
| Crédito | Ficha de crédito do cedente, risco do cliente, risco por faixa, pendências do cliente, clientes em atraso, classificação da carteira (capital + juros), carteira global. |
| Recebíveis | Concentração de sacados, títulos liquidados, títulos recomprados, prorrogação, baixa parcial, tipo de baixa, valor presente, deságio, confirmação de canhoto. |
| Fiscal / financeiro | IOF, impostos por operação, impostos por parcela, desembolso, retorno de capital, rendas efetivas, fluxo de caixa. |
| Cobrança | Títulos na cobrança, relatório de retorno bancário, cheques devolvidos, acompanhamento de cobrança. |
| Comercial | Comissão por agente, comissão de liquidação, volume operado por cliente, produtividade de checagem. |
| Cadastral | Registro único de pessoas, clientes, concentração. |

### 14.1 Classificação de carteira

**RF-REL-02.** O relatório de classificação de carteira distribui o volume operado em
faixas percentuais que estabelecem condições por tipo de operação (capital + juros).
*(Faixas e percentuais: decisão de negócio - seção 19.)*

---

## 15. Integrações externas

| Integração | Uso | Direção |
|------------|-----|---------|
| Serviço de score / bureau | Score e indicadores de crédito de cedente e sacado. | Consulta |
| Registradora de recebíveis | Registro obrigatório das operações (RN-04). | Envio + retorno |
| Assinatura eletrônica | Assinatura de contrato, NP, duplicata. | Envio + callback |
| Bancos (CNAB) | Remessa e retorno de cobrança. | Arquivo bidirecional |
| Bureau (reciprocidade) | Envio de comportamento de pagamento, conciliação. | Envio + retorno |
| Monitoramento de NF-e | Acompanhamento de eventos das notas fiscais que lastreiam títulos. | Consulta |
| Consulta de CNPJ | Enriquecimento cadastral do cedente/sacado. | Consulta |
| Conciliação bancária (OFX) | Conciliação de extratos. | Importação |

- **RN-36.** Toda integração é configurada por tenant (credenciais, tarifas, ativação).
  Nenhuma credencial de integração trafega para o navegador do usuário.

---

## 16. Requisitos não-funcionais

Detalhados no [PLANO_TECNICO.md](PLANO_TECNICO.md). Resumo dos que impactam o
comportamento funcional:

- **Isolamento por tenant** em todas as consultas e gravações (RN-08).
- **Trilha de auditoria imutável** para eventos financeiros e de decisão (RN-09).
- **Snapshot imutável** da decisão de crédito (RN-19, RN-22).
- **Parâmetros fiscais e de precificação versionados por vigência** (RN-17).
- **Motor de cálculo determinístico e testável**, com casos de referência versionados.
- **Retenção e exportação** de dados por tenant (LGPD).
- Valores monetários com precisão decimal exata; datas sem hora onde a hora não importa.

---

## 17. Regras de negócio consolidadas

| # | Regra |
|---|-------|
| RN-01 | ESC opera só no município-sede e limítrofes; validar cedente, sacado e operação contra a lista de municípios habilitados. |
| RN-02 | Tomador elegível: PJ MEI/ME/EPP ou empresário individual. |
| RN-03 | Toda operação lastreada em funding próprio do tenant. |
| RN-04 | Operação deferida deve ser registrada em registradora em até 30 dias corridos. |
| RN-05 | IOF reduzido (Simples) sobre principal acumulado até R$ 30.000; excedente com alíquota normal. |
| RN-06 | Cada operação apura IOF, IRRF, PIS e COFINS pelos parâmetros vigentes na data. |
| RN-07 | Declaração PNMPO registrada no cadastro do cedente quando aplicável. |
| RN-08 | Todo registro pertence a um tenant e é invisível aos demais. |
| RN-09 | Eventos financeiros e de decisão gravados em auditoria imutável. |
| RN-10 | Só se origina operação para cedente com status APROVADO. |
| RN-11 | Histórico de status do cedente é append-only. |
| RN-12 | Exposição por sacado controlada independentemente da exposição por cedente. |
| RN-13 | Análise considera títulos vencidos de todo o grupo econômico do cedente. |
| RN-14 | Margem = limite aprovado − risco; risco = Σ valor em aberto dos títulos do cedente. |
| RN-15 | Operação só deferida se couber na margem da tranche, salvo aprovação do comitê registrando o excesso. |
| RN-16 | Título sob confirmação obrigatória não compõe operação deferida sem estar confirmado. |
| RN-17 | Cálculo usa sempre parâmetros fiscais vigentes na data da operação. |
| RN-18 | Score é insumo, não decisão; a regra de uso está nos CAR. |
| RN-19 | Snapshot de decisão é imutável e prevalece sobre recálculo posterior. |
| RN-20 | Status de título é informativo; não bloqueia deferimento (exceto RN-16). |
| RN-21 | Tenant pode configurar recusa automática de título vencido na importação. |
| RN-22 | Saída do motor no deferimento é gravada integralmente no snapshot. |
| RN-23 | Operação deferida não pode ser excluída. |
| RN-24 | Operação deferida só se altera por reabertura, na janela: aceite no mês corrente ou deferimento há ≤ 5 dias úteis. |
| RN-25 | Operação registrada em registradora não pode ser reaberta. |
| RN-26 | Reabertura volta a operação a proposta, com motivo e responsável, e exige novo deferimento. |
| RN-27 | Registro na registradora em até 30 dias corridos do deferimento. |
| RN-28 | Remessa já enviada à registradora não aceita inclusão/remoção de títulos. |
| RN-29 | Título vencido acumula mora e multa do dia seguinte ao vencimento até a quitação. |
| RN-30 | Baixa, baixa parcial e prorrogação de título vencido recalculam o valor atualizado antes de efetivar. |
| RN-31 | Baixa PDD e percentual provisionado seguem a política de PDD do tenant por faixa de atraso. |
| RN-32 | Recompra só é efetivada quando a operação que a contém é deferida. |
| RN-33 | Título recomprado sai do risco do cedente original. |
| RN-34 | Régua de cobrança com estados sucessivos e progressão automática por prazos configuráveis. |
| RN-35 | Comissão de agente só é apurada sobre operação deferida. |
| RN-36 | Integração configurada por tenant; credenciais nunca no navegador. |
| RN-37 | Juros da operação de empréstimo são aplicados por período; a periodicidade não altera a taxa por parcela (impacta o CET, exibido ao tomador). |
| RN-38 | Deságio da operação de desconto = valor de face − valor presente, com a taxa da operação e o prazo (dias + floating para cheque). |
| RN-39 | Cronograma e IOF calculados sobre o principal de cada parcela; base do IOF diário é a amortização, limitada ao teto de dias. |
| RN-40 | Em operação pós-fixada, parcelas não vencidas são projeção; nenhum valor pós-fixado é definitivo antes da apuração no vencimento. |
| RN-41 | A apuração de cada parcela pós-fixada usa a série DI realizada dos dias úteis do período e é evento auditável, com a série registrada. |
| RN-42 | Contrato pós-fixado explicita indexador, forma, base de capitalização (252 dias úteis) e metodologia; o snapshot guarda esses parâmetros e a curva da data. |
| RN-43 | Prorrogação, baixa parcial e recompra de parcela/título pós-fixado recalculam sobre o CDI realizado até a data do evento. |
| RN-44 | Linha de IOF resolvida por tipo de tomador (cadastro do cedente) + enquadramento da operação; default `PJ` / `PADRAO`. |
| RN-45 | Alíquotas de IOF e tributos são dados carregados pelo tenant conforme a legislação vigente; nada embutido em código. |
| RN-46 | O tipo de tomador da operação é o do cedente na originação e fica no snapshot; mudança de cadastro não afeta operação já deferida. |
| RN-47 | A alíquota adicional do IOF (0,38%) não tem redução pelo Simples; incide integralmente, salvo enquadramento isento. |
| RN-48 | Enquadramento com isenção total ou alíquota zero (diária e adicional) resulta em IOF total zero, com base legal registrada no snapshot. |
| RN-49 | Enquadramento que gera alíquota zero/isenção exige documento comprobatório na originação; sem ele, a operação é tratada como `PADRAO`. |
| RN-50 | Prorrogação/novação sem troca de devedor: IOF complementar sobre o saldo não liquidado, com a alíquota da operação original, respeitando o teto de 365 dias somados; sem nova adicional. |
| RN-51 | Renegociação com novo desembolso: IOF (diário + adicional) só sobre o valor acrescido. |
| RN-52 | Substituição de devedor / assunção de dívida: sem novo fato gerador de IOF sobre o saldo transferido. |
| RN-53 | Vencimento nominal calculado sempre a partir do 1º nominal; adiar uma parcela não desloca as seguintes. |
| RN-54 | O valor da parcela não muda pelo ajuste de dia útil; a cadência de juros é a nominal. |
| RN-55 | IOF diário e contagem de dias usam a data de vencimento ajustada (dias efetivos até o pagamento). |
| RN-56 | Mora e multa só correm a partir do dia seguinte ao vencimento ajustado. |
| RN-57 | Título só entra em remessa se não estiver `EM_COBRANCA` nem `EM_REMESSA` (evita registro em duplicidade). |
| RN-58 | Nosso Número atribuído e confirmado é imutável e único por conta de cobrança. |
| RN-59 | Arquivo de retorno processado diariamente, mesmo sem remessa no dia anterior. |
| RN-60 | Cada ocorrência de retorno vira evento na linha do tempo do título, com código, motivos, valores e data. |
| RN-61 | Ocorrência de liquidação (06/15/17) baixa o título pelo valor pago, com mora, desconto e abatimento do retorno, respeitando crédito disponível/indisponível. |
| RN-62 | Ocorrência 28 (tarifas/custas) gera lançamento de custo operacional, classificado pelo motivo. |
| RN-63 | Estorno de pagamento (ocorrência de retorno 40) reverte a baixa e devolve o título ao risco do cedente. |
| RN-64 | O módulo valida os títulos contra os motivos de rejeição conhecidos antes de gerar a remessa (Anexo A.10). |

---

## 18. Modelo de dados conceitual

Entidades principais e relações. Nomes conceituais; o modelo físico segue o
[PLANO_TECNICO.md](PLANO_TECNICO.md) (chave `uuid`, `tenant_id` em toda tabela, RLS).

```
tenant
  municipio_habilitado (tenant_id, municipio_ibge, tipo SEDE|LIMITROFE)
  iof_tabela (vigência, tipo_tomador PJ|PJ_SIMPLES|MEI|PF|COOPERATIVA|ISENTO,
              enquadramento PADRAO|PNMPO|RURAL|HABITACIONAL|EXPORTACAO|RENEGOCIACAO,
              aliquota_dia, aliquota_dia_reduzida, teto_valor_reducao,
              aliquota_adicional, teto_dias, isencao_total)
  tributo_receita_tabela (vigência, tipo_tomador, enquadramento, tributo IRRF|PIS|COFINS,
                          base_calculo, aliquota)
  tabela_custo / tabela_custo_item (padrão por tenant)
  funding (sigla, descrição, tipo PROPRIO)
  esteira_status (esteira, código, descrição, ordem)
  transicao_permitida (esteira, de, para, perfil_minimo)
  serie_indexador (indexador CDI, data, fator_diario)           -- série DI realizada
  curva_indexador (indexador CDI, data_referencia, prazo_du, taxa)  -- estrutura a termo p/ projeção

cedente
  identificação, endereço (municipio_ibge), porte, atividade_economica_id,
  tipo_tomador PJ|PJ_SIMPLES|MEI|COOPERATIVA|ISENTO, isencao_base_legal,
  declara_simples, declaracao_pnmpo, receita_bruta, status_cadastro
  cedente_iof_reducao_consumo (janela 12m: principal já operado com alíquota reduzida)
  cedente_socio | cedente_procurador | cedente_referencia | cedente_conta_bancaria
  cedente_faturamento
  cedente_situacao_hist (append-only)
  cedente_limite (tranche, valor, vigência)
  cedente_parametro_taxa (fator, taxa_minima, floating_dias, juros_mora_mes,
                          multa_pct, fator_prorrogacao_pct, prazo_recompra_dias,
                          prazo_protesto_dias, vigência)
  cedente_politica_confirmacao (exige_confirmacao, exige_canhoto)
  cedente_car (regra, resultado_default)
  cedente_garantia (tipo AVALISTA|DEVEDOR_SOLIDARIO|GARANTIA_REAL|NP_LIMITE, dados)
  contrato_mae (numero, assinado_em, documento)

sacado
  identificação, endereço (municipio_ibge), limite_credito, bloqueado
  sacado_exposicao (view: total operado, a vencer, por cedente)

grupo_economico / grupo_economico_membro (CEDENTE|SACADO)

agente
  categoria, situação, dados_bancarios
  agente_parametro_comissao (modalidade, percentual, limites)
  agente_conta_corrente (comissões a pagar)

atividade_economica (segmento)
banco  |  conta_desembolso (cosif)  |  feriado (abrangência)
categoria_operacao  |  categoria_credito  |  tipo_documento
escritorio_cobranca

proposta
  cedente_id, agente_id, modalidade, sistema_amortizacao PRICE|SAC,
  indexador PREFIXADO|POS_CDI, forma_pos CDI_MAIS_SPREAD|PERCENTUAL_CDI,
  taxa_prefixada | spread_aa | percentual_cdi, base_capitalizacao (252),
  valor_solicitado, n_parcelas, taxa | valor_parcela, carencia, periodicidade,
  dias_uteis[], tratamento_iof FINANCIADO|DESCONTADO, forma_pagamento,
  renegociacao, status, car_resultado, score_snapshot, rating_snapshot,
  simulacao_snapshot (jsonb), criado_em, decidido_em, decidido_por
  proposta_parecer_comite (membro, voto, justificativa, condicoes)

operacao   (proposta deferida)
  proposta_id, numero, funding_id, categoria_id, rating_na_operacao,
  indexador, curva_projecao_ref (data da curva usada no snapshot),
  tipo_tomador_snapshot, enquadramento_iof PADRAO|PNMPO|RURAL|...,
  iof_isento (bool), iof_base_legal,
  valor_face, valor_principal, valor_iof_total, valor_iof_adicional,
  valor_iof_reduzido, valor_iof_normal, tributos_total,
  custos_total, valor_desembolso, cet, cet_estimado (bool), deságio_total,
  data_operacao, data_aceite, data_deferimento, janela_reabertura_ate,
  registrado_em, registradora_ref
  operacao_iof_evento (tipo INICIAL|COMPLEMENTAR_PRORROGACAO|AJUSTE_APURACAO,
                       base, aliquota, valor, ocorrido_em)
  operacao_desembolso (conta, valor)
  operacao_garantia (tipo, referência)
  operacao_contrato (contrato_mae_id, tipo, documento)
  operacao_imposto (tributo, base, aliquota, valor)
  operacao_status_esteira (esteira, status, alterado_em, alterado_por)
  operacao_caucao (titulo_id)

parcela   (empréstimo/financiamento)
  operacao_id, numero, vencimento_nominal, vencimento (ajustado dia útil),
  valor_prestacao, amortizacao, juros,
  saldo_devedor, dias_corridos, iof_parcela, tributos_parcela,
  situacao PROJETADA|APURADA, taxa_periodo_i_k, fator_cdi_periodo,
  iof_provisionado, iof_ajuste, apurada_em
  parcela_apuracao (parcela_id, serie_di_utilizada jsonb, i_k_apurado,
                    prestacao_apurada, ocorrido_em)   -- evento auditável (RN-41)

titulo    (desconto)
  operacao_id, sacado_id, tipo_documento, numero, natureza,
  valor_face, valor_presente, valor_desagio, data_emissao, vencimento,
  comissaria, forma_inclusao, status_checagem, confirmado_em, tem_canhoto,
  recompra_prioritaria,
  dias_atraso, juros_mora_acumulado, multa_aplicada, valor_atualizado,
  data_pdd, valor_pdd, situacao_cobranca, data_liquidacao, data_estorno
  titulo_evento (tipo LIQUIDACAO|BAIXA_PARCIAL|ESTORNO|PRORROGACAO|BAIXA_PDD
                 |ESTORNO_PDD|RECOMPRA|ENVIO_JURIDICO|OCORRENCIA_BANCARIA, dados, ocorrido_em)
  titulo_prorrogacao (venc_antigo, venc_novo, fator, juros, multa, valor_recalculado)
  cheque_devolucao (sequencia 1..3, data_deposito, data_devolucao, alinea,
                    data_reapresentacao, juros, multa, resolvido_em)

credito_cliente
  cedente_id, categoria_credito_id, origem MANUAL|RECOMPRA|AUTOMATICO,
  valor, gerado_em, baixado_em

conta_cobranca (banco, agencia, conta, codigo_beneficiario, carteira,
                emissao_boleto BANCO (v1) | MODULO (futuro),
                nosso_numero_range (só se MODULO), tarifas, padrao)
remessa_bancaria (conta_cobranca_id, tipo REGISTRO|INSTRUCAO, numero_sequencial,
                  arquivo, gerada_em, transmitida_em)
  remessa_bancaria_titulo (remessa_id, titulo_id, nosso_numero, comando_ocorrencia)
retorno_bancario (conta_cobranca_id, arquivo, recebido_em, processado_em)
  retorno_bancario_ocorrencia (retorno_id, titulo_id, nosso_numero, cod_ocorrencia,
                               data_ocorrencia, motivos[], valor_pago, juros_mora,
                               desconto, abatimento, tarifa, credito_disponivel)
titulo_cobranca (titulo_id, conta_cobranca_id, nosso_numero, dv, situacao
                 PENDENTE|EM_REMESSA|EM_COBRANCA|LIQUIDADO|BAIXADO|PROTESTO|REJEITADO)
remessa_registro / remessa_registro_titulo
caso_cobranca / caso_cobranca_tratativa

auditoria (append-only): tenant_id, usuario_id, ocorrido_em, acao, entidade,
           entidade_id, valor_anterior (jsonb), valor_novo (jsonb), ip, user_agent
```

---

## 19. Decisões de negócio pendentes

Itens que a especificação assume, mas que precisam de definição do negócio/contábil antes
da construção:

1. **Escala e fórmula do rating** do cedente (RF-ANA-03).
2. **Conjunto de critérios dos CAR** e seus limiares (RF-PAR-06).
3. **Faixas de alçada e quórum do comitê** por valor de operação (RF-ANA-06).
4. **Fórmula de cálculo do limite** do cedente e do sacado.
5. **Política de PDD**: dias de atraso que disparam a provisão e percentual por faixa
   (RN-31).
6. **Faixas da classificação de carteira** e os percentuais por tipo de operação
   (RF-REL-02).
7. **Base e alíquotas de IRRF, PIS e COFINS** sobre a receita da operação de ESC
   (RF-CAL-01) - confirmar com a contabilidade.
8. **Carência**: além da capitalização (8.5), haverá a opção "carência com pagamento de
   juros"? Unidade do campo (períodos).
9. ~~Ajuste de vencimento em dia não útil~~ - **decidido (27/08/2026): postergar para o
   próximo dia útil** (convenção "seguinte"). Especificado em RF-CAL-10 e RN-53 a RN-56.
10. **Cronograma da Price**: adotar o padrão de mercado (juros sobre saldo devedor,
    seção 8.2) - confirmar que não há requisito de outra convenção de decomposição.
11. **Regras de recompra de títulos de terceiros** (quais casos, com que autorização).
12. **Modalidades de garantia obrigatórias** por faixa de valor ou rating.
13. **Prazos padrão da régua de cobrança** (RN-34).
14. **Política de retenção de dados** por tipo de informação (LGPD), no
    [PLANO_TECNICO.md](PLANO_TECNICO.md).
15. **Operação pós-fixada ao CDI - validação jurídica** (seção 8.13): confirmar com o
    jurídico (a) que a taxa pós-fixada/indexada é admitida para ESC - a LC 167/2019
    restringe fonte de recurso, contraparte e área de atuação, não o tipo de taxa, mas o
    ponto deve ser chancelado; (b) o tratamento da capitalização diária do CDI para
    entidade fora do SFN; (c) os requisitos de transparência do indexador e da
    metodologia no contrato e na oferta (CET estimado).
16. **Provedor da série DI diária e da curva de projeção** (RF-CAL-07): fonte oficial,
    frequência de atualização, tratamento de dias sem divulgação, e defasagem aceitável.
17. **Forma padrão da taxa pós-fixada** (RF-OPE-02): `CDI + spread` e/ou
    `percentual do CDI`; qual é a oferta padrão da ESC.
18. **Momento da apuração** da parcela pós-fixada: na data do vencimento, ou D+1 com o
    fechamento do DI do dia; e política quando o pagamento ocorre antes do vencimento.
19. **Valores vigentes da Tabela de IOF** (RF-PAR-08a): alíquota diária por tipo de
    tomador (PJ, MEI, cooperativa), alíquota adicional, teto de dias, teto de valor da
    redução do Simples - confirmar contra o Decreto 6.306/2007 e alterações na data de
    implantação (a legislação de IOF teve mudanças recentes; validar com a contabilidade
    e o jurídico).
20. **Enquadramentos de alíquota zero / isenção** efetivamente oferecidos pela ESC
    (RF-PAR-08a, 8.6.4): PNMPO é o mais provável (liga com RN-07); rural, cooperativa e
    isenção subjetiva - decidir se entram na v1 e quais documentos comprobatórios o
    módulo exige (RN-49).
21. **Regra da faixa de R$ 30.000 do Simples** (8.6.3): confirmar se o teto é por
    operação, por cedente/ano, ou acumulado em 12 meses móveis, e como tratar o consumo
    parcial - a especificação assume acumulado em 12 meses por cedente.
22. **IOF na operação de desconto**: confirmar a base (valor líquido entregue ao cedente
    x soma dos valores de face) e o prazo (por título, dias até o vencimento) para o IOF
    diário na antecipação de recebíveis.
23. **Cobrança Bradesco** (Anexo A): a emissão do boleto é **pelo banco** (decidido em
    27/08/2026, RF-COB-08). Falta definir a(s) **carteira**(s) contratada(s) e a tabela de
    **tarifas** negociadas, no momento da contratação com a agência.
24. **Meio de transmissão** dos arquivos de cobrança (Anexo A): download/upload manual
    pelo operador na v1, ou integração automática (API / transferência de arquivos) -
    definir para a v1.
25. **Segundo banco cobrador**: se além do Bradesco haverá outro banco na v1, e se será
    CNAB 400 ou 240 (o Anexo A cobre só Bradesco 400).

---

## 20. Glossário

| Termo | Definição |
|-------|-----------|
| **ESC** | Empresa Simples de Crédito (LC 167/2019). |
| **Cedente** | PJ que toma crédito ou cede recebíveis à ESC. Também chamado cliente. |
| **Sacado** | Devedor do título cedido; quem paga o recebível. |
| **Devedor solidário** | Terceiro que responde pela dívida junto com o cedente. |
| **Avalista** | Garantidor pessoal de uma operação específica. |
| **Título** | Direito creditório: duplicata, cheque, nota promissória, etc. |
| **Valor de face** | Valor nominal do título no vencimento. |
| **Valor presente** | Valor do título trazido para a data da operação pela taxa pactuada. |
| **Deságio** | Diferença entre o valor de face e o valor presente; custo da antecipação. |
| **Borderô** | Conjunto de títulos de uma operação de desconto e seus valores. |
| **Funding** | Fonte do recurso que lastreia a operação (aqui, sempre capital próprio). |
| **Tranche** | Faixa do limite de crédito com condições próprias. |
| **Margem** | Limite aprovado menos o risco atual do cedente. |
| **Risco** | Soma do valor em aberto de todos os títulos do cedente. |
| **Rating** | Classificação interna de risco do cedente. |
| **CAR** | Critérios de Aceitação de Risco: regras automáticas de triagem da proposta. |
| **Floating** | Dias de compensação do cheque, somados ao prazo. |
| **Fator** | Taxa de referência da operação com um cedente. |
| **PDD** | Provisão para Devedores Duvidosos. |
| **Price** | Sistema de amortização com parcela constante. |
| **SAC** | Sistema de Amortização Constante; parcela decrescente. |
| **CET** | Custo Efetivo Total da operação para o tomador. Efetivo no prefixado; estimado no pós-fixado. |
| **Prefixado** | Taxa de juros fixa, definida na contratação; parcelas conhecidas de antemão. |
| **Pós-fixado** | Taxa atrelada a um indexador (aqui, o CDI); o valor de cada parcela só é definitivo na apuração do vencimento. |
| **CDI** | Certificado de Depósito Interbancário; sua taxa (DI) diária, base 252 dias úteis, é o indexador pós-fixado suportado. |
| **Indexador** | Índice que corrige a taxa da operação pós-fixada. |
| **Cronograma projetado / apurado** | O projetado usa a curva futura do CDI; o apurado substitui, parcela a parcela, pelo CDI realizado. |
| **IOF** | Imposto sobre Operações Financeiras. No crédito: alíquota diária sobre o principal (até um teto de dias) mais uma alíquota adicional única. |
| **IOF adicional** | Parcela fixa do IOF (atualmente 0,38%) sobre o principal, na liberação, independente do prazo. |
| **Tipo de tomador** | Enquadramento do cedente para fins de IOF: PJ, PJ optante do Simples, MEI, cooperativa, ou isento. |
| **Enquadramento da operação** | Natureza que define alíquota de IOF: padrão, microcrédito PNMPO, rural, etc. |
| **Alíquota zero / isenção** | Enquadramentos em que a operação não sofre IOF (ex.: microcrédito produtivo orientado). |
| **PNMPO** | Programa Nacional de Microcrédito Produtivo Orientado; operações enquadradas têm IOF com alíquota zero. |
| **CNAB** | Padrão de arquivo para troca de informações de cobrança com bancos. CNAB 400 = registros de 400 posições. |
| **Nosso Número** | Identificador do título na cobrança do banco, gerado pelo beneficiário, com dígito verificador. |
| **Remessa / Retorno** | Arquivo do beneficiário para o banco (registro e instruções) / arquivo do banco para o beneficiário (ocorrências). |
| **Pagador** | Nomenclatura FEBRABAN para o sacado (quem paga o boleto). |
| **Beneficiário** | Nomenclatura FEBRABAN para o cedente/credor da cobrança (aqui, a ESC). |
| **Beneficiário final** | Nomenclatura FEBRABAN para sacador/avalista. |
| **Contrato-mãe** | Contrato base do cedente; cada operação gera um aditivo. |
| **Operação comissária** | Desconto em que o sacado não é notificado da cessão. |
| **Recompra** | Cedente readquire um título vencido. |
| **Snapshot de decisão** | Registro imutável de todos os dados e cálculos que embasaram o deferimento. |
| **Tenant** | Uma ESC dentro do módulo multicliente. |

---

## Anexo A - Integração de cobrança bancária: CNAB 400 Bradesco

Base normativa: Manual de Procedimentos Operacionais para Troca de Arquivos - Cobrança
Bradesco (documento nº 4008.524.0121). Este anexo resume os pontos que o módulo precisa
implementar; a fonte oficial prevalece em caso de divergência.

### A.1 Estrutura dos arquivos

Registros de **400 bytes**, texto, alinhados: numéricos à direita com zeros à esquerda,
alfanuméricos em caixa alta à esquerda. Valores em reais com 2 decimais, sem ponto nem
vírgula. Delimitador de registro `0D0A` ao fim de cada linha e finalizador `1A` ao fim do
arquivo (transmissão internet/WebTA).

| Arquivo | Registros (na ordem) |
|---------|----------------------|
| **Remessa** | `0` Header Label · `1` Transação (um por título) · `2` Mensagem (opcional) · `3` Rateio de crédito (opcional) · `6` Débito automático (opcional) · `7` Beneficiário final (opcional) · `9` Trailer |
| **Retorno** | `0` Header Label · `1` Transação (um por ocorrência) · `3` Rateio (opcional) · `9` Trailer |

Nome do arquivo de remessa (WebTA): `CBDDMM??.REM` (`CB` + dia + mês + 2 variáveis). No
mesmo dia não pode haver dois arquivos com o mesmo nome. Número sequencial de remessa
(header, pos. 111-117) começa em `0000001` e incrementa +1 a cada arquivo, sem repetir.

O módulo deve processar o **retorno diariamente**, ainda que não tenha enviado remessa: o
banco envia ocorrências espontâneas (pagamentos, baixas por decurso, protestos). Para um
mesmo código de empresa, o banco gera **um único arquivo de retorno** por
processamento.

### A.2 Identificação da conta beneficiária

- Header, pos. 27-46: **código da empresa** (20 posições), fornecido pelo Bradesco.
- Registro tipo 1, pos. 21-37: `0` + **carteira** (3) + **agência** sem dígito (5) +
  **conta-corrente** (7) + **dígito da conta** (1).
- A carteira determina regras de comando e a composição do Nosso Número; é definida na
  contratação (RF-COB-06, seção 19 item 23).

### A.3 Nosso Número e dígito verificador

**Na v1 (emissão pelo banco):** o registro de remessa (pos. 71-82) vai com **zeros**. O
banco atribui o Nosso Número (11 dígitos) e o devolve no retorno de confirmação de
entrada (ocorrência 02, pos. 127-146). O módulo apenas armazena e usa como chave de
conciliação. Não há cálculo de dígito verificador nem geração de código de barras/linha
digitável no módulo.

**Para evolução futura (emissão pelo módulo):** Nosso Número de 11 dígitos atribuído pelo
beneficiário, com dígito verificador por **módulo 11, base 7** sobre `carteira (3) + nosso
número (11)`, pesos ciclando `2,3,4,5,6,7` da direita para a esquerda;
`DV = 11 − (soma mod 11)`; resto `0` ⇒ `DV = 0`; resto `1` ⇒ `DV = 'P'`. Nesse cenário o
módulo também monta o código de barras (módulo 11 base 9) e a linha digitável.

### A.4 Remessa - campos-chave do registro tipo 1

| Pos. | Campo |
|------|-------|
| 001 | Identificação do registro = `1` |
| 021-037 | Identificação do beneficiário no banco (zero + carteira + agência + conta + dígito) |
| 038-062 | Nº de controle do participante (uso livre; devolvido no retorno) - usar como chave do título no módulo |
| 066-070 | Indicador de multa (`0` sem, `2` com) e percentual de multa |
| 071-082 | Nosso Número + DV - **zeros na v1** (banco atribui) |
| 093 | Condição de emissão: **`1` = banco emite e registra** (v1). `2` = cliente emite (evolução futura) |
| 109-110 | **Identificação da ocorrência** (comando) - ver A.5 |
| 111-120 | Nº do documento |
| 121-126 | Data de vencimento `DDMMAA` |
| 127-139 | Valor do título |
| 148-149 | Espécie: `01` duplicata, `02` NP, `03` nota de seguro, `05` recibo, `12` duplicata de serviço, `31` cartão, `99` outros |
| 151-156 | Data de emissão `DDMMAA` |
| 157-158 / 159-160 | 1ª / 2ª instrução (protesto, decurso de prazo, mensagens) - ver A.6 |
| 161-173 | Valor de mora por dia de atraso |
| 174-179 / 180-192 | Data-limite e valor de desconto |
| 219-220 / 221-234 | Tipo (`01` CPF / `02` CNPJ) e número de inscrição do pagador |
| 235-274 | Nome do pagador |
| 275-314 | Endereço do pagador |
| 327-334 | CEP + sufixo |

### A.5 Códigos de ocorrência de REMESSA (comando do beneficiário)

| Código | Comando |
|--------|---------|
| 01 | Remessa (registro de novo título / entrada) |
| 02 | Pedido de baixa |
| 04 | Concessão de abatimento |
| 05 | Cancelamento de abatimento |
| 06 | Alteração de vencimento |
| 07 | Alteração do nº de controle do participante |
| 08 | Alteração do seu número (nº do documento) |
| 09 | Pedido de protesto |
| 18 | Sustar protesto e baixar título |
| 19 | Sustar protesto e manter em carteira |
| 20 / 21 | Alteração de valor (sem / com emissão de boleto) |
| 22 | Transferência cessão de crédito |
| 23 | Transferência entre carteiras |
| 31 | Alteração de outros dados |
| 45 | Pedido de negativação |
| 46 / 47 | Excluir negativação com baixa / mantendo pendente |

### A.6 Instrução automática de protesto / negativação (pos. 157-160)

Enviada junto com a entrada (ocorrência `01`), com CNPJ/CPF e endereço do pagador
corretos:

- Pos. 157-158 = `06` (protestar) ou `07` (negativar); pos. 159-160 = nº de dias após o
  vencimento (**mínimo 5**).
- Pos. 157-158 = `05` (protesto falimentar); 159-160 = dias (mínimo 5).
- Pos. 157-158 = `18` (baixa por decurso de prazo); 159-160 = dias para baixa.
- Cancelamento: ocorrência `31` + pos. 157-160 = `9999`.
- As mesmas posições 157-158 admitem códigos de mensagem no boleto (`08` não cobrar juros,
  `09` não receber após o vencimento, `10` multa de 10% após o 4º dia, etc.).

O prazo de protesto configurado por cedente (RF-PAR-03) alimenta a pos. 159-160; a régua
de cobrança (RN-34) decide quando emitir a ocorrência `09`.

### A.7 Retorno - campos-chave do registro tipo 1

| Pos. | Campo |
|------|-------|
| 038-062 | Nº de controle do participante (a chave do título do módulo, ecoada) |
| 108 | Carteira |
| 109-110 | **Identificação da ocorrência** (retorno) - ver A.8 |
| 111-116 | Data da ocorrência no banco `DDMMAA` |
| 117-126 | Nº do documento |
| 127-146 | Nosso Número |
| 147-152 | Data de vencimento |
| 153-165 | Valor do título |
| 175-188 | Despesas de cobrança (tarifa de registro; tarifas da ocorrência 28) |
| 189-201 | Outras despesas (custas de protesto) |
| 215-227 | IOF devido (na liquidação) |
| 228-240 | Abatimento concedido |
| 241-253 | Desconto concedido |
| 254-266 | **Valor pago** |
| 267-279 | Juros de mora recebidos |
| 295 | Motivo da confirmação de protesto: `A` aceito, `D` desprezado |
| 319-328 | **Até 5 motivos** do código de ocorrência (2 dígitos cada) |

### A.8 Códigos de ocorrência de RETORNO e ação no módulo

| Código | Ocorrência | Ação no módulo |
|--------|------------|----------------|
| 02 | Entrada confirmada | `titulo_cobranca.situacao = EM_COBRANCA`; **grava o Nosso Número atribuído pelo banco**; lança tarifa de registro se informada |
| 03 | Entrada rejeitada | `situacao = REJEITADO`; registra motivo (pos. 319-328); alerta o operador |
| 06 | Liquidação normal | Baixa o título pelo valor pago; registra mora, desconto, abatimento; marca crédito disponível/indisponível (motivo `00`/`15`) |
| 09 | Baixado automaticamente via arquivo | Confirma baixa comandada; `situacao = BAIXADO` |
| 10 | Baixado conforme instrução da agência | `situacao = BAIXADO`; motivo (protesto, decurso, transferência p/ desconto) |
| 11 | Títulos em ser (pendentes) | Reconciliação da carteira em aberto |
| 12 / 13 | Abatimento concedido / cancelado | Atualiza abatimento do título |
| 14 | Vencimento alterado | Confirma alteração de vencimento |
| 15 | Liquidação em cartório | Baixa por pagamento em cartório |
| 17 | Liquidação após baixa ou título não registrado | Baixa; tratar como pagamento fora de cobrança |
| 19 | Confirmação de recebimento de instrução de protesto | Motivo `A`/`D` (pos. 295); atualiza `situacao_cobranca` do título |
| 20 | Confirmação de sustação de protesto | Atualiza estado |
| 23 | Entrada do título em cartório | `situacao = PROTESTO` |
| 27 | Baixa rejeitada | Registra motivo; mantém estado anterior; alerta |
| 28 | Débito de tarifas / custas | Lançamento de custo operacional classificado pelo motivo (A.9) |
| 29 | Ocorrência do pagador | Registro informativo (pagador contesta / reconhece faturamento) |
| 30 | Alteração de outros dados rejeitada | Registra motivo; alerta |
| 32 | Instrução rejeitada | Registra motivo; alerta |
| 40 | Estorno de pagamento | Reverte a liquidação; reabre o título |
| 45 | Pedido de negativação recebido | Atualiza estado |
| 55 | Sustado judicial | Atualiza estado; bloqueia ações |

- **RN-61** (reafirmada): a liquidação usa o valor pago do retorno, não o valor
  projetado; o título só é considerado quitado quando o crédito é disponível ou após o
  arquivo de retorno consolidado.
- **RN-63.** O estorno de pagamento (ocorrência 40) reverte todos os efeitos da baixa e
  devolve o título ao risco do cedente.

### A.9 Tarifas (ocorrência 28) - motivos frequentes

`03` sustação · `04` protesto/inclusão negativação · `08` custas de protesto ·
`12` registro · `13` título pago no Bradesco · `14` título pago em compensação ·
`15` título baixado não pago · `16` alteração de vencimento · `17`/`18` concessão/
cancelamento de abatimento · `19`/`20` concessão/cancelamento de desconto ·
`41` baixa por decurso de prazo · `43` baixado via remessa. Cada uma vira um lançamento
em contas a pagar / custo, vinculado ao título e à conta de cobrança.

### A.10 Principais motivos de rejeição (ocorrência 03 / 27 / 30 / 32)

`08` Nosso Número inválido · `09` Nosso Número duplicado · `10` carteira inválida ·
`16` data de vencimento inválida · `18` vencimento fora do prazo de operação ·
`20` valor do título inválido · `21`/`22` espécie inválida / não permitida para a
carteira · `27` valor/taxa de mora inválido · `29` valor de desconto ≥ valor do título ·
`46` tipo/número de inscrição do pagador inválido · `47` endereço não informado ·
`48`/`49` CEP inválido / sem praça de cobrança · `63` entrada para título já cadastrado ·
`65` limite excedido. O módulo deve validar estes itens **antes** de gerar a remessa,
para minimizar rejeição.

### A.11 Nomenclatura

Conforme circulares Bacen, o layout usa: **Pagador** (= sacado), **Beneficiário**
(= cedente/ESC), **Beneficiário Final** (= sacador/avalista). O módulo mapeia esses
termos para as suas entidades ao gerar e ao ler os arquivos.

### A.12 Extensão futura

O gerador e o parser são isolados por (banco, versão CNAB). Acrescentar Itaú, Banco do
Brasil, Santander, Sicoob/Sicredi ou o CNAB 240 é adicionar uma implementação da mesma
interface, sem tocar no núcleo de cobrança nem no modelo de dados.
