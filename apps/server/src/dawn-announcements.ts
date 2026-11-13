export const dawnDeathTemplates = [
  '{name} foi eliminado. A alcateia deixou apenas a conta da padaria.',
  '{name} foi eliminado e não poderá justificar o barulho no telhado.',
  '{name} saiu para tomar ar e encontrou ar demais. Foi eliminado.',
  '{name} foi eliminado. A lua afirma que não viu nada e pede um advogado.',
  '{name} foi eliminado. O galo cantou, mas desta vez sem entusiasmo.',
  '{name} foi eliminado e perdeu oficialmente o café da manhã.',
  '{name} foi eliminado. Os Lobisomens avaliaram o serviço com cinco estrelas.',
  '{name} foi eliminado. A cesta de piquenique voltou sozinha.',
  '{name} foi eliminado. O manual da vila chama isso de uma manhã complicada.',
  '{name} foi eliminado. Ninguém sabe por que havia pegadas no teto.',
  '{name} foi eliminado. A alcateia nega tudo, inclusive saber o que é alcateia.',
  '{name} foi eliminado. Seu despertador ainda tocou, por puro deboche.',
  '{name} foi eliminado. A névoa entregou a notícia e saiu de fininho.',
  '{name} foi eliminado. A reunião de condomínio ficará um pouco mais curta.',
  '{name} foi eliminado. Os cães da vila exigem que não sejam confundidos com os suspeitos.',
  '{name} foi eliminado. A lua cheia emitiu um comunicado sem comentários.',
  '{name} foi eliminado. A porta estava trancada, mas a janela tinha planos próprios.',
  '{name} foi eliminado. O padeiro recomenda não perguntar sobre as marcas de garras.',
  '{name} foi eliminado. O sino tocou duas vezes: uma pela notícia e outra pelo drama.',
  '{name} foi eliminado. A alcateia levou tudo, menos as meias desaparelhadas.',
  '{name} foi eliminado. A coruja viu tudo, mas cobra caro pelo depoimento.',
  '{name} foi eliminado. A vila marcou o ocorrido como “inesperado, porém bem lupino”.',
  '{name} foi eliminado. O tapete de boas-vindas agora parece ironia.',
  '{name} foi eliminado. A única pista é um recibo de petiscos tamanho família.',
  '{name} foi eliminado. O café esfriou e o clima também.',
  '{name} foi eliminado. A alcateia deixou um bilhete escrito “não fomos nós”.',
  '{name} foi eliminado. O guarda-noturno estava ocupado contando estrelas.',
  '{name} foi eliminado. A lua recomenda fechar melhor as cortinas amanhã.',
  '{name} foi eliminado. O mistério aumentou e a população diminuiu.',
  '{name} foi eliminado. A praça ganhou silêncio e perdeu um frequentador.',
  '{name} foi eliminado. Até o galo pediu um minuto de silêncio antes de cantar.',
  '{name} foi eliminado. A investigação começou pela pergunta: “quem uivou tão alto?”.',
  '{name} foi eliminado. A alcateia chama de jantar; a vila chama de péssima vizinhança.',
  '{name} foi eliminado. O diário da vila registrou: “noite ruim, lobos satisfeitos”.',
  '{name} foi eliminado. Sua cadeira na praça agora está disponível, mas ninguém quer sentar.',
  '{name} foi eliminado. A lua baixou o brilho para não se envolver.',
  '{name} foi eliminado. O estoque de alho continua inútil, como sempre.',
  '{name} foi eliminado. A vila promete investigar assim que terminar o café.',
  '{name} foi eliminado. Havia pelos na cena, mas o gato exige retratação.',
  '{name} foi eliminado. O sino anunciou a notícia com zero delicadeza.',
  '{name} foi eliminado. A alcateia esqueceu de preencher o livro de visitas.',
  '{name} foi eliminado. A testemunha principal é uma galinha muito nervosa.',
  '{name} foi eliminado. A noite levou um morador e deixou muitas teorias ruins.',
  '{name} foi eliminado. O prefeito declarou que está tudo sob controle, então claramente não está.',
  '{name} foi eliminado. A vila acordou com menos respostas e uma vaga no café da manhã.',
  'Oxente! {name} foi eliminado. A alcateia fez um aperreio danado nesta noite.',
  'Vixe Maria! {name} foi eliminado e o terreiro amanheceu num silêncio só.',
  'Eita gota serena! {name} foi eliminado antes mesmo do primeiro café.',
  '{name} foi eliminado. Foi um rebuliço arretado e ninguém viu foi nada, visse?',
  'Ave Maria! {name} foi eliminado. A lua clareou tudo, menos o culpado.',
  '{name} foi eliminado. A alcateia chegou avexada e deixou o maior aperreio.',
  'Oxente, cadê {name}? Foi eliminado, e agora a vila inteira quer explicação.',
  '{name} foi eliminado. Eita noite comprida da moléstia para uma notícia dessas.',
] as const;

export const dawnNoDeathMessages = [
  'Ninguém morreu. A alcateia aparentemente colocou o despertador para a hora errada.',
  'Todos sobreviveram. Os Lobisomens culpam o trânsito na floresta.',
  'Nenhuma vítima nesta noite. Até a lua parece um pouco decepcionada.',
  'Ninguém morreu. Houve muito uivo e pouca organização.',
  'A vila amanheceu inteira. A alcateia pede que isso não conste na avaliação de desempenho.',
  'Todos estão vivos. Alguém claramente leu o mapa da vila de cabeça para baixo.',
  'Nenhuma baixa. Os Lobisomens tiveram uma noite de cão, com todo respeito aos cães.',
  'Ninguém morreu. A porta rangeu, a coruja gritou e no fim era só vento dramático.',
  'Amanheceu sem vítimas. A alcateia marcou a noite como reunião improdutiva.',
  'Todos sobreviveram. O galo cantou vitória sem saber exatamente por quê.',
  'Nenhuma vítima. A lua cheia exige mais profissionalismo dos envolvidos.',
  'Ninguém morreu. A floresta ouviu desculpas sobre prazo, escopo e falta de petiscos.',
  'A vila continua completa. Os Lobisomens devem ter parado para pedir informação.',
  'Todos vivos. Foi uma noite assustadora, mas administrativamente tranquila.',
  'Nenhuma morte. A alcateia enviou o ataque para o endereço errado.',
  'Oxente, ninguém morreu! A alcateia se avexou e errou o caminho.',
  'Vixe, todo mundo vivo! O aperreio foi grande, mas o estrago foi nenhum.',
  'Eita manhã arretada: ninguém morreu e o café pode ser servido em paz.',
  'Ninguém morreu, visse? Teve uivo, rebuliço e nenhuma competência.',
] as const;

export function dawnDeathAnnouncement(name: string, seed: string): string {
  return select(dawnDeathTemplates, seed).replace('{name}', name);
}

export function dawnNoDeathAnnouncement(seed: string): string {
  return select(dawnNoDeathMessages, seed);
}

function select<const Item extends string>(
  items: readonly Item[],
  seed: string,
): Item {
  let hash = 2_166_136_261;
  for (const character of seed) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return items[(hash >>> 0) % items.length]!;
}
