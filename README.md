# RAMON.RECRUIT — Cloudflare Workers + D1 (EU) — v0.4 STAGING

Base técnica para publicar o **protótipo do Ramon** em um Cloudflare Worker, com SQLite migrado para **Cloudflare D1**, cadastro administrativo de vagas e chatbot **nativo por regras** no próprio site. Interface vem da v0.3. O projeto LORD NUTRI é uma referência de arquitetura, **não houve cópia de seu código-fonte**.

**Status: testado localmente com simulador D1/Node; NÃO publicado em conta Cloudflare; NÃO aprovado para receber dados reais de candidatos.** É necessário autenticar na conta Cloudflare e executar os scripts. Não forneça API tokens, senhas ou documentos pessoais no ChatGPT.

## Publicar no PowerShell (Windows)

Requisitos: **Node.js 22+**, **npm**, **PowerShell 5.1+**, acesso administrativo à conta Cloudflare. Vá à pasta descompactada:

```powershell
cd .\Ramon-Recruit-Cloudflare-v0.4
npm install
npx wrangler login
.\scripts\Configurar-Cloudflare.ps1
```

O script:

1. verifica autenticação e dependências;
2. executa `wrangler d1 create ramon-recruit-eu --jurisdiction eu` **se o banco não existir**;
3. obtém o UUID retornado por `wrangler d1 list --json` e insere em `wrangler.jsonc` como `database_id`;
4. aplica a migração SQL via `wrangler d1 migrations apply DB --remote`;
5. publica o Worker com `wrangler deploy`. O endereço `.workers.dev` será informado no terminal pelo Wrangler.

**Banco existente:** o script não reutiliza o nome de banco sem confirmação explícita. Se você **verificou** que já criou o banco D1 com a jurisdição `eu`, use `-UsarBancoExistente`; caso contrário, não reutilize. Jurisdição só pode ser configurada **na criação do banco**.

O config mantém candidaturas públicas bloqueadas por padrão. Você poderá acessar o login e as vagas publicadas, mas o recebimento de dados pessoais ficará bloqueado até a liberação consciente.

## Criar acessos pelo PowerShell

**Depois** de publicar e aplicar a migração remota:

```powershell
.\scripts\Criar-Acesso-Cloudflare.ps1 -Email "EMAIL_REAL_DO_RAMON" -Nome "Ramon da Gama Soares" -Perfil admin
.\scripts\Criar-Acesso-Cloudflare.ps1 -Email "EMAIL_REAL_DO_RECRUTADOR" -Nome "Equipe Recrutamento" -Perfil recruiter
```

Substitua e-mails de exemplo pelos endereços reais. As senhas são pedidas sem eco no terminal, passadas por STDIN ao Node, derivadas com **PBKDF2-SHA256 (310.000 iterações, salt aleatório)** e gravadas como hash no D1 com comando Wrangler. O script gera um arquivo SQL **temporário somente com o hash**, que é apagado ao terminar. Proteja o dispositivo e o acesso à conta Cloudflare. Provisionar um e-mail existente redefine sua senha e perfil.

**As contas do Node/SQLite v0.3 NÃO são migradas automaticamente para o D1.** Os scripts novos cadastram novamente com senhas novas. Não há senhas padrão.

## Variáveis e bindings Cloudflare

Em `wrangler.jsonc`:

| Variável / binding | Tipo | Valor inicial | Uso |
| --- | --- | --- | --- |
| `DB` | D1 binding | banco `ramon-recruit-eu` | Vagas, usuários, sessões, chatbot, candidatos |
| `ASSETS` | Static assets binding | `./public` | Painel web, PWA, JS/CSS |
| `APP_ENV` | plain var | `staging` | Identifica ambiente de homologação |
| `PUBLIC_APPLICATIONS_ENABLED` | plain var | `false` | Bloqueia `apply` e início/avanço do chatbot público |

**Não** coloque tokens, senhas ou chaves de IA em `vars` do arquivo. Para futuras integrações reais, crie secrets somente quando o código os consumir:

```powershell
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put WHATSAPP_ACCESS_TOKEN
npx wrangler secret put WHATSAPP_VERIFY_TOKEN
```

Esses nomes são **reservados para desenvolvimento futuro**, não necessários para executar a v0.4. Adicioná-los agora não habilitará OpenAI ou WhatsApp. Para visualizar variáveis de produção no painel Cloudflare: Workers & Pages → Worker `ramon-recruit-staging` → Settings → Variables and Secrets; o D1 aparece em Bindings.

**Habilitar candidaturas somente depois de testes legais e técnicos:**

```powershell
.\scripts\Configurar-Abertura.ps1 -Habilitar true
npx wrangler deploy
```

Para bloquear novamente, use `-Habilitar false` e republique.

## Desenvolvimento local

```powershell
npm install
npm run db:local
npm run dev
```

O Wrangler informa o endereço local, geralmente `http://127.0.0.1:8787`. Para testar login local, crie uma conta **no D1 local**, não remoto (o script de criação fornecido usa `--remote`). Testes automatizados sem conta Cloudflare:

```powershell
npm test
```

`GET /api/health` fornece status sem consultar dados privados. `GET /api/public/jobs` lista apenas vagas publicadas. No frontend, o admin pode publicar vagas e configurar perguntas técnicas; o recrutador recebe 403 ao tentar fazer alterações reservadas.

## O que a v0.4 faz

- Servir PWA e painel administrativo no Cloudflare Worker, por assets do mesmo deploy.
- Guardar usuários e candidaturas no banco D1, com sessões de login baseadas em cookies Secure/HttpOnly.
- Criar, editar, publicar e encerrar vagas exclusivamente como `admin`, **com verificação no servidor**.
- Mostrar vagas publicadas para candidatos e coletar candidaturas (quando ativado).
- Atender candidatos pelo chatbot próprio em **PT / EN / ES**, com teste técnico configurado pelo admin, UTM de anúncios e gravação no D1; resultado inicial encaminhado para revisão humana.
- Pontuar compatibilidade por regras transparentes; não há IA generativa operando.
- Guardar **somente metadados** de documentos e status de conferência; não há upload/OCR de passaportes ainda.

## Antes de aceitar 500+ pessoas/dia

**Este pacote é STAGING.** Recursos ainda obrigatórios para uso público com dados reais:

1. Política de privacidade **real**: substituir o texto demonstrativo `public/privacy.html`, estabelecer controlador/encarregado, base legal, retenção, direitos dos candidatos e contratos de tratamento.
2. Anti-bot e antispam: Cloudflare Turnstile integrado ao formulário e chatbot, WAF, rate limit por conta, limites de uso e alertas. O rate limit no D1 é apenas inicial; não substitui WAF.
3. Segurança: MFA para administradores, recuperação segura de senha, segregação de papéis por organização, proteção contra ataques de sessão, acesso restrito ao painel, testes de penetração, monitoração e backups/restauração testados.
4. Documentos: armazenamento R2 **privado** com política de residência adequada, antivírus/validação e criptografia, URLs temporárias, trilha de auditoria e processamento com permissão. A v0.4 não permite anexar passaportes reais.
5. Recrutamento na UE: avaliar RGPD, decisões automatizadas, transferências internacionais e classificação do uso de IA de seleção no AI Act; revisão humana **efetiva**, com possibilidade de contestação. Considerar DPIA antes do processamento.
6. Performance: testes realistas de carga e custo para **500+ candidatos/dia**, limites D1, política de filas/Workers, métricas de erro e preservação de dados. Sem garantia atual de throughput.
7. Integrações: IA Vision, WhatsApp Cloud API oficial, notificações/push e eventual checkout, apenas quando previstos e validados.

**Worker é global, mas D1 `--jurisdiction eu` mantém os dados do D1 nessa jurisdição.** Isso não assegura residência de todos os outros serviços, logs e operações, nem conformidade integral com RGPD.

## Política comercial

Nenhum valor comercial interno é exposto no painel. A referência interna do projeto é **R$ 5.000 pela mão de obra de desenvolvimento** e **R$ 800 mensais**, sendo **R$ 500 reservados para infraestrutura/APIs** e **R$ 300 de remuneração mensal do desenvolvedor**. Os R$ 500 são um **limite planejado** e não há garantia de que suportem 500+ candidatos/dia sem orçamento e medição.
