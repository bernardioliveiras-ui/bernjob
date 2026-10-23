# Ramon Recruit v0.4.5 - corrigir o banco `ramon` sem renomear o D1

## Por que os scripts anteriores falhavam

O `wrangler.jsonc` mostrado indica `database_name: "ramon"` e ID `5815cc53-5a3d-4666-a231-0c5b318eb03b`. Os scripts anteriores exigiam `ramon-recruit-eu` sem consultar o nome existente de fato na Cloudflare, o que impedia a inicializacao.

## Correção

A validacao do D1 agora:

1. exige o UUID mostrado no print (`5815cc53-5a3d-4666-a231-0c5b318eb03b`) para evitar writes em outro banco;
2. consulta a lista oficial com `npx wrangler d1 list --json`;
3. compara o nome cadastrado na Cloudflare com `database_name` do `wrangler.jsonc`;
4. exige confirmacao `RAMON` para operacoes de escrita.

Nao altera seu `wrangler.jsonc`. Nao cria outro D1 nem altera Workers.

## Instalação

Copie os arquivos da pasta `scripts/` para `C:\Users\hokiz\Documents\GitHub\bernjob\scripts\` substituindo os de mesmo nome. **Nao substitua** o `wrangler.jsonc`, `package.json` ou suas tabelas.

No PowerShell **na raiz do repositorio**, abra uma janela nova e rode:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
npx wrangler whoami
npx wrangler d1 list
.\scripts\Inicializar-D1-Sem-Importacao.ps1
```

Na mensagem de confirmacao, digite `RAMON` **somente se o UUID e o nome pertencerem ao banco exclusivo do recrutamento**.

Confirme as tabelas:

```powershell
npx wrangler d1 execute DB --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

Somente apos encontrar `users`, `jobs`, `candidates`, `sessions`, `request_limits`, cadastre o administrador:

```powershell
.\scripts\Criar-Acesso-Cloudflare.ps1 -Email "SEU_EMAIL" -Nome "Administrador Principal" -Perfil admin
```

## Segurança e limitações

- Este pacote **nao foi executado na sua conta Cloudflare** e nao publica o Worker.
- Se o banco `ramon` da lista estiver vinculado ao Bern Global, **pare** e separe os projetos antes de prosseguir.
- Scripts usam o modo `d1 execute --command`, nao `--file`, para contornar a falha de `/import` encontrada antes.
- Cria somente tabelas e indices com `IF NOT EXISTS`, mas executar em DB de projeto incorreto ainda seria perigoso; por isso as conferencias.
- A migracao executada manualmente nao grava a versao em `d1_migrations`; evite aplicar outra migracao antes de revisar o estado do esquema.
- `name: "ramon"` no wrangler nao resolve o aviso de projeto GitHub conectado a `bernjob`. Confira que os dois identificam o projeto do Ramon antes de usar esse Worker.
