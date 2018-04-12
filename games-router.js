'use strict';
const express = require('express');
const config = require('./config');
const bodyParser = require('body-parser');
const {Game} = require('./models');
const passport = require('passport');
const router = express.Router();
const {jwtStrategy} = require('./auth/strategies');
const {createHumanPlayer} = require('./utils');

const jwtAuth = passport.authenticate('jwt', { session: false });


router.use(bodyParser.json());

router.post('/', jwtAuth, (req, res, next) => {
  const {id: userId, username} = req.user;
  let player = createHumanPlayer(userId, username, true)
  // TODO: put function here to create bots, add to players
  Game
  .create({
    players: [player],
    numHumans: req.body.humans,
    numBots: req.body.bots,
  })
  .then(game=>{
    res.status(201).json(game.serialize());
  })
  .catch(e=>{
    res.status(400).json(e);
  })
})

router.get('/:gameId', jwtAuth, (req, res, next) => {
  // extract userId from req
  const {id: userId, username} = req.user;
  Game
  .findById(req.params.gameId)
  .then(game=> {
    let {players, numHumans, numBots} = game;
    let userControlledPlayer = players.find(player=> (player.controller === userId));

    if (userControlledPlayer) {
      // find if the user has controls a player, return current game state
      let resObj = Object.assign({}, game.serialize(), {userPlayer: userControlledPlayer});
      return res.status(200).json(resObj);
    } 
    else if ((players.length - numBots) >= numHumans) {
      // if there are already the right number of human players, the game is full, can't join
      return res.status(400).json({error: 'Error: game full'})
    } 
    else {
      // give user control of new player in game
      let player = createHumanPlayer(userId, username, false)
      Game
      .findByIdAndUpdate({_id: req.params.gameId}, {$push: {players: player}})
      .then(game=> {
        let resObj = Object.assign({}, game.serialize(), {userPlayer: player})
        return res.status(200).json(resObj);
      })
    }
  })
})


router.get('/:gameId/startGame', jwtAuth, (req, res, next) => {
  // get userid from req.user
  // check if user is in players
  // find out if its that player is creator

  // start game function()
  //  set player order/ start player, and update db to reflect table order and start player
  //  run startRound()
  //    change phase to 'place first card'


  // if start player is bot, run botTurn()
  // else set start player to active
})

router.get('/:gameId/playCard/:cardType', jwtAuth, (req, res, next) => {
  // get userid from req.user
  // check if user is in players
  // find out if its that players turn
  // get cardtype from body

/** if phase is 'place first card'
  *   if cardtype is in hand, remove from hand, add to stack
  *   if each player has played 1 card, start new phase
  *   set player.active to false

      if next player is bot run botTurn()
      make next player active
  *   send game state
  *
  * if phase 'place or bid'
  *   if cardtype is in hand, remove from hand, add to stack
  *   set player.active to false
      if next player is bot run botTurn()
      make next player active
  *   send game state
  *  
  * else reject
  */
})

router.get('/:gameId/bid/:bidAmount', jwtAuth, (req, res, next) => {
  /*
    get userid from req.user
    check if user is in players
    find out if its that player's turn
    bid amount from body
    bid must be greater than current high bid, and <= number of cards in all stacks

    if bid = number of cards in all stacks
        change phase to 'select cards'
        set all other players to passed
        (if dealing with timers, start timer for new player turn, with current player active)
        send game state

    if phase is 'place or bid'
      change phase to 'bidding'
      update high bid
      update player.bid to bid
      make player.active to false
      if next player is bot run botTurn() 
      make next player (who hasn't passed) active
      send game state
    
    if phase is 'bid or pass'
      update high bid
      update player.bid to bid
      make player.active to false
      if next player is bot run botTurn() 
      make next player (who hasn't passed) active
      send game state

  */
})

router.get('/:gameId/pass', jwtAuth, (req, res, next) => {
/*
  get userid from req.user
  check if user is in players
  find out if its that player's turn
  find out if the phase is 'bid or pass'

  if only one other player hasn't passed
    set phase to 'select cards'
    set high bidder to active
    if high bidder is bot, run botTurn()
    send game state

  else 
    set player.passed to true
    player.active to false
    if next player is bot run botTurn() 
    make next player (who hasn't passed) active
    send game state
*/
})

router.get('/:gameId/selectCard/:playerId', jwtAuth, (req, res, next) => {
/*
  get userid from req.user
  check if user is in players
  check if playerid is in players
  find out if its that user's turn
  find out if the phase is 'select cards'

  if user.stack > 0 userid must === playerid

  move card from player.stack to player.revealed
  
  if card === 'badCard'
    user loses round
    if card belonged to user, user chooses which card to lose
    else user loses random card from hand (hand + stack + revealed)

    if loser out of cards
      they lose and are out of the game
      if there is only won player still in the game
        THAT PLAYER WINS
        endGame()
          game status is 'Game Over'
          display message conveying victory
      next player in turn table order (not out of game) is start player
      resetRound()
        everyone's cards back into hand
        tick round counter
        phase = 'place first card'

    else 
      user is start player next round
      resetRound()
        everyone's cards back into hand
        tick round counter
        phase = 'place first card'

  else (card === 'goodCard')
    if user.bid === revealed cards total
      user wins round!
      if user has already won a round before,
        USER WINS GAME
        endGame()
          game status is 'Game Over'
          display message conveying victory
      else
        tick user.roundsWon
        resetRound()
          everyone's cards back into hand
          tick round counter
          phase = 'place first card'

    else (user needs to select more cards)
      (reset turn timer)
      turn message 'revealed (revealedCardsTotal) of (highBid) cards, select another'
      send game state


*/
})


module.exports = {router};