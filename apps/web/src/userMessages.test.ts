import { describe, expect, it } from 'vitest';
import { translateUserMessage } from './userMessages';

describe('mensagens exibidas ao usuário', () => {
  it('traduz erros de entrada e de estado da partida', () => {
    expect(translateUserMessage('Room not found')).toBe('Sala não encontrada.');
    expect(translateUserMessage('The game has already started')).toBe(
      'A partida já começou.',
    );
    expect(translateUserMessage('That phase deadline has passed')).toBe(
      'O prazo dessa fase terminou.',
    );
  });

  it('traduz mensagens com dados dinâmicos sem expor identificadores', () => {
    expect(translateUserMessage('Unknown player: player-42.')).toBe(
      'Jogador não encontrado.',
    );
    expect(
      translateUserMessage('This action requires 2 target(s) or an abstention'),
    ).toBe('Essa ação exige a quantidade correta de alvos ou uma abstenção.');
  });

  it('preserva mensagens desconhecidas', () => {
    expect(translateUserMessage('Mensagem específica da vila.')).toBe(
      'Mensagem específica da vila.',
    );
  });
});
