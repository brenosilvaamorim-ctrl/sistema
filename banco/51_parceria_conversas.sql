-- 51_parceria_conversas.sql — a parceira enxerga a conversa do WhatsApp do lead que é nosso
--
-- A regra é estreita de propósito. A conversa do WhatsApp chega antes de alguém decidir se
-- o caso é da parceria: quem escreve é um desconhecido, e o que ele conta ali é da pessoa,
-- não do escritório. Então a parceira **não** vê a caixa de conversas.
--
-- O que ela vê é só a conversa cujo **lead já está carimbado como da parceria** — ou seja,
-- depois de você ter decidido que aquele atendimento é de vocês dois. Antes disso, nada.
-- E é só leitura: responder pelo WhatsApp continua sendo do escritório, porque a mensagem
-- sai pelo número do escritório e em nome dele.
--
-- Rodar no SQL Editor do Supabase. Pode rodar de novo sem estragar nada.

drop policy if exists bot_conversa_parceria on public.bot_conversa;
create policy bot_conversa_parceria on public.bot_conversa for select to public
  using (lead_id in (select id from public.lead where parceria_id = minha_parceria()));

drop policy if exists bot_mensagem_parceria on public.bot_mensagem;
create policy bot_mensagem_parceria on public.bot_mensagem for select to public
  using (conversa_id in (
    select c.id from public.bot_conversa c
     where c.lead_id in (select id from public.lead where parceria_id = minha_parceria())));

-- Conferência: quantas conversas a parceria alcança hoje, e quantas existem ao todo.
select (select count(*) from public.bot_conversa) as conversas_no_escritorio,
       (select count(*) from public.bot_conversa c
         where c.lead_id in (select id from public.lead where parceria_id is not null))
         as conversas_de_lead_em_parceria;
