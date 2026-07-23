import Link from "next/link";
import {
  Target,
  Percent,
  CheckSquare,
  AlertTriangle,
  TrendingUp,
  Store,
  Check,
  X,
} from "lucide-react";
import Logo from "./Logo";

// Landing page de vendas do Z Meta — vive em app/page.js, mas só é mostrada pra quem não tem
// sessão ativa (quem já está logado é redirecionado direto pro próprio dashboard, sem ver essa
// tela). Usa só os tokens de cor e classes já existentes no app (.btn/.btn-outline/.card/
// .card-dark/.rank-pos etc., ver app/globals.css e tailwind.config.js) — nada de paleta nova.
export default function LandingPage() {
  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-40 bg-paper/90 backdrop-blur border-b-2 border-line">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Logo size="md" />
          <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-navy">
            <a href="#solucao" className="opacity-70 hover:opacity-100 transition-opacity">Como funciona</a>
            <a href="#recursos" className="opacity-70 hover:opacity-100 transition-opacity">Recursos</a>
            <a href="#papeis" className="opacity-70 hover:opacity-100 transition-opacity">Para sua equipe</a>
            <a href="#planos" className="opacity-70 hover:opacity-100 transition-opacity">Planos</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="btn-outline !py-2 !px-4 !text-xs">Entrar</Link>
            <a href="#planos" className="btn !py-2 !px-4 !text-xs">Agendar demonstração</a>
          </div>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-6 pt-16 pb-20 grid md:grid-cols-2 gap-14 items-center">
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gold mb-5">
            <span className="w-4 h-0.5 bg-gold inline-block" /> Gestão de equipes de varejo
          </p>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-navy leading-[1.1] mb-6">
            Sua rede de lojas rodando no <span className="text-gold">controle</span>, não na planilha.
          </h1>
          <p className="text-lg text-muted max-w-md mb-8">
            O Z Meta organiza tarefas, metas em camadas, comissão e ranking de cada loja, automaticamente, todos os dias. Da colaboradora ao sócio, cada um vê exatamente o que precisa.
          </p>
          <div className="flex flex-wrap gap-3 mb-8">
            <a href="#planos" className="btn">Agendar demonstração</a>
            <a href="#solucao" className="btn-outline">Ver como funciona</a>
          </div>
          <p className="text-xs text-muted">Feito para redes de moda, atacado e franquias multi-loja.</p>
        </div>

        <div className="card !p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-sm font-bold text-navy">Loja Centro</p>
              <p className="text-xs text-muted">Placar de hoje</p>
            </div>
            <span className="badge bg-success/15 text-success">98% da equipe ativa</span>
          </div>
          <div className="space-y-4 mb-5">
            <div>
              <div className="flex justify-between text-xs font-semibold text-navy mb-1.5">
                <span>Meta do mês</span><b className="text-gold font-extrabold">74%</b>
              </div>
              <div className="h-2 bg-line rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: "74%", background: "linear-gradient(90deg, #c9a15a, #e4c789)" }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs font-semibold text-navy mb-1.5">
                <span>Super meta</span><b className="text-gold font-extrabold">41%</b>
              </div>
              <div className="h-2 bg-line rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: "41%", background: "linear-gradient(90deg, #c9a15a, #e4c789)" }} />
              </div>
            </div>
          </div>
          <div className="border-t-2 border-line pt-4">
            <p className="text-sm font-bold text-navy mb-3">Ranking de vendedores</p>
            <ul className="space-y-2.5">
              {[
                { pos: "rank-pos-1", name: "Camila Souza", val: "R$ 8.420" },
                { pos: "rank-pos-plain", name: "Diego Alves", val: "R$ 7.110", light: true },
                { pos: "rank-pos-plain", name: "Bruna Lima", val: "R$ 6.980", light: true },
              ].map((r, i) => (
                <li key={r.name} className="flex items-center gap-2.5 text-sm">
                  <span className={`rank-pos ${i === 0 ? "rank-pos-1" : "bg-paper text-navy"}`}>{i + 1}</span>
                  <span className="w-6 h-6 rounded-full bg-line shrink-0" />
                  <span className="flex-1 font-semibold text-navy">{r.name}</span>
                  <span className="font-extrabold text-navy">{r.val}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <div className="border-y-2 border-line bg-white py-8">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <p className="text-xs font-bold uppercase tracking-wider text-muted mb-5">Pensado para operações que vivem de execução diária</p>
          <div className="flex flex-wrap justify-center gap-10 opacity-50 font-extrabold text-navy text-lg">
            <span>MODA</span><span>ATACADO</span><span>FRANQUIAS</span><span>MULTI-LOJA</span><span>CONSÓRCIO</span>
          </div>
        </div>
      </div>

      <section className="max-w-6xl mx-auto px-6 py-20" id="dores">
        <div className="max-w-xl mx-auto text-center mb-14">
          <p className="text-xs font-bold uppercase tracking-wider text-gold mb-4">O problema</p>
          <h2 className="text-3xl font-extrabold text-navy mb-3">Gerir loja por planilha custa caro, e ninguém percebe até o mês fechar</h2>
          <p className="text-muted">Sem visibilidade em tempo real, pequenos furos em tarefa, meta e comissão viram um rombo silencioso em cada loja.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { title: "Ninguém sabe quem está batendo meta", body: "O sócio só descobre o resultado da loja no fechamento do mês, tarde demais para corrigir a rota." },
            { title: "Comissão calculada na mão, com erro", body: "Planilha de comissão que não bate, colaborador desconfiado e gerente perdendo horas todo mês." },
            { title: "Tarefa do dia a dia sem registro", body: "Checklist de loja no papel ou no grupo de WhatsApp, sem histórico, sem cobrança, sem consequência." },
          ].map((p) => (
            <div key={p.title} className="card">
              <div className="w-9 h-9 rounded-xl bg-danger/10 text-danger flex items-center justify-center mb-4">
                <X size={18} strokeWidth={2.5} />
              </div>
              <h4 className="font-bold text-navy mb-2">{p.title}</h4>
              <p className="text-sm text-muted">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y-2 border-line bg-white py-20" id="solucao">
        <div className="max-w-6xl mx-auto px-6">
          <div className="max-w-xl mb-14">
            <p className="text-xs font-bold uppercase tracking-wider text-gold mb-4">Como funciona</p>
            <h2 className="text-3xl font-extrabold text-navy">Três passos para colocar a operação no automático</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-10">
            {[
              { n: "01", title: "Configure metas e comissão por loja", body: "Meta, Super Meta e Hiper Meta em camadas, com o percentual de comissão de cada uma. O sistema sempre calcula pela maior camada realmente atingida." },
              { n: "02", title: "A equipe usa o app todos os dias", body: "Colaborador marca tarefa, lança venda e acompanha a própria meta. Gerente acompanha a equipe. Tudo pelo celular." },
              { n: "03", title: "Você acompanha tudo, de qualquer lugar", body: "Ranking, faturamento, comissão e saúde de cada loja atualizados em tempo real, sem esperar planilha nenhuma." },
            ].map((s) => (
              <div key={s.n}>
                <div className="w-11 h-11 rounded-2xl bg-navy text-goldlight flex items-center justify-center font-extrabold mb-5">{s.n}</div>
                <h4 className="font-bold text-navy mb-2.5">{s.title}</h4>
                <p className="text-sm text-muted">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-20" id="recursos">
        <div className="max-w-xl mb-14">
          <p className="text-xs font-bold uppercase tracking-wider text-gold mb-4">Recursos</p>
          <h2 className="text-3xl font-extrabold text-navy mb-3">Tudo que a gestão de loja precisa, num só lugar</h2>
          <p className="text-muted">Nenhuma funcionalidade solta: cada peça conversa com a outra automaticamente.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { Icon: Target, title: "Metas em camadas", body: "Meta, Super Meta e Hiper Meta por loja e por colaborador, com comissão calculada pela camada efetivamente batida." },
            { Icon: Percent, title: "Comissionamento automático", body: "Sem planilha, sem divergência. A comissão de cada colaborador e gerente é calculada sozinha, todo mês." },
            { Icon: CheckSquare, title: "Tarefas diárias", body: "Checklist recorrente por loja, diário, semanal ou pontual, com histórico completo de execução." },
            { Icon: AlertTriangle, title: "Advertências e premiações", body: "Registro formal de advertência com desconto configurável, e premiações lançadas direto pelo gestor." },
            { Icon: TrendingUp, title: "Rankings em tempo real", body: "Ranking de vendedores, lojas e tarefas concluídas, o mesmo estímulo de competição saudável, todos os dias." },
            { Icon: Store, title: "Multi-loja e multi-empresa", body: "Uma empresa, várias lojas, vários times, cada nível da hierarquia vendo só o que precisa ver." },
          ].map(({ Icon, title, body }) => (
            <div key={title} className="card">
              <div className="w-10 h-10 rounded-xl bg-gold/10 text-gold flex items-center justify-center mb-4">
                <Icon size={19} />
              </div>
              <h4 className="font-bold text-navy mb-2">{title}</h4>
              <p className="text-sm text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y-2 border-line bg-white py-20" id="papeis">
        <div className="max-w-6xl mx-auto px-6">
          <div className="max-w-xl mb-14">
            <p className="text-xs font-bold uppercase tracking-wider text-gold mb-4">Para sua equipe</p>
            <h2 className="text-3xl font-extrabold text-navy mb-3">Uma tela certa para cada papel</h2>
            <p className="text-muted">Sem planilha genérica tentando servir todo mundo. Cada nível da hierarquia vê exatamente o que precisa decidir.</p>
          </div>
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { tag: "Sócio", title: "Visão de todas as lojas", items: ["Faturamento consolidado", "Ranking entre lojas", "Saúde de cada loja", "Cadastro de supervisores"] },
              { tag: "Supervisor", title: "Lojas sob sua gestão", items: ["Acompanha metas em tempo real", "Aprova advertências e premiações", "Compara desempenho entre lojas"] },
              { tag: "Gerente", title: "Dono da própria equipe", items: ["Venda diária da loja", "Ranking da equipe", "Tarefas e advertências"] },
              { tag: "Colaborador", title: "Foco no que gera comissão", items: ["Meta do dia, clara e simples", "Checklist de tarefas", "Própria comissão e ranking"] },
            ].map((r) => (
              <div key={r.tag} className="border-2 border-line rounded-3xl p-6 bg-paper">
                <span className="badge bg-gold/10 text-gold mb-3">{r.tag}</span>
                <h4 className="font-bold text-navy mb-3">{r.title}</h4>
                <ul className="space-y-1.5">
                  {r.items.map((it) => (
                    <li key={it} className="text-sm text-muted pl-4 relative before:content-['—'] before:absolute before:left-0 before:text-gold">
                      {it}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-20 text-center">
        <p className="text-xs font-bold uppercase tracking-wider text-gold mb-6">Depoimento</p>
        <div className="card-dark !p-10">
          <p className="text-xl font-semibold text-white leading-snug mb-7">
            &ldquo;Antes eu só sabia se a loja tinha batido meta no fechamento do mês. Hoje eu vejo em tempo real e consigo corrigir a rota no meio do caminho.&rdquo;
          </p>
          <div className="flex items-center justify-center gap-3">
            <span className="w-11 h-11 rounded-full bg-white/10 border-2 border-gold shrink-0" />
            <div className="text-left">
              <p className="text-sm font-bold text-white">Sócio de rede de moda</p>
              <p className="text-xs text-white/50">8 lojas em operação</p>
            </div>
          </div>
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mt-5">Exemplo ilustrativo</p>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-20" id="planos">
        <div className="card max-w-2xl mx-auto text-center !p-12">
          <p className="text-xs font-bold uppercase tracking-wider text-gold mb-4">Planos</p>
          <h3 className="text-2xl font-extrabold text-navy mb-3">Um valor pensado para o tamanho da sua operação</h3>
          <p className="text-muted max-w-md mx-auto mb-7">Cobrança por usuário cadastrado, com condição comercial personalizada para o número de lojas e colaboradores da sua empresa.</p>
          <div className="flex flex-wrap justify-center gap-6 mb-8">
            {["Sem limite de lojas", "Suporte na implantação", "Sem fidelidade"].map((t) => (
              <div key={t} className="flex items-center gap-2 text-sm font-semibold text-navy">
                <span className="w-[18px] h-[18px] rounded-full bg-gold text-navy flex items-center justify-center shrink-0">
                  <Check size={11} strokeWidth={3} />
                </span>
                {t}
              </div>
            ))}
          </div>
          <a
            href="https://wa.me/5511953893938?text=Ol%C3%A1!%20Quero%20saber%20mais%20sobre%20o%20Z%20Meta%20para%20minha%20empresa."
            target="_blank"
            rel="noopener noreferrer"
            className="btn"
          >
            Falar com um especialista
          </a>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-20 text-center">
        <div className="card max-w-xl mx-auto !p-14">
          <h2 className="text-3xl font-extrabold text-navy mb-4">Pronto para tirar sua operação da planilha?</h2>
          <p className="text-muted max-w-sm mx-auto mb-8">Marque uma demonstração de 20 minutos e veja o Z Meta rodando com o cenário da sua rede.</p>
          <div className="flex flex-wrap justify-center gap-3 mb-5">
            <a
              href="https://wa.me/5511953893938?text=Ol%C3%A1!%20Quero%20saber%20mais%20sobre%20o%20Z%20Meta%20para%20minha%20empresa."
              target="_blank"
              rel="noopener noreferrer"
              className="btn"
            >
              Agendar demonstração
            </a>
            <Link href="/login" className="btn-outline">Já sou cliente, entrar</Link>
          </div>
        </div>
      </section>

      <footer className="border-t-2 border-line bg-white py-12">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-wrap justify-between gap-8 mb-10">
            <div>
              <Logo size="sm" />
              <p className="text-sm text-muted max-w-xs mt-3">Gestão de equipes de varejo para redes de moda, atacado e franquias multi-loja. Um produto FORGE GROUP.</p>
            </div>
            <div className="flex gap-14 flex-wrap">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-muted mb-3">Produto</p>
                <a href="#solucao" className="block text-sm text-navy/75 hover:text-gold mb-2">Como funciona</a>
                <a href="#recursos" className="block text-sm text-navy/75 hover:text-gold mb-2">Recursos</a>
                <a href="#planos" className="block text-sm text-navy/75 hover:text-gold">Planos</a>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-muted mb-3">Acesso</p>
                <Link href="/login" className="block text-sm text-navy/75 hover:text-gold">Já sou cliente</Link>
              </div>
            </div>
          </div>
          <div className="border-t-2 border-line pt-6 flex flex-wrap justify-between gap-2 text-xs text-muted">
            <span>© {new Date().getFullYear()} Z Meta. Todos os direitos reservados.</span>
            <span>zmeta.com.br</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
