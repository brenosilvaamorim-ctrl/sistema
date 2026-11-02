# Guia de emissão de NFS-e nacional: escritório de advocacia do Simples Nacional em Petrolina/PE

*Situação em 02/11/2026. Leiaute da DPS em produção: v1.01, com os grupos de IBS/CBS da NT 004 e o `tpRetPisCofins` da NT 007. Município: Petrolina/PE, IBGE 2611101.*

> **Legenda.** ✅ = confirmado em fonte oficial lida (lei, resolução, anexo técnico ou nota técnica). ⚠️ = incerto, depende de parametrização ou interpretação, ou só tem fonte secundária. Os códigos de regra (E0xxx) são do **ANEXO_I-SEFIN_ADN-DPS_NFSe-SNNFSe v1.01 (09/02/2026)**, aba "RN DPS_NFS-e" ([xlsx](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/anexo_i-sefin_adn-dps_nfse-snnfse-v1-01-20260209.xlsx)).

---

## 0. Como preencher cada campo da DPS para este escritório

Situação típica: honorários próprios, cliente pessoa física, sem retenção, emissão pelo próprio escritório.

| Campo (caminho na DPS) | Valor | Base |
|---|---|---|
| `DPS/@versao` | `1.01` (versão do XSD em produção) | XSD "NFSe-ESQUEMAS_XSD-v1.01-20260209". O aviso do Portal NFS-e de 29/10/2026 manda continuar emitindo pela NT 004 até a NT 009 entrar em produção, prevista para **01/12/2026** ✅ |
| `tpAmb` | `1` (Produção) | Anexo I ✅ |
| `dhEmi` | Data e hora reais de envio, no formato UTC com fuso: `AAAA-MM-DDThh:mm:ss-03:00` | Não pode ser posterior ao processamento (E0008) ✅ |
| `dCompet` | Data do fato gerador, ou seja, da prestação do serviço (ver §7) | Precisa ser ≤ `dhEmi` (E0015) e ≥ data de ativação do convênio do município (E0016/E1270) ✅ |
| `tpEmit` | `1` (Prestador) | Anexo I ✅ |
| `serie` | Emissor Web: série na faixa 70000–79999, atribuída pelo sistema. API própria: 00001–49999 | E0010 ✅ |
| `cLocEmi` | `2611101` | Anexo I ✅ |
| `prest/CNPJ` | CNPJ do escritório | — |
| `prest/IM` | **Só se** o escritório tiver registro no CNC nacional de Petrolina; caso contrário, **não informar** | E0116 obriga a IM quando há registro no CNC; E0120 proíbe quando não há ✅ ⚠️ (depende de Petrolina) |
| `prest/xNome` | **Não informar** quando o emitente é o próprio prestador | E0121 ✅ |
| `regTrib/opSimpNac` | `3` (ME/EPP) | Conferido com a base do Simples na `dCompet` (E0160) ✅ |
| `regTrib/regApTribSN` | `1` (tributos federais e ISS apurados pelo SN). Usar `2` só se a receita bruta passar do sublimite estadual/municipal | Obrigatório para ME/EPP (E0166) ✅ |
| `regTrib/regEspTrib` | **`0` (Nenhum)**, nunca `6` | E0175: com `opSimpNac=3` e `regApTribSN=1`, o regime especial deve ser 0. O ISS fixo de sociedade de profissionais não se aplica ao Simples (§2) ✅ |
| `toma` | Pessoa física: CPF e nome; endereço opcional. Pessoa jurídica: CNPJ, nome e **endereço nacional obrigatório** | Grupo 0-1; E0235 (PJ exige endereço); E0237 (se houver retenção) ✅ |
| `serv/locPrest/cLocPrestacao` | `2611101` (ou o município onde o serviço foi prestado) | Para 17.14 o ISS é devido no estabelecimento do prestador (aba MUN.INCID, linha 171401: "EP") ✅ |
| `serv/cServ/cTribNac` | **`171401`** (Advocacia) | Anexo B v1.01, aba LISTA.SERV.NAC.; LC 116/2003, item 17.14 ✅ |
| `serv/cServ/cTribMun` | Só se Petrolina tiver parametrizado um código municipal complementar | Campo 0-1 ⚠️ |
| `serv/cServ/xDescServ` | Descrição do serviço e da parcela própria quando houver parceria (modelo no §6). Até 1000 caracteres | Anexo I ✅ |
| `serv/cServ/cNBS` | **`113012000`** (1.1301.20.00, representação e consultoria jurídica em outras áreas do direito, exceto consultoria tributária). Criminal: `113011000`. Consultoria tributária: `113031000` (PJ) ou `113032000` (PF) | Anexo B, aba LISTA.NBS_v2.0. Opcional na v1.01, **obrigatório se o grupo IBSCBS for informado** (E0322) ✅ |
| `valores/vServPrest/vServ` | Valor da **parcela própria** do escritório (ver §6) | EAOAB, art. 15, §9º; SC COSIT 118/2026 ✅ |
| `trib/tribMun/tribISSQN` | `1` (Operação tributável) | ✅ |
| `trib/tribMun/tpRetISSQN` | `1` (Não retido) como regra. Usar `2` só quando um tomador PJ for responsável pela retenção na lei de Petrolina (§3.4) | ✅ / ⚠️ |
| `trib/tribMun/pAliq` | **Não informar** quando `tpRetISSQN=1` (E0625/E0631). **Obrigatório** quando `tpRetISSQN=2`: alíquota efetiva de ISS do Simples (mínimo 1,8% no sistema; LC 123, art. 21, §4º) (E0621/E0628) | ✅ |
| Benefício municipal, dedução/redução | Não informar | E0536 (BM); E0440 e seguintes (dedução proibida para ME/EPP no SN, exceto subitens listados, entre os quais não está 17.14) ✅ |
| `trib/tribFed` (IRRF, CP, CSLL, PIS/COFINS) | **Não informar**. ME/EPP do Simples está dispensada de retenção de IRRF e de PIS/COFINS/CSLL (§3) | IN RFB 765/2007; Lei 10.833/2003, art. 32 ✅ |
| `trib/totTrib` | Usar **`pTotTribSN`** = alíquota (efetiva) do DAS no Anexo IV. **Não** usar `indTotTrib` | Grupo obrigatório; E0712 proíbe `indTotTrib` para ME/EPP; Decreto 8.264/2014, art. 9º ✅ |
| `IBSCBS` (grupo RTC) | **Não informar em 2026.** Obrigatório para o Simples a partir de **01/01/2027** | Ato Conjunto RFB/CGIBS nº 4/2026, art. 1º, §1º ✅ |
| `infoCompl/xInfComp` | "Optante pelo Simples Nacional – ME/EPP; dispensada retenção de IRRF (IN RFB 765/2007) e de CSRF (Lei 10.833/2003, art. 32)" e, se houver parceria, os dados do §6 | Prática recomendada ⚠️ |

---

## 1. Enquadramento do serviço: item LC 116, cTribNac e NBS

- **LC 116/2003, subitem 17.14 – Advocacia.** Arbitragem é o 17.15, um subitem diferente. ✅
- **cTribNac `171401`**, "Advocacia", desdobro nacional 01 e único. Fonte: Anexo B v1.01 (22/01/2026), aba LISTA.SERV.NAC. ([xlsx](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/anexo_b-nbs2-lista_servico_nacional-snnfse-v1-01-20260122.xlsx)). ✅
- **Local de incidência:** pela aba MUN.INCID_INFO.SERV. do Anexo I, o 171401 é tributado no **estabelecimento do prestador** (regra geral do art. 3º da LC 116). O ISS é devido em Petrolina mesmo quando o cliente mora ou tem sede em outro município. ✅
- **NBS 2.0** (aba LISTA.NBS_v2.0). O campo tem 9 dígitos, sem pontos:
  - `1.1301.10.00` → `113011000`: representação e consultoria jurídica criminal;
  - `1.1301.20.00` → **`113012000`**: representação e consultoria jurídica em outras áreas do direito, exceto consultoria tributária. É o padrão para causas trabalhistas, previdenciárias, cíveis e de servidor público;
  - `1.1301.90.00` → `113019000`: serviços jurídicos não classificados em outra posição;
  - `1.1303.10.00` / `1.1303.20.00` → consultoria tributária para PJ / PF.
  - ⚠️ O Anexo VIII de correlação item × NBS × cClassTrib (v1.02.00, 26/10/2026) avisa que "NÃO HÁ REGRAS DE NEGÓCIO BASEADAS NESTE ANEXO". Hoje a escolha da NBS é do emitente.

## 2. Simples Nacional aplicado à advocacia

- **Anexo IV:** a LC 123/2006, art. 18, §5º-C, VII, manda tributar os "serviços advocatícios" pelo Anexo IV. ✅
- **CPP fora do DAS:** no Anexo IV a contribuição patronal previdenciária é recolhida à parte, pela folha (LC 123, art. 13, VI, que remete ao §5º-C do art. 18). ✅ O ISS **fica dentro do DAS** (LC 123, art. 13, VIII). ✅
- **ISS fixo de sociedade de profissionais (DL 406/68, art. 9º, §3º) não se aplica.** A LC 123 só admite ISS em valor fixo para escritórios contábeis (art. 18, §§5º-B, XIV, e 22-A). No sistema nacional, a regra E0175 exige `regEspTrib=0` quando `opSimpNac=3` e `regApTribSN=1`. As regras E1307, E0588 e E0604 confirmam que o regime especial bloqueia alíquota e retenção. A cartilha de Perguntas e Respostas da NFS-e (v1.00, 08/09/2026, item 12.1) diz que o Simples "se sobrepõe a qualquer Regime Especial", com exceção apenas dos contábeis. ✅
  - O CTM de Petrolina (LC 17/2013, art. 54) prevê ISS fixo para sociedades de profissionais, inclusive de advocacia, mas esse regime vale só para quem não é optante do Simples.
- **`regApTribSN`:** `1` enquanto a empresa estiver dentro dos sublimites. O valor `2` (federais pelo SN e ISS pela legislação municipal) é para quem ultrapassou o sublimite de ISS. ✅
- **`pAliq` com `opSimpNac=3` e `regApTribSN=1`:** ✅
  - sem retenção (`tpRetISSQN=1`): **proibido** informar (E0625 com convênio ativo; E0631 sem convênio);
  - com retenção (`tpRetISSQN=2`): **obrigatório** (E0621/E0628). Informa-se a **alíquota efetiva de ISS do Simples** apurada no mês anterior (LC 123, art. 21, §4º, I). No 1º mês de atividade, 2% (inc. II). Sem alíquota na nota, o tomador retém 5% (inc. IV). O sistema aceita no mínimo 1,8%.
- **`tribISSQN=1`** (tributável). Advocacia não tem imunidade nem não incidência.

## 3. Retenções quando o tomador é pessoa jurídica

### 3.1 IRRF de 1,5%
- Em regra incide sobre serviços profissionais pagos por PJ, e a lista inclui advocacia (RIR/2018, Decreto 9.580/2018, art. 714). ⚠️ O número do artigo é o usual na doutrina; não conferi o texto do decreto nesta pesquisa.
- **Dispensa para o Simples:** a IN RFB nº 765/2007, art. 1º, dispensa a retenção de IR na fonte sobre pagamentos a PJ optante pelo Simples Nacional, salvo rendimentos de aplicações financeiras. ✅ (fontes secundárias concordam; texto oficial não aberto).
- **Órgãos públicos federais:** IN RFB 1.234/2012, que dispensa as optantes do Simples mediante declaração no modelo da própria IN. ⚠️ Conferir o inciso (tradicionalmente art. 4º, XI) e o modelo vigente.
- **Estados e municípios:** desde a extensão da sistemática da IN 1.234 aos entes subnacionais, eles também retêm IR. Verificar se aceitam a dispensa do Simples com declaração. ⚠️
- Pessoa física **não** retém IRRF.

### 3.2 CSRF (PIS/COFINS/CSLL, 4,65%)
- A Lei 10.833/2003, art. 30, abrange "serviços profissionais" (art. 31: 4,65%). O **art. 32, III**, exclui da retenção os pagamentos a "pessoas jurídicas optantes pelo SIMPLES". ✅
- Para órgãos federais vale a IN RFB 1.234/2012, com a mesma dispensa mediante declaração. ⚠️

### 3.3 INSS (11%)
- A retenção da Lei 8.212/91, art. 31, alcança cessão de mão de obra e empreitada. Advocacia não é cessão de mão de obra, então **não há retenção**. ⚠️ Fundamento usual na IN RFB 2.110/2022 (rol de serviços); dispositivo não conferido.

### 3.4 ISS retido pelo tomador
- **Regra geral:** o ISS da advocacia é devido em Petrolina e pago no DAS (`tpRetISSQN=1`).
- **Quando há retenção:** se o tomador for responsável tributário pela lei de Petrolina (LC 116, art. 6º). O **CTM de Petrolina (LC Municipal 17/2013, art. 139)** lista, entre outros: ✅ (texto compilado de 2018 ⚠️ conferir alterações posteriores)
  - inc. I: bancos e instituições financeiras;
  - inc. VIII: **associações com ou sem fins lucrativos**, o que inclui **sindicatos e associações de servidores** que contratem o escritório;
  - inc. IX: PJ imunes ou isentas;
  - inc. XIII: cooperativas;
  - inc. XIV: empresas com faturamento no ano anterior ≥ 1.100.000 UFM;
  - inc. XXIV: instituições de ensino;
  - inc. XXXVI: a própria Prefeitura;
  - inc. XXXVII: **Administração Pública direta, indireta e fundacional federal, estadual e municipal**;
  - inc. XXXIX: tomador PJ quando o prestador não comprovar a inscrição no cadastro mobiliário ou não emitir nota.
  - O art. 140 afasta a retenção quando o prestador recolhe ISS fixo ou usa nota fiscal emitida pela própria Secretaria (avulsa). ⚠️
- **Retenção de prestador do Simples:** LC 123, art. 21, §4º. A alíquota é a efetiva do mês anterior, informada na nota. O ISS retido é definitivo e sai da base do ISS no DAS (o PGDAS-D deve marcar a receita "com retenção"). ✅
- **Tomador de outro município:** como o ISS do 17.14 é de Petrolina, a lei de outro município não pode exigir retenção. ⚠️ Pode haver exigência indevida de cadastro como CPOM (São Paulo e outros).

## 4. "Total aproximado dos tributos" (Lei 12.741/2012) e `pTotTribSN`

- O grupo `totTrib` é **obrigatório** (ocorrência 1-1) e a escolha é exclusiva entre `vTotTrib`, `pTotTrib`, `indTotTrib` e `pTotTribSN`. ✅
  - E0712: ME/EPP **nunca** pode usar `indTotTrib`, a opção de não informar;
  - E0713: `pTotTribSN` é proibido a não optante;
  - E0710: proibido ao MEI.
- **O que preencher:** `pTotTribSN` = percentual do DAS, preferencialmente a **alíquota efetiva** do Anexo IV no mês. O Decreto 8.264/2014, art. 9º, permite que ME/EPP do Simples informem "apenas a alíquota a que se encontram sujeitas nos termos do referido regime". ✅
- A CPP paga fora do DAS não entra. A Lei 12.741 trata de venda a consumidor; mesmo para tomador PJ o grupo continua obrigatório no leiaute.
- O DANFSe (NT 008, nota 10) deve trazer "Totais Aproximados dos Tributos cfe. Lei nº 12.741/2012", em valores ou percentuais. ✅

## 5. Reforma tributária: IBS/CBS, versão do leiaute e DANFSe

### 5.1 Obrigatoriedade do grupo IBS/CBS
- **Contribuintes em geral (serviços da LC 116):** a obrigação começou em 01/10/2026 (Ato Conjunto RFB/CGIBS nº 4/2026, art. 1º, III, "d"). ✅
- **Optantes do Simples:** "a obrigatoriedade de emissão dos documentos de que tratam os incisos do caput deste artigo iniciar-se-á em **1º de janeiro de 2027**" (art. 1º, §1º). ✅
- **Em 2026 o grupo não é obrigatório nem proibido para o Simples.** Recomenda-se **não preencher.** ✅/⚠️
  - Se preenchido, todos os campos dependentes passam a ser exigidos: NBS (E0322), CST, cClassTrib e dados do destinatário. Aviso do Portal NFS-e de 29/10/2026.
  - Até 31/12/2026, a falta do grupo não leva à rejeição pelo sistema nacional.
  - A cartilha de Perguntas e Respostas (item 20.4) confirma que emitir pelo Emissor Nacional desde 01/11/2026 **não** obriga a preencher IBS/CBS.

### 5.2 Leiaute e versão
- **Em produção:** leiaute da NT 004 v2.00 (grupos RTC) mais o domínio `tpRetPisCofins` da NT 007, com XSD v1.01. ✅
- **NT 009 v1.01 (01/10/2026):** traz os campos específicos do Simples, ainda **fora de produção**. ✅ Previsão de produção dos "releases 1 a 3" em **01/12/2026**, sujeita a cronograma formal do CGNFS-e.
  - `opSimpNac=4` (optante pendente);
  - `prest/regTrib/regApIBSCBSSN`: 1 = IBS e CBS pelo SN; 2 = CBS pelo SN e IBS regular; 3 = ambos regulares;
  - `serv/cServ/cAtvSN`: **`14` – "Prestação de serviços – Anexo IV"**, o código aplicável à advocacia;
  - grupo `gTribSN` (pIBSSN/vIBSSN/pCBSSN/vCBSSN) e `vReceitaBrutaSN`.
- **Para 2027:** preencher `IBSCBS` com NBS, `cIndOp`, CST e cClassTrib conforme a tabela oficial ([consumo.tributos.gov.br](https://consumo.tributos.gov.br/servico/calcular-tributos-consumo/calculadora/classificacoes-tributarias)). Preencher também `regApIBSCBSSN` e `cAtvSN=14` quando a NT 009 estiver em produção. ⚠️ Não indico CST/cClassTrib específicos: confirmar na tabela vigente.

### 5.3 Opção pelo regime regular de IBS/CBS em 2027
- A Res. CGSN nº 186/2026 abriu a janela de 1º a 30/09/2026. A **Res. CGSN nº 194/2026** (25/09/2026, DOU extra de 28/09) prorrogou a opção pelo regime regular até **30/10/2026**. ✅ (notícias da Receita e de terceiros; texto da 194 não lido)
  - A opção vale só para **jan–jun/2027**.
  - Cancelamento irretratável entre **03/11 e 20/12/2026**.
  - Quem não optou recolhe IBS/CBS no DAS.
- **O prazo para optar já passou.** Se o escritório optou, avaliar o cancelamento até 20/12/2026. Clientes pessoa física não aproveitam crédito, o que em regra desfavorece o regime regular. ⚠️ Decisão do contador.
- Contexto: no regime regular, a LC 214/2025 prevê redução de 30% para profissões intelectuais, entre elas a advocacia (art. 127). ⚠️ Conferir condições.

### 5.4 DANFSe: fim da API de PDF
- A **NT 008 v1.02 (14/07/2026)** declara a API de geração do DANFSe (`https://adn.nfse.gov.br/danfse/...`) **"sobrestada (suspensa)" em 03/08/2026**. Quem integra via API deve **gerar o DANFSe localmente**, a partir do XML autorizado, no leiaute da NT 008 (QR Code ≥ 1,52 cm, marcas d'água "CANCELADA"/"SUBSTITUÍDA" etc.). ✅
- O **Emissor Web nacional** continua oferecendo o DANFSe para download. A suspensão atinge só a API. ✅ (fontes secundárias)

## 6. Parceria entre escritórios (EAOAB, art. 15, §9º)

**Texto legal** (Lei 8.906/1994, art. 15, §9º, incluído pela Lei 14.365/2022): "A sociedade de advogados e a sociedade unipessoal de advocacia deverão recolher seus tributos sobre a parcela da receita que efetivamente lhes couber, com a exclusão da receita que for transferida a outros advogados ou a sociedades que atuem em forma de parceria para o atendimento do cliente." ✅ (trechos conferidos no Planalto)

**Receita Federal:**
- **SC COSIT nº 161/2025** (08/09/2025) tratou do lucro presumido. ✅
- **SC COSIT nº 118/2026** (23/07/2026, DOU 28/07/2026) tratou do **Simples Nacional** e está vinculada parcialmente à 161/2025. Ementa: "Na apuração do Simples Nacional, é facultado à sociedade de advogados que firmar contratos de parcerias…" reconhecer como receita bruta apenas a parcela que lhe couber, desde que observadas as normas do conselho profissional. ✅
- A SC 118 cita o Provimento CFOAB 204/2021 (art. 9º), 112/2006 e 70/2016. Segundo comentaristas, as condições são: ⚠️ (fontes secundárias)
  - contrato **prévio e escrito**, com remuneração do parceiro, valor do contrato de origem, trabalhos e condições de recebimento;
  - **averbação no Conselho Seccional**;
  - parceria de **atendimento ao cliente**, não subcontratação.
- **Notas fiscais:** a pergunta sobre como emiti-las **não foi conhecida** (genérica). Comentários à SC 118 registram que "cada parceiro deverá emitir documentação fiscal pertinente". ⚠️

**Como montar a NFS-e (recomendação):**
1. `vServ` = **somente a parcela própria**. Base: §9º + SC 118. A NFS-e é o documento da receita bruta do escritório no PGDAS-D.
2. `xDescServ` (modelo): "Honorários advocatícios – [ação/serviço], processo nº [...], cliente [nome]. Contrato de honorários de [data] em parceria com [Escritório Parceiro], CNPJ [...], nos termos do art. 15, §9º, da Lei 8.906/94 (contrato de parceria averbado na OAB/PE em [data]). Valor total dos honorários: R$ X; parcela do parceiro: R$ Y (não integra a receita deste escritório); **parcela deste escritório: R$ Z**."
3. Se o escritório recebe o valor integral e repassa, guardar o contrato de parceria, o comprovante de repasse e a escrituração espelhada.
4. **O parceiro deve emitir a própria NFS-e ao cliente pela parcela dele.** Não deve emitir nota contra o escritório repassador: isso pareceria subcontratação, a hipótese que a SC exclui, e geraria dupla tributação. ⚠️ Não há norma expressa.
5. Se houver retenção na fonte pelo cliente PJ sobre o total, só a proporção da parcela própria pode ser compensada (SC 161/118, segundo comentários). ⚠️
6. **Correção de valor:** para ME/EPP a substituição **não pode alterar** `vServ`, `dCompet` nem o tomador (E0061). Errou o valor da parcela? **Cancelar e reemitir.**
7. Dedução de base (`vDedRed`/`vAjusteBC`) **não** serve para isso: é proibida a ME/EPP no SN para o 17.14 (E0440 e seguintes). O tipo "9 – Profissional parceiro" da NT 009 é do salão-parceiro.

## 7. Datas, competência, cancelamento e substituição

- **`dCompet`** = data da prestação, isto é, do fato gerador (nota do Anexo I). ✅
  - Não pode ser futura: deve ser ≤ `dhEmi` (E0015).
  - Não pode ser anterior à ativação do convênio do município emissor (E0016/E1270) nem à inscrição do CNPJ (E0018).
  - **Competências passadas são aceitas** dentro desses limites (cartilha P&R, item 23.1).
  - ⚠️ Serviços com competência até 31/10/2026 deveriam, em tese, ter nota no sistema de Petrolina (E&L). Confirmar com a Prefeitura se notas atrasadas desse período vão pela E&L ou pelo nacional.
  - ⚠️ Para honorários de êxito e parcelados, a data do fato gerador é questão de interpretação (conclusão do serviço × exigibilidade de cada parcela). O contador deve fixar um critério e aplicá-lo de modo uniforme.
- **`dhEmi`**: data e hora reais, com fuso (`-03:00`); não pode ser posterior ao processamento (E0008). ✅
- **Cancelamento** (evento `e101101`): `cMotivo` 1 = Erro na emissão; 2 = Serviço não prestado; 9 = Outros. `xMotivo` obrigatório, com 15 a 255 caracteres (Anexo II v1.01). ✅
  - Prazo: o que Petrolina parametrizar (E0822). Na falta, **730 dias** (cartilha P&R, item 9.2). ⚠️
  - Fora do prazo: evento `e101103`, "Solicitação de Análise Fiscal para Cancelamento", deferida ou indeferida pela Prefeitura.
- **Substituição:** nova DPS com `subst/chSubstda` e `subst/cMotivo`. ✅
  - Motivos: 01 desenquadramento do SN; 02 enquadramento; 03/04 imunidade/isenção retroativa; 05 rejeição pelo tomador; 99 outros, com `xMotivo`.
  - Gera automaticamente o "Cancelamento por Substituição" (`e105102`).
  - Prazo máximo parametrizável de 2 anos, exceto para os motivos 01/02 (E0050).
  - **Para ME/EPP não muda tomador, `dCompet` nem `vServ` (E0061)**. Também não troca "sem tomador" por "com tomador" (E0058 na cartilha). Serve, por exemplo, para corrigir descrição ou NBS.

## 8. Dados do tomador pessoa física

- O grupo `toma` é opcional no leiaute (0-1). Para pessoa física identificada, basta **CPF + nome** (`xNome`); endereço, telefone e e-mail são opcionais. ✅ O CPF é validado (E0206 dígito verificador; E0207 existência na base).
- **Endereço obrigatório** quando o tomador é PJ identificado por CNPJ (E0235) e quando há retenção de ISS (E0237). ✅
- **Recomendação:** sempre identificar o cliente pelo CPF. ⚠️
  - Nota sem tomador pode **não ser substituível** depois (E0056, conforme parametrização) e não admite inclusão posterior do tomador (E0058).
  - A partir de 2027, com IBS/CBS, a identificação do adquirente ganha relevância.
- **Cliente sem CPF:** brasileiro deve providenciar o CPF. Estrangeiro não residente vai pelo grupo de endereço no exterior, com `NIF` ou `cNaoNIF` (1 = dispensado; 2 = não exigência), e `xNome` obrigatório (E0223/E0233). ✅ Se o resultado do serviço se der no exterior, avaliar exportação (`tribISSQN=3`). ⚠️

## 9. Particularidades de Petrolina

- **Alíquota de ISS da advocacia:** **5%** (CTM, LC Municipal 17/2013, art. 136, tabela, subitem 17.14). Fonte: texto compilado em 2018 em leismunicipais, publicado no site da Prefeitura. ⚠️ Conferir alterações posteriores.
  - Para o optante do Simples essa alíquota **não é usada**: o ISS sai do Anexo IV.
  - A alíquota municipal só importaria se o escritório saísse do Simples ou ultrapassasse o sublimite.
- **Inscrição municipal (IM) na DPS:** só se houver registro no **CNC nacional** de Petrolina (E0116/E0120).
  - Se Petrolina não carregou o escritório no CNC, a DPS **não pode** conter IM. O sistema nacional usa a base do CNPJ.
  - No Emissor Web, o campo aparece conforme o cadastro.
  - Isso não dispensa manter a inscrição no Cadastro Mobiliário local (CTM, art. 139, XXXIX, "a"). ⚠️
- **Petrolina e o Ambiente Nacional:**
  - Petrolina tem sistema próprio da E&L. Em 21/11/2025 anunciou testes do "modelo nacional" e obrigatoriedade a partir de 01/01/2026, o que indica sistema próprio integrado ao ADN (compartilhamento), **não** uso dos emissores públicos nacionais. ⚠️ Não achei fonte oficial sobre o status do convênio de Petrolina.
  - **Para ME/EPP do Simples isso não importa:** a **Res. CGSN nº 191/2026** (04/08/2026, DOU 10/08/2026, efeitos a partir de **01/11/2026**) alterou a Res. CGSN 140/2018, art. 59, §1º. O texto: a ME/EPP "utilizará, obrigatoriamente, a NFS-e de padrão nacional, emitida pelo Emissor Nacional da NFS-e" (web ou API). ✅
  - A Res. 191 revogou a Res. 189/2026, que previa 1º/09/2026. A regra não depende de adesão municipal.
  - A cartilha P&R (item 20.1) diz que, a partir de 01/11/2026, "sistemas próprios municipais ficam impedidos de autorizar essas emissões".
  - ⚠️ **Risco técnico:** o Anexo I v1.01 só dispensa o **MEI** das travas de convênio. As regras são E0037 (município sem convênio), E0038 (convênio não ativo) e E0039 (município não habilitou os emissores públicos nacionais). Se o Emissor Nacional rejeitar a DPS por um desses códigos, registrar o erro (print com data) e acionar a Secretaria de Fazenda de Petrolina e o canal do Portal NFS-e. Não voltar a emitir na E&L sem orientação escrita.

---

## Pontos a confirmar com o contador

1. **Status de Petrolina no Sistema Nacional:**
   - se a primeira DPS de 01/11/2026 em diante passa sem E0037/E0038/E0039;
   - se o escritório tem registro no CNC, o que decide se a IM entra (E0116) ou não (E0120);
   - qual o prazo de cancelamento parametrizado.
2. **Notas de competências até 31/10/2026 emitidas em atraso:** pela E&L ou pelo Emissor Nacional?
3. **Alíquota de ISS (5%) e lista de responsáveis do CTM:** o texto lido é de 2018. Verificar alterações e se sindicatos e associações clientes estão retendo ISS. Nesse caso, `tpRetISSQN=2`, `pAliq` = alíquota efetiva do mês anterior e PGDAS-D com receita marcada como "ISS retido".
4. **Critério de competência para honorários de êxito e parcelas** (prestação × recebimento), e coerência com o regime caixa ou competência do PGDAS-D.
5. **Parceria (art. 15, §9º):**
   - contratos prévios e **averbados na OAB/PE**, no padrão do Provimento 204/2021, art. 9º, conforme citado na SC COSIT 118/2026 (texto integral não lido);
   - cada parceiro emitindo a própria NFS-e ao cliente;
   - tratamento do IRRF retido sobre o total.
6. **Retenções de órgãos públicos:** inciso e modelo de declaração da IN RFB 1.234/2012 para dispensa do Simples (federais) e prática de estados e municípios, especialmente nas causas de servidores em que o ente paga honorários. Conferir também RIR/2018, art. 714 (IRRF de 1,5%) e o fundamento da não retenção do INSS (IN RFB 2.110/2022).
7. **IBS/CBS em 2027:**
   - se o escritório fez a opção pelo regime regular até 30/10/2026 (Res. CGSN 194/2026) e se convém cancelá-la entre 03/11 e 20/12/2026;
   - CST/cClassTrib corretos para advocacia no Simples;
   - adequação do sistema à NT 009 (`regApIBSCBSSN`, `cAtvSN=14`), prevista para produção em 01/12/2026.
8. **Valor de `pTotTribSN`:** alíquota efetiva do mês (recomendado) ou nominal da faixa do Anexo IV.
9. **Fontes ainda não conferidas no original:**
   - a cartilha "Perguntas e Respostas NFS-e v1.00 (08/09/2026)": lida em cópia de terceiro (notagateway). Ela afirma, por exemplo, que as regras E1302/E1307 bloqueiam valores para ME/EPP, mas no Anexo I a E1302 é só para MEI e a E1307 para regime especial. Prevalece o Anexo I;
   - a Res. CGSN 194/2026;
   - as IN RFB 765/2007 e 1.234/2012.

---

### Fontes principais
- Res. CGSN nº 191/2026 (texto do DOU 10/08/2026, via [SEEC-DF](https://economia.df.gov.br/documents/d/seec/resol-cgsn-n-191-2026-pdf)); notícia da RFB sobre a Res. 189/2026 ([gov.br](https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/abril/nfs-e-de-padrao-nacional-sera-obrigatoria-para-optantes-do-simples-nacional)).
- Documentação técnica NFS-e ([documentação atual](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual)): Anexo I v1.01, Anexo II v1.01, Anexo B v1.01; [página RTC](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc) (NT 008 v1.02, NT 009 v1.01, Anexo VIII).
- [Aviso do Portal NFS-e de 29/10/2026](https://www.gov.br/nfse/pt-br/noticias/nfs-e-nacional-confira-oas-rientacoes-sobre-leiaute-em-producao-regras-de-preenchimento-de-ibs-cbs-e-status-da-nota-tecnica-009) (leiaute em produção, regras de IBS/CBS e status da NT 009).
- [Ato Conjunto RFB/CGIBS nº 4/2026](https://www.cgibs.gov.br/upload/arquivos/202607/31091735-20260730-16h30-ato-conjunto-rfb-cgibs-na-c2-ba-4-260731-090909.pdf).
- [RFB: prazos de opção para 2027 (Res. CGSN 186/2026)](https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/abril/cgsn-define-prazos-de-opcao-pelo-simples-nacional-e-pelo-regime-regular-do-ibs-e-da-cbs-para-2027); [prorrogação pela Res. CGSN 194/2026](https://www.reformatributaria.com/iva/opcao-pelo-regime-regular-de-ibs-e-cbs-no-simples-nacional-e-prorrogada-para-30-de-outubro-entenda-as-novas-datas).
- Planalto: [Lei 8.906/1994](https://www.planalto.gov.br/ccivil_03/leis/l8906.htm), [LC 123/2006](https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm), [Lei 10.833/2003](https://www.planalto.gov.br/ccivil_03/leis/2003/l10.833.htm), [Lei 12.741/2012](https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2012/lei/l12741.htm), [Decreto 8.264/2014](https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/decreto/d8264.htm).
- SC COSIT 118/2026 ([ementa](https://www.normaslegais.com.br/legislacao/solucao-de-consulta-cosit-118-2026.htm)); comentários da [APET](https://apet.org.br/artigos/parcerias-entre-advogados-o-que-a-receita-definiu-e-o-que-ainda-depende-de-resposta/) e da [Faculdade Santo Ivo](https://faculdadesantoivo.com.br/artigos/receita-federal-nas-sc-cosit-161-2025-e-118-2026-esclarece-como-sociedades-de-advogados-devem-tributar-receitas-em-parcerias/).
- [CTM de Petrolina (LC 17/2013, compilação de 2018)](https://petrolina.pe.gov.br/wp-content/uploads/2018/03/Co%CC%81digo-Tributa%CC%81rio-de-Petrolina-PE.pdf); [notícia sobre testes do padrão nacional em Petrolina](https://notagateway.com.br/blog/petrolina-pe-inicia-fase-de-testes-para-o-novo-padrao-nacional-da-nfs-e/).
