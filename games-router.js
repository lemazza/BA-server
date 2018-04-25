'use strict';
const express = require('express');
const config = require('./config');
const bodyParser = require('body-parser');
const {Game} = require('./models');
const passport = require('passport');
const router = express.Router();
const {jwtStrategy} = require('./auth/strategies');
const {createHumanPlayer, setStartGameOrder, updateGameAndSendRes, setNextPlayerTurn, shuffle} = require('./utils');

const jwtAuth = passport.authenticate('jwt', { session: false });


router.use(bodyParser.json());


router.post('/', jwtAuth, (req, res, next) => {
  const {id: userId, username} = req.user;
  let player = createHumanPlayer(userId, username, true);
  // TODO: put function here to create bots, add to players
  Game
  .create({
    players: [player],
    numHumans: req.body.humans,
    numBots: req.body.bots,
  })
  .then(game=>{
    console.log('GAME, post creation in POST GAME', game);
    res.status(201).json(game.serialize());
  })
  .catch(e=>{
    console.log('ERROR IN POST GAME', e.text);
    res.status(400).json(e);
  });
});



router.get('/:gameId', jwtAuth, (req, res, next) => {
  const {id: userId, username} = req.user;
  Game
  .findById(req.params.gameId)
  .then(game=> {
    let {players, numHumans, numBots} = game;
    let userControlledPlayer = players.find(player=> (player.controller === userId));

    if (userControlledPlayer) {
      // find if the user controls a player, return current game state
      let resObj = Object.assign({}, game.serialize(), {userPlayer: userControlledPlayer});
      return res.status(200).json(resObj);
    } 
    else if ((players.length - numBots) >= numHumans) {
      // if there are already the right number of human players, the game is full, can't join
      return res.status(400).json({error: 'Error: game full'});
    } 
    else {
      // give user control of new player in game
      let player = createHumanPlayer(userId, username, false);
      Game
      .findByIdAndUpdate(
        {_id: req.params.gameId},
        {$push: {players: player}},
        {new: true}
      )
      .then(game=> {
        let resObj = Object.assign({}, game.serialize(), {userPlayer: player});
        return res.status(200).json(resObj);
      });
    }
  });
});



router.get('/:gameId/start', jwtAuth, (req, res, next) => {
  // check if user is in players and is the game creator
  // check if all players have signed in
  const userId = req.user.id;
  Game
  .findById(req.params.gameId)
  .then(game=> {
    if(!game) {
      res.status(400).json({error: 'not a valid gameId', location: 'start'});
    }
    const player = game.players.find(plyr=> plyr.controller === userId && plyr.creator);
    if(!player) {
      res.status(400).json({error: "user does not exist in players or isn't creator", location: 'start'});
    }
    if (game.players.length !== (game.numBots + game.numHumans)) {
      res.status(400).json({error: 'not all players have signed in', location:'start'});
    }

    //set order of players around table
    const {players, playerOrder, startPlayer, turn} = setStartGameOrder(game);
    Game
    .findByIdAndUpdate(
      req.params.gameId, 
      {$set: {players, startPlayer, playerOrder, turn, round: 1, phase: 'place first card'}},
      {new: true}
    )
    .then(game=> {
      if(!game) {
        res.status(400).json({error: 'problem setting up game order', location: 'start: setStartGameOrder'});
      }
      let userControlledPlayer = game.players.find(player=> (player.controller === userId));
      let resObj = Object.assign({}, game.serialize(), {userPlayer: userControlledPlayer});
      return res.status(200).json(resObj);
    });
  });
});



router.get('/:gameId/place/:cardType', jwtAuth, (req, res, next) => {
  const userId = req.user.id;
  const cardType = req.params.cardType;

  // make sure the game exists
  Game
  .findById(req.params.gameId)
  .then(game=> {
    if(!game) {
      res.status(400).json({error: 'not a valid gameId', location: 'place'});
    }

    const gameUpdates = {};
    let playerIndex;
    console.log('made it to hear in PLACE', game.players);

    //make sure the player exists and it is their turn
    let activePlyr = game.playerOrder[game.turn];
    const player = game.players.find((plyr, index) => {
      if(plyr.controller === userId && index === activePlyr) {
        playerIndex = index;
        return true;
      } else { 
        return false; 
      }
    });
    if(!player) {
      res.status(400).json({error: "user does not exist in players or (more likely) it isn't their turn", location: 'place'});
    }

    // if cardtype is in hand, remove from hand, add to stack 
    const cardIndex = player.hand.findIndex(card => card === cardType)
      player.hand.splice(cardIndex, 1);
      player.stack.push(cardType);
      // if it can't be found, res error
    if (cardIndex === -1) {
      res.status(400).json({error: `${cardType} does not exist in hand`, location: 'place'});
    }
    let players = game.players;
    players[playerIndex] = player;
    gameUpdates.players = players;

    if(game.phase === 'place first card') {
      // if each player has played 1 card, start new phase
      const allStacks = players.map(player => player.stack.length);
      const allStacksTotal = allStacks.reduce((acc, cv) => acc + cv);
      
      gameUpdates.phase = (allStacksTotal === players.length)? 
        'place or bid' : 'place first card';
    }

    const nextTurn = setNextPlayerTurn(game.playerOrder, game.turn);
    Game
    .findByIdAndUpdate(
      req.params.gameId, 
      {$set: {...gameUpdates, turn: nextTurn}},
      {new: true}
    )
    .then(game => {
      if (!game) {
        return res.status(400).json({error: 'error updating game', location: 'place'});
      }
      let userControlledPlayer = game.players.find(player=> (player.controller === userId));
      let resObj = Object.assign({}, game.serialize(), {userPlayer: userControlledPlayer});
      //if (game.players[game.turn].bot === true) {
        //botTurn;
      //}
      return res.status(200).json(resObj);
    });
  });
});



router.get('/:gameId/bid/:bidAmount', jwtAuth, (req, res, next) => {
  const userId = req.user.id;
  const bidAmount = req.params.bidAmount;
  const gameUpdates = {};

  // make sure the game exists
  Game
  .findById(req.params.gameId)
  .then(game=> {
    if(!game) {
      res.status(400).json({error: 'not a valid gameId', location: 'bid'});
    }

    //make sure the player exists and it is their turn
    let playerIndex;
    let activePlyr = game.playerOrder[game.turn];
    const player = game.players.find((plyr, index) => {
      if(plyr.controller === userId && index === activePlyr) {
        playerIndex = index;
        return true;
      } else { 
        return false;
      }
    });
    if(!player) {
      res.status(400).json({
        error: "user does not exist in players or (more likely) it isn't their turn", 
        location: 'bid'
      });
    }

    //bidAmount must be > current high bid, and <= total number of cards in stacks
    const allStacks = game.players.map(player => player.stack.length);
    const allStacksTotal = allStacks.reduce((acc, cv) => acc + cv);
    if (bidAmount <= game.highBid || bidAmount > allStacksTotal) {
      res.status(400).json({
        error: "bid amount must be greater than current high bid, and less than or equal to the number of cards in players' stacks",
        location: "bid"
      });
    }

    // add new info to our game update obj
    player.bid = bidAmount;
    let newPlayers = game.players;
    newPlayers[playerIndex] = player;
    gameUpdates.players = newPlayers;
    gameUpdates.highBid = bidAmount;

    console.log('bidAmount and allStacksTotal', bidAmount, allStacksTotal);
    if (bidAmount === allStacksTotal) {
      // change to reveal cards phase, all players pass except user
      gameUpdates.phase = 'reveal cards';
      gameUpdates.players = newPlayers.map(plyr => plyr.passed = true);
      gameUpdates.players[playerIndex].passed = false;
      gameUpdates.playerOrder = game.playerOrder.filter(num => num !== playerIndex);
    } else {
      gameUpdates.phase = 'bid or pass';
    }  

    //this could probably be made into a util function
    //determine next turn
    //update gamestate in db
    //send gamestate
    const nextTurn = (gameUpdates.phase === 'reveal cards')? 
      game.turn : setNextPlayerTurn(game.playerOrder, game.turn);

    Game
    .findByIdAndUpdate(
      req.params.gameId, 
      {$set: {...gameUpdates, turn: nextTurn}},
      {new: true}
    )
    .then(game => {
      if (!game) {
        return res.status(400).json({error: 'error updating game', location: 'bid'});
      }
      let userControlledPlayer = game.players.find(player=> (player.controller === userId));
      let resObj = Object.assign({}, game.serialize(), {userPlayer: userControlledPlayer});
     
      return res.status(200).json(resObj);
    });
  });
});



router.get('/:gameId/pass', jwtAuth, (req, res, next) => {
  const userId = req.user.id;
  const gameUpdates = {};

  // make sure the game exists
  Game
  .findById(req.params.gameId)
  .then(game=> {
    if(!game) {
      res.status(400).json({error: 'not a valid gameId', location: 'pass'});
    }

    //make sure the player exists and it is their turn
    let playerIndex;
    let activePlyr = game.playerOrder[game.turn];
    const player = game.players.find((plyr, index) => {
      if(plyr.controller === userId && index === activePlyr) {
        playerIndex = index;
        return true;
      } else { 
        return false;
      }
    });
    if(!player) {
      res.status(400).json({
        error: "user does not exist in players or (more likely) it isn't their turn", 
        location: 'pass'
      });
    }

    // make sure phase is 'bid or pass'
    if (game.phase !== 'bid or pass') {
      res.status(400).json({
        error: "cannot pass in this phase",
        location: 'pass',
      });
    }

    // add new info to our game update obj
    player.passed = true;
    let newPlayers = game.players;
    newPlayers[playerIndex] = player;
    gameUpdates.players = newPlayers;
    gameUpdates.playerOrder = game.playerOrder.filter(num => num !== playerIndex);

    // if only one player remains after this pass, change phase to 'reveal cards'
    gameUpdates.phase = (gameUpdates.playerOrder.length === 1)? 
      'reveal cards' : 'bid or pass';

    //this could probably be made into a util function
    //determine next turn
    //update gamestate in db
    //send gamestate
    const nextTurn = (playerIndex === (game.playerOrder.length -1))? 0 : game.turn;
    Game
    .findByIdAndUpdate(
      req.params.gameId, 
      {$set: {...gameUpdates, turn: nextTurn}},
      {new: true}
    )
    .then(game => {
      if (!game) {
        return res.status(400).json({error: 'error updating game', location: 'pass'});
      }
      let userControlledPlayer = game.players.find(player=> (player.controller === userId));
      let resObj = Object.assign({}, game.serialize(), {userPlayer: userControlledPlayer});
      
      return res.status(200).json(resObj);
    });
  });
});



router.get('/:gameId/reveal/:revealId', jwtAuth, (req, res, next) => {
  const userId = req.user.id;
  const revealId = req.params.revealId;
  const gameUpdates = {};
  const gameId = req.params.gameId;

  // make sure the game exists
  Game
  .findById(gameId)
  .then(game=> {
    if(!game) {
      res.status(400).json({error: 'not a valid gameId', location: 'reveal'});
    }

    // make sure phase is 'reveal cards'
    if (game.phase !== 'reveal cards') {
      res.status(400).json({
        error: "cannot reveal cards in this phase",
        location: 'reveal',
      });
    }

    //make sure the player exists and it is their turn
    let playerIndex;
    let activePlyr = game.playerOrder[game.turn];
    const player = game.players.find((plyr, index) => {
      if(plyr.controller === userId && index === activePlyr) {
        playerIndex = index;
        return true;
      } else { 
        return false;
      }
    });
    if(!player) {
      res.status(400).json({
        error: "user does not exist in players or (more likely) it isn't their turn", 
        location: 'reveal'
      });
    }

    //make sure the selected stack exists and isn't empty;
    let revealPlayerIndex;
    const revealPlayer = game.players.find((plyr, index) => {
      console.log('player find...', plyr.stack);
      if(plyr.controller === revealId && plyr.stack.length > 0 ) {
        console.log('FOUND ONE');
        revealPlayerIndex = index;
        return true;
      } else { 
        return false; 
      }
    });
    console.log('revealPlayer', revealPlayer);
    if(!revealPlayer) {
      res.status(400).json({
        error: "selected player does not exist in players or does not have cards in their stack", 
        location: 'reveal'
      });
    }

    // must select from your own stack before any other players
    if (player.stack.length > 0 && userId !== revealId) {
      res.status(400).json({
        error: "must select from your own stack first",
        location: 'reveal',
      });
    }

    // move card from stack to revealed;
    let revealedCard = revealPlayer.stack.pop();
    revealPlayer.revealed.push(revealedCard);
    let players = game.players;
    players[revealPlayerIndex] = revealPlayer;
    gameUpdates.players = players;
    console.log('REVEALED CARD: ', revealedCard);

    if (revealedCard === 'badCard') {
      //  PLAYER LOSES ROUND
      console.log('player loses round');
      // (if player.controller === revealPlayer.controller) user can choose card to discard
      // implement this later
      // until i decide to do that (as a new phase), randomly remove card from player;
      let allPlayerCards = shuffle([...player.stack, ...player.hand, ...player.revealed]);
      let discardIndex = Math.floor( Math.random() * allPlayerCards.length );
      allPlayerCards.splice(discardIndex, 1);
      player.hand = allPlayerCards;
      console.log('new player hand, post discard', player.hand)
      player.stack = [];
      player.revealed = [];
      gameUpdates.players[playerIndex] = player;

      // if loser is out of cards, they lose and are out of the game
      // if there is only one other player, that player wins the game
      if (player.hand.length === 0 && game.players.length === 2) {
        // update db with game end status and victory declaration
        let winnerName = game.players[revealPlayerIndex].name;
        console.log('WINNER: ', winnerName);
        gameUpdates.phase = `GAME OVER: ${winnerName} Wins!`;

      } else {
        // RESET FOR NEW ROUND
        console.log('reset for new round');
        // set player order for players still in game
        let newPlayerOrder = [];
        let newPlayers = gameUpdates.players.map((plyr, index) => {
          //put cards back in hand
          let hand = [...plyr.hand, ...plyr.stack, ...plyr.revealed];
          //if player still has cards, push them to newPlayerOrder
          if (hand.length) {
            newPlayerOrder.push(index);
          }
          // return playerObj
          const resetPlayer = Object.assign(plyr, {
            hand: shuffle(hand),
            stack: [],
            revealed: [],
            bid: 0,
          });
          return resetPlayer;
        });
        gameUpdates.playerOrder = newPlayerOrder;
        gameUpdates.players = newPlayers;
        gameUpdates.phase = 'place first card';
        gameUpdates.highBid = 0;
        gameUpdates.round = (gameUpdates.round || game.round) + 1
        // if player out of game, next player becomes start player, else player does
        gameUpdates.startPlayer = (player.hand.length)? playerIndex : setNextPlayerTurn(newPlayerOrder, game.turn);
        gameUpdates.turn = gameUpdates.startPlayer;
      }

    } else {
      // PLAYER REVEALED 'goodCard'
      console.log('player revealed goodCard');
      // if player has revealed the number of cards they bid, they win the round
      const allRevealedCards = gameUpdates.players.map(player => player.revealed.length);
      const countOfAllRevealedCards = allRevealedCards.reduce((acc, cv) => acc + cv);
      if (game.highBid === countOfAllRevealedCards) {
        // PLAYER WINS ROUND
        console.log('player wins round!');
        
        if (player.roundsWon === 1) {
          //PLAYER WINS GAME
        let winnerName = game.players[playerIndex].name;
        console.log('player wins game: ', winnerName);
        gameUpdates.phase = `GAME OVER: ${winnerName} Wins!`;

        } else {
        player.roundsWon = 1;
        gameUpdates.players[playerIndex] = player;

        // RESET FOR NEW ROUND
        // set player order for players still in game
        let newPlayerOrder = [];
        let newPlayers = gameUpdates.players.map((plyr, index) => {
          //put cards back in hand
          let hand = [...plyr.hand, ...plyr.stack, ...plyr.revealed];
          //if player still has cards, push them to newPlayerOrder
          if (hand.length) {
            newPlayerOrder.push(index);
          }
          // return playerObj
          return Object.assign(plyr, {
            hand: shuffle(hand),
            stack: [],
            revealed: [],
            bid: 0,
          });
        });
        gameUpdates.playerOrder = newPlayerOrder;
        gameUpdates.players = newPlayers;
        gameUpdates.phase = 'place first card';
        gameUpdates.highBid = 0;
        gameUpdates.round = (gameUpdates.round || game.round) + 1
        // if player out of game, next player becomes start player, else player does
        gameUpdates.startPlayer = (player.hand.length)? playerIndex : setNextPlayerTurn(newPlayerOrder, game.turn);
        gameUpdates.turn = gameUpdates.startPlayer;
        }

      } else {
        // PLAYER MUST SELECT AGAIN
        console.log('player must select again');
        // turn stays the same, that's it
        gameUpdates.turn = game.turn;
        // so really nothing happens, this is probably unnecessary until i add turn result messages
      }
    }
    updateGameAndSendRes(res, gameId, userId, gameUpdates, 'reveal')
  });
});


router.post('/:gameId/chat', jwtAuth, (req, res, next) => {
  res.status(400).json({error:'not built yet'});
/*
  get userId from req.user
  make sure userId exists in players

  message = req.body

  make sure message has sender and text fields
  sender username should === req.user.username
  text field <= maxlength

  (should messages have timestamps when they're extracted via .serialize?
  , probably timestamp from when added to DB, not when sent)

  put message into game.chat
  Game.findByIdAndUpdate()

  res chatArray

*/
});


module.exports = {router};