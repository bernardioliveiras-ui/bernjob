# HOTFIX v0.4.3 — Login, D1 e primeiro acesso

**IMPORTANTE**: este ZIP e apenas um PATCH. NAO contem wrangler.jsonc nem cria D1 novo. Preserve o UUID real que ja esta no GitHub.

## Se o painel abriu e retorna Erro interno

1. No repositorio existente e autenticado, confira qual banco esta em `wrangler.jsonc`: deve ser EXCLUSIVO do Ramon. Nao use banco de outros projetos.
2. Use PowerShell dentro da raiz do projeto, apos instalar dependencias:

```powershell
npm install
npx wrangler login
npx wrangler d1 migrations apply DB --remote
npx wrangler d1 execute DB --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

3. Crie o admin com script original:

```powershell
.\scripts\Criar-Acesso-Cloudflare.ps1 -Email "SEU_EMAIL_REAL" -Nome "Administrador Principal" -Perfil admin
```

Ou use o script novo, que valida o banco e exige confirmacao antes de executar as duas etapas:

```powershell
.\scripts\Preparar-Primeiro-Admin.ps1 -Email "SEU_EMAIL_REAL" -Nome "Administrador Principal"
```

**Escolha apenas uma forma de aplicar as migrations e cadastrar o admin**; nao precisa executar ambas.

## O que mudou

- `src/index.mjs`: `/api/health` agora testa se existem as tabelas principais no D1; um banco sem migracoes retorna 503 e o codigo `migration_pending`.
- Resposta mais clara `Banco nao inicializado...` para endpoints que consultam uma tabela ausente, em vez de `Erro interno`.
- `scripts/Preparar-Primeiro-Admin.ps1`: pede confirmacao do banco antes de aplicar migrations e criar/atualizar a conta de administrador. Nao gera senhas padrao.
- Testes Node cobrindo D1 sem migracoes e D1 com migracoes.

**Para implantar a nova tela de diagnostico**, copie os arquivos deste patch para os mesmos caminhos do repositorio (sobrescrevendo os arquivos indicados), execute `npm test` e faca commit/push. Sem esse novo `src/index.mjs`, `/api/health` antigo nao exibe o estado do banco. Aplicar migrations e cadastrar admin funciona mesmo sem publicar o hotfix.

**Seguranca:** nao poste tokens, senhas nem documentos. O admin pode ser criado diretamente no seu computador. O sistema continua em STAGING com candidaturas publicas bloqueadas.
