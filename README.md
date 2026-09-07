# CATALISA — versão HTML para Vercel

Aplicação em HTML, CSS e JavaScript com login por e-mail/senha e banco compartilhado no Supabase. O projeto está pronto para ser versionado no GitHub e publicado na Vercel.

## Por que o Supabase é necessário

Sem banco, cada computador teria dados separados no navegador. Como gestores e colaboradores precisam enxergar as mesmas ações, cronograma e resultados, esta versão usa:

- Supabase Auth para login e senha individual;
- Supabase Database para dados compartilhados;
- Row Level Security para bloquear usuários não autenticados.

## 1. Criar e configurar o Supabase

1. Crie um projeto em https://supabase.com/dashboard.
2. Abra **SQL Editor**, copie todo o conteúdo de `supabase/schema.sql` e execute.
3. Em **Project Settings > API**, copie:
   - Project URL;
   - chave pública `anon` / `publishable`.
4. Em **Authentication > URL Configuration**, defina a URL publicada na Vercel como **Site URL** e adicione-a em **Redirect URLs**.
5. Em **Authentication > Users**, use **Invite user** para convidar cada pessoa. Não ative cadastro público se o acesso deve ser restrito.

## 2. Criar o repositório no GitHub

1. Crie um repositório novo, por exemplo `catalisa-botuvera`.
2. Na pasta deste projeto, execute:

```bash
git init
git add .
git commit -m "Publica MVP do CATALISA"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/catalisa-botuvera.git
git push -u origin main
```

## 3. Publicar na Vercel

1. Entre em https://vercel.com/new e importe o repositório do GitHub.
2. Em **Environment Variables**, adicione:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
3. Clique em **Deploy**. O arquivo `vercel.json` já configura o build e a pasta de saída.
4. Depois do primeiro deploy, volte ao Supabase e configure a URL final conforme o passo 1.4.

## Teste local

Crie um arquivo `.env` com as duas variáveis e carregue-as no terminal antes do build, ou defina-as diretamente no ambiente. Depois execute:

```bash
npm run dev
```

Abra `http://localhost:4173`.

## Segurança e acesso

- A chave `anon` é pública por definição; a segurança real está nas políticas RLS do banco.
- Nunca use a chave `service_role` no site ou na Vercel.
- Cada usuário deve receber convite próprio e criar sua própria senha.
- Nesta primeira versão, todo usuário autenticado pode visualizar, criar, atualizar e excluir registros.
