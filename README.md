# Bern Global MVP 0.1 — Cloudflare Workers + D1

Base executável de um marketplace de informações profissionais na Europa. Inclui páginas públicas e painel de candidatos, painel jurídico e coleta agendada de vagas de páginas públicas de carreira via APIs de Greenhouse, Lever e Ashby.

**Status:** código-base e testes locais de lógica concluídos. **Não foi publicado, não contém fontes cadastradas e não está conectado a uma conta InfinitePay ou Cloudflare.** Precisa de credenciais próprias e testes reais de ponta a ponta antes de ser colocado à venda. Diretório e solicitações de advogados são funcionalidades de desenvolvimento sujeitas à validação ética/jurídica.

## O que já está implementado

- Site responsivo em português; cadastro/login por e-mail + senha; sessões HttpOnly; hash de senha PBKDF2-SHA256, troca de senha e bloqueio de senha provisória.
- Papéis separados: `candidate`, `lawyer`, `admin`. O candidato não vê o cadastro dos demais. Advogados não conseguem consultar candidatos.
- Checkout InfinitePay criado pelo **servidor** com preço fixado: R$9,90 candidato / R$29,90 advogado, cada acesso por 30 dias (pagamento único por período, **sem renovação automática** nessa versão).
- Liberação de acesso **somente** após `payment_check` no servidor confirmar `paid` e valor exato para um pedido do próprio usuário; ativação idempotente.
- Catálogo público com amostra e catálogo completo para assinante ativo, filtro por país e link ao anúncio original, nunca candidatura automática.
- JobBot executado via cron por hora, mais execução administrativa manual. Coleta até oito fontes por rodada por padrão, dando preferência às menos recentemente consultadas.
- Integrações Greenhouse, Lever (até 500 anúncios por fonte por rodada) e Ashby, filtragem Portugal/Alemanha/Irlanda, recusa de URL de candidatura sem HTTPS, deduplicação por identificador e URL, histórico de coleta e arquivamento após fonte confirmar que vaga saiu do quadro.
- Três etiquetas migratórias: `confirmed` significa **somente que o anúncio tem indício textual de suporte internacional**, `not_confirmed` sinaliza restrição explícita, e `unknown` indica ausência de confirmação. **Nenhuma etiqueta garante autorização de trabalho.**
- Central documental com links de governo; perfis jurídicos com aprovação administrativa; solicitações de contato escolhidas pelo candidato e compartilhadas apenas com o profissional escolhido, com consentimento explícito. Essa função permanece **DESLIGADA por padrão** até revisão jurídica.
- Provisionamento administrativo e senha temporária gerados pelo PowerShell, além de comandos PowerShell para cadastrar uma fonte, rodar o bot e consultar estatísticas.

## 1. Requisitos

Node.js 20+, PowerShell 7+ para os scripts administrativos, conta Cloudflare com Workers/D1 e acesso ao Checkout Integrado InfinitePay.

No PowerShell, dentro da pasta:

```powershell
npm install
npx wrangler login
npx wrangler d1 create bern-global-db
```

Copie o `database_id` informado para `wrangler.jsonc`, no lugar de `REPLACE_WITH_CLOUDFLARE_D1_ID`.

Em seguida:

```powershell
npx wrangler d1 migrations apply bern-global-db --local
npm run dev
```

Acesse `http://localhost:8787`. O site aparecerá, mas sem vagas ou pagamentos até configurar as fontes e as credenciais.

## 2. Segredos

**Nunca publique a chave da InfinitePay nem a chave administrativa em `wrangler.jsonc`, GitHub público ou navegador.**

Gere uma chave administrativa longa e aleatória com PowerShell:

```powershell
$bytes = [byte[]]::new(32)
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$env:BERN_ADMIN_KEY = [Convert]::ToBase64String($bytes)
npx wrangler secret put ADMIN_KEY
npx wrangler secret put INFINITEPAY_API_KEY
```

O primeiro comando `secret put` perguntará o valor: cole o mesmo de `$env:BERN_ADMIN_KEY`. Para `INFINITEPAY_API_KEY`, cole a chave gerada na InfinitePay. Configure opcionalmente `INFINITEPAY_HANDLE` com a sua InfiniteTag **sem `$`** (pode adicionar em `wrangler.jsonc` em `vars`; não é segredo comparável a API key).

Para teste local, crie `.dev.vars` (não versionar):

```ini
ADMIN_KEY=COLE_UMA_CHAVE_ALEATORIA_LONGA
INFINITEPAY_API_KEY=COLE_SUA_CHAVE_INFINITEPAY
INFINITEPAY_HANDLE=SEU_HANDLE
```

Na publicação, `wrangler secret put` grava segredos de produção. Defina a variável `$env:BERN_ADMIN_KEY` no seu terminal com o mesmo valor de `ADMIN_KEY` para os scripts.

## 3. Cadastrar empresas reais e testar o JobBot

Primeiro confirme no site da empresa qual seu provedor de recrutamento (Greenhouse, Lever ou Ashby), seu identificador de quadro `board_slug` e os termos de acesso. Não invente identificadores.

```powershell
.\scripts\Add-BernSource.ps1 -BaseUrl 'http://localhost:8787' -Employer 'NOME REAL DA EMPRESA' -Provider 'greenhouse' -BoardSlug 'SLUG_REAL' -TermsReviewed
.\scripts\Run-BernJobBot.ps1 -BaseUrl 'http://localhost:8787'
.\scripts\Get-BernStats.ps1 -BaseUrl 'http://localhost:8787'
```

Também é possível importar muitos quadros após validação individual usando `scripts/Import-BernSources.ps1`: preencha `scripts/fontes-modelo.csv` com empresas e slugs **reais**, marque `TermsReviewed=true` apenas depois de conferir as condições e execute `./scripts/Import-BernSources.ps1 -BaseUrl 'http://localhost:8787' -CsvPath './scripts/fontes-modelo.csv'`. O CSV incluído contém **apenas marcadores de exemplo**, nenhuma empresa real cadastrada. Ajuste `JOBBOT_BATCH_SIZE` às cotas do seu plano Cloudflare.

Na versão atual os portais oficiais IEFP, Make it in Germany e JobsIreland estão na **central de links**; **ainda não foram implementados como conectores automáticos**, porque suas condições e formatos de acesso devem ser validados antes. Para volume, incremente o catálogo de fontes corporativas verificadas; o cron hora a hora processará lotes de 8 fontes. Fontes com acesso limitado não são coletadas até autorização.

## 4. Gerar acesso com PowerShell

```powershell
.\scripts\New-BernUser.ps1 -BaseUrl 'http://localhost:8787' -Name 'Pessoa Teste' -Email 'teste@exemplo.com' -Role candidate
```

A senha provisória aparece **uma vez** no terminal: transfira por canal seguro. No primeiro login o usuário troca a senha. Uma conta provisionada não ganha assinatura paga automaticamente; deve ter pagamento confirmado (ou uma funcionalidade administrativa de cortesia, ainda não implementada).

## 5. Publicar no Cloudflare

```powershell
npx wrangler d1 migrations apply bern-global-db --remote
npm test
npx wrangler deploy
```

O Worker fornece o site e as rotas `/api/*`. A rotina agendada roda em UTC. CronTriggers podem levar alguns minutos para passar a executar após uma publicação; acompanhe os logs, `Get-BernStats` e as métricas Cloudflare.

## 6. InfinitePay

A aplicação cria uma compra com o endpoint `POST https://api.checkout.infinitepay.io/links` e checa pagamento no endpoint `POST https://api.checkout.infinitepay.io/payment_check` usando o cabeçalho `X-Api-Key`. Sempre confira na documentação atual da sua conta: <https://ajuda.infinitepay.io/pt-BR/articles/10766888-como-usar-o-checkout-integrado-da-infinitepay>.

Fluxo: cadastro -> login -> comprar plano -> checkout -> retorno com `order_nsu`, `transaction_nsu` e `slug` -> servidor confirma valor e pagamento -> acesso por 30 dias. Se o usuário fecha a página sem voltar, **a ativação não ocorrerá automaticamente nesta versão**; é necessário implementar um webhook verificado/reconciliação server-side antes de operar comercialmente. Não marque o usuário como pago somente a partir do webhook não autenticado.

## 7. Jurídico e proteção de dados

`ENABLE_LEGAL_REQUESTS` está `false` por padrão. Não ative publicamente até revisão por assessoria que domine regras da OAB, do país de registro do advogado, LGPD e GDPR. A OAB proíbe determinadas formas de captação e de comercialização de serviços jurídicos; a escolha voluntária de um advogado não é autorização geral para vender ou distribuir dados de candidatos. Nenhuma comissão por indicação ou ranking pago é implementada.

Antes do lançamento: termos de uso, política LGPD, verificação dos registros profissionais, canal de exclusão de dados, recuperação de senha por e-mail de modo seguro, verificação de titularidade do e-mail, rate limiting/Turnstile/WAF, moderação e antifraude, retenção e exclusão de solicitações, autenticação adicional de administradores, tratamento de estornos e suporte.

## 8. Testes

```powershell
npm run check
npm test
```

Os testes cobrem normalização de localidade, decisão conservadora sobre contratação internacional, Greenhouse, Lever, Ashby, slug permitido e paginação de Lever. **Não substituem um teste integrado com Cloudflare D1 e InfinitePay reais.**
