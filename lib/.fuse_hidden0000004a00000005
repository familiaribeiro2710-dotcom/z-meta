"use client";
import Confetti from "./Confetti";
import { Trophy, PartyPopper } from "lucide-react";
import { formatBRL } from "./scoring";

const POSITION_LABEL = { 1: "1º lugar", 2: "2º lugar", 3: "3º lugar" };

// Modal de parabéns do ritual de fechamento de mês — mostrado pro colaborador (top 1-2 da
// própria equipe) ou pro gerente (top 1-3 entre as lojas do supervisor) quando existe uma linha
// ainda não vista em monthly_closing_winners. Diferente do modal de pergunta (que insiste até
// confirmar), esse aparece só até a pessoa fechar — depois disso a tela que monta esse
// componente marca `seen_at` e ele não volta a aparecer pro mesmo mês/pessoa.
export default function MonthClosingCongratsModal({ winner, role, firstName, monthLabelText, onClose }) {
  if (!winner) return null;
  const roleLabel = role === "gerente" ? "entre as equipes que o seu supervisor acompanha" : "da sua equipe";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/70 p-6">
      <Confetti />
      <div className="card max-w-sm w-full text-center animate-bounce-in border-purple/30">
        <div className="flex justify-center mb-3 animate-wiggle">
          <Trophy size={56} className="text-pink" />
        </div>
        <h2 className="text-xl font-extrabold gradient-text">Parabéns, {firstName}!</h2>
        <p className="text-sm text-muted mt-2 flex items-center justify-center gap-1.5 flex-wrap">
          Você ficou em <span className="font-bold text-navy">{POSITION_LABEL[winner.position] || `${winner.position}º lugar`}</span> no ranking de vendas {roleLabel} em {monthLabelText}, com <span className="font-bold text-navy">{formatBRL(winner.sold)}</span> vendidos. <PartyPopper size={15} className="text-orange" />
        </p>
        <button className="btn-hype mt-5 w-full" onClick={onClose}>Show de bola!</button>
      </div>
    </div>
  );
}
