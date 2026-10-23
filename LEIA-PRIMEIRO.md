# Ramon Recruit v0.4.4 - correcao do D1 remoto (sem importacao)

## Diagnostico

A consulta `d1 execute --command` funcionou e mostrou apenas `_cf_KV`: o esquema do aplicativo nao foi criado.
A tentativa anterior de criar conta usava `d1 execute --file`, o qual chama a API `/import` e retornou erro de autenticacao `[code: 10000]` apesar de o token anunciar escopo `d1(write)`. A causa precisa do erro de `/import` nao esta confirmada.

## O que copiar para seu repositorio

Copie **apenas a pasta `scripts/` deste patch** sobre `scripts/` no repositorio ja configurado. Nao substitua seu `wrangler.jsonc` e NAO coloque o patch como uma pasta extra na raiz.

Conteudo: `Inicializar-D1-Sem-Importacao.ps1`, `ler-migracao-para-comandos.mjs`, `Criar-Acesso-Cloudflare.ps1` atualizado e `gerar-sql-acesso.mjs` auxiliar ja usado no projeto.

A migracao SQL original `migrations/0001_initial.sql` precisa existir no projeto. O novo script so aceita o esquema da familia v0.4, usando `CREATE TABLE IF NOT EXISTS` e `CREATE INDEX IF NOT EXISTS`, sem DROP/DELETE.

## Comandos no Windows PowerShell, na raiz do repositorio

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
npm install
npx wrangler whoami
.\scripts\Inicializar-D1-Sem-Importacao.ps1
npx wrangler d1 execute DB --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
.\scripts\Criar-Acesso-Cloudflare.ps1 -Email "SEU_EMAIL" -Nome "Administrador Principal" -Perfil admin
```

Os scripts imprimem o destino D1 e exigem confirmacao `RAMON`. Se o Worker/repo `bernjob` estiver apontando para um banco de outro projeto, nao confirme. O script de criacao exige uma nova senha forte e atualiza a conta se ja existir.

Se `--command` tambem falhar ao criar tabelas, interrompa e use o Cloudflare D1 Studio (console SQL) para executar a migracao original manualmente; nao saia repetindo comandos nem apague o banco. O problema de permissao pode ser no endpoint de gravacao.

### Seguranca

- A senha nunca vai para o SQL do D1; so PBKDF2-SHA256 com salt aleatorio.
- A chamada `--command` passa o **hash** pela linha de comando do processo local; execute numa maquina confiavel, sem gravacao de terminal ou sistema de telemetria de processos que capture argumentos. O hash nao e senha em texto puro, mas tambem deve ser protegido.
- Nao copie o hash, a senha ou o token para GitHub, screenshots ou chats.
- O script original usa `--file`, que falhou no endpoint `/import`; este patch nao usa `--file`.
- Este patch nao publica o Worker nem ativa candidaturas publicas.

### Observacao sobre migracoes posteriores

Essa inicializacao emergencial cria o esquema diretamente sem registrar uma migracao no historico de `d1_migrations`. Assim, nao use `d1 migrations apply --remote` novamente sem verificar o estado; caso o endpoint de importacao seja corrigido, a migracao original e idempotente, mas sera aplicada como pendente e atualizara o historico. Antes de futuras alteracoes no esquema, organize as migracoes corretamente.

Nao foi possivel realizar teste remoto na sua conta Cloudflare daqui. Os scripts foram validados de forma estrutural e o particionamento do SQL inicial foi testado localmente.
