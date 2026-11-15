# Spec Delta

## Purpose

Manter participantes eliminados envolvidos por meio de um espaco privado de conversa, previsoes e pontos ficticios que nao interfere na partida principal.

## ADDED Requirements

### Requirement: Elegibilidade do espaco dos mortos
O sistema SHALL liberar o espaco dos mortos somente para participantes autenticados que tenham sido eliminados da partida, independentemente da causa. Participantes vivos e removidos administrativamente MUST NOT receber nem consultar dados desse espaco.

#### Scenario: Eliminacao durante a partida
- **WHEN** a resolucao autoritativa altera um participante de vivo para eliminado
- **THEN** sua proxima projecao privada libera o espaco dos mortos sem encerrar sua sessao

#### Scenario: Participante vivo tenta acessar
- **WHEN** um participante vivo solicita mensagens, previsoes ou classificacao do espaco dos mortos
- **THEN** o sistema rejeita a solicitacao sem retornar qualquer dado privado dos mortos

#### Scenario: Participante removido tenta acessar
- **WHEN** uma credencial de participante removido e usada para consultar ou enviar dados do espaco dos mortos
- **THEN** o sistema rejeita a autenticacao como faz para os demais recursos da sala

### Requirement: Mensagem apos expulsao pela vila
O sistema MUST apresentar ao participante expulso pela votacao diurna a mensagem exata: “A vila encerrou sua jornada, mas seu espírito continua observando. Faça suas previsões e dispute o título de Oráculo do Além.”

#### Scenario: Participante expulso por votacao
- **WHEN** a resolucao diurna confirma a expulsao de um participante
- **THEN** a projecao privada desse participante inclui a mensagem de entrada e o acesso ao espaco dos mortos

#### Scenario: Morte por outra causa
- **WHEN** um participante e eliminado por uma causa diferente de expulsao pela vila
- **THEN** o sistema libera o espaco dos mortos sem atribuir a mensagem especifica de expulsao a essa causa

### Requirement: Chat privado dos mortos
O sistema SHALL oferecer aos participantes eliminados um chat persistente da partida, visivel somente aos mortos elegiveis. Cada mensagem MUST identificar autor e instante, preservar ordem autoritativa e conter entre 1 e 500 caracteres apos normalizacao.

#### Scenario: Morto envia mensagem valida
- **WHEN** um participante eliminado envia uma mensagem valida durante uma partida ativa
- **THEN** o sistema persiste a mensagem uma unica vez e atualiza as projecoes privadas dos mortos da mesma partida

#### Scenario: Novo morto abre o chat
- **WHEN** um participante acaba de ser eliminado e consulta o espaco dos mortos
- **THEN** o sistema apresenta o historico do chat daquela partida em ordem cronologica

#### Scenario: Mensagem invalida ou repetida
- **WHEN** uma mensagem vazia, acima do limite ou com a mesma chave idempotente ja processada e enviada
- **THEN** o sistema rejeita o conteudo invalido ou devolve o resultado anterior sem duplicar a mensagem

#### Scenario: Partida encerrada
- **WHEN** um participante eliminado consulta o chat depois do encerramento
- **THEN** o historico permanece visivel, mas novas mensagens sao rejeitadas

### Requirement: Janela de atividade por rodada
O sistema SHALL abrir uma atividade do Alem na alvorada de cada rodada e fecha-la ao encerrar a votacao diurna. Participantes eliminados ate a abertura podem substituir suas escolhas enquanto a janela estiver aberta; eliminados depois da abertura participam a partir da proxima rodada aplicavel.

#### Scenario: Morto elegivel envia escolhas
- **WHEN** um participante ja eliminado na abertura envia ou substitui escolhas antes do fechamento
- **THEN** o sistema mantem somente a ultima versao aceita para esse participante e rodada

#### Scenario: Eliminado durante a resolucao diurna
- **WHEN** um participante e expulso depois que a atividade da rodada foi fechada
- **THEN** ele entra no chat imediatamente e aguarda a proxima abertura para fazer previsoes

#### Scenario: Escolha fora da janela
- **WHEN** um participante envia escolhas antes da abertura ou depois do fechamento da atividade
- **THEN** o sistema rejeita o comando e devolve o estado privado vigente

#### Scenario: Partida termina antes de nova abertura
- **WHEN** a partida termina sem abrir outra atividade para um participante recem-eliminado
- **THEN** o participante conserva acesso ao chat e ao resultado final sem receber uma atividade retroativa

### Requirement: Previsao do proximo eliminado
Em cada atividade, o sistema SHALL permitir escolher exatamente um jogador vivo como provavel expulso da votacao daquela rodada. Um acerto SHALL acrescentar 3 pontos do Alem; rodada sem expulsao ou palpite incorreto nao altera a pontuacao.

#### Scenario: Palpite correto
- **WHEN** o alvo previsto e expulso na resolucao diurna da mesma rodada
- **THEN** o sistema credita 3 pontos ao participante que fez o palpite

#### Scenario: Palpite incorreto ou dia sem expulsao
- **WHEN** outro jogador e expulso ou a rodada termina sem expulsao
- **THEN** o sistema encerra o palpite sem creditar nem retirar pontos

#### Scenario: Alvo deixa de ser elegivel
- **WHEN** o alvo previsto deixa de estar vivo antes do fechamento da atividade
- **THEN** o sistema invalida esse alvo na projecao e exige uma nova escolha para concluir a atividade

### Requirement: Marcacao de Lobisomens
Em cada atividade, o sistema SHALL permitir marcar qualquer quantidade de jogadores vivos como Lobisomens. No encerramento da partida, cada marcacao correta SHALL valer 1 ponto e cada marcacao incorreta SHALL retirar 1 ponto, sem revelar acertos durante a partida.

#### Scenario: Apuracao das marcacoes
- **WHEN** a partida termina e os papeis sao revelados
- **THEN** o sistema soma 1 ponto por alvo que possuia papel de Lobisomem e subtrai 1 ponto por qualquer outro alvo marcado em cada rodada

#### Scenario: Consulta durante a partida
- **WHEN** um morto consulta suas marcacoes antes do encerramento
- **THEN** o sistema mostra suas escolhas sem indicar quais estao corretas e sem expor papeis ainda secretos

#### Scenario: Nenhum suspeito marcado
- **WHEN** o participante confirma uma atividade sem marcar suspeitos
- **THEN** o sistema aceita a lista vazia e nao aplica pontos por essa categoria

### Requirement: Aposta ficticia na equipe vencedora
Cada morto SHALL iniciar com 10 pontos do Alem e, por atividade, pode apostar de 1 a 3 pontos disponiveis em Cidade, Lobisomens ou Amantes. O valor fica reservado; ao final, aposta correta devolve o valor e credita igual premio, enquanto aposta incorreta perde o valor reservado.

#### Scenario: Aposta aceita
- **WHEN** um participante escolhe uma equipe e aposta entre 1 e 3 pontos que possui disponiveis
- **THEN** o sistema reserva o valor e impede que ele seja comprometido novamente

#### Scenario: Substituicao da aposta
- **WHEN** o participante altera equipe ou valor durante a janela aberta
- **THEN** o sistema libera a reserva anterior e aplica somente a nova reserva de forma atomica

#### Scenario: Saldo insuficiente
- **WHEN** o participante tenta apostar mais pontos do que possui disponiveis
- **THEN** o sistema rejeita a escolha e preserva aposta e saldo anteriores

#### Scenario: Liquidacao da aposta
- **WHEN** a partida termina com uma equipe vencedora
- **THEN** o sistema liquida cada aposta contra essa equipe e registra o ganho ou a perda no saldo final

### Requirement: Pontuacao e titulo de Oraculo do Alem
O sistema MUST manter um lancamento auditavel para cada alteracao de pontos e nunca apresentar saldo final abaixo de zero. Ao encerrar a partida, SHALL classificar os mortos pelo saldo final e atribuir o titulo de Oraculo do Alem a todos que empatarem na maior pontuacao.

#### Scenario: Classificacao final com empate
- **WHEN** dois ou mais mortos terminam com o mesmo maior saldo
- **THEN** todos recebem o titulo e aparecem empatados na primeira posicao

#### Scenario: Penalidades excedem o saldo
- **WHEN** perdas de apostas e marcacoes incorretas produziriam saldo negativo
- **THEN** o sistema apresenta saldo final zero sem apagar os lancamentos que explicam o calculo

#### Scenario: Nenhum participante eliminado
- **WHEN** a partida termina sem qualquer participante elegivel ao espaco dos mortos
- **THEN** o sistema nao atribui o titulo nem cria uma classificacao vazia para exibicao

### Requirement: Privacidade de escolhas e classificacao
Durante a partida, cada morto MUST ver apenas suas escolhas, reservas e saldo disponivel, alem do chat compartilhado. Resultados, acertos e classificacao SHALL ficar ocultos ate o encerramento e, mesmo entao, ser visiveis somente aos participantes eliminados.

#### Scenario: Morto consulta atividade em andamento
- **WHEN** um participante eliminado recebe uma atualizacao antes do fim da partida
- **THEN** a projecao privada inclui suas escolhas e saldo disponivel, mas omite escolhas alheias, acertos e classificacao

#### Scenario: Vivo recebe atualizacao da sala
- **WHEN** o servidor projeta ou transmite o estado para um participante vivo
- **THEN** nenhum conteudo do chat, escolhas, saldo ou classificacao dos mortos aparece na resposta

#### Scenario: Resultado para os mortos
- **WHEN** a partida termina e um participante eliminado consulta o resultado
- **THEN** o sistema apresenta a classificacao, os lancamentos do proprio participante e os vencedores do titulo

### Requirement: Persistencia e recuperacao
Mensagens, escolhas, reservas, lancamentos e classificacao MUST sobreviver a reconexao e reinicio do servidor. Comandos do espaco dos mortos MUST usar identidade autenticada, chave idempotente e estado esperado para evitar repeticao ou escrita em rodada encerrada.

#### Scenario: Reconexao durante atividade aberta
- **WHEN** um morto reconecta com sessao valida durante a janela da rodada
- **THEN** recebe o chat, a ultima escolha aceita, as reservas e o saldo disponivel atuais

#### Scenario: Reinicio apos fechamento
- **WHEN** o servidor reinicia depois de fechar ou liquidar uma atividade
- **THEN** a recuperacao preserva exatamente uma apuracao e nao reaplica pontos ou apostas

#### Scenario: Comando obsoleto
- **WHEN** um comando referencia versao ou rodada que ja nao esta aberta
- **THEN** o sistema rejeita a escrita e retorna a projecao privada mais recente autorizada
