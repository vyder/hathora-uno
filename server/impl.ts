import _ from 'lodash'
import { Methods, Context } from "./.hathora/methods";
import { Response } from "../api/base";
import {
  Color,
  Card,
  Player,
  GameStatus,
  GameState,
  UserId,
  IInitializeRequest,
  IJoinGameRequest,
  IStartGameRequest,
  IPlayCardRequest,
  IDrawCardRequest,
  PlayerState,
} from "../api/types";

type InternalState = GameState;

const NUM_CARDS_STARTING_HAND = 4

export class Impl implements Methods<InternalState> {
  initialize(ctx: Context, request: IInitializeRequest): InternalState {

    // Generate deck
    const allCards: Card[] = []
    const colors = [Color.RED, Color.GREEN, Color.YELLOW, Color.BLUE]
    _.each(colors, color => {
      _.times(9, i => {
        allCards.push({ color, number: (i + 1) })
      })
    })
    const deck = _.shuffle(allCards)

    return {
      status: GameStatus.INITIALIZED,
      players: [],
      deck,
      pile: [],
      turn: undefined,
      winner: undefined,
    };
  }
  joinGame(state: InternalState, userId: UserId, ctx: Context, request: IJoinGameRequest): Response {
    const foundPlayer = this.findPlayer(state.players, userId)
    if (foundPlayer) {
      return Response.error("Already joined the game!")
    }
    state.players.push({ id: userId, hand: [] })
    return Response.ok()
  }
  startGame(state: InternalState, userId: UserId, ctx: Context, request: IStartGameRequest): Response {
    if (state.players.length < 2) {
      return Response.error("Not enough players to start game!")
    }

    if (state.status === GameStatus.IN_PROGRESS) {
      return Response.error("Game is already in progress!")
    }

    if (state.status === GameStatus.OVER) {
      return Response.error("Game is over! Create a new lobby")
    }

    const { deck, players } = state

    // Check that we can deal the right amount of cards
    // to everybody without running out
    if (players.length * NUM_CARDS_STARTING_HAND > deck.length) {
      return Response.error("Too many players!")
    }

    // Deal cards to each player from the deck
    _.each(players, player => {
      player.hand = deck.splice(0, NUM_CARDS_STARTING_HAND)
    })

    // Deal one card into the pile
    state.pile.push(deck.shift()!)

    // Pick a random player to start
    state.turn = _.random(players.length)

    state.status = GameStatus.IN_PROGRESS

    return Response.ok()
  }

  playCard(state: InternalState, userId: UserId, ctx: Context, request: IPlayCardRequest): Response {
    if (state.status === GameStatus.INITIALIZED) {
      return Response.error("Game has not started yet!")
    }

    if (state.status === GameStatus.OVER) {
      return Response.error("Game Over!")
    }

    const { players, pile, turn } = state
    const { card } = request
    const player = players[turn!]

    // Check if this player can play right now
    if (player.id !== userId) {
      return Response.error("Not your turn!")
    }

    // Double-check that the card is in the player's hand
    const found = player.hand.find(c => this.isEqualCards(c, card))
    if (!found) {
      return Response.error("You don't have this card!")
    }

    // Can this card be played on the pile
    const topCard = pile[0]
    if (!this.isMatchCards(topCard, card)) {
      return Response.error("Card doesn't match the last card on the pile!")
    }

    // Remove card from player and add to the top of the pile (top index = 0)
    _.remove(player.hand, c => this.isEqualCards(c, card))
    pile.unshift(card)

    // This player has won if his hand is empty
    if (_.isEmpty(player.hand)) {
      state.winner = player.id
      state.status = GameStatus.OVER
      return Response.ok()
    }

    // Otherwise, move to the next player's turn
    this.nextTurn(state)

    return Response.ok()
  }

  drawCard(state: InternalState, userId: UserId, ctx: Context, request: IDrawCardRequest): Response {
    if (state.status === GameStatus.INITIALIZED) {
      return Response.error("Game has not started yet!")
    }

    if (state.status === GameStatus.OVER) {
      return Response.error("Game Over!")
    }

    const { players, deck, turn } = state
    const player = players[turn!]

    // If the deck is empty, leave the top card in the pile,
    // shuffle the rest into the deck
    if (_.isEmpty(deck)) {
      // TODO
      return Response.error("Deck is empty!")
    }

    // Draw the top card into the player's hand
    player.hand.push(deck.shift()!)

    // Move to next player's turn
    this.nextTurn(state)

    return Response.ok()
  }

  // Players can see a subset of the game's state
  getUserState(state: InternalState, userId: UserId): PlayerState {
    const { players, pile, turn: turnIndex, winner, deck } = state

    const player = this.findPlayer(players, userId)
    const ids = players.map(player => player.id)

    let turn: UserId|undefined = undefined
    if (turnIndex !== undefined) {
      const turnPlayer = players[turnIndex]
      if (turnPlayer) {
        turn = turnPlayer.id
      }
    }

    const topOfPile = pile[0]
    const numCardsInDeck = deck.length

    return {
      players: ids,
      hand: player?.hand,
      topOfPile, turn, winner,
      numCardsInDeck,
    }
  }

  // Helper Methods
  //

  nextTurn(state: InternalState): void {
    state.turn = (state.turn! + 1) % state.players.length
  }

  findPlayer(players: Player[], userId: UserId): Player|undefined {
    return players.find(player => player.id === userId)
  }

  isEqualCards(card1: Card, card2: Card): boolean {
    return (card1.color === card2.color && card1.number === card2.number);
  }

  // Color or number matches
  isMatchCards(card1: Card, card2: Card): boolean {
    return (card1.color === card2.color || card1.number === card2.number);
  }
}
