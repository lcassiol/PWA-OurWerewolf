# Spec Delta

## Purpose

Define composicoes validas, distribuicao confidencial e efeitos verificaveis do catalogo inicial de papeis do jogo Lobisomem.

## ADDED Requirements

### Requirement: Quantidade automatica de lobisomens
O sistema MUST definir a quantidade de Lobisomens pelo total de jogadores: 1 para 6 a 8 jogadores, 2 para 9 a 12, 3 para 13 a 16 e 4 para 17 a 20. O anfitriao MUST NOT reduzir ou exceder essa quantidade na composicao do MVP.

#### Scenario: Calculo para dez participantes
- **WHEN** uma sala com dez participantes valida sua composicao
- **THEN** o sistema reserva exatamente dois papeis de Lobisomem

#### Scenario: Total fora do intervalo
- **WHEN** uma composicao e solicitada para menos de 6 ou mais de 20 participantes
- **THEN** o sistema a considera invalida e nao permite iniciar

### Requirement: Composicao dos papeis da Cidade e neutros
O sistema SHALL disponibilizar no maximo uma copia de Cacador, Vidente, Bruxa, Medico, Bobo, Cupido, Guardiao, Prefeito e Menina. Depois dos Lobisomens e papeis especiais habilitados, todas as vagas restantes MUST ser preenchidas por Aldeoes; a composicao MUST possuir pelo menos um Aldeao.

#### Scenario: Preenchimento automatico
- **WHEN** a quantidade de papeis especiais habilitados e menor que as vagas nao reservadas aos lobisomens
- **THEN** o sistema completa a composicao com Aldeoes ate igualar o numero de participantes

#### Scenario: Excesso de papeis especiais
- **WHEN** os papeis selecionados nao deixam vaga para pelo menos um Aldeao
- **THEN** o sistema rejeita a composicao e informa o ajuste necessario

### Requirement: Distribuicao aleatoria e secreta
O sistema SHALL embaralhar todos os papeis da composicao e atribuir exatamente um papel a cada participante sem intervencao do anfitriao. Cada atribuicao MUST permanecer confidencial ate uma revelacao prevista nas regras ou o fim da partida.

#### Scenario: Distribuicao completa
- **WHEN** uma partida valida e iniciada
- **THEN** cada participante recebe um unico papel e nenhum papel da composicao fica sem dono ou e duplicado

#### Scenario: Anfitriao consulta distribuicao
- **WHEN** o anfitriao tenta obter os papeis dos demais durante a partida
- **THEN** o sistema aplica a ele as mesmas restricoes de segredo de qualquer participante

### Requirement: Lobisomem
Cada Lobisomem SHALL conhecer os demais lobisomens vivos e votar secretamente, durante a noite, em um jogador vivo que nao seja Lobisomem. Um alvo SHALL sofrer o ataque da alcateia somente quando tiver sozinho a maior quantidade de votos; empate ou ausencia de votos resulta em nenhum ataque.

#### Scenario: Alcateia escolhe alvo unico
- **WHEN** a fase noturna termina com um alvo tendo sozinho a maior quantidade de votos dos lobisomens vivos
- **THEN** o sistema registra um ataque da alcateia contra esse alvo antes das protecoes

#### Scenario: Votos da alcateia empatados
- **WHEN** dois ou mais alvos empatam na maior quantidade de votos
- **THEN** a alcateia nao produz ataque naquela noite

### Requirement: Aldeao
O Aldeao SHALL pertencer a Cidade, nao possuir acao noturna e participar normalmente da discussao e votacao enquanto estiver vivo.

#### Scenario: Noite do Aldeao
- **WHEN** a partida entra em uma fase de acoes noturnas
- **THEN** o Aldeao recebe apenas a informacao de aguardar o amanhecer

### Requirement: Cacador
Quando o Cacador morrer por qualquer causa, o sistema SHALL abrir uma decisao privada e limitada por tempo para que ele elimine um jogador ainda vivo. Se nao escolher a tempo, nenhuma morte adicional ocorre.

#### Scenario: Ultimo disparo
- **WHEN** o Cacador morto escolhe um jogador vivo dentro do prazo
- **THEN** o sistema elimina o alvo e resolve efeitos de morte decorrentes antes de verificar a vitoria

#### Scenario: Cacador nao escolhe
- **WHEN** o prazo do ultimo disparo termina sem uma escolha valida
- **THEN** o sistema continua sem alvo adicional

### Requirement: Vidente
A Vidente SHALL poder inspecionar um outro jogador vivo por noite e descobrir se seu alinhamento atual e Lobisomens, Cidade ou Neutro. O resultado MUST ser visivel somente para a Vidente.

#### Scenario: Inspecao valida
- **WHEN** a Vidente escolhe outro jogador vivo durante sua fase noturna
- **THEN** o sistema informa privadamente o alinhamento desse jogador sem revelar seu papel exato

### Requirement: Bruxa
A Bruxa SHALL possuir uma pocao de cura e uma pocao de veneno, cada uma utilizavel no maximo uma vez por partida. A cada noite, ela SHALL ver o alvo atual do ataque da alcateia, se houver, e pode usar no maximo uma das duas pocoes; a cura cancela esse ataque e o veneno mata outro jogador vivo escolhido.

#### Scenario: Uso da cura
- **WHEN** existe um alvo da alcateia e a Bruxa usa sua pocao de cura ainda disponivel
- **THEN** o ataque da alcateia contra o alvo e cancelado e a pocao fica indisponivel pelo restante da partida

#### Scenario: Uso do veneno
- **WHEN** a Bruxa usa sua pocao de veneno ainda disponivel em um jogador vivo valido
- **THEN** o sistema registra dano letal por veneno e torna a pocao indisponivel

#### Scenario: Tentativa de usar duas pocoes
- **WHEN** a Bruxa tenta usar cura e veneno na mesma noite
- **THEN** o sistema aceita no maximo a primeira escolha confirmada e rejeita a outra

### Requirement: Medico
O Medico SHALL escolher a cada noite um jogador vivo, inclusive a si mesmo, para impedir um ataque da alcateia contra ele. O Medico MUST NOT proteger o mesmo alvo em duas noites consecutivas e sua protecao nao evita veneno nem mortes derivadas.

#### Scenario: Protecao contra alcateia
- **WHEN** o jogador protegido e o alvo do ataque da alcateia
- **THEN** esse ataque nao o mata

#### Scenario: Alvo repetido
- **WHEN** o Medico tenta proteger o mesmo jogador da noite anterior
- **THEN** o sistema rejeita o alvo e exige outro jogador ou abstencao

### Requirement: Bobo
O Bobo SHALL possuir alinhamento Neutro e conquistar uma vitoria pessoal quando for expulso pela votacao diurna. Sua expulsao MUST NOT encerrar a disputa principal; ele permanece eliminado e sera apresentado como vencedor adicional ao fim da partida.

#### Scenario: Bobo expulso pelo voto
- **WHEN** a resolucao da votacao diurna expulsa o Bobo
- **THEN** o sistema registra sua vitoria pessoal e continua a partida se nenhuma condicao principal foi satisfeita

#### Scenario: Bobo morre de outra forma
- **WHEN** o Bobo morre por ataque, habilidade ou efeito derivado
- **THEN** o sistema o elimina sem conceder sua vitoria pessoal

### Requirement: Cupido e amantes
Na primeira noite, Cupido SHALL ligar dois participantes vivos distintos e pode incluir a si mesmo. Os amantes SHALL conhecer apenas a identidade um do outro; quando um morrer, o outro MUST morrer em seguida. Se os dois amantes forem os unicos sobreviventes apos uma resolucao, ambos SHALL vencer juntos antes das condicoes principais.

#### Scenario: Formacao do casal
- **WHEN** Cupido confirma dois alvos distintos na primeira noite
- **THEN** o sistema registra o vinculo e revela privadamente cada amante ao outro

#### Scenario: Morte por vinculo
- **WHEN** um amante morre
- **THEN** o sistema elimina o outro como efeito derivado antes de verificar a vitoria

#### Scenario: Casal como ultimos sobreviventes
- **WHEN** uma resolucao deixa vivos apenas os dois amantes
- **THEN** o sistema encerra a partida com vitoria dos amantes independentemente de seus alinhamentos originais

### Requirement: Guardiao
O Guardiao SHALL escolher a cada noite outro jogador vivo para guardar. Se esse jogador sofrer um ataque da alcateia que nao foi cancelado por cura ou protecao, o Guardiao MUST morrer em seu lugar; a guarda nao intercepta outras causas de morte.

#### Scenario: Intercepcao do ataque
- **WHEN** o alvo guardado sofreria um ataque valido da alcateia sem outra protecao
- **THEN** o sistema preserva o alvo e mata o Guardiao em seu lugar

#### Scenario: Ataque ja cancelado
- **WHEN** a cura da Bruxa ou a protecao do Medico cancela o ataque ao alvo guardado
- **THEN** o Guardiao nao morre por esse ataque

### Requirement: Prefeito
Enquanto o Prefeito estiver vivo, seu voto diurno confirmado SHALL valer dois votos. Sua identidade MUST permanecer secreta como os demais papeis ate que uma regra geral a revele.

#### Scenario: Contagem do voto do Prefeito
- **WHEN** o Prefeito vivo confirma um voto valido
- **THEN** o sistema soma peso dois ao alvo sem revelar publicamente a origem do peso durante a votacao

### Requirement: Menina
Uma vez por noite, a Menina SHALL poder optar por espiar a alcateia. Ao espiar, ela descobre privadamente um Lobisomem vivo escolhido aleatoriamente; em cada tentativa existe uma chance publicada de 25% de sua identidade ser revelada privadamente aos lobisomens vivos.

#### Scenario: Espionagem sem deteccao
- **WHEN** a Menina espia, existe um lobisomem vivo e a deteccao nao ocorre
- **THEN** o sistema revela um lobisomem para a Menina e nao revela a Menina para a alcateia

#### Scenario: Espionagem detectada
- **WHEN** a Menina espia e a verificacao de 25% resulta em deteccao
- **THEN** o sistema revela um lobisomem para a Menina e revela a identidade da Menina aos lobisomens vivos
