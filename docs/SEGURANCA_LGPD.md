# Segurança e LGPD — checklist técnico do Bern Global v0.2

## O que a base de código já implementa

- Três papéis distintos (`candidate`, `lawyer`, `company`) mais `admin` administrativo.
- Sessão com cookie `HttpOnly`, `SameSite=Lax`; hash de token armazenado em D1.
- Hash de senha PBKDF2-SHA256 com sal aleatório, troca obrigatória de senha gerada pelo administrador.
- Confirmação de pagamento via servidor com API InfinitePay, conferência do valor e vinculação ao pedido.
- Verificações de propriedade para acesso a candidaturas e mensagens; empresa não consegue listar candidatos fora de suas vagas.
- Verificação de empresa e moderação humana antes da publicação de vaga própria.
- Requisições autenticadas com validação de Origin no POST (e scripts administrativos com segredo).
- Cabeçalhos defensivos: CSP, HSTS em HTTPS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy.
- Limites básicos por conta/tentativa de login e volume de mensagens/publicações.
- Dados exibidos via DOM textContent, evitando injeção direta de HTML nos perfis e mensagens.
- Diretório jurídico desativado por padrão até revisão ética/regulatória.

## Obrigatório antes de produção pública

1. Criar conta Cloudflare com 2FA e acessos mínimos; habilitar WAF, regras de rate limiting de borda, Bot Fight/Turnstile nos cadastros e logins após teste, e alertas de consumo/custos.
2. Usar domínio próprio com DNS Cloudflare, TLS Full (strict), HSTS depois de testar HTTPS em todos os subdomínios, proteção a rotas `/api/admin/*` (ex.: Cloudflare Access, IP autorizado ou token adicional por funcionário).
3. Testar segurança com contas reais de exemplo (candidato A, B; empresa A, B; advogado) tentando acessar recursos de outra conta (IDOR). Revisar e testar o middleware por rota e método.
4. Conectar InfinitePay e testar pagamento realizado, pendente, cancelado, estornado, repetido, usuário de outro pedido e corrida de confirmações. Esta versão **não** implementa confirmação assíncrona por webhook em produção.
5. Adicionar verificação de e-mail e fluxo de recuperação com token de uso único, curto prazo e e-mail transacional; hoje há somente mudança autenticada e reset administrativo por PowerShell.
6. Implementar endpoint autenticado de exportação e exclusão dos dados, política de retenção, registro auditável de consentimentos, minimização e procedimento de exercício de direitos LGPD.
7. Definir controlador e canais de privacidade, análise de impacto quando adequada, acordos com operadores, registro de operações e salvaguardas de transferência internacional. Avaliar GDPR se a plataforma oferecer serviços a residentes na UE.
8. Revisar a conformidade trabalhista e de recrutamento nos países de atuação, inclusive proibições de cobrança dos candidatos para candidatar-se. Revisar o diretório jurídico e o modelo de assinaturas com advogado da jurisdição relevante antes de habilitar.
9. Usar armazenamento privado R2 com upload validado para imagens e currículos; neste MVP o cadastro da vaga aceita **URL HTTPS de imagem**, não upload de arquivos e nenhum documento de identidade deve ser solicitado pela plataforma.
10. Criar backups periódicos testados (D1 Time Travel/PITR quando disponível e export seguro), telemetria sem registrar senhas ou documentos, plano de incidentes e atualização programada de dependências.
11. Testes de integração com `wrangler dev`, migrations locais/remotas e auditoria externa de segurança. **Os testes unitários não constituem pentest nem garantia de invulnerabilidade.**
12. Revisar os Termos, a Política de Privacidade, o mecanismo de reembolso/cancelamento e o fluxo de reclamações e moderação com profissionais habilitados antes da venda.

## Publicação

Mantenha segredo `ADMIN_KEY` e `INFINITEPAY_API_KEY` apenas no Workers Secrets. Não copie para JavaScript público, GitHub, logs, e-mails ou arquivos `.dev.vars` enviados a clientes.

## Ponto de atenção da migração

**Este pacote deve ser instalado em banco D1 novo.** O schema inicial de v0.1 foi ajustado para incluir o papel `company`. Caso tenha dados em v0.1 implantados, **não execute esta atualização diretamente**: será necessária migração controlada das tabelas com restrição `CHECK`, com backup, reconciliação e teste de preservação de dados.
