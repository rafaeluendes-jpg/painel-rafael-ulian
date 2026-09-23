-- Semente: o convite do dono. Só entra se ainda não existir (tabela vazia).
-- No projeto novo (23/09/2026) o usuário do dono foi criado por SQL com senha provisória.
-- Depois de aplicar, o Rafael entra na tela de entrada, clica em
-- "Esqueci minha senha / primeiro acesso", recebe o link por e-mail e define a senha.
insert into public.painel_convites (dono_id, email, nome, papel)
select null, 'rafaeluendes@gmail.com', 'Rafael Ulian', 'dono'
where not exists (select 1 from public.painel_convites);
